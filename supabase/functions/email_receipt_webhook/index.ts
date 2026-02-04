/**
 * Email Receipt Webhook
 *
 * Receives delivery and read receipt notifications from Microsoft Graph API
 * Updates time entry and email tracking status accordingly
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReceiptNotification {
  messageId: string;
  recipientEmail: string;
  receiptType: 'delivery' | 'read' | 'declined_read';
  timestamp: string;
  details?: any;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('📬 Receipt Webhook: Incoming notification...');

    const notification: ReceiptNotification = await req.json();
    console.log('📧 Notification:', notification);

    if (!notification.messageId) {
      throw new Error('Missing messageId in notification');
    }

    // Get Supabase connection
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find the email tracking record by message ID
    const { data: trackingRecord, error: findError } = await supabase
      .from('email_tracking')
      .select('*')
      .eq('message_id', notification.messageId)
      .single();

    if (findError || !trackingRecord) {
      console.error('❌ Tracking record not found for message:', notification.messageId);
      throw new Error(`Tracking record not found: ${findError?.message || 'Not found'}`);
    }

    console.log('✅ Found tracking record:', trackingRecord.id);

    // Update tracking record based on receipt type
    const updates: any = {
      updated_at: new Date().toISOString()
    };

    let newStatus = trackingRecord.status;
    let auditAction = '';

    switch (notification.receiptType) {
      case 'delivery':
        updates.delivered_at = notification.timestamp;
        updates.status = 'delivered';
        newStatus = 'delivered';
        auditAction = 'delivered';
        console.log('📬 Delivery receipt received');
        break;

      case 'read':
        updates.read_at = notification.timestamp;
        updates.status = 'read';
        updates.read_receipt_declined = false;
        newStatus = 'read';
        auditAction = 'read';
        console.log('📖 Read receipt received');
        break;

      case 'declined_read':
        updates.read_receipt_declined = true;
        auditAction = 'declined_read';
        console.log('❌ Read receipt declined');
        break;
    }

    // Update email_tracking table
    const { error: updateTrackingError } = await supabase
      .from('email_tracking')
      .update(updates)
      .eq('id', trackingRecord.id);

    if (updateTrackingError) {
      throw updateTrackingError;
    }

    console.log('✅ Email tracking updated');

    // Update time_entries approval_status (if not declined)
    if (notification.receiptType !== 'declined_read' && trackingRecord.time_entry_ids) {
      const { error: updateEntriesError } = await supabase
        .from('time_entries')
        .update({
          approval_status: newStatus,
          [`${notification.receiptType}_at`]: notification.timestamp
        })
        .in('id', trackingRecord.time_entry_ids);

      if (updateEntriesError) {
        console.error('⚠️ Failed to update time entries:', updateEntriesError);
      } else {
        console.log(`✅ Updated ${trackingRecord.time_entry_ids.length} time entries to status: ${newStatus}`);
      }
    }

    // Log to audit trail
    if (trackingRecord.time_entry_ids && auditAction) {
      const auditLogs = trackingRecord.time_entry_ids.map((entryId: number) => ({
        time_entry_id: entryId,
        email_tracking_id: trackingRecord.id,
        action: auditAction,
        performed_by: notification.recipientEmail,
        performed_at: notification.timestamp,
        details: {
          message_id: notification.messageId,
          receipt_type: notification.receiptType,
          ...notification.details
        }
      }));

      const { error: auditError } = await supabase
        .from('approval_audit_log')
        .insert(auditLogs);

      if (auditError) {
        console.error('⚠️ Failed to log audit:', auditError);
      } else {
        console.log('✅ Audit log updated');
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Receipt processed: ${notification.receiptType}`,
        tracking_id: trackingRecord.id,
        entries_updated: trackingRecord.time_entry_ids?.length || 0
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('❌ Webhook error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
