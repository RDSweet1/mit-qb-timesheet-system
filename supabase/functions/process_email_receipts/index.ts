/**
 * Process Email Receipts
 *
 * Polls the accounting@mitigationconsulting.com inbox for delivery and read receipts
 * Updates tracking data when receipts are found
 *
 * This should be called periodically (every 5-15 minutes) via a scheduled job
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('📬 Processing email receipts...');

    // Get Azure credentials
    const tenantId = Deno.env.get('AZURE_TENANT_ID');
    const clientId = Deno.env.get('AZURE_CLIENT_ID');
    const clientSecret = Deno.env.get('AZURE_CLIENT_SECRET');
    const fromEmail = Deno.env.get('FROM_EMAIL') || 'accounting@mitigationconsulting.com';

    if (!tenantId || !clientId || !clientSecret) {
      throw new Error('Azure credentials not configured');
    }

    // Get Supabase connection
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Get access token
    console.log('🔑 Getting Azure access token...');
    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        }),
      }
    );

    if (!tokenResponse.ok) {
      throw new Error('Failed to get access token');
    }

    const { access_token } = await tokenResponse.json();

    // 2. Get unread messages from Inbox
    console.log('📥 Checking inbox for receipts...');
    const messagesResponse = await fetch(
      `https://graph.microsoft.com/v1.0/users/${fromEmail}/mailFolders/inbox/messages?$filter=isRead eq false&$top=50&$select=id,subject,from,receivedDateTime,body,internetMessageHeaders`,
      {
        headers: { 'Authorization': `Bearer ${access_token}` },
      }
    );

    if (!messagesResponse.ok) {
      throw new Error('Failed to fetch messages');
    }

    const { value: messages } = await messagesResponse.json();
    console.log(`📧 Found ${messages.length} unread messages`);

    let deliveryReceiptsProcessed = 0;
    let readReceiptsProcessed = 0;
    let declinedReceiptsProcessed = 0;

    // 3. Process each message
    for (const message of messages) {
      const subject = message.subject || '';
      const lowerSubject = subject.toLowerCase();

      // Check if it's a receipt
      const isDeliveryReceipt = lowerSubject.includes('delivery') ||
                                lowerSubject.includes('delivered') ||
                                subject.includes('Delivery Status Notification');

      const isReadReceipt = lowerSubject.includes('read:') ||
                           lowerSubject.includes('read receipt') ||
                           message.internetMessageHeaders?.some((h: any) =>
                             h.name === 'Content-Type' && h.value.includes('report-type=disposition-notification')
                           );

      const isDeclined = lowerSubject.includes('not read') ||
                        lowerSubject.includes('deleted without being read');

      if (!isDeliveryReceipt && !isReadReceipt && !isDeclined) {
        continue; // Not a receipt, skip
      }

      console.log(`📨 Processing receipt: ${subject}`);

      // Extract the original message ID from the receipt
      // Receipts reference the original message in the subject or body
      let originalMessageId = null;

      // Try to find message ID in body
      const bodyText = message.body?.content || '';
      const messageIdMatch = bodyText.match(/Message-ID:\s*<?([^<>\s]+)>?/i);
      if (messageIdMatch) {
        originalMessageId = messageIdMatch[1];
      }

      // Also check headers
      if (!originalMessageId && message.internetMessageHeaders) {
        const inReplyTo = message.internetMessageHeaders.find((h: any) =>
          h.name.toLowerCase() === 'in-reply-to'
        );
        if (inReplyTo) {
          originalMessageId = inReplyTo.value.replace(/[<>]/g, '');
        }
      }

      if (!originalMessageId) {
        console.warn('⚠️ Could not extract message ID from receipt');
        // Mark as read anyway so we don't reprocess
        await fetch(
          `https://graph.microsoft.com/v1.0/users/${fromEmail}/messages/${message.id}`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ isRead: true }),
          }
        );
        continue;
      }

      // Find tracking record
      const { data: trackingRecord, error: findError } = await supabase
        .from('email_tracking')
        .select('*')
        .eq('message_id', originalMessageId)
        .single();

      if (findError || !trackingRecord) {
        console.warn(`⚠️ No tracking record found for message: ${originalMessageId}`);
        // Mark as read
        await fetch(
          `https://graph.microsoft.com/v1.0/users/${fromEmail}/messages/${message.id}`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ isRead: true }),
          }
        );
        continue;
      }

      // Update tracking based on receipt type
      const updates: any = { updated_at: new Date().toISOString() };
      let receiptType = '';
      let newStatus = trackingRecord.status;

      if (isDeclined) {
        updates.read_receipt_declined = true;
        receiptType = 'declined_read';
        declinedReceiptsProcessed++;
      } else if (isReadReceipt) {
        updates.read_at = message.receivedDateTime;
        updates.status = 'read';
        updates.read_receipt_declined = false;
        newStatus = 'read';
        receiptType = 'read';
        readReceiptsProcessed++;
      } else if (isDeliveryReceipt) {
        updates.delivered_at = message.receivedDateTime;
        if (trackingRecord.status === 'sent') {
          updates.status = 'delivered';
          newStatus = 'delivered';
        }
        receiptType = 'delivered';
        deliveryReceiptsProcessed++;
      }

      // Update email_tracking
      await supabase
        .from('email_tracking')
        .update(updates)
        .eq('id', trackingRecord.id);

      // Update time_entries if not declined
      if (receiptType !== 'declined_read' && trackingRecord.time_entry_ids) {
        const entryUpdates: any = { approval_status: newStatus };
        if (receiptType === 'delivered') {
          entryUpdates.delivered_at = message.receivedDateTime;
        } else if (receiptType === 'read') {
          entryUpdates.read_at = message.receivedDateTime;
        }

        await supabase
          .from('time_entries')
          .update(entryUpdates)
          .in('id', trackingRecord.time_entry_ids);
      }

      // Log to audit
      if (trackingRecord.time_entry_ids && receiptType) {
        const auditLogs = trackingRecord.time_entry_ids.map((entryId: number) => ({
          time_entry_id: entryId,
          email_tracking_id: trackingRecord.id,
          action: receiptType,
          performed_by: message.from?.emailAddress?.address || trackingRecord.recipient_email,
          performed_at: message.receivedDateTime,
          details: {
            receipt_subject: subject,
            receipt_message_id: message.id
          }
        }));

        await supabase.from('approval_audit_log').insert(auditLogs);
      }

      // Mark receipt as read
      await fetch(
        `https://graph.microsoft.com/v1.0/users/${fromEmail}/messages/${message.id}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ isRead: true }),
        }
      );

      console.log(`✅ Processed ${receiptType} receipt for tracking ID: ${trackingRecord.id}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: {
          delivery: deliveryReceiptsProcessed,
          read: readReceiptsProcessed,
          declined: declinedReceiptsProcessed,
          total: deliveryReceiptsProcessed + readReceiptsProcessed + declinedReceiptsProcessed
        },
        messagesScanned: messages.length
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('❌ Receipt processing error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
