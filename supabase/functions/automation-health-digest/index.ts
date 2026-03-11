/**
 * Daily Automation Health Digest
 * Sends a summary email every morning showing the status of all automated functions.
 * Schedule: pg_cron at 7:00 AM EST daily (0 12 * * *)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail, getDefaultEmailSender } from '../_shared/outlook-email.ts';
import { emailWrapper, emailHeader, emailFooter, contentSection, COLORS } from '../_shared/email-templates.ts';
import { shouldRun } from '../_shared/schedule-gate.ts';
import { getInternalRecipients } from '../_shared/config.ts';
import { fetchWithRetry } from '../_shared/fetch-retry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const outlookConfig = {
      tenantId: Deno.env.get('AZURE_TENANT_ID') ?? '',
      clientId: Deno.env.get('AZURE_CLIENT_ID') ?? '',
      clientSecret: Deno.env.get('AZURE_CLIENT_SECRET') ?? '',
    };

    // Schedule gate (with outlookConfig for watchdog alerts if health digest itself fails)
    let body: any = {};
    try { body = await req.clone().json(); } catch {}
    if (!body.manual) {
      const gate = await shouldRun('automation-health-digest', supabase, { outlookConfig });
      if (!gate.run) {
        return new Response(JSON.stringify({ skipped: true, reason: gate.reason }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      (globalThis as any).__gateComplete = gate.complete;
    }

    // 1. Get all schedule_config rows
    const { data: schedules } = await supabase
      .from('schedule_config')
      .select('*')
      .order('id');

    // 2. Get function_metrics from last 24 hours
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentMetrics } = await supabase
      .from('function_metrics')
      .select('function_name, status, started_at, duration_ms, error_count, entries_processed')
      .gte('started_at', since)
      .order('started_at', { ascending: false });

    // 3. Aggregate metrics by function
    const metricsMap: Record<string, { runs: number; errors: number; lastStatus: string; lastRun: string }> = {};
    for (const m of recentMetrics || []) {
      if (!metricsMap[m.function_name]) {
        metricsMap[m.function_name] = { runs: 0, errors: 0, lastStatus: m.status, lastRun: m.started_at };
      }
      metricsMap[m.function_name].runs++;
      if (m.status === 'error') metricsMap[m.function_name].errors++;
    }

    // 4. Determine overall health
    let hasErrors = false;
    let hasStale = false;
    const rows: string[] = [];

    // Functions that manage their own metrics and don't use schedule_config for status
    const SELF_MANAGED = new Set(['self-heal']);

    for (const sched of schedules || []) {
      const metrics = metricsMap[sched.function_name];

      // For self-managed functions, check function_metrics instead of schedule_config
      if (SELF_MANAGED.has(sched.function_name)) {
        const hasRecentRun = metrics && metrics.runs > 0;
        const statusBadge = hasRecentRun
          ? `<span style="background:#d4edda;color:#155724;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:bold;">OK</span>`
          : `<span style="background:#fff3cd;color:#856404;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:bold;">STALE</span>`;
        if (!hasRecentRun) hasStale = true;
        const lastRunStr = metrics ? new Date(metrics.lastRun).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Never';
        const metricsStr = metrics ? `${metrics.runs} run(s), ${metrics.errors} error(s)` : 'No activity';
        rows.push(`
          <tr>
            <td style="padding:8px;border-bottom:1px solid #eee;">${sched.display_name}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${statusBadge}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;">${lastRunStr}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px;">${sched.schedule_day} @ ${String(sched.schedule_time).slice(0, 5)}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px;">${metricsStr}</td>
          </tr>
        `);
        continue;
      }

      const lastRunAt = sched.last_run_at ? new Date(sched.last_run_at) : null;
      const lastStatus = sched.last_run_status || 'never';

      // Check staleness: if a function hasn't run in expected window
      let stale = false;
      if (lastRunAt) {
        const hoursSinceRun = (Date.now() - lastRunAt.getTime()) / (1000 * 60 * 60);
        const isDaily = sched.schedule_day === 'daily' || sched.schedule_day === 'weekdays';
        const isWeekly = !isDaily;
        if (isDaily && hoursSinceRun > 36) stale = true;
        if (isWeekly && hoursSinceRun > 192) stale = true; // 8 days
      } else {
        stale = true;
      }

      const isError = lastStatus === 'error';
      const isPaused = sched.is_paused;
      if (isError) hasErrors = true;
      if (stale && !isPaused) hasStale = true;

      // Status badge
      let statusBadge: string;
      if (isPaused) {
        statusBadge = `<span style="background:#e2e3e5;color:#383d41;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:bold;">PAUSED</span>`;
      } else if (isError) {
        statusBadge = `<span style="background:#f8d7da;color:#721c24;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:bold;">ERROR</span>`;
      } else if (stale) {
        statusBadge = `<span style="background:#fff3cd;color:#856404;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:bold;">STALE</span>`;
      } else {
        statusBadge = `<span style="background:#d4edda;color:#155724;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:bold;">OK</span>`;
      }

      const lastRunStr = lastRunAt
        ? lastRunAt.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
        : 'Never';

      const metricsStr = metrics
        ? `${metrics.runs} run(s), ${metrics.errors} error(s)`
        : 'No activity';

      rows.push(`
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee;">${sched.display_name}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${statusBadge}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;">${lastRunStr}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px;">${sched.schedule_day} @ ${String(sched.schedule_time).slice(0, 5)}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px;">${metricsStr}</td>
        </tr>
      `);
    }

    // 5. If issues found, trigger self-heal and capture results
    const allOk = !hasErrors && !hasStale;
    let selfHealResult: any = null;

    if (!allOk) {
      console.log('Health digest: issues detected — triggering self-heal...');
      try {
        const selfHealUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/self-heal`;
        const shRes = await fetchWithRetry(selfHealUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({ manual: true }),
        }, { label: 'self-heal trigger', maxRetries: 1 });
        selfHealResult = await shRes.json().catch(() => null);
        console.log('Health digest: self-heal result:', selfHealResult);
      } catch (shErr: any) {
        console.error('Health digest: self-heal invocation failed:', shErr.message);
        selfHealResult = { success: false, error: shErr.message };
      }
    }

    // 6. Build email
    const headerColor = hasErrors ? COLORS.red : hasStale ? '#f0ad4e' : COLORS.green;
    const statusText = hasErrors ? 'Action Required' : hasStale ? 'Attention Needed' : 'All Systems OK';

    const today = new Date().toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    const header = emailHeader({
      color: headerColor,
      title: `${allOk ? '&#10004;' : '&#9888;'} Automation Health — ${statusText}`,
      subtitle: today,
    });

    // Self-heal results section (only when triggered)
    let selfHealSection = '';
    if (selfHealResult) {
      const shSuccess = selfHealResult.success && selfHealResult.escalated === 0;
      const shColor = shSuccess ? COLORS.green : COLORS.red;
      const shIcon = shSuccess ? '&#10004;' : '&#9888;';
      const shStatus = shSuccess
        ? `Self-heal repaired ${selfHealResult.repaired || 0} function(s) automatically`
        : selfHealResult.error
          ? `Self-heal failed to run: ${selfHealResult.error}`
          : `Self-heal repaired ${selfHealResult.repaired || 0}, escalated ${selfHealResult.escalated || 0}`;

      let detailRows = '';
      if (selfHealResult.details && Array.isArray(selfHealResult.details)) {
        detailRows = selfHealResult.details.map((d: any) => `
          <tr>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;">${d.displayName || d.functionName}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">
              <span style="background:${d.resolved ? '#d4edda' : '#f8d7da'};color:${d.resolved ? '#155724' : '#721c24'};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:bold;">${d.resolved ? 'HEALED' : 'FAILED'}</span>
            </td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;font-size:12px;">${d.attempts || 0}</td>
          </tr>
        `).join('');
      }

      selfHealSection = `
        <div style="background:${shSuccess ? '#d4edda' : '#f8d7da'};border-left:4px solid ${shColor};padding:12px 16px;margin:16px 0;border-radius:0 4px 4px 0;">
          <strong style="color:${shSuccess ? '#155724' : '#721c24'};">${shIcon} ${shStatus}</strong>
        </div>
        ${detailRows ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#fff;border-radius:5px;margin:0 0 16px;font-size:13px;">
          <thead>
            <tr style="background:#f0f0f0;">
              <th style="padding:6px 8px;text-align:left;">Function</th>
              <th style="padding:6px 8px;text-align:center;">Result</th>
              <th style="padding:6px 8px;text-align:center;">Attempts</th>
            </tr>
          </thead>
          <tbody>${detailRows}</tbody>
        </table>` : ''}
      `;
    }

    const bodyContent = contentSection(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#fff;border-radius:5px;">
        <thead>
          <tr style="background:#f0f0f0;">
            <th style="padding:8px;text-align:left;">Function</th>
            <th style="padding:8px;text-align:center;">Status</th>
            <th style="padding:8px;text-align:left;">Last Run</th>
            <th style="padding:8px;text-align:left;">Schedule</th>
            <th style="padding:8px;text-align:left;">24h Activity</th>
          </tr>
        </thead>
        <tbody>${rows.join('')}</tbody>
      </table>
      ${selfHealSection}
      ${allOk ? '<p style="margin:16px 0 0;color:#155724;font-weight:bold;text-align:center;">All automations running normally. No action needed.</p>' : ''}
    `);

    const footer = emailFooter({ internal: true });
    const htmlBody = emailWrapper(`${header}${bodyContent}${footer}`);

    const fromEmail = await getDefaultEmailSender(supabase);
    const recipients = await getInternalRecipients(supabase, 'health');

    const subject = allOk
      ? `Automation Health — All Systems OK — ${today}`
      : selfHealResult?.success && selfHealResult?.escalated === 0
        ? `Automation Health — Issues Auto-Repaired — ${today}`
        : `Automation Health — ${statusText} — ${today}`;

    const emailResult = await sendEmail(
      { from: fromEmail, to: recipients, subject, htmlBody },
      outlookConfig
    );

    // Mark gate complete
    if ((globalThis as any).__gateComplete) {
      await (globalThis as any).__gateComplete(emailResult.success ? 'success' : 'error');
    }

    return new Response(
      JSON.stringify({
        success: true,
        allOk,
        functionsChecked: schedules?.length || 0,
        hasErrors,
        hasStale,
        emailSent: emailResult.success,
        selfHealTriggered: !allOk,
        selfHealResult: selfHealResult || null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    if ((globalThis as any).__gateComplete) {
      await (globalThis as any).__gateComplete('error');
    }
    console.error('Health digest error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
