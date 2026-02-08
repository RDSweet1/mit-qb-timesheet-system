/**
 * Customer Review Action Handler
 * Processes accept/dispute/notes from the customer review portal.
 * Sends confirmation emails and internal alerts as needed.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail, getDefaultEmailSender } from '../_shared/outlook-email.ts';
import { emailWrapper, emailHeader, emailFooter, contentSection, COLORS } from '../_shared/email-templates.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Internal recipients for dispute alerts
const INTERNAL_RECIPIENTS = [
  'skisner@mitigationconsulting.com',
  'david@mitigationconsulting.com',
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const outlookConfig = {
      tenantId: Deno.env.get('AZURE_TENANT_ID') ?? '',
      clientId: Deno.env.get('AZURE_CLIENT_ID') ?? '',
      clientSecret: Deno.env.get('AZURE_CLIENT_SECRET') ?? '',
    };

    const { token, action, notes } = await req.json();

    if (!token || !action) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing token or action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!['accepted', 'disputed', 'notes_submitted'].includes(action)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Fetch review token
    const { data: reviewToken, error: tokenErr } = await supabaseClient
      .from('review_tokens')
      .select('*, report_periods(*)')
      .eq('token', token)
      .single();

    if (tokenErr || !reviewToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired review token' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Check if already actioned
    if (reviewToken.customer_action) {
      return new Response(
        JSON.stringify({ success: false, error: 'This report has already been reviewed', existingAction: reviewToken.customer_action }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Check expiry
    if (reviewToken.expires_at && new Date(reviewToken.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ success: false, error: 'Review period has expired' }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const reportPeriod = reviewToken.report_periods;
    const now = new Date().toISOString();

    // Get client IP and user agent from request
    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    // 4. Update review_tokens
    await supabaseClient
      .from('review_tokens')
      .update({
        customer_action: action,
        customer_action_at: now,
        customer_notes: notes || null,
        customer_ip: clientIp,
        customer_user_agent: userAgent,
      })
      .eq('id', reviewToken.id);

    // 5. Update report_periods
    const rpUpdate: Record<string, any> = {
      updated_at: now,
    };

    if (action === 'accepted') {
      rpUpdate.status = 'accepted';
      rpUpdate.accepted_at = now;
    } else if (action === 'disputed' || action === 'notes_submitted') {
      rpUpdate.status = 'disputed';
    }

    await supabaseClient
      .from('report_periods')
      .update(rpUpdate)
      .eq('id', reportPeriod.id);

    // 6. Get customer email
    const { data: customer } = await supabaseClient
      .from('customers')
      .select('email, display_name')
      .eq('id', reportPeriod.customer_id)
      .single();

    const fromEmail = await getDefaultEmailSender(supabaseClient);

    const fmtStart = new Date(reportPeriod.week_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const fmtEnd = new Date(reportPeriod.week_end + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // 7. Send confirmation email to customer
    if (customer?.email) {
      let confirmHtml: string;
      let confirmSubject: string;

      if (action === 'accepted') {
        confirmSubject = `Confirmation: Time Entries Accepted — ${reportPeriod.customer_name} — ${fmtStart} – ${fmtEnd}`;
        const header = emailHeader({
          color: COLORS.green,
          title: 'Time Entries Accepted',
          periodStart: fmtStart,
          periodEnd: fmtEnd,
          customerName: reportPeriod.customer_name,
        });
        const body = contentSection(`
          <p style="margin: 0 0 16px;">Dear ${reportPeriod.customer_name},</p>
          <p style="margin: 0 0 16px;">Thank you for reviewing the time entries for the week of <strong>${fmtStart} &ndash; ${fmtEnd}</strong>. Your acceptance has been recorded.</p>
          <p style="margin: 0 0 16px;">No further action is required. These hours will be included on your next billing statement.</p>
          ${notes ? `<p style="margin: 0 0 8px; font-weight: bold;">Your notes:</p><p style="margin: 0 0 16px; padding: 12px; background-color: ${COLORS.grayLight}; border-radius: 6px; font-style: italic;">${escapeHtml(notes)}</p>` : ''}
          <p style="margin: 0;">If you have additional questions, please contact us at <a href="mailto:accounting@mitigationconsulting.com" style="color: ${COLORS.blue};">accounting@mitigationconsulting.com</a>.</p>
        `);
        const footer = emailFooter();
        confirmHtml = emailWrapper(`${header}${body}${footer}`);
      } else {
        confirmSubject = `Confirmation: Your Review Has Been Received — ${reportPeriod.customer_name}`;
        const header = emailHeader({
          color: COLORS.blue,
          title: 'Your Comments Have Been Received',
          periodStart: fmtStart,
          periodEnd: fmtEnd,
          customerName: reportPeriod.customer_name,
        });
        const body = contentSection(`
          <p style="margin: 0 0 16px;">Dear ${reportPeriod.customer_name},</p>
          <p style="margin: 0 0 16px;">Thank you for reviewing the time entries for the week of <strong>${fmtStart} &ndash; ${fmtEnd}</strong>. Your comments have been submitted and recorded.</p>
          ${notes ? `<p style="margin: 0 0 8px; font-weight: bold;">Your comments:</p><p style="margin: 0 0 16px; padding: 12px; background-color: ${COLORS.grayLight}; border-radius: 6px; font-style: italic;">${escapeHtml(notes)}</p>` : ''}
          <p style="margin: 0;">Our team will review your comments and follow up with you directly. If you have additional questions, please contact us at <a href="mailto:accounting@mitigationconsulting.com" style="color: ${COLORS.blue};">accounting@mitigationconsulting.com</a>.</p>
        `);
        const footer = emailFooter();
        confirmHtml = emailWrapper(`${header}${body}${footer}`);
      }

      // Send confirmation to customer
      const confirmResult = await sendEmail(
        {
          from: fromEmail,
          to: [customer.email],
          subject: confirmSubject,
          htmlBody: confirmHtml,
        },
        outlookConfig
      );

      // Log to email_log
      await supabaseClient.from('email_log').insert({
        customer_id: reportPeriod.customer_id,
        email_type: action === 'accepted' ? 'accepted_confirmation' : 'action_confirmation',
        week_start: reportPeriod.week_start,
        week_end: reportPeriod.week_end,
        total_hours: reportPeriod.total_hours,
        resend_id: confirmResult.messageId || null,
      });

      // Record follow-up
      await supabaseClient.from('review_follow_ups').insert({
        report_period_id: reportPeriod.id,
        review_token_id: reviewToken.id,
        follow_up_number: 0,
        email_type: action === 'accepted' ? 'accepted_confirmation' : 'action_confirmation',
        sent_at: now,
      });
    }

    // 8. If disputed, send internal alert to Sharon + David
    if (action === 'disputed' || action === 'notes_submitted') {
      const alertHeader = emailHeader({
        color: COLORS.red,
        title: 'Customer Response Received',
        subtitle: 'Action Required — Customer Dispute',
        periodStart: fmtStart,
        periodEnd: fmtEnd,
        customerName: reportPeriod.customer_name,
      });

      const alertBody = contentSection(`
        <p style="margin: 0 0 16px;"><strong>${reportPeriod.customer_name}</strong> has submitted comments regarding the time entries for <strong>${fmtStart} &ndash; ${fmtEnd}</strong>.</p>
        ${notes ? `
          <p style="margin: 0 0 8px; font-weight: bold;">Customer&rsquo;s comments:</p>
          <div style="padding: 16px; background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; margin-bottom: 16px;">
            <p style="margin: 0; white-space: pre-wrap;">${escapeHtml(notes)}</p>
          </div>
        ` : '<p style="margin: 0 0 16px; color: #6b7280;"><em>No specific comments provided.</em></p>'}
        <p style="margin: 0;"><strong>Action required:</strong> Review comments and respond to customer.</p>
      `);

      const alertFooter = emailFooter({ internal: true });
      const alertHtml = emailWrapper(`${alertHeader}${alertBody}${alertFooter}`);

      await sendEmail(
        {
          from: fromEmail,
          to: INTERNAL_RECIPIENTS,
          subject: `Customer Response Received — ${reportPeriod.customer_name} — Week of ${fmtStart}`,
          htmlBody: alertHtml,
        },
        outlookConfig
      );

      await supabaseClient.from('review_follow_ups').insert({
        report_period_id: reportPeriod.id,
        review_token_id: reviewToken.id,
        follow_up_number: 0,
        email_type: 'dispute_alert',
        sent_at: now,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        action,
        message: action === 'accepted'
          ? 'Time entries accepted. Confirmation email sent.'
          : 'Comments submitted. Our team will follow up.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing review action:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}
