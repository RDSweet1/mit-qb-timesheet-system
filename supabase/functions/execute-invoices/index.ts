/**
 * Execute Invoices — processes approved invoice actions from invoice_staging.
 * Creates new invoices, updates existing ones, or skips based on user decisions.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { loadQBTokens, qbCreate, qbUpdate, qbQuery, qbSend } from '../_shared/qb-auth.ts';
import { sendEmail, getDefaultEmailSender } from '../_shared/outlook-email.ts';
import { invoiceCourtesyEmail } from '../_shared/email-templates.ts';
import { getAppSetting } from '../_shared/config.ts';

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

    const { tokens, config: qbConfig } = await loadQBTokens();

    const body = await req.json();
    const { batchId, approvals, executedBy, sendAfterCreate } = body;

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

          const isInterim = staging.invoice_type === 'interim';
          const invoiceData = {
            CustomerRef: { value: staging.qb_customer_id },
            TxnDate: staging.period_end,
            DueDate: staging.period_end,
            Line: qbLineItems,
            CustomerMemo: {
              value: isInterim
                ? `Interim billing — professional services for ${staging.period_start} to ${staging.period_end}`
                : `Professional services for period ${staging.period_start} to ${staging.period_end}`
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

          // Send via QB email + courtesy email if requested
          let qbSentAt: string | null = null;
          let courtesyEmailSentAt: string | null = null;
          let sentToEmail: string | null = null;

          if (sendAfterCreate) {
            const sendResult = await sendInvoiceViaQB(
              invoice, staging, supabaseClient, tokens, qbConfig
            );
            qbSentAt = sendResult.qbSentAt;
            courtesyEmailSentAt = sendResult.courtesyEmailSentAt;
            sentToEmail = sendResult.customerEmail;
          }

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
            action_type: 'create_new',
            invoice_type: staging.invoice_type || 'standard',
            sent_via_qb: !!qbSentAt,
            qb_sent_at: qbSentAt,
            qb_sent_to_email: sentToEmail,
            courtesy_email_sent: !!courtesyEmailSentAt,
            courtesy_email_sent_at: courtesyEmailSentAt,
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
            total: staging.our_total_amount,
            qbEmailSent: !!qbSentAt,
            courtesyEmailSent: !!courtesyEmailSentAt,
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

          const isInterimUpdate = staging.invoice_type === 'interim';
          const updatePayload = {
            Id: currentInvoice.Id,
            SyncToken: currentInvoice.SyncToken,
            Line: qbLineItems,
            CustomerMemo: {
              value: isInterimUpdate
                ? `Interim billing — professional services for ${staging.period_start} to ${staging.period_end} (updated)`
                : `Professional services for period ${staging.period_start} to ${staging.period_end} (updated)`
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

          // Send via QB email + courtesy email if requested
          let qbSentAt: string | null = null;
          let courtesyEmailSentAt: string | null = null;
          let sentToEmail: string | null = null;

          if (sendAfterCreate) {
            const sendResult = await sendInvoiceViaQB(
              invoice, staging, supabaseClient, tokens, qbConfig
            );
            qbSentAt = sendResult.qbSentAt;
            courtesyEmailSentAt = sendResult.courtesyEmailSentAt;
            sentToEmail = sendResult.customerEmail;
          }

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
            action_type: 'update_existing',
            invoice_type: staging.invoice_type || 'standard',
            sent_via_qb: !!qbSentAt,
            qb_sent_at: qbSentAt,
            qb_sent_to_email: sentToEmail,
            courtesy_email_sent: !!courtesyEmailSentAt,
            courtesy_email_sent_at: courtesyEmailSentAt,
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
            total: staging.our_total_amount,
            qbEmailSent: !!qbSentAt,
            courtesyEmailSent: !!courtesyEmailSentAt,
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
 * Send an invoice via QB email and send a courtesy Outlook email.
 * Returns timestamps for successful sends.
 */
async function sendInvoiceViaQB(
  invoice: any,
  staging: any,
  supabaseClient: any,
  tokens: any,
  qbConfig: any
): Promise<{ qbSentAt: string | null; courtesyEmailSentAt: string | null; customerEmail: string | null }> {
  let qbSentAt: string | null = null;
  let courtesyEmailSentAt: string | null = null;

  // Look up customer email
  const { data: customer } = await supabaseClient
    .from('customers')
    .select('email')
    .eq('id', staging.customer_id)
    .single();

  const customerEmail = customer?.email;
  if (!customerEmail) {
    console.warn(`No email found for customer ${staging.customer_name} — skipping QB send`);
    return { qbSentAt, courtesyEmailSentAt, customerEmail: null };
  }

  // QB email send
  try {
    await qbSend('invoice', invoice.Id, customerEmail, tokens, qbConfig);
    qbSentAt = new Date().toISOString();
    console.log(`QB emailed invoice #${invoice.DocNumber} to ${customerEmail}`);
  } catch (sendErr: any) {
    console.error(`Failed to QB-send invoice #${invoice.DocNumber}:`, sendErr.message);
  }

  // Courtesy Outlook email
  try {
    const gentleSetting = await getAppSetting(supabaseClient, 'gentle_review_language');
    const gentle = gentleSetting === 'true';

    const outlookConfig = {
      tenantId: Deno.env.get('AZURE_TENANT_ID') ?? '',
      clientId: Deno.env.get('AZURE_CLIENT_ID') ?? '',
      clientSecret: Deno.env.get('AZURE_CLIENT_SECRET') ?? ''
    };
    const fromEmail = await getDefaultEmailSender(supabaseClient);

    // Parse billing period from staging dates
    const periodEnd = new Date(staging.period_end);
    const billingPeriod = formatBillingPeriod(periodEnd.getFullYear(), periodEnd.getMonth() + 1);

    const emailHtml = invoiceCourtesyEmail({
      customerName: staging.customer_name,
      invoiceNumber: invoice.DocNumber,
      billingPeriod,
      totalAmount: staging.our_total_amount,
      totalHours: staging.our_total_hours,
      gentle,
    });

    const emailResult = await sendEmail(
      {
        from: fromEmail,
        to: [customerEmail],
        subject: `Invoice Sent — ${staging.customer_name} — ${billingPeriod}`,
        htmlBody: emailHtml,
      },
      outlookConfig
    );

    if (emailResult.success) {
      courtesyEmailSentAt = new Date().toISOString();
      console.log(`Courtesy email sent to ${customerEmail} for ${staging.customer_name}`);
    } else {
      console.error(`Courtesy email failed for ${staging.customer_name}:`, emailResult.error);
    }
  } catch (emailErr: any) {
    console.error(`Courtesy email error for ${staging.customer_name}:`, emailErr.message);
  }

  return { qbSentAt, courtesyEmailSentAt, customerEmail };
}

/** Format billing period for display, e.g. "January 2026" */
function formatBillingPeriod(year: number, month: number): string {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return `${monthNames[month - 1]} ${year}`;
}

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
