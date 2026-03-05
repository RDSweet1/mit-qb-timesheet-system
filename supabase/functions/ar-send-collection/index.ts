/**
 * ar-send-collection — Send a dunning email for a specific invoice + stage
 *
 * Called by ar-automation (auto stages) or manually from the AR frontend.
 * Uses Microsoft Graph API with delivery + read receipt tracking.
 * Links back to the original QB invoice (payment link).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STAGE_LABELS: Record<number, string> = {
  1: 'First Notice',
  2: 'Grace Period Expired',
  3: 'Second Notice',
  4: 'Final Notice',
  5: 'Attorney Referral',
};

function buildDunningEmail(opts: {
  stage: number;
  customerName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  balanceDue: number;
  qbPaymentLink?: string;
  periodStart: string;
  periodEnd: string;
}): string {
  const { stage, customerName, invoiceNumber, invoiceDate, dueDate, totalAmount, balanceDue, qbPaymentLink, periodStart, periodEnd } = opts;

  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const fmtMoney = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const payBtn = qbPaymentLink
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
        <tr><td align="center">
          <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${qbPaymentLink}" style="height:44px;v-text-anchor:middle;width:200px;" arcsize="10%" stroke="f" fillcolor="#1e40af"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">Pay Now</center></v:roundrect><![endif]-->
          <a href="${qbPaymentLink}" style="background:#1e40af;border-radius:6px;color:#ffffff;display:inline-block;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;line-height:44px;text-align:center;text-decoration:none;width:200px;-webkit-text-size-adjust:none;">Pay Now</a>
        </td></tr>
      </table>`
    : '';

  const tones: Record<number, { color: string; heading: string; body: string }> = {
    1: {
      color: '#1e40af',
      heading: 'Payment Reminder',
      body: `<p>This is a friendly reminder that payment of <strong>${fmtMoney(balanceDue)}</strong> for invoice #${invoiceNumber} was due on <strong>${fmt(dueDate)}</strong>.</p>
             <p>Please remit payment at your earliest convenience. If you have already sent payment, please disregard this notice.</p>`,
    },
    2: {
      color: '#d97706',
      heading: 'Grace Period Expired — Project On Hold',
      body: `<p>Your grace period for invoice #${invoiceNumber} has now expired. A balance of <strong>${fmtMoney(balanceDue)}</strong> remains outstanding.</p>
             <p><strong>Effective immediately, your project has been placed on hold</strong> until payment is received. Work will resume promptly upon receipt of payment.</p>
             <p>Please contact us immediately if you have any questions.</p>`,
    },
    3: {
      color: '#b45309',
      heading: 'Second Notice — Account Past Due',
      body: `<p>This is your second notice regarding an outstanding balance of <strong>${fmtMoney(balanceDue)}</strong> on invoice #${invoiceNumber}, which was due on <strong>${fmt(dueDate)}</strong>.</p>
             <p>Your project remains on hold. <strong>Immediate payment is required to resume services.</strong></p>
             <p>Please contact our office today to arrange payment.</p>`,
    },
    4: {
      color: '#dc2626',
      heading: 'Final Notice — Immediate Action Required',
      body: `<p>This is your <strong>final notice</strong> regarding an outstanding balance of <strong>${fmtMoney(balanceDue)}</strong> on invoice #${invoiceNumber}.</p>
             <p>If payment is not received within <strong>7 days</strong> of this notice, your account will be referred to our attorney for collections. This may result in additional fees and costs being assessed against you.</p>
             <p>To avoid further action, please remit payment immediately.</p>`,
    },
  };

  const tone = tones[stage] || tones[1];

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${tone.heading}</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

  <!-- Header -->
  <tr><td style="background:${tone.color};padding:28px 32px;">
    <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Mitigation Information Technologies</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">MIT Consulting — Accounts Receivable</p>
  </td></tr>

  <!-- Notice banner -->
  <tr><td style="background:${tone.color}22;padding:14px 32px;border-bottom:2px solid ${tone.color};">
    <p style="margin:0;font-size:16px;font-weight:700;color:${tone.color};">${tone.heading}</p>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Dear ${customerName},</p>
    <div style="font-size:14px;color:#374151;line-height:1.7;">
      ${tone.body}
    </div>

    <!-- Invoice Summary -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
      <tr style="background:#f3f4f6;">
        <th colspan="2" style="padding:10px 16px;text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280;letter-spacing:0.05em;">Invoice Details</th>
      </tr>
      <tr><td style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;width:40%;">Invoice Number</td>
          <td style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;font-weight:600;color:#111827;">#${invoiceNumber}</td></tr>
      <tr style="background:#f9fafb;">
          <td style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;">Service Period</td>
          <td style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;color:#111827;">${fmt(periodStart)} – ${fmt(periodEnd)}</td></tr>
      <tr><td style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;">Invoice Date</td>
          <td style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;color:#111827;">${fmt(invoiceDate)}</td></tr>
      <tr style="background:#f9fafb;">
          <td style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;">Due Date</td>
          <td style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;color:#dc2626;font-weight:600;">${fmt(dueDate)}</td></tr>
      <tr><td style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;">Original Amount</td>
          <td style="padding:10px 16px;border-top:1px solid #e5e7eb;font-size:13px;color:#111827;">${fmtMoney(totalAmount)}</td></tr>
      <tr style="background:#fef2f2;">
          <td style="padding:12px 16px;border-top:2px solid #dc2626;font-size:14px;font-weight:700;color:#dc2626;">Balance Due</td>
          <td style="padding:12px 16px;border-top:2px solid #dc2626;font-size:16px;font-weight:700;color:#dc2626;">${fmtMoney(balanceDue)}</td></tr>
    </table>

    ${payBtn}

    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">
      If you have questions about this invoice, please contact our office at
      <a href="mailto:accounting@mitigationconsulting.com" style="color:#1e40af;">accounting@mitigationconsulting.com</a>
      or call us directly.
    </p>
  </td></tr>

  <!-- Footer -->
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
    const { invoiceLogId, stage, sentBy = 'system', previewOnly = false } = body;

    if (!invoiceLogId || !stage) {
      return new Response(JSON.stringify({ success: false, error: 'invoiceLogId and stage required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
      });
    }

    // Get invoice + customer details
    const { data: inv, error: invError } = await supabase
      .from('invoice_log')
      .select('*')
      .eq('id', invoiceLogId)
      .single();

    if (invError || !inv) throw new Error(`Invoice ${invoiceLogId} not found`);
    if (inv.ar_status === 'paid') throw new Error('Invoice is already paid');

    // Get customer email
    const { data: customer } = await supabase
      .from('customers')
      .select('email, display_name')
      .eq('qb_customer_id', inv.qb_customer_id)
      .single();

    if (!customer?.email) throw new Error(`No email on file for ${inv.qb_customer_id}`);

    // Get sequence config for this stage
    const { data: config } = await supabase
      .from('ar_sequence_config')
      .select('*')
      .eq('stage', stage)
      .single();

    const stageLabel = config?.label || STAGE_LABELS[stage] || `Stage ${stage}`;

    // Build subject from template
    const subject = (config?.email_subject || `Payment Reminder — Invoice #${inv.qb_invoice_number || inv.qb_invoice_id}`)
      .replace('{invoice_number}', inv.qb_invoice_number || inv.qb_invoice_id || '')
      .replace('{customer_name}', inv.customer_name || '');

    const balanceDue = parseFloat(inv.balance_due ?? inv.total_amount ?? '0');
    const totalAmount = parseFloat(inv.total_amount ?? '0');

    const htmlBody = buildDunningEmail({
      stage,
      customerName: inv.customer_name,
      invoiceNumber: inv.qb_invoice_number || inv.qb_invoice_id || '',
      invoiceDate: inv.created_at?.split('T')[0] || inv.due_date,
      dueDate: inv.due_date,
      totalAmount,
      balanceDue,
      periodStart: inv.period_start,
      periodEnd: inv.period_end,
    });

    if (previewOnly) {
      return new Response(JSON.stringify({ success: true, preview: htmlBody, subject, recipient: customer.email }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get Azure token for Graph API
    const tenantId = Deno.env.get('AZURE_TENANT_ID');
    const clientId = Deno.env.get('AZURE_CLIENT_ID');
    const clientSecret = Deno.env.get('AZURE_CLIENT_SECRET');
    const fromEmail = Deno.env.get('FROM_EMAIL') || 'accounting@mitigationconsulting.com';

    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId!, client_secret: clientSecret!, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
    });
    if (!tokenRes.ok) throw new Error(`Azure token failed: ${await tokenRes.text()}`);
    const { access_token } = await tokenRes.json();

    // CC: always include Sharon + David for stages 2+
    const ccEmails = stage >= 2
      ? ['skisner@mitigationconsulting.com', 'david@mitigationconsulting.com']
      : ['david@mitigationconsulting.com'];

    // Create email message
    const createRes = await fetch(`https://graph.microsoft.com/v1.0/users/${fromEmail}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject,
        body: { contentType: 'HTML', content: htmlBody },
        toRecipients: [{ emailAddress: { address: customer.email } }],
        ccRecipients: ccEmails.map(e => ({ emailAddress: { address: e } })),
        isDeliveryReceiptRequested: true,
        isReadReceiptRequested: true,
      }),
    });
    if (!createRes.ok) throw new Error(`Create email failed: ${await createRes.text()}`);
    const { id: messageId } = await createRes.json();

    // Send the message
    const sendRes = await fetch(`https://graph.microsoft.com/v1.0/users/${fromEmail}/messages/${messageId}/send`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${access_token}` },
    });
    if (!sendRes.ok) throw new Error(`Send failed: ${await sendRes.text()}`);

    console.log(`📧 Stage ${stage} dunning sent to ${customer.email} for invoice ${inv.qb_invoice_id}`);

    // Get next stage config to compute next_action_date
    const { data: nextConfig } = await supabase
      .from('ar_sequence_config')
      .select('days_from_due')
      .eq('stage', stage + 1)
      .single();

    const nextActionDate = nextConfig
      ? new Date(new Date(inv.due_date).getTime() + nextConfig.days_from_due * 86400000).toISOString().split('T')[0]
      : null;

    // Update invoice_log: advance stage, set next action date, billing hold if Stage 2+
    const invUpdates: Record<string, any> = {
      current_stage: stage,
      next_action_date: stage >= 5 ? null : nextActionDate,
    };
    if (config?.creates_billing_hold) invUpdates.billing_hold = true;
    if (stage >= 5) {
      invUpdates.ar_status = 'attorney';
      invUpdates.attorney_referred_at = new Date().toISOString();
    }

    await supabase.from('invoice_log').update(invUpdates).eq('id', invoiceLogId);

    // Log to ar_collection_emails
    await supabase.from('ar_collection_emails').insert({
      invoice_log_id: invoiceLogId,
      qb_invoice_id: inv.qb_invoice_id,
      qb_customer_id: inv.qb_customer_id,
      customer_name: inv.customer_name,
      stage,
      stage_label: stageLabel,
      sent_by: sentBy,
      recipient_email: customer.email,
      cc_emails: ccEmails,
      message_id: messageId,
      amount_due: balanceDue,
      outcome: 'sent',
    });

    // Log to ar_activity_log
    await supabase.from('ar_activity_log').insert({
      invoice_log_id: invoiceLogId,
      qb_invoice_id: inv.qb_invoice_id,
      qb_customer_id: inv.qb_customer_id,
      activity_type: stage >= 5 ? 'attorney' : 'email',
      description: `${stageLabel} sent to ${customer.email} (balance: $${balanceDue.toFixed(2)})`,
      performed_by: sentBy,
      metadata: { stage, message_id: messageId, balance_due: balanceDue, next_action_date: nextActionDate },
    });

    return new Response(
      JSON.stringify({ success: true, stage, stageLabel, messageId, recipient: customer.email, nextActionDate }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ ar-send-collection failed:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
