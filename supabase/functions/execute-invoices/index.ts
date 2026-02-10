/**
 * Execute Invoices — processes approved invoice actions from invoice_staging.
 * Creates new invoices, updates existing ones, or skips based on user decisions.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { qbCreate, qbUpdate, qbQuery } from '../_shared/qb-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const qbConfig = {
      clientId: Deno.env.get('QB_CLIENT_ID') ?? '',
      clientSecret: Deno.env.get('QB_CLIENT_SECRET') ?? '',
      environment: (Deno.env.get('QB_ENVIRONMENT') ?? 'sandbox') as 'sandbox' | 'production'
    };

    const tokens = {
      accessToken: Deno.env.get('QB_ACCESS_TOKEN') ?? '',
      refreshToken: Deno.env.get('QB_REFRESH_TOKEN') ?? '',
      realmId: Deno.env.get('QB_REALM_ID') ?? ''
    };

    const body = await req.json();
    const { batchId, approvals, executedBy } = body;

    if (!batchId || !approvals || !Array.isArray(approvals)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: batchId, approvals[]' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Executing ${approvals.length} invoice actions for batch ${batchId}`);

    // First, update all staging rows with the user's action decisions
    for (const approval of approvals) {
      await supabaseClient
        .from('invoice_staging')
        .update({ action: approval.action })
        .eq('id', approval.stagingId)
        .eq('batch_id', batchId);
    }

    // Now process each approval
    const results: any[] = [];
    let created = 0, updated = 0, skipped = 0, failed = 0;

    for (const approval of approvals) {
      const { stagingId, action } = approval;

      // Fetch the full staging row
      const { data: staging } = await supabaseClient
        .from('invoice_staging')
        .select('*')
        .eq('id', stagingId)
        .single();

      if (!staging) {
        results.push({ stagingId, action, status: 'failed', error: 'Staging row not found' });
        failed++;
        continue;
      }

      try {
        if (action === 'skip') {
          // Just mark as skipped
          await supabaseClient
            .from('invoice_staging')
            .update({ result_status: 'skipped', executed_at: new Date().toISOString() })
            .eq('id', stagingId);

          results.push({
            stagingId,
            customerName: staging.customer_name,
            action: 'skip',
            status: 'skipped'
          });
          skipped++;
          continue;
        }

        if (action === 'create_new') {
          // Build QB invoice payload from staging line items
          // Strip _display fields from line items before sending to QB
          const qbLineItems = (staging.our_line_items as any[]).map(item => ({
            DetailType: item.DetailType,
            Amount: item.Amount,
            SalesItemLineDetail: item.SalesItemLineDetail,
            Description: item.Description
          }));

          const invoiceData = {
            CustomerRef: { value: staging.qb_customer_id },
            TxnDate: staging.period_end,
            DueDate: staging.period_end,
            Line: qbLineItems,
            CustomerMemo: {
              value: `Professional services for period ${staging.period_start} to ${staging.period_end}`
            }
          };

          console.log(`Creating invoice for ${staging.customer_name}...`);
          const qbResponse = await qbCreate('invoice', invoiceData, tokens, qbConfig);

          if (!qbResponse.Invoice) {
            throw new Error('QB did not return an Invoice object');
          }

          const invoice = qbResponse.Invoice;
          console.log(`Created invoice ${invoice.DocNumber} for ${staging.customer_name}`);

          // Mark time entries as billed in QB
          await markTimeEntriesAsBilled(staging, tokens, qbConfig, supabaseClient);

          // Log to invoice_log
          await supabaseClient.from('invoice_log').insert({
            customer_id: staging.customer_id,
            qb_invoice_id: invoice.Id,
            qb_invoice_number: invoice.DocNumber,
            billing_period_start: staging.period_start,
            billing_period_end: staging.period_end,
            total_hours: staging.our_total_hours,
            total_amount: staging.our_total_amount,
            line_item_count: (staging.our_line_items as any[]).length,
            time_entry_ids: staging.our_time_entry_ids,
            status: 'created',
            created_by: executedBy || 'system',
            staging_id: stagingId,
            action_type: 'create_new'
          });

          // Update staging row
          await supabaseClient
            .from('invoice_staging')
            .update({
              result_status: 'success',
              result_qb_invoice_id: invoice.Id,
              executed_at: new Date().toISOString()
            })
            .eq('id', stagingId);

          results.push({
            stagingId,
            customerName: staging.customer_name,
            action: 'create_new',
            status: 'success',
            invoiceId: invoice.Id,
            invoiceNumber: invoice.DocNumber,
            total: staging.our_total_amount
          });
          created++;

        } else if (action === 'update_existing') {
          // Read-before-write: get fresh SyncToken
          console.log(`Reading existing invoice ${staging.qb_existing_invoice_id} for SyncToken...`);
          const readResult = await qbQuery(
            `SELECT * FROM Invoice WHERE Id = '${staging.qb_existing_invoice_id}'`,
            tokens,
            qbConfig
          );

          const currentInvoice = readResult.QueryResponse?.Invoice?.[0];
          if (!currentInvoice) {
            throw new Error(`Could not read existing invoice ${staging.qb_existing_invoice_id} from QB`);
          }

          // Build update payload — replace line items with our calculated ones
          const qbLineItems = (staging.our_line_items as any[]).map(item => ({
            DetailType: item.DetailType,
            Amount: item.Amount,
            SalesItemLineDetail: item.SalesItemLineDetail,
            Description: item.Description
          }));

          const updatePayload = {
            Id: currentInvoice.Id,
            SyncToken: currentInvoice.SyncToken,
            Line: qbLineItems,
            CustomerMemo: {
              value: `Professional services for period ${staging.period_start} to ${staging.period_end} (updated)`
            }
          };

          console.log(`Updating invoice ${currentInvoice.DocNumber} for ${staging.customer_name}...`);
          const qbResponse = await qbUpdate('invoice', updatePayload, tokens, qbConfig);

          if (!qbResponse.Invoice) {
            throw new Error('QB did not return an Invoice object on update');
          }

          const invoice = qbResponse.Invoice;
          console.log(`Updated invoice ${invoice.DocNumber} for ${staging.customer_name}`);

          // Mark time entries as billed
          await markTimeEntriesAsBilled(staging, tokens, qbConfig, supabaseClient);

          // Log
          await supabaseClient.from('invoice_log').insert({
            customer_id: staging.customer_id,
            qb_invoice_id: invoice.Id,
            qb_invoice_number: invoice.DocNumber,
            billing_period_start: staging.period_start,
            billing_period_end: staging.period_end,
            total_hours: staging.our_total_hours,
            total_amount: staging.our_total_amount,
            line_item_count: (staging.our_line_items as any[]).length,
            time_entry_ids: staging.our_time_entry_ids,
            status: 'updated',
            created_by: executedBy || 'system',
            staging_id: stagingId,
            action_type: 'update_existing'
          });

          // Update staging
          await supabaseClient
            .from('invoice_staging')
            .update({
              result_status: 'success',
              result_qb_invoice_id: invoice.Id,
              executed_at: new Date().toISOString()
            })
            .eq('id', stagingId);

          results.push({
            stagingId,
            customerName: staging.customer_name,
            action: 'update_existing',
            status: 'success',
            invoiceId: invoice.Id,
            invoiceNumber: invoice.DocNumber,
            total: staging.our_total_amount
          });
          updated++;
        }

      } catch (error) {
        console.error(`Error processing ${staging.customer_name}:`, error);

        await supabaseClient
          .from('invoice_staging')
          .update({
            result_status: 'failed',
            result_error: error.message,
            executed_at: new Date().toISOString()
          })
          .eq('id', stagingId);

        results.push({
          stagingId,
          customerName: staging.customer_name,
          action,
          status: 'failed',
          error: error.message
        });
        failed++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
        summary: { created, updated, skipped, failed }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in execute-invoices:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

/**
 * Mark time entries as HasBeenBilled in QB and update local cache.
 */
async function markTimeEntriesAsBilled(
  staging: any,
  tokens: any,
  qbConfig: any,
  supabaseClient: any
) {
  const timeEntryIds = staging.our_time_entry_ids || [];
  if (timeEntryIds.length === 0) return;

  // Get the time entries from our DB to find their qb_time_id and sync_token
  const { data: entries } = await supabaseClient
    .from('time_entries')
    .select('qb_time_id, qb_sync_token')
    .in('qb_time_id', timeEntryIds);

  let billedCount = 0;
  for (const entry of entries || []) {
    try {
      // Read current SyncToken first
      const readResult = await qbQuery(
        `SELECT Id, SyncToken, BillableStatus FROM TimeActivity WHERE Id = '${entry.qb_time_id}'`,
        tokens,
        qbConfig
      );
      const currentTA = readResult.QueryResponse?.TimeActivity?.[0];
      if (!currentTA) continue;

      await qbUpdate(
        'timeactivity',
        {
          Id: currentTA.Id,
          SyncToken: currentTA.SyncToken,
          BillableStatus: 'HasBeenBilled'
        },
        tokens,
        qbConfig
      );
      billedCount++;
    } catch (err) {
      console.error(`Failed to mark entry ${entry.qb_time_id} as billed:`, err);
    }
  }

  // Update local cache
  if (timeEntryIds.length > 0) {
    await supabaseClient
      .from('time_entries')
      .update({ billable_status: 'HasBeenBilled' })
      .in('qb_time_id', timeEntryIds);
  }

  console.log(`Marked ${billedCount}/${timeEntryIds.length} time entries as billed`);
}
