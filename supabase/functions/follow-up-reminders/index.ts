/**
 * Follow-Up Reminder Sequence
 * Sends automated follow-up emails for reports awaiting customer review.
 * Schedule: pg_cron at 9:00 AM weekdays (0 9 * * 1-5)
 *
 * Business day sequence after initial report send:
 *   Day 1 (48h): "Please review — 48 hours remaining"
 *   Day 2 (24h): "Reminder — 24 hours remaining"
 *   Day 3 (AM):  "Final notice — accepted at close of business today"
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail, getDefaultEmailSender } from '../_shared/outlook-email.ts';
import {
  emailWrapper, emailHeader, emailFooter, emailButton,
  reviewNotice, contentSection, summaryStats, COLORS,
} from '../_shared/email-templates.ts';
import { shouldRun } from '../_shared/schedule-gate.ts';
import { businessDaysBetween } from '../_shared/date-utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

import { getPortalUrl } from '../_shared/config.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Schedule gate — skip if paused or outside scheduled window
    let body: any = {};
    try { body = await req.clone().json(); } catch {}
    if (!body.manual) {
      const gate = await shouldRun('follow-up-reminders', supabaseClient);
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

    const fromEmail = await getDefaultEmailSender(supabaseClient);
    const now = new Date();

    // Find all report_periods with status='sent' (awaiting review)
    const { data: pendingReports, error: rpErr } = await supabaseClient
      .from('report_periods')
      .select('*, review_tokens(*)')
      .eq('status', 'sent')
      .not('sent_at', 'is', null);

    if (rpErr) {
      throw new Error(`Failed to fetch pending reports: ${rpErr.message}`);
    }

    if (!pendingReports || pendingReports.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No pending reports require follow-up', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Batch-fetch all customers upfront to avoid N+1 queries
    const customerIds = [...new Set(pendingReports.map((rp: any) => rp.customer_id))];
    const { data: allCustomers } = await supabaseClient
      .from('customers')
      .select('id, email, display_name')
      .in('id', customerIds);
    const customerMap: Record<number, { email: string; display_name: string }> = {};
    for (const c of allCustomers || []) {
      customerMap[c.id] = c;
    }

    const results: Array<{ customer: string; followUpNumber: number; emailType: string }> = [];

    for (const rp of pendingReports) {
      // Skip if no review token
      const reviewToken = rp.review_tokens?.[0];
      if (!reviewToken) continue;

      // Skip if customer already took action
      if (reviewToken.customer_action) continue;

      const sentAt = new Date(rp.sent_at);
      const bizDays = businessDaysBetween(sentAt, now);

      // Check what follow-ups have already been sent
      const { data: existingFollowUps } = await supabaseClient
        .from('review_follow_ups')
        .select('follow_up_number, email_type')
        .eq('report_period_id', rp.id)
        .order('follow_up_number', { ascending: true });

      const sentNumbers = new Set((existingFollowUps || []).map((f: any) => f.follow_up_number));

      // Get customer from pre-fetched map (avoids N+1 query)
      const customer = customerMap[rp.customer_id];
      if (!customer?.email) continue;

      const fmtStart = new Date(rp.week_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const fmtEnd = new Date(rp.week_end + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const reviewUrl = `${getPortalUrl('review')}?token=${reviewToken.token}`;

      // Determine which follow-up to send based on business days elapsed
      let emailType: string | null = null;
      let followUpNumber = 0;
      let subject = '';
      let bodyHtml = '';

      if (bizDays >= 1 && !sentNumbers.has(1)) {
        // Day 1: 48-hour reminder
        emailType = '48h_reminder';
        followUpNumber = 1;
        subject = `Action Required: Please Review Weekly Activities — ${rp.customer_name}`;
        bodyHtml = buildReminderEmail({
          customerName: rp.customer_name,
          periodStart: fmtStart,
          periodEnd: fmtEnd,
          totalHours: rp.total_hours,
          entryCount: rp.entry_count,
          reviewUrl,
          urgency: '48h',
          reportNumber: rp.report_number,
        });
      } else if (bizDays >= 2 && !sentNumbers.has(2)) {
        // Day 2: 24-hour reminder
        emailType = '24h_reminder';
        followUpNumber = 2;
        subject = `Reminder: 24 Hours Remaining — Time Entry Review — ${rp.customer_name}`;
        bodyHtml = buildReminderEmail({
          customerName: rp.customer_name,
          periodStart: fmtStart,
          periodEnd: fmtEnd,
          totalHours: rp.total_hours,
          entryCount: rp.entry_count,
          reviewUrl,
          urgency: '24h',
          reportNumber: rp.report_number,
        });
      } else if (bizDays >= 3 && !sentNumbers.has(3)) {
        // Day 3: Final notice
        emailType = 'final_notice';
        followUpNumber = 3;
        subject = `Final Notice: Time Entries Accepted at Close of Business Today — ${rp.customer_name}`;
        bodyHtml = buildReminderEmail({
          customerName: rp.customer_name,
          periodStart: fmtStart,
          periodEnd: fmtEnd,
          totalHours: rp.total_hours,
          entryCount: rp.entry_count,
          reviewUrl,
          urgency: 'final',
          reportNumber: rp.report_number,
        });
      }

      if (!emailType) continue;

      // Send email
      const emailResult = await sendEmail(
        {
          from: fromEmail,
          to: [customer.email],
          subject,
          htmlBody: bodyHtml,
        },
        outlookConfig
      );

      if (emailResult.success) {
        // Log to email_log
        const { data: emailLogRow } = await supabaseClient.from('email_log').insert({
          customer_id: rp.customer_id,
          email_type: emailType,
          week_start: rp.week_start,
          week_end: rp.week_end,
          total_hours: rp.total_hours,
          follow_up_number: followUpNumber,
          resend_id: emailResult.messageId || null,
        }).select('id').single();

        // Record follow-up
        await supabaseClient.from('review_follow_ups').insert({
          report_period_id: rp.id,
          review_token_id: reviewToken.id,
          follow_up_number: followUpNumber,
          email_type: emailType,
          sent_at: now.toISOString(),
          email_log_id: emailLogRow?.id || null,
        });

        results.push({
          customer: rp.customer_name,
          followUpNumber,
          emailType,
        });

        console.log(`Sent ${emailType} to ${customer.email} for ${rp.customer_name}`);
      } else {
        console.error(`Failed to send ${emailType} to ${customer.email}: ${emailResult.error}`);
      }
    }

    // Mark schedule gate as successful
    if ((globalThis as any).__gateComplete) {
      await (globalThis as any).__gateComplete('success');
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: results.length,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    if ((globalThis as any).__gateComplete) {
      await (globalThis as any).__gateComplete('error');
    }
    console.error('Error in follow-up reminders:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ─── Build Reminder Email HTML ──────────────────────────────────────
interface ReminderOptions {
  customerName: string;
  periodStart: string;
  periodEnd: string;
  totalHours: number;
  entryCount: number;
  reviewUrl: string;
  urgency: '48h' | '24h' | 'final';
  reportNumber?: string | null;
}

function buildReminderEmail(opts: ReminderOptions): string {
  const isFinal = opts.urgency === 'final';
  const headerColor = isFinal ? COLORS.red : COLORS.blue;
  const title = isFinal
    ? 'Final Notice — Time Entry Review'
    : 'Action Required — Time Entry Review';

  const header = emailHeader({
    color: headerColor,
    title,
    reportNumber: opts.reportNumber || undefined,
    periodStart: opts.periodStart,
    periodEnd: opts.periodEnd,
    customerName: opts.customerName,
  });

  let messageText: string;
  if (opts.urgency === '48h') {
    messageText = `
      <p style="margin: 0 0 16px;">Dear ${opts.customerName},</p>
      <p style="margin: 0 0 16px;">Adjustments to weekly activities have been provided for the week of <strong>${opts.periodStart} &ndash; ${opts.periodEnd}</strong>. Please review at your earliest convenience.</p>
      <p style="margin: 0 0 16px;">You have <strong>48 hours</strong> to respond with any notes or clarifications regarding the <strong>${opts.totalHours.toFixed(2)} hours</strong> reported across <strong>${opts.entryCount} entries</strong>.</p>
      <p style="margin: 0;">If no response is received within three (3) business days of the original report, the time will be confirmed as accurate and billable.</p>
    `;
  } else if (opts.urgency === '24h') {
    messageText = `
      <p style="margin: 0 0 16px;">Dear ${opts.customerName},</p>
      <p style="margin: 0 0 16px;">This is a reminder that you have <strong>24 hours remaining</strong> to review the time entries for the week of <strong>${opts.periodStart} &ndash; ${opts.periodEnd}</strong> and provide any notes or clarifications you may have.</p>
      <p style="margin: 0 0 16px;"><strong>${opts.totalHours.toFixed(2)} hours</strong> across <strong>${opts.entryCount} entries</strong> are pending your review.</p>
      <p style="margin: 0;">If no response is received by close of business tomorrow, the time will be confirmed as accurate and billable.</p>
    `;
  } else {
    messageText = `
      <p style="margin: 0 0 16px;">Dear ${opts.customerName},</p>
      <p style="margin: 0 0 16px;">This is your <strong>final notice</strong>. If no response is received by <strong>close of business today</strong>, the time entries for the week of <strong>${opts.periodStart} &ndash; ${opts.periodEnd}</strong> will be <strong>confirmed as accurate as reported</strong>.</p>
      <p style="margin: 0 0 16px;"><strong>${opts.totalHours.toFixed(2)} hours</strong> across <strong>${opts.entryCount} entries</strong> will be accepted.</p>
      <p style="margin: 0;">To report discrepancies or request adjustments, please use the review link below immediately.</p>
    `;
  }

  const body = contentSection(messageText);
  const button = emailButton(opts.reviewUrl, 'Review &amp; Accept Time Entries', isFinal ? COLORS.red : COLORS.blue);
  const notice = isFinal ? '' : reviewNotice();
  const footer = emailFooter();

  return emailWrapper(`${header}${body}${button}${notice}${footer}`);
}
