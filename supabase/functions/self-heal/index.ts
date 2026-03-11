/**
 * self-heal — Automated repair loop for failed edge functions
 *
 * Reads the accounting@ inbox via Microsoft Graph API for watchdog ALERT emails,
 * identifies which function failed, retries it, and loops until fixed or escalates.
 *
 * Flow:
 *   1. Read inbox for unread "ALERT: ... failed" emails (from our watchdog system)
 *   2. Parse the failed function name from the email subject/body
 *   3. Cross-reference schedule_config to confirm error state
 *   4. Retry the function (POST to its edge function URL with { manual: true })
 *   5. Wait briefly, re-check schedule_config.last_run_status
 *   6. If fixed → send resolution email, mark alert as read
 *   7. If still failing after max retries → send escalation email, mark alert as read
 *
 * Schedule: pg_cron every 15 minutes (see migration)
 * Can also be triggered manually with { manual: true }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail, getDefaultEmailSender, getGraphAccessToken } from '../_shared/outlook-email.ts';
import { emailWrapper, emailHeader, emailFooter, contentSection, COLORS } from '../_shared/email-templates.ts';
import { startMetrics } from '../_shared/metrics.ts';
import { getInternalRecipients } from '../_shared/config.ts';
import { fetchWithRetry } from '../_shared/fetch-retry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3_000; // 3 seconds between retries
const MAX_FUNCTIONS_PER_RUN = 3; // limit to avoid timeout (cron picks up rest next cycle)
const FUNCTIONS_BASE_URL = Deno.env.get('SUPABASE_URL') + '/functions/v1';

interface RepairAttempt {
  functionName: string;
  displayName: string;
  source: 'email' | 'db_scan';
  alertMessageId?: string;
  attempts: number;
  resolved: boolean;
  error?: string;
}

// Functions the self-heal should NOT attempt to retry (itself, or test functions)
const SKIP_FUNCTIONS = new Set(['self-heal', 'test-cleanup', 'test-suite-verify']);

/**
 * Read unread ALERT emails from the inbox via Graph API
 */
async function readAlertEmails(
  token: string,
  mailbox: string
): Promise<Array<{ id: string; subject: string; bodyPreview: string; receivedDateTime: string }>> {
  // Fetch recent unread emails, then filter for ALERT subjects in code
  // Graph API is picky about filter combos, so keep the server-side filter simple
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const fields = 'id,subject,bodyPreview,receivedDateTime,isRead';

  const filter = `receivedDateTime ge ${since}`;
  const url = `https://graph.microsoft.com/v1.0/users/${mailbox}/mailFolders/inbox/messages` +
    `?$filter=${encodeURIComponent(filter)}&$select=${fields}&$top=100&$orderby=receivedDateTime desc`;

  const res = await fetchWithRetry(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  }, { label: 'Graph ReadMail', maxRetries: 2 });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API read inbox failed: ${res.status} — ${text}`);
  }

  const data = await res.json();
  const messages = data.value || [];

  // Post-filter: only unread ALERT emails
  return messages.filter((m: any) => {
    return !m.isRead && m.subject?.startsWith('ALERT:');
  });
}

/**
 * Mark an email as read in the inbox
 */
async function markAsRead(token: string, mailbox: string, messageId: string): Promise<void> {
  await fetchWithRetry(
    `https://graph.microsoft.com/v1.0/users/${mailbox}/messages/${messageId}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isRead: true }),
    },
    { label: 'Graph MarkRead', maxRetries: 2 }
  );
}

/**
 * Parse function name from watchdog alert subject line.
 * Subject format: "ALERT: {displayName} failed — {timestamp}"
 */
function parseAlertSubject(subject: string): { displayName: string } | null {
  const match = subject.match(/^ALERT:\s*(.+?)\s+failed/i);
  if (!match) return null;
  return { displayName: match[1].trim() };
}

/**
 * Look up the function_name in schedule_config by display_name
 */
async function resolveFunction(
  supabase: any,
  displayName: string
): Promise<{ function_name: string; display_name: string; last_run_status: string } | null> {
  const { data, error } = await supabase
    .from('schedule_config')
    .select('function_name, display_name, last_run_status')
    .ilike('display_name', `%${displayName}%`)
    .single();

  if (error || !data) {
    // Try exact match on function_name too (in case displayName IS the function_name)
    const slug = displayName.toLowerCase().replace(/\s+/g, '-');
    const { data: data2 } = await supabase
      .from('schedule_config')
      .select('function_name, display_name, last_run_status')
      .eq('function_name', slug)
      .single();
    return data2 || null;
  }
  return data;
}

/**
 * Retry a failed function by calling its edge function endpoint
 */
async function retryFunction(functionName: string, serviceRoleKey: string): Promise<boolean> {
  const url = `${FUNCTIONS_BASE_URL}/${functionName}`;
  console.log(`  Retrying ${functionName} via POST ${url}`);

  try {
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ manual: true }),
    }, { label: `Retry ${functionName}`, maxRetries: 0 }); // no internal retry — we handle retries ourselves

    const body = await res.json().catch(() => ({}));
    console.log(`  ${functionName} response: ${res.status}`, body);

    // Consider success if HTTP 200 and body.success !== false
    return res.ok && body.success !== false;
  } catch (err) {
    console.error(`  ${functionName} retry threw:`, err.message);
    return false;
  }
}

/**
 * Check if a function has recovered (schedule_config.last_run_status = 'success')
 */
async function checkRecovered(supabase: any, functionName: string): Promise<boolean> {
  const { data } = await supabase
    .from('schedule_config')
    .select('last_run_status')
    .eq('function_name', functionName)
    .single();
  return data?.last_run_status === 'success';
}

/**
 * Mark a function as recovered in schedule_config.
 * Used when manual retry succeeds (manual calls bypass the schedule gate,
 * so they don't update schedule_config themselves).
 */
async function markRecovered(supabase: any, functionName: string): Promise<void> {
  await supabase
    .from('schedule_config')
    .update({
      last_run_at: new Date().toISOString(),
      last_run_status: 'success',
    })
    .eq('function_name', functionName);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const metrics = await startMetrics('self-heal', supabase);

  try {
    const outlookConfig = {
      tenantId: Deno.env.get('AZURE_TENANT_ID') ?? '',
      clientId: Deno.env.get('AZURE_CLIENT_ID') ?? '',
      clientSecret: Deno.env.get('AZURE_CLIENT_SECRET') ?? '',
    };

    const mailbox = Deno.env.get('FROM_EMAIL') || 'accounting@mitigationconsulting.com';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // 1. Get Graph token and read alert emails
    const graphToken = await getGraphAccessToken(outlookConfig);
    metrics.addApiCall();

    const alerts = await readAlertEmails(graphToken, mailbox);
    metrics.addApiCall();
    console.log(`Self-heal: found ${alerts.length} unread ALERT email(s)`);

    // 2. Build repair queue from TWO sources:
    //    A) Unread ALERT emails from inbox
    //    B) schedule_config rows with error/stale status (catches issues even if email was read)

    // Source A: Parse alert emails
    const repairQueue = new Map<string, { displayName: string; source: 'email' | 'db_scan'; alertId?: string }>();

    for (const alert of alerts) {
      const parsed = parseAlertSubject(alert.subject);
      if (!parsed) {
        console.log(`  Skipping unparseable alert: "${alert.subject}"`);
        continue;
      }
      const funcConfig = await resolveFunction(supabase, parsed.displayName);
      if (funcConfig) {
        repairQueue.set(funcConfig.function_name, {
          displayName: funcConfig.display_name,
          source: 'email',
          alertId: alert.id,
        });
      } else {
        // Mark unresolvable alerts as read
        await markAsRead(graphToken, mailbox, alert.id);
      }
    }

    // Source B: Scan schedule_config for error or stale functions
    const { data: allConfigs } = await supabase
      .from('schedule_config')
      .select('*')
      .eq('is_paused', false);

    for (const cfg of allConfigs || []) {
      if (SKIP_FUNCTIONS.has(cfg.function_name)) continue;
      if (repairQueue.has(cfg.function_name)) continue; // already queued from email

      const isError = cfg.last_run_status === 'error';
      const isStale = (() => {
        if (!cfg.last_run_at) return true; // never ran
        const hoursSince = (Date.now() - new Date(cfg.last_run_at).getTime()) / (1000 * 60 * 60);
        const isDaily = cfg.schedule_day === 'daily' || cfg.schedule_day === 'weekdays';
        return isDaily ? hoursSince > 36 : hoursSince > 192; // 36h for daily, 8 days for weekly
      })();

      if (isError || isStale) {
        console.log(`  DB scan: ${cfg.function_name} is ${isError ? 'ERROR' : 'STALE'} (last: ${cfg.last_run_status || 'never'}, ${cfg.last_run_at || 'never'})`);
        repairQueue.set(cfg.function_name, {
          displayName: cfg.display_name,
          source: 'db_scan',
        });
      }
    }

    console.log(`Self-heal: ${repairQueue.size} function(s) need repair (${alerts.length} from email, ${repairQueue.size - [...repairQueue.values()].filter(v => v.source === 'email').length} from DB scan)`);

    if (repairQueue.size === 0) {
      metrics.setMeta('alerts_found', alerts.length);
      metrics.setMeta('db_issues', 0);
      metrics.setMeta('outcome', 'all_clear');
      await metrics.end('success');

      // Update own schedule_config so health digest sees us as healthy
      await supabase
        .from('schedule_config')
        .update({ last_run_at: new Date().toISOString(), last_run_status: 'success' })
        .eq('function_name', 'self-heal');

      return new Response(
        JSON.stringify({ success: true, message: 'No issues found — all clear', repaired: 0, escalated: 0, details: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Repair loop — process up to MAX_FUNCTIONS_PER_RUN (email alerts prioritized first)
    const results: RepairAttempt[] = [];
    let processed = 0;

    for (const [functionName, info] of repairQueue) {
      if (processed >= MAX_FUNCTIONS_PER_RUN) {
        console.log(`  Hit limit of ${MAX_FUNCTIONS_PER_RUN} per run — remaining functions deferred to next cycle`);
        break;
      }
      processed++;
      console.log(`\nRepairing: ${info.displayName} (${functionName}) [source: ${info.source}]`);

      // Check if it's already recovered
      const alreadyOk = await checkRecovered(supabase, functionName);
      if (alreadyOk) {
        console.log(`  ${functionName} already recovered`);
        if (info.alertId) await markAsRead(graphToken, mailbox, info.alertId);
        results.push({
          functionName,
          displayName: info.displayName,
          source: info.source,
          alertMessageId: info.alertId,
          attempts: 0,
          resolved: true,
        });
        continue;
      }

      // Retry loop
      let resolved = false;
      let attempts = 0;

      for (let i = 0; i < MAX_RETRIES; i++) {
        attempts++;
        metrics.addApiCall();
        console.log(`  Attempt ${attempts}/${MAX_RETRIES} for ${functionName}...`);

        const retrySuccess = await retryFunction(functionName, serviceRoleKey);

        if (retrySuccess) {
          // Manual calls bypass the schedule gate, so update schedule_config ourselves
          await markRecovered(supabase, functionName);
          resolved = true;
          console.log(`  ${functionName} HEALED on attempt ${attempts}`);
          break;
        }

        if (i < MAX_RETRIES - 1) {
          console.log(`  Waiting ${RETRY_DELAY_MS / 1000}s before next attempt...`);
          await sleep(RETRY_DELAY_MS);
        }
      }

      // Mark alert emails as read for this function
      if (info.alertId) {
        await markAsRead(graphToken, mailbox, info.alertId);
      }
      // Mark any duplicate alerts for same function
      for (const a of alerts) {
        const p = parseAlertSubject(a.subject);
        if (p) {
          const resolved2 = await resolveFunction(supabase, p.displayName);
          if (resolved2?.function_name === functionName) {
            await markAsRead(graphToken, mailbox, a.id);
          }
        }
      }

      results.push({
        functionName,
        displayName: info.displayName,
        source: info.source,
        alertMessageId: info.alertId,
        attempts,
        resolved,
        error: resolved ? undefined : `Failed after ${attempts} attempts`,
      });

      if (resolved) {
        metrics.addEntries(1);
      } else {
        metrics.addError();
      }
    }

    // 4. Send summary email
    const resolvedResults = results.filter(r => r.resolved);
    const failed = results.filter(r => !r.resolved);
    const fromEmail = await getDefaultEmailSender(supabase);
    const recipients = await getInternalRecipients(supabase, 'health');

    const now = new Date();
    const timeStr = now.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    // Only send email if there were actual repair attempts
    if (results.length > 0) {
      const allResolved = failed.length === 0;
      const resolved = resolvedResults;
      const headerColor = allResolved ? COLORS.green : COLORS.red;
      const statusEmoji = allResolved ? '&#10004;' : '&#9888;';
      const statusText = allResolved ? 'All Issues Resolved' : 'Escalation Required';

      let bodyHtml = '';

      if (resolved.length > 0) {
        const resolvedRows = resolved.map(r => `
          <tr>
            <td style="padding:8px;border-bottom:1px solid #eee;">${r.displayName}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">
              <span style="background:#d4edda;color:#155724;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:bold;">HEALED</span>
            </td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${r.attempts || 'auto'}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;font-size:11px;color:#888;">${r.source === 'email' ? 'Alert Email' : 'DB Scan'}</td>
          </tr>
        `).join('');

        bodyHtml += `
          <div style="background:#d4edda;border-left:4px solid ${COLORS.green};padding:12px 16px;margin:0 0 16px;border-radius:0 4px 4px 0;">
            <strong style="color:#155724;">Self-Healed (${resolved.length})</strong>
          </div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#fff;border-radius:5px;margin:0 0 20px;">
            <thead>
              <tr style="background:#f0f0f0;">
                <th style="padding:8px;text-align:left;">Function</th>
                <th style="padding:8px;text-align:center;">Status</th>
                <th style="padding:8px;text-align:center;">Attempts</th>
                <th style="padding:8px;text-align:left;">Source</th>
              </tr>
            </thead>
            <tbody>${resolvedRows}</tbody>
          </table>
        `;
      }

      if (failed.length > 0) {
        const failedRows = failed.map(r => `
          <tr>
            <td style="padding:8px;border-bottom:1px solid #eee;">${r.displayName}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">
              <span style="background:#f8d7da;color:#721c24;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:bold;">FAILED</span>
            </td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${r.attempts}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px;color:#666;">${r.error || ''}</td>
          </tr>
        `).join('');

        bodyHtml += `
          <div style="background:#f8d7da;border-left:4px solid ${COLORS.red};padding:12px 16px;margin:0 0 16px;border-radius:0 4px 4px 0;">
            <strong style="color:#721c24;">Needs Human Attention (${failed.length})</strong>
          </div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#fff;border-radius:5px;margin:0 0 20px;">
            <thead>
              <tr style="background:#f0f0f0;">
                <th style="padding:8px;text-align:left;">Function</th>
                <th style="padding:8px;text-align:center;">Status</th>
                <th style="padding:8px;text-align:center;">Attempts</th>
                <th style="padding:8px;text-align:left;">Details</th>
              </tr>
            </thead>
            <tbody>${failedRows}</tbody>
          </table>
          <p style="margin:0;color:#721c24;font-size:13px;">These functions could not be auto-repaired after ${MAX_RETRIES} attempts each. Check Supabase dashboard logs for root cause.</p>
        `;
      }

      const header = emailHeader({
        color: headerColor,
        title: `${statusEmoji} Self-Heal Report — ${statusText}`,
        subtitle: timeStr,
      });

      const body = contentSection(bodyHtml);
      const footer = emailFooter({ internal: true });
      const htmlBody = emailWrapper(`${header}${body}${footer}`);

      const subject = allResolved
        ? `Self-Heal: ${resolved.length} function(s) auto-repaired — ${timeStr}`
        : `ESCALATION: ${failed.length} function(s) need attention — ${timeStr}`;

      await sendEmail({ from: fromEmail, to: recipients, subject, htmlBody }, outlookConfig);
      metrics.addApiCall();
    }

    metrics.setMeta('alerts_found', alerts.length);
    metrics.setMeta('resolved', resolvedResults.length);
    metrics.setMeta('escalated', failed.length);
    metrics.setMeta('results', results);
    await metrics.end(failed.length === 0 ? 'success' : 'error');

    // Update own schedule_config so health digest sees us as healthy
    await supabase
      .from('schedule_config')
      .update({ last_run_at: new Date().toISOString(), last_run_status: failed.length === 0 ? 'success' : 'error' })
      .eq('function_name', 'self-heal');

    return new Response(
      JSON.stringify({
        success: true,
        alertsFound: alerts.length,
        repaired: resolvedResults.length,
        escalated: failed.length,
        details: results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Self-heal error:', error);
    metrics.setMeta('fatal_error', error.message);
    await metrics.end('error');
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
