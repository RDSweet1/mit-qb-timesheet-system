/**
 * Mid-Week Oversight
 * Checks for report_periods with late entries that haven't had supplemental reports sent.
 * Schedule: pg_cron Wednesday 10:00 AM EST (0 15 * * 3)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail, getDefaultEmailSender } from '../_shared/outlook-email.ts';
import { emailWrapper, emailHeader, emailFooter, contentSection, COLORS } from '../_shared/email-templates.ts';
import { shouldRun } from '../_shared/schedule-gate.ts';
import { getInternalRecipients } from '../_shared/config.ts';

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

    // Schedule gate
    let body: any = {};
    try { body = await req.clone().json(); } catch {}
    if (!body.manual) {
      const gate = await shouldRun('midweek-oversight', supabase);
      if (!gate.run) {
        return new Response(JSON.stringify({ skipped: true, reason: gate.reason }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      (globalThis as any).__gateComplete = gate.complete;
    }

    const outlookConfig = {
      tenantId: Deno.env.get('AZURE_TENANT_ID') ?? '',
      clientId: Deno.env.get('AZURE_CLIENT_ID') ?? '',
      clientSecret: Deno.env.get('AZURE_CLIENT_SECRET') ?? '',
    };

    // Find report_periods from the past 4 weeks that:
    // - Have late entries (late_entry_count > 0)
    // - Status is still 'sent' (no supplemental has been sent)
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    const cutoff = fourWeeksAgo.toISOString().split('T')[0];

    const { data: pendingSupplementals, error: queryErr } = await supabase
      .from('report_periods')
      .select('customer_name, week_start, week_end, sent_at, late_entry_count, late_entry_hours, total_hours, entry_count')
      .gte('week_start', cutoff)
      .eq('status', 'sent')
      .gt('late_entry_count', 0)
      .order('week_start', { ascending: false });

    if (queryErr) {
      throw new Error(`Failed to query report_periods: ${queryErr.message}`);
    }

    // Also check for reports that were sent but never accepted/reviewed (stale reports)
    const { data: staleReports } = await supabase
      .from('report_periods')
      .select('customer_name, week_start, sent_at')
      .gte('week_start', cutoff)
      .eq('status', 'sent')
      .not('sent_at', 'is', null);

    // Filter stale: sent more than 5 business days ago with no action
    const now = new Date();
    const staleItems = (staleReports || []).filter(r => {
      const sentAt = new Date(r.sent_at);
      const daysSince = (now.getTime() - sentAt.getTime()) / (1000 * 60 * 60 * 24);
      return daysSince > 7; // More than a week with no response
    });

    const hasIssues = (pendingSupplementals && pendingSupplementals.length > 0) || staleItems.length > 0;

    if (!hasIssues) {
      // No issues — skip email to avoid noise
      if ((globalThis as any).__gateComplete) {
        await (globalThis as any).__gateComplete('success');
      }
      return new Response(
        JSON.stringify({ success: true, message: 'No mid-week issues detected', pendingSupplementals: 0, staleReports: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build email
    let supplementalSection = '';
    if (pendingSupplementals && pendingSupplementals.length > 0) {
      const rows = pendingSupplementals.map(r => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee;">${r.customer_name}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;">Week of ${r.week_start}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${r.late_entry_count}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${(r.late_entry_hours || 0).toFixed(2)}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px;">${new Date(r.sent_at).toLocaleDateString('en-US', { timeZone: 'America/New_York' })}</td>
        </tr>
      `).join('');

      supplementalSection = `
        <div style="margin:20px 0;padding:15px;background:#fff3cd;border:1px solid #ffeaa7;border-radius:5px;">
          <h3 style="margin:0 0 10px;color:#856404;">Late Entries — Supplemental Reports Needed</h3>
          <p style="color:#856404;margin:0 0 10px;">These customers have late time entries that arrived after the weekly report was sent. Consider sending supplemental reports:</p>
          <table style="width:100%;border-collapse:collapse;background:white;border-radius:5px;">
            <thead>
              <tr style="background:#f0f0f0;">
                <th style="padding:8px;text-align:left;">Customer</th>
                <th style="padding:8px;text-align:left;">Week</th>
                <th style="padding:8px;text-align:center;">Late Entries</th>
                <th style="padding:8px;text-align:center;">Late Hours</th>
                <th style="padding:8px;text-align:left;">Report Sent</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    }

    let staleSection = '';
    if (staleItems.length > 0) {
      const rows = staleItems.map(r => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee;">${r.customer_name}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;">Week of ${r.week_start}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;">${new Date(r.sent_at).toLocaleDateString('en-US', { timeZone: 'America/New_York' })}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${Math.round((now.getTime() - new Date(r.sent_at).getTime()) / (1000 * 60 * 60 * 24))} days</td>
        </tr>
      `).join('');

      staleSection = `
        <div style="margin:20px 0;padding:15px;background:#e8daef;border:1px solid #d5c8e8;border-radius:5px;">
          <h3 style="margin:0 0 10px;color:#6c3483;">Stale Reports — No Customer Response</h3>
          <p style="color:#6c3483;margin:0 0 10px;">These reports were sent over 7 days ago with no customer action (no accept/dispute):</p>
          <table style="width:100%;border-collapse:collapse;background:white;border-radius:5px;">
            <thead>
              <tr style="background:#f8f4fc;">
                <th style="padding:8px;text-align:left;">Customer</th>
                <th style="padding:8px;text-align:left;">Week</th>
                <th style="padding:8px;text-align:left;">Sent</th>
                <th style="padding:8px;text-align:center;">Age</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    }

    const header = emailHeader({
      color: '#f0ad4e',
      title: '&#9888; Mid-Week Oversight Alert',
      subtitle: 'Internal — Action may be required',
    });

    const bodyHtml = contentSection(`
      <p style="margin:0 0 12px;">Hi Sharon &amp; David,</p>
      <p style="margin:0 0 16px;">The mid-week check has found items that may need attention:</p>
      ${supplementalSection}
      ${staleSection}
      <div style="margin:20px 0;padding:15px;background:#e8f4f8;border:1px solid #bee5eb;border-radius:5px;">
        <h3 style="margin:0 0 10px;color:#0c5460;">Action Items</h3>
        <ul style="color:#0c5460;margin:0;padding-left:20px;">
          ${pendingSupplementals && pendingSupplementals.length > 0 ? '<li>Send supplemental reports for customers with late entries</li>' : ''}
          ${staleItems.length > 0 ? '<li>Follow up with customers who haven\'t responded to reports over 7 days old</li>' : ''}
        </ul>
      </div>
    `);

    const footer = emailFooter({ internal: true });
    const htmlEmail = emailWrapper(`${header}${bodyHtml}${footer}`);

    const fromEmail = await getDefaultEmailSender(supabase);
    const recipients = await getInternalRecipients(supabase, 'reconciliation');

    const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
    const subject = `Mid-Week Oversight — ${pendingSupplementals?.length || 0} supplementals pending, ${staleItems.length} stale reports — ${today}`;

    const emailResult = await sendEmail(
      { from: fromEmail, to: recipients, subject, htmlBody: htmlEmail },
      outlookConfig
    );

    if ((globalThis as any).__gateComplete) {
      await (globalThis as any).__gateComplete(emailResult.success ? 'success' : 'error');
    }

    return new Response(
      JSON.stringify({
        success: true,
        pendingSupplementals: pendingSupplementals?.length || 0,
        staleReports: staleItems.length,
        emailSent: emailResult.success,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    if ((globalThis as any).__gateComplete) {
      await (globalThis as any).__gateComplete('error');
    }
    console.error('Mid-week oversight error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
