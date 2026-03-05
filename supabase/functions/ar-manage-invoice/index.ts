/**
 * ar-manage-invoice — Manual AR actions from the frontend dashboard
 *
 * Actions:
 *   log_note         — Free-text note on an invoice (no email)
 *   log_call         — Log a phone call on an invoice (no email)
 *   promise_to_pay   — Record a payment commitment date + send confirmation email to customer
 *   mark_disputed    — Mark invoice as disputed, pause dunning, optional internal assignment
 *   resolve_dispute  — Resolve dispute, resume dunning at current stage
 *   clear_hold       — Manually lift a billing hold (Sharon override)
 *   update_customer_email — Update customer email address in customers table
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function buildPromiseEmail(opts: {
  customerName: string;
  invoiceNumber: string;
  balanceDue: number;
  promiseDate: string;
  note?: string;
  periodStart: string;
  periodEnd: string;
}): string {
  const { customerName, invoiceNumber, balanceDue, promiseDate, note, periodStart, periodEnd } = opts;
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const fmtMoney = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

  <tr><td style="background:#059669;padding:28px 32px;">
    <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Mitigation Information Technologies</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">MIT Consulting — Payment Arrangement Confirmed</p>
  </td></tr>

  <tr><td style="background:#ecfdf5;padding:14px 32px;border-bottom:2px solid #059669;">
    <p style="margin:0;font-size:16px;font-weight:700;color:#059669;">Payment Arrangement Confirmed</p>
  </td></tr>

  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Dear ${customerName},</p>
    <div style="font-size:14px;color:#374151;line-height:1.7;">
      <p>Thank you for contacting our office. This email confirms your commitment to remit payment of
      <strong>${fmtMoney(balanceDue)}</strong> for Invoice #${invoiceNumber} by
      <strong>${fmt(promiseDate)}</strong>.</p>
      ${note ? `<p style="padding:12px 16px;background:#f0fdf4;border-left:3px solid #059669;border-radius:4px;font-style:italic;">${note}</p>` : ''}
      <p>We appreciate your prompt attention to this matter. Collection activity will be paused pending
      receipt of payment by the agreed date.</p>
      <p>Please do not hesitate to contact us if circumstances change or if you have any questions.</p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
      <tr style="background:#f3f4f6;">
        <th colspan="2" style="padding:10px 16px;text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280;letter-spacing:0.05em;">Payment Arrangement Details</th>
      </tr>
      <tr><td style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;width:40%;">Invoice Number</td>
          <td style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;font-weight:600;color:#111827;">#${invoiceNumber}</td></tr>
      <tr style="background:#f9fafb;">
          <td style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;">Service Period</td>
          <td style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;color:#111827;">${fmt(periodStart)} – ${fmt(periodEnd)}</td></tr>
      <tr><td style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;">Amount Committed</td>
          <td style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;font-weight:600;color:#111827;">${fmtMoney(balanceDue)}</td></tr>
      <tr style="background:#ecfdf5;">
          <td style="padding:12px 16px;border-top:2px solid #059669;font-size:14px;font-weight:700;color:#059669;">Payment Due By</td>
          <td style="padding:12px 16px;border-top:2px solid #059669;font-size:16px;font-weight:700;color:#059669;">${fmt(promiseDate)}</td></tr>
    </table>

    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">
      Questions? Contact us at
      <a href="mailto:accounting@mitigationconsulting.com" style="color:#059669;">accounting@mitigationconsulting.com</a>.
    </p>
  </td></tr>

  <tr><td style="background:#f3f4f6;padding:16px 32px;border-top:1px solid #e5e7eb;">
    <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
      Mitigation Information Technologies &mdash; MIT Consulting<br>
      accounting@mitigationconsulting.com
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

async function getGraphToken(tenantId: string, clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) throw new Error(`Azure token failed: ${await res.text()}`);
  const { access_token } = await res.json();
  return access_token;
}

async function sendEmail(token: string, from: string, opts: {
  to: string;
  cc?: string[];
  subject: string;
  html: string;
}): Promise<string> {
  const createRes = await fetch(`https://graph.microsoft.com/v1.0/users/${from}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subject: opts.subject,
      body: { contentType: 'HTML', content: opts.html },
      toRecipients: [{ emailAddress: { address: opts.to } }],
      ccRecipients: (opts.cc || []).map(e => ({ emailAddress: { address: e } })),
      isDeliveryReceiptRequested: true,
      isReadReceiptRequested: true,
    }),
  });
  if (!createRes.ok) throw new Error(`Create email failed: ${await createRes.text()}`);
  const { id: messageId } = await createRes.json();

  const sendRes = await fetch(`https://graph.microsoft.com/v1.0/users/${from}/messages/${messageId}/send`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!sendRes.ok) throw new Error(`Send email failed: ${await sendRes.text()}`);
  return messageId;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const { invoiceLogId, action, data, performedBy = 'system' } = body;

    if (!invoiceLogId || !action) {
      return new Response(JSON.stringify({ success: false, error: 'invoiceLogId and action required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
      });
    }

    // Load invoice
    const { data: inv, error: invErr } = await supabase
      .from('invoice_log')
      .select('*')
      .eq('id', invoiceLogId)
      .single();

    if (invErr || !inv) throw new Error(`Invoice ${invoiceLogId} not found`);

    const fromEmail = Deno.env.get('FROM_EMAIL') || 'accounting@mitigationconsulting.com';

    // ─── log_note ───────────────────────────────────────────────────────────
    if (action === 'log_note') {
      const text = data?.text?.trim();
      if (!text) throw new Error('Note text required');

      await supabase.from('ar_activity_log').insert({
        invoice_log_id: invoiceLogId,
        qb_invoice_id: inv.qb_invoice_id,
        qb_customer_id: inv.qb_customer_id,
        activity_type: 'note',
        description: text,
        performed_by: performedBy,
        metadata: { manual: true },
      });

      return new Response(JSON.stringify({ success: true, action: 'log_note' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── log_call ───────────────────────────────────────────────────────────
    if (action === 'log_call') {
      const text = data?.text?.trim();
      if (!text) throw new Error('Call notes required');

      await supabase.from('ar_activity_log').insert({
        invoice_log_id: invoiceLogId,
        qb_invoice_id: inv.qb_invoice_id,
        qb_customer_id: inv.qb_customer_id,
        activity_type: 'call',
        description: text,
        performed_by: performedBy,
        metadata: { manual: true, contact_name: data?.contactName || null },
      });

      return new Response(JSON.stringify({ success: true, action: 'log_call' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── promise_to_pay ─────────────────────────────────────────────────────
    if (action === 'promise_to_pay') {
      const { date, note } = data || {};
      if (!date) throw new Error('Promise date required');

      const today = new Date().toISOString().split('T')[0];
      if (date <= today) throw new Error('Promise date must be in the future');

      // Get customer email
      const { data: customer } = await supabase
        .from('customers')
        .select('email, display_name')
        .eq('qb_customer_id', inv.qb_customer_id)
        .single();

      if (!customer?.email) throw new Error(`No email on file for ${inv.customer_name}. Please add customer email first.`);

      // Update invoice
      await supabase.from('invoice_log')
        .update({ promise_to_pay_date: date })
        .eq('id', invoiceLogId);

      // Log activity
      await supabase.from('ar_activity_log').insert({
        invoice_log_id: invoiceLogId,
        qb_invoice_id: inv.qb_invoice_id,
        qb_customer_id: inv.qb_customer_id,
        activity_type: 'promise',
        description: `Promise to pay by ${date}${note ? ` — ${note}` : ''}. Confirmation email sent to ${customer.email}.`,
        performed_by: performedBy,
        metadata: { promise_date: date, note, email_sent: true },
      });

      // Send confirmation email
      const balanceDue = parseFloat(inv.balance_due ?? inv.total_amount ?? '0');
      const html = buildPromiseEmail({
        customerName: inv.customer_name,
        invoiceNumber: inv.qb_invoice_number || inv.qb_invoice_id || '',
        balanceDue,
        promiseDate: date,
        note,
        periodStart: inv.billing_period_start,
        periodEnd: inv.billing_period_end,
      });

      const token = await getGraphToken(
        Deno.env.get('AZURE_TENANT_ID') ?? '',
        Deno.env.get('AZURE_CLIENT_ID') ?? '',
        Deno.env.get('AZURE_CLIENT_SECRET') ?? ''
      );

      const subject = `Payment Arrangement Confirmed — Invoice #${inv.qb_invoice_number || inv.qb_invoice_id}`;
      const messageId = await sendEmail(token, fromEmail, {
        to: customer.email,
        cc: ['skisner@mitigationconsulting.com', 'david@mitigationconsulting.com'],
        subject,
        html,
      });

      // Record in ar_collection_emails
      await supabase.from('ar_collection_emails').insert({
        invoice_log_id: invoiceLogId,
        qb_invoice_id: inv.qb_invoice_id,
        qb_customer_id: inv.qb_customer_id,
        customer_name: inv.customer_name,
        stage: inv.current_stage,
        stage_label: 'Promise to Pay Confirmation',
        sent_by: performedBy,
        recipient_email: customer.email,
        cc_emails: ['skisner@mitigationconsulting.com', 'david@mitigationconsulting.com'],
        message_id: messageId,
        amount_due: balanceDue,
        outcome: 'sent',
      });

      return new Response(JSON.stringify({ success: true, action: 'promise_to_pay', promiseDate: date, messageId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── mark_disputed ──────────────────────────────────────────────────────
    if (action === 'mark_disputed') {
      const { reason, assignedTo, assignedEmail } = data || {};
      if (!reason) throw new Error('Dispute reason required');

      // Pause dunning by clearing next_action_date
      await supabase.from('invoice_log').update({
        ar_status: 'disputed',
        dispute_reason: reason,
        next_action_date: null,
      }).eq('id', invoiceLogId);

      let description = `Invoice disputed: ${reason}`;
      if (assignedTo) description += ` — Assigned to ${assignedTo} for resolution.`;

      await supabase.from('ar_activity_log').insert({
        invoice_log_id: invoiceLogId,
        qb_invoice_id: inv.qb_invoice_id,
        qb_customer_id: inv.qb_customer_id,
        activity_type: 'dispute',
        description,
        performed_by: performedBy,
        metadata: { reason, assigned_to: assignedTo || null, assigned_email: assignedEmail || null },
      });

      // If an internal person is assigned, email them
      if (assignedEmail) {
        try {
          const token = await getGraphToken(
            Deno.env.get('AZURE_TENANT_ID') ?? '',
            Deno.env.get('AZURE_CLIENT_ID') ?? '',
            Deno.env.get('AZURE_CLIENT_SECRET') ?? ''
          );
          const html = `<p>You have been assigned a billing dispute to review:</p>
            <table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">
              <tr><td style="padding:8px 12px;color:#6b7280;border:1px solid #e5e7eb;">Customer</td><td style="padding:8px 12px;font-weight:600;border:1px solid #e5e7eb;">${inv.customer_name}</td></tr>
              <tr style="background:#f9fafb;"><td style="padding:8px 12px;color:#6b7280;border:1px solid #e5e7eb;">Invoice #</td><td style="padding:8px 12px;border:1px solid #e5e7eb;">${inv.qb_invoice_number || inv.qb_invoice_id}</td></tr>
              <tr><td style="padding:8px 12px;color:#6b7280;border:1px solid #e5e7eb;">Balance Due</td><td style="padding:8px 12px;font-weight:600;color:#dc2626;border:1px solid #e5e7eb;">$${parseFloat(inv.balance_due ?? '0').toFixed(2)}</td></tr>
              <tr style="background:#f9fafb;"><td style="padding:8px 12px;color:#6b7280;border:1px solid #e5e7eb;">Dispute Reason</td><td style="padding:8px 12px;border:1px solid #e5e7eb;">${reason}</td></tr>
            </table>
            <p>Please review the charges and provide documentation or corrections to <a href="mailto:${fromEmail}">${fromEmail}</a>.</p>
            <p style="font-size:12px;color:#9ca3af;">Assigned by ${performedBy} — MIT Consulting Accounting</p>`;
          await sendEmail(token, fromEmail, {
            to: assignedEmail,
            cc: ['skisner@mitigationconsulting.com'],
            subject: `Billing Dispute — Action Required — ${inv.customer_name} Invoice #${inv.qb_invoice_number || inv.qb_invoice_id}`,
            html,
          });
        } catch (e: any) {
          console.error('Failed to send dispute assignment email:', e.message);
        }
      }

      return new Response(JSON.stringify({ success: true, action: 'mark_disputed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── resolve_dispute ────────────────────────────────────────────────────
    if (action === 'resolve_dispute') {
      const { resolution } = data || {};

      // Resume dunning — compute next action date from current stage
      const { data: nextConfig } = await supabase
        .from('ar_sequence_config')
        .select('days_from_due')
        .eq('stage', (inv.current_stage || 0) + 1)
        .single();

      const nextActionDate = nextConfig && inv.due_date
        ? new Date(new Date(inv.due_date).getTime() + nextConfig.days_from_due * 86400000).toISOString().split('T')[0]
        : null;

      await supabase.from('invoice_log').update({
        ar_status: 'unpaid',
        dispute_reason: null,
        next_action_date: nextActionDate,
      }).eq('id', invoiceLogId);

      await supabase.from('ar_activity_log').insert({
        invoice_log_id: invoiceLogId,
        qb_invoice_id: inv.qb_invoice_id,
        qb_customer_id: inv.qb_customer_id,
        activity_type: 'note',
        description: `Dispute resolved${resolution ? `: ${resolution}` : ''}. Dunning resumed.`,
        performed_by: performedBy,
        metadata: { resolution, resumed_dunning: true, next_action_date: nextActionDate },
      });

      return new Response(JSON.stringify({ success: true, action: 'resolve_dispute', nextActionDate }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── clear_hold ─────────────────────────────────────────────────────────
    if (action === 'clear_hold') {
      await supabase.from('invoice_log').update({ billing_hold: false }).eq('id', invoiceLogId);

      await supabase.from('ar_activity_log').insert({
        invoice_log_id: invoiceLogId,
        qb_invoice_id: inv.qb_invoice_id,
        qb_customer_id: inv.qb_customer_id,
        activity_type: 'hold',
        description: `Billing hold cleared${data?.reason ? `: ${data.reason}` : ''}`,
        performed_by: performedBy,
        metadata: { hold_cleared: true },
      });

      return new Response(JSON.stringify({ success: true, action: 'clear_hold' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── update_customer_email ───────────────────────────────────────────────
    if (action === 'update_customer_email') {
      const { email } = data || {};
      if (!email || !email.includes('@')) throw new Error('Valid email address required');

      await supabase.from('customers').update({ email }).eq('qb_customer_id', inv.qb_customer_id);

      await supabase.from('ar_activity_log').insert({
        invoice_log_id: invoiceLogId,
        qb_invoice_id: inv.qb_invoice_id,
        qb_customer_id: inv.qb_customer_id,
        activity_type: 'note',
        description: `Customer email updated to ${email}`,
        performed_by: performedBy,
        metadata: { email_updated: true, new_email: email },
      });

      return new Response(JSON.stringify({ success: true, action: 'update_customer_email' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (error: any) {
    console.error('❌ ar-manage-invoice failed:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
