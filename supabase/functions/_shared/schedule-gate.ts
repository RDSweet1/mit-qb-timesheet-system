/**
 * Schedule Gate — controls whether an edge function should run
 * based on schedule_config table settings.
 *
 * Only checks the `is_paused` flag. Day/time scheduling is handled
 * entirely by pg_cron — the gate does NOT duplicate that logic.
 *
 * Manual invocations (with { manual: true } in the request body)
 * bypass the gate entirely.
 *
 * Watchdog: When complete('error') is called, an immediate alert email
 * is sent to the health recipients so failures are caught right away.
 */

import { sendEmail, getDefaultEmailSender } from './outlook-email.ts';
import { getInternalRecipients } from './config.ts';
import { emailWrapper, emailHeader, emailFooter, contentSection, COLORS } from './email-templates.ts';

interface OutlookConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

interface GateResult {
  run: boolean;
  reason?: string;
  complete: (status: 'success' | 'error') => Promise<void>;
}

/**
 * Check if the function should run based on its schedule_config row.
 * Only blocks if `is_paused` is true. Day/time scheduling is left to pg_cron.
 * Returns { run: true/false, reason, complete() }.
 *
 * Pass outlookConfig to enable watchdog alerts on failure.
 */
export async function shouldRun(
  functionName: string,
  supabaseClient: any,
  options?: { outlookConfig?: OutlookConfig }
): Promise<GateResult> {
  const noop = async () => {};

  const { data: config, error } = await supabaseClient
    .from('schedule_config')
    .select('*')
    .eq('function_name', functionName)
    .single();

  if (error || !config) {
    // No config row = always run (backwards compatible)
    console.log(`schedule-gate: no config for "${functionName}", allowing run`);
    return { run: true, complete: noop };
  }

  // Check if paused
  if (config.is_paused) {
    await supabaseClient
      .from('schedule_config')
      .update({
        last_run_at: new Date().toISOString(),
        last_run_status: 'skipped_paused',
      })
      .eq('function_name', functionName);

    console.log(`schedule-gate: "${functionName}" is paused`);
    return { run: false, reason: 'paused', complete: noop };
  }

  console.log(`schedule-gate: "${functionName}" cleared to run`);

  // Return gate with complete() callback that records run status
  // and sends watchdog alert on error
  const complete = async (status: 'success' | 'error') => {
    // Read previous status to avoid duplicate alerts
    const prevStatus = config.last_run_status;

    await supabaseClient
      .from('schedule_config')
      .update({
        last_run_at: new Date().toISOString(),
        last_run_status: status,
      })
      .eq('function_name', functionName);

    // Watchdog: send immediate alert on first error
    if (status === 'error' && prevStatus !== 'error' && options?.outlookConfig) {
      try {
        await sendWatchdogAlert(functionName, config.display_name || functionName, supabaseClient, options.outlookConfig);
      } catch (alertErr) {
        console.error(`schedule-gate: watchdog alert failed for "${functionName}":`, alertErr);
      }
    }
  };

  return { run: true, complete };
}

/**
 * Send an immediate alert email when a function fails.
 */
async function sendWatchdogAlert(
  functionName: string,
  displayName: string,
  supabaseClient: any,
  outlookConfig: OutlookConfig
): Promise<void> {
  const fromEmail = await getDefaultEmailSender(supabaseClient);
  const recipients = await getInternalRecipients(supabaseClient, 'health');

  const now = new Date();
  const timeStr = now.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const header = emailHeader({
    color: COLORS.red,
    title: '&#9888; Automation Failure Alert',
    subtitle: `${displayName} failed at ${timeStr}`,
  });

  const body = contentSection(`
    <p style="margin:0 0 12px;">An automated function has failed and may need attention:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#fff;border-radius:5px;">
      <tr>
        <td style="padding:10px;border-bottom:1px solid #eee;font-weight:bold;">Function</td>
        <td style="padding:10px;border-bottom:1px solid #eee;">${displayName} (${functionName})</td>
      </tr>
      <tr>
        <td style="padding:10px;border-bottom:1px solid #eee;font-weight:bold;">Status</td>
        <td style="padding:10px;border-bottom:1px solid #eee;">
          <span style="background:#f8d7da;color:#721c24;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:bold;">ERROR</span>
        </td>
      </tr>
      <tr>
        <td style="padding:10px;border-bottom:1px solid #eee;font-weight:bold;">Time</td>
        <td style="padding:10px;border-bottom:1px solid #eee;">${timeStr}</td>
      </tr>
    </table>
    <p style="margin:16px 0 0;color:#666;font-size:13px;">Check the Supabase dashboard function logs for details. This alert is sent once per failure — you won't receive another until the function recovers and fails again.</p>
  `);

  const footer = emailFooter({ internal: true });
  const htmlBody = emailWrapper(`${header}${body}${footer}`);

  const result = await sendEmail(
    {
      from: fromEmail,
      to: recipients,
      subject: `ALERT: ${displayName} failed — ${timeStr}`,
      htmlBody,
    },
    outlookConfig
  );

  if (result.success) {
    console.log(`schedule-gate: watchdog alert sent for "${functionName}"`);
  } else {
    console.error(`schedule-gate: watchdog alert email failed:`, result.error);
  }
}
