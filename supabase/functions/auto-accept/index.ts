/**
 * Auto-Accept at Day 3 Close of Business
 * Automatically marks reports as accepted when 3 business days pass
 * with no customer response. Sends proof-of-delivery confirmation email.
 * Schedule: pg_cron at 5:00 PM weekdays (0 17 * * 1-5)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail, getDefaultEmailSender } from '../_shared/outlook-email.ts';
import { acceptedEmail, type NotificationRecord } from '../_shared/email-templates.ts';
import { shouldRun } from '../_shared/schedule-gate.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Internal CC recipients
const INTERNAL_CC = [
  'skisner@mitigationconsulting.com',
  'david@mitigationconsulting.com',
];

/**
 * Count business days between two dates
 */
function businessDaysBetween(start: Date, end: Date): number {
  let count = 0;
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);
  while (d < endDay) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

function fmtDateTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

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
      const gate = await shouldRun('auto-accept', supabaseClient);
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

    // Find reports that are still 'sent' (no customer action) and 3+ business days old
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
        JSON.stringify({ success: true, message: 'No reports eligible for auto-accept', accepted: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: Array<{ customer: string; weekStart: string }> = [];

    for (const rp of pendingReports) {
      const sentAt = new Date(rp.sent_at);
      const bizDays = businessDaysBetween(sentAt, now);

      // Only auto-accept if 3+ business days have passed
      if (bizDays < 3) continue;

      const reviewToken = rp.review_tokens?.[0];

      // Skip if customer already took action (shouldn't be 'sent' status, but double-check)
      if (reviewToken?.customer_action) continue;

      // 1. Update report_periods → accepted
      await supabaseClient
        .from('report_periods')
        .update({
          status: 'accepted',
          accepted_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', rp.id);

      // 2. Update review token if exists
      if (reviewToken) {
        await supabaseClient
          .from('review_tokens')
          .update({
            customer_action: 'accepted',
            customer_action_at: now.toISOString(),
            customer_notes: 'Auto-accepted: no response within 3 business days',
          })
          .eq('id', reviewToken.id);
      }

      // 3. Build notification proof table from follow-ups
      const { data: followUps } = await supabaseClient
        .from('review_follow_ups')
        .select('*')
        .eq('report_period_id', rp.id)
        .order('follow_up_number', { ascending: true });

      // Build the notification history for the proof-of-delivery email
      const notifications: NotificationRecord[] = [];

      // Original report send
      notifications.push({
        label: 'Weekly Activity Report',
        sentAt: fmtDateTime(rp.sent_at),
        delivered: true,
        deliveredAt: fmtDateTime(rp.sent_at),
        opened: reviewToken?.first_opened_at ? true : false,
        openedAt: reviewToken?.first_opened_at ? fmtDateTime(reviewToken.first_opened_at) : undefined,
      });

      // Follow-up emails
      const emailLabels: Record<string, string> = {
        '48h_reminder': '48-Hour Review Reminder',
        '24h_reminder': '24-Hour Review Reminder',
        'final_notice': 'Final Notice',
      };

      if (followUps) {
        for (const fu of followUps) {
          if (!emailLabels[fu.email_type]) continue;
          notifications.push({
            label: emailLabels[fu.email_type],
            sentAt: fmtDateTime(fu.sent_at),
            delivered: fu.delivered_at ? true : true, // Assume delivered if sent
            deliveredAt: fmtDateTime(fu.delivered_at || fu.sent_at),
            opened: fu.opened_at ? true : false,
            openedAt: fu.opened_at ? fmtDateTime(fu.opened_at) : undefined,
          });
        }
      }

      // 4. Get customer email
      const { data: customer } = await supabaseClient
        .from('customers')
        .select('email, display_name')
        .eq('id', rp.customer_id)
        .single();

      if (!customer?.email) continue;

      const fmtStart = new Date(rp.week_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const fmtEnd = new Date(rp.week_end + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      // 5. Send proof-of-delivery "Accepted as Accurate" email
      const htmlBody = acceptedEmail({
        customerName: rp.customer_name,
        periodStart: fmtStart,
        periodEnd: fmtEnd,
        totalHours: rp.total_hours,
        notifications,
      });

      const emailResult = await sendEmail(
        {
          from: fromEmail,
          to: [customer.email],
          cc: INTERNAL_CC,
          subject: `Time Entries Confirmed as Accurate — ${rp.customer_name} — Week of ${fmtStart}`,
          htmlBody,
        },
        outlookConfig
      );

      // 6. Log
      const { data: emailLogRow } = await supabaseClient.from('email_log').insert({
        customer_id: rp.customer_id,
        email_type: 'accepted_confirmation',
        week_start: rp.week_start,
        week_end: rp.week_end,
        total_hours: rp.total_hours,
        follow_up_number: 4,
        resend_id: emailResult.messageId || null,
      }).select('id').single();

      if (reviewToken) {
        await supabaseClient.from('review_follow_ups').insert({
          report_period_id: rp.id,
          review_token_id: reviewToken.id,
          follow_up_number: 4,
          email_type: 'accepted_confirmation',
          sent_at: now.toISOString(),
          email_log_id: emailLogRow?.id || null,
        });
      }

      results.push({
        customer: rp.customer_name,
        weekStart: rp.week_start,
      });

      console.log(`Auto-accepted: ${rp.customer_name} for week ${rp.week_start}`);
    }

    // Mark schedule gate as successful
    if ((globalThis as any).__gateComplete) {
      await (globalThis as any).__gateComplete('success');
    }

    return new Response(
      JSON.stringify({
        success: true,
        accepted: results.length,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    if ((globalThis as any).__gateComplete) {
      await (globalThis as any).__gateComplete('error');
    }
    console.error('Error in auto-accept:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
