/**
 * ar-sync-emails — Pull customer email replies from accounting@ inbox into AR activity log
 *
 * Reads the accounting@ mailbox via Microsoft Graph API and logs any inbound messages
 * from known customer email addresses into ar_activity_log. Deduplicates by Graph message ID.
 *
 * Also scans sent folder for any manual emails to customers not already tracked in
 * ar_collection_emails (e.g., emails written directly in Outlook).
 *
 * Called: manually from AR dashboard, or daily from ar-automation cron
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

async function fetchMailPage(token: string, url: string): Promise<{ messages: any[]; nextLink: string | null }> {
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API error: ${res.status} — ${text}`);
  }
  const data = await res.json();
  return {
    messages: data.value || [],
    nextLink: data['@odata.nextLink'] || null,
  };
}

async function fetchAllMessages(token: string, mailbox: string, folder: string, since: string): Promise<any[]> {
  const fields = 'id,subject,from,toRecipients,receivedDateTime,conversationId,bodyPreview,internetMessageId';
  let url = `https://graph.microsoft.com/v1.0/users/${mailbox}/mailFolders/${folder}/messages` +
    `?$filter=receivedDateTime ge ${since}&$select=${fields}&$top=100&$orderby=receivedDateTime desc`;

  const all: any[] = [];
  let safetyLimit = 20; // max 2000 messages per run

  while (url && safetyLimit-- > 0) {
    const { messages, nextLink } = await fetchMailPage(token, url);
    all.push(...messages);
    url = nextLink || '';
  }

  return all;
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

    const body = await req.json().catch(() => ({}));
    const lookbackDays = body.lookbackDays || 90;

    const since = new Date(Date.now() - lookbackDays * 86400000).toISOString();
    const mailbox = Deno.env.get('FROM_EMAIL') || 'accounting@mitigationconsulting.com';

    console.log(`📧 AR Email Sync: scanning ${mailbox} last ${lookbackDays} days...`);

    // Build customer email → qb_customer_id lookup
    const { data: customers, error: custErr } = await supabase
      .from('customers')
      .select('qb_customer_id, display_name, email')
      .not('email', 'is', null);

    if (custErr) throw custErr;

    const emailToCustomer = new Map<string, { qb_customer_id: string; display_name: string }>();
    for (const c of customers || []) {
      if (c.email) emailToCustomer.set(c.email.toLowerCase().trim(), {
        qb_customer_id: c.qb_customer_id,
        display_name: c.display_name,
      });
    }

    if (emailToCustomer.size === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No customer emails on file', logged: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load all existing tracked message IDs to dedup
    const { data: existingActivities } = await supabase
      .from('ar_activity_log')
      .select('metadata')
      .not('metadata->message_id', 'is', null);

    const knownMessageIds = new Set(
      (existingActivities || []).map(a => a.metadata?.message_id).filter(Boolean)
    );

    const { data: existingEmails } = await supabase
      .from('ar_collection_emails')
      .select('message_id')
      .not('message_id', 'is', null);

    for (const e of existingEmails || []) {
      if (e.message_id) knownMessageIds.add(e.message_id);
    }

    console.log(`📬 ${emailToCustomer.size} customers with email, ${knownMessageIds.size} messages already tracked`);

    // Get Graph token
    const token = await getGraphToken(
      Deno.env.get('AZURE_TENANT_ID') ?? '',
      Deno.env.get('AZURE_CLIENT_ID') ?? '',
      Deno.env.get('AZURE_CLIENT_SECRET') ?? ''
    );

    // Fetch inbox (inbound from customers) and sentItems (outbound not yet logged)
    const [inboxMessages, sentMessages] = await Promise.all([
      fetchAllMessages(token, mailbox, 'inbox', since),
      fetchAllMessages(token, mailbox, 'sentItems', since),
    ]);

    console.log(`📥 Inbox: ${inboxMessages.length} messages | 📤 Sent: ${sentMessages.length} messages`);

    // Load most recent open invoice per qb_customer_id for linking
    const { data: openInvoices } = await supabase
      .from('invoice_log')
      .select('id, qb_invoice_id, qb_invoice_number, qb_customer_id')
      .not('ar_status', 'in', '("paid","void")')
      .order('created_at', { ascending: false });

    // Map: qb_customer_id → most recent open invoice
    const customerInvoice = new Map<string, { id: number; qb_invoice_id: string; qb_invoice_number: string }>();
    for (const inv of openInvoices || []) {
      if (!customerInvoice.has(inv.qb_customer_id)) {
        customerInvoice.set(inv.qb_customer_id, inv);
      }
    }

    let logged = 0;
    let skipped = 0;

    // Process inbound (customer replies / new messages from customers)
    for (const msg of inboxMessages) {
      const msgId = msg.id;
      if (knownMessageIds.has(msgId)) { skipped++; continue; }

      const fromEmail = msg.from?.emailAddress?.address?.toLowerCase().trim();
      if (!fromEmail) continue;

      const customer = emailToCustomer.get(fromEmail);
      if (!customer) continue; // not from a known customer

      const invoice = customerInvoice.get(customer.qb_customer_id);

      await supabase.from('ar_activity_log').insert({
        invoice_log_id: invoice?.id || null,
        qb_invoice_id: invoice?.qb_invoice_id || '',
        qb_customer_id: customer.qb_customer_id,
        activity_type: 'email',
        description: `Inbound email from ${fromEmail}: "${msg.subject || '(no subject)'}"${msg.bodyPreview ? ` — ${msg.bodyPreview.slice(0, 120)}...` : ''}`,
        performed_by: fromEmail,
        performed_at: msg.receivedDateTime,
        metadata: {
          direction: 'inbound',
          message_id: msgId,
          subject: msg.subject,
          from_email: fromEmail,
          preview: msg.bodyPreview?.slice(0, 300),
          conversation_id: msg.conversationId,
          invoice_number: invoice?.qb_invoice_number || null,
        },
      });

      knownMessageIds.add(msgId);
      logged++;
      console.log(`📥 Logged reply from ${fromEmail}: "${msg.subject}"`);
    }

    // Process sent items — log outbound emails we sent directly in Outlook (not via system)
    for (const msg of sentMessages) {
      const msgId = msg.id;
      if (knownMessageIds.has(msgId)) { skipped++; continue; }

      // Check if any recipient is a known customer
      const recipients: string[] = (msg.toRecipients || []).map((r: any) =>
        r.emailAddress?.address?.toLowerCase().trim()
      ).filter(Boolean);

      let matchedCustomer: { qb_customer_id: string; display_name: string } | undefined;
      let matchedEmail = '';
      for (const toEmail of recipients) {
        const c = emailToCustomer.get(toEmail);
        if (c) { matchedCustomer = c; matchedEmail = toEmail; break; }
      }

      if (!matchedCustomer) continue;

      const invoice = customerInvoice.get(matchedCustomer.qb_customer_id);

      await supabase.from('ar_activity_log').insert({
        invoice_log_id: invoice?.id || null,
        qb_invoice_id: invoice?.qb_invoice_id || '',
        qb_customer_id: matchedCustomer.qb_customer_id,
        activity_type: 'email',
        description: `Outbound email to ${matchedEmail}: "${msg.subject || '(no subject)'}"`,
        performed_by: 'accounting@mitigationconsulting.com',
        performed_at: msg.receivedDateTime,
        metadata: {
          direction: 'outbound_manual',
          message_id: msgId,
          subject: msg.subject,
          to_email: matchedEmail,
          preview: msg.bodyPreview?.slice(0, 300),
          conversation_id: msg.conversationId,
          invoice_number: invoice?.qb_invoice_number || null,
          note: 'Sent manually from Outlook — not via system',
        },
      });

      knownMessageIds.add(msgId);
      logged++;
      console.log(`📤 Logged manual email to ${matchedEmail}: "${msg.subject}"`);
    }

    const summary = { scanned: inboxMessages.length + sentMessages.length, logged, skipped };
    console.log('✅ AR Email Sync complete:', summary);

    return new Response(JSON.stringify({ success: true, ...summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('❌ AR Email Sync failed:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
