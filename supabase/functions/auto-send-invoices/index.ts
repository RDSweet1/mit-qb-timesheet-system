/**
 * Auto-Send Invoices — monthly orchestrator
 *
 * Runs on the 1st of each month via pg_cron. For the previous month:
 * 1. Checks app_settings: skip if auto_send_invoices !== 'true'
 * 2. For each customer with billable time in the billing month:
 *    a. Verify ALL report_periods for the month are 'accepted' or 'no_time'
 *    b. Verify customer has an email address
 *    c. Verify not already invoiced (idempotent)
 *    d. Build line items, create invoice in QB
 *    e. Send invoice via QB email
 *    f. Send courtesy Outlook notification
 *    g. Log to invoice_log, mark time entries billed
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { loadQBTokens, qbCreate, qbSend, qbUpdate, qbQuery } from '../_shared/qb-auth.ts';
import { buildRateLookups, buildLineItems } from '../_shared/invoice-line-builder.ts';
import { sendEmail, getDefaultEmailSender } from '../_shared/outlook-email.ts';
import { invoiceCourtesyEmail } from '../_shared/email-templates.ts';
import { getAppSetting } from '../_shared/config.ts';
import { startMetrics } from '../_shared/metrics.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let metrics: Awaited<ReturnType<typeof startMetrics>> | undefined;

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    metrics = await startMetrics('auto-send-invoices', supabaseClient);

    // Check for manual trigger
    let body: any = {};
    try { body = await req.clone().json(); } catch {}
    const isManual = !!body.manual;

    // 1. Check app_settings gate
    const autoSendEnabled = await getAppSetting(supabaseClient, 'auto_send_invoices');
    if (autoSendEnabled !== 'true') {
      console.log('Auto-send invoices is disabled. Skipping.');
      await metrics.end('success');
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'auto_send_invoices is disabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Determine billing month (previous month)
    const now = new Date();
    const billingYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const billingMonth = now.getMonth() === 0 ? 12 : now.getMonth(); // 1-indexed
    const firstDay = `${billingYear}-${String(billingMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(billingYear, billingMonth, 0).toISOString().split('T')[0];

    console.log(`Auto-invoicing for billing month: ${firstDay} to ${lastDay}`);
    metrics.setMeta('billingPeriod', `${firstDay} to ${lastDay}`);

    // 3. Load QB tokens and config
    const { tokens, config: qbConfig } = await loadQBTokens();

    // 4. Read gentle language setting for courtesy emails
    const gentleSetting = await getAppSetting(supabaseClient, 'gentle_review_language');
    const gentle = gentleSetting === 'true';

    // 5. Outlook config for courtesy emails
    const outlookConfig = {
      tenantId: Deno.env.get('AZURE_TENANT_ID') ?? '',
      clientId: Deno.env.get('AZURE_CLIENT_ID') ?? '',
      clientSecret: Deno.env.get('AZURE_CLIENT_SECRET') ?? ''
    };
    const fromEmail = await getDefaultEmailSender(supabaseClient);

    // 6. Get all customers with billable time in the billing month
    const { data: billableEntries } = await supabaseClient
      .from('time_entries')
      .select('qb_customer_id')
      .gte('txn_date', firstDay)
      .lte('txn_date', lastDay)
      .eq('billable_status', 'Billable');

    if (!billableEntries || billableEntries.length === 0) {
      console.log('No billable time entries found for the billing month.');
      await metrics.end('success');
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'No billable time entries for the period' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const uniqueCustomerIds = [...new Set(billableEntries.map((e: any) => e.qb_customer_id))];
    console.log(`Found ${uniqueCustomerIds.length} customers with billable time`);

    // 7. Load customers
    const { data: customers } = await supabaseClient
      .from('customers')
      .select('*')
      .in('qb_customer_id', uniqueCustomerIds);

    const customerMap = new Map((customers || []).map((c: any) => [c.qb_customer_id, c]));

    // 8. Load service items for rate lookups
    const { data: serviceItems } = await supabaseClient
      .from('service_items')
      .select('*');
    const lookups = buildRateLookups(serviceItems || []);

    // 9. Process each customer
    const results: any[] = [];
    let invoiced = 0, skippedNotAccepted = 0, skippedNoEmail = 0, skippedAlreadyInvoiced = 0, failed = 0;

    for (const qbCustomerId of uniqueCustomerIds) {
      const customer = customerMap.get(qbCustomerId);
      if (!customer) {
        console.warn(`Customer not found in DB for qb_customer_id: ${qbCustomerId}`);
        failed++;
        results.push({ qbCustomerId, status: 'failed', reason: 'Customer not found in DB' });
        continue;
      }

      const customerName = customer.display_name || customer.name || qbCustomerId;

      // Skip closed files
      if (customer.file_closed) {
        console.log(`Skipping ${customerName} — file is closed`);
        results.push({ qbCustomerId, customerName, status: 'skipped', reason: 'File closed' });
        continue;
      }

      try {
        // a. Check report_periods acceptance gate (skip if customer has override flag)
        if (customer.skip_acceptance_gate) {
          console.log(`Skipping acceptance gate for ${customerName} (override flag set)`);
        } else {
          const { data: reportPeriods } = await supabaseClient
            .from('report_periods')
            .select('status, week_start, week_end')
            .eq('qb_customer_id', qbCustomerId)
            .lte('week_start', lastDay)
            .gte('week_end', firstDay);

          if (reportPeriods && reportPeriods.length > 0) {
            const nonAccepted = reportPeriods.filter(
              (rp: any) => rp.status !== 'accepted' && rp.status !== 'no_time'
            );
            if (nonAccepted.length > 0) {
              const statuses = nonAccepted.map((rp: any) => `${rp.week_start}: ${rp.status}`).join(', ');
              console.log(`Skipping ${customerName}: not all weeks accepted (${statuses})`);
              skippedNotAccepted++;
              results.push({ customerName, status: 'skipped', reason: 'not_all_accepted', detail: statuses });
              continue;
            }
          }
        }

        // b. Check customer has email
        if (!customer.email) {
          console.log(`Skipping ${customerName}: no email address`);
          skippedNoEmail++;
          results.push({ customerName, status: 'skipped', reason: 'no_email' });
          continue;
        }

        // c. Check idempotency — already invoiced for this customer+period?
        const { data: existingLogs } = await supabaseClient
          .from('invoice_log')
          .select('id')
          .eq('customer_id', customer.id)
          .eq('billing_period_start', firstDay)
          .eq('billing_period_end', lastDay)
          .limit(1);

        if (existingLogs && existingLogs.length > 0) {
          console.log(`Skipping ${customerName}: already invoiced for this period`);
          skippedAlreadyInvoiced++;
          results.push({ customerName, status: 'skipped', reason: 'already_invoiced' });
          continue;
        }

        // d. Get billable time entries for this customer+period
        const { data: entries } = await supabaseClient
          .from('time_entries')
          .select('*')
          .eq('qb_customer_id', qbCustomerId)
          .gte('txn_date', firstDay)
          .lte('txn_date', lastDay)
          .eq('billable_status', 'Billable')
          .order('txn_date', { ascending: true });

        if (!entries || entries.length === 0) {
          results.push({ customerName, status: 'skipped', reason: 'no_billable_entries' });
          continue;
        }

        // e. Build line items
        const { lineItems, totalHours, totalAmount } = buildLineItems(entries, lookups);

        // f. Create invoice in QB
        const invoiceData = {
          CustomerRef: { value: qbCustomerId },
          TxnDate: lastDay,
          DueDate: lastDay,
          Line: lineItems,
          BillEmail: { Address: customer.email },
          CustomerMemo: {
            value: `Professional services for period ${firstDay} to ${lastDay}`
          }
        };

        console.log(`Creating invoice for ${customerName}...`);
        metrics.addApiCall();
        const qbResponse = await qbCreate('invoice', invoiceData, tokens, qbConfig);

        if (!qbResponse.Invoice) {
          throw new Error('QB did not return an Invoice object');
        }

        const invoice = qbResponse.Invoice;
        const invoiceNumber = invoice.DocNumber;
        console.log(`Created invoice #${invoiceNumber} for ${customerName}`);

        // g. Send invoice via QB email
        let qbSentAt: string | null = null;
        try {
          metrics.addApiCall();
          await qbSend('invoice', invoice.Id, customer.email, tokens, qbConfig);
          qbSentAt = new Date().toISOString();
          console.log(`QB emailed invoice #${invoiceNumber} to ${customer.email}`);
        } catch (sendErr: any) {
          console.error(`Failed to QB-send invoice #${invoiceNumber}:`, sendErr.message);
          // Continue — invoice is created, just not QB-emailed
        }

        // h. Send courtesy Outlook email
        let courtesyEmailSentAt: string | null = null;
        try {
          const billingPeriodLabel = formatBillingPeriod(billingYear, billingMonth);
          const emailHtml = invoiceCourtesyEmail({
            customerName,
            invoiceNumber,
            billingPeriod: billingPeriodLabel,
            totalAmount,
            totalHours,
            gentle,
          });

          const emailResult = await sendEmail(
            {
              from: fromEmail,
              to: [customer.email],
              subject: `Invoice Sent — ${customerName} — ${billingPeriodLabel}`,
              htmlBody: emailHtml,
            },
            outlookConfig
          );

          if (emailResult.success) {
            courtesyEmailSentAt = new Date().toISOString();
            console.log(`Courtesy email sent to ${customer.email} for ${customerName}`);
          } else {
            console.error(`Courtesy email failed for ${customerName}:`, emailResult.error);
          }
        } catch (emailErr: any) {
          console.error(`Courtesy email error for ${customerName}:`, emailErr.message);
        }

        // i. Log to invoice_log
        await supabaseClient.from('invoice_log').insert({
          customer_id: customer.id,
          qb_invoice_id: invoice.Id,
          qb_invoice_number: invoiceNumber,
          billing_period_start: firstDay,
          billing_period_end: lastDay,
          total_hours: totalHours,
          total_amount: totalAmount,
          line_item_count: lineItems.length,
          time_entry_ids: entries.map((e: any) => e.qb_time_id),
          status: 'created',
          created_by: 'auto-send-invoices',
          auto_generated: true,
          sent_via_qb: !!qbSentAt,
          qb_sent_at: qbSentAt,
          qb_sent_to_email: customer.email,
          courtesy_email_sent: !!courtesyEmailSentAt,
          courtesy_email_sent_at: courtesyEmailSentAt,
        });

        // j. Mark time entries as HasBeenBilled in QB
        let billedCount = 0;
        for (const entry of entries) {
          if (!entry.qb_time_id) continue;
          try {
            metrics.addApiCall();
            const readResult = await qbQuery(
              `SELECT Id, SyncToken FROM TimeActivity WHERE Id = '${entry.qb_time_id}'`,
              tokens,
              qbConfig
            );
            const currentTA = readResult.QueryResponse?.TimeActivity?.[0];
            if (!currentTA) continue;

            metrics.addApiCall();
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
          } catch (billErr: any) {
            console.error(`Failed to mark ${entry.qb_time_id} as billed:`, billErr.message);
          }
        }

        // Update local cache
        const billedQbIds = entries.map((e: any) => e.qb_time_id).filter(Boolean);
        if (billedQbIds.length > 0) {
          await supabaseClient
            .from('time_entries')
            .update({ billable_status: 'HasBeenBilled' })
            .in('qb_time_id', billedQbIds);
        }

        metrics.addEntries(entries.length);
        invoiced++;
        results.push({
          customerName,
          status: 'invoiced',
          invoiceId: invoice.Id,
          invoiceNumber,
          totalAmount,
          totalHours,
          entriesCount: entries.length,
          billedCount,
          qbEmailSent: !!qbSentAt,
          courtesyEmailSent: !!courtesyEmailSentAt,
        });

      } catch (err: any) {
        console.error(`Error processing ${customerName}:`, err.message);
        metrics.addError();
        failed++;
        results.push({ customerName, status: 'failed', error: err.message });
      }
    }

    await metrics.end(failed > 0 && invoiced === 0 ? 'error' : 'success');

    const summary = {
      billingPeriod: `${firstDay} to ${lastDay}`,
      processed: uniqueCustomerIds.length,
      invoiced,
      skipped_not_accepted: skippedNotAccepted,
      skipped_no_email: skippedNoEmail,
      skipped_already_invoiced: skippedAlreadyInvoiced,
      failed,
    };

    console.log('Auto-send invoices complete:', JSON.stringify(summary));

    return new Response(
      JSON.stringify({ success: true, summary, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in auto-send-invoices:', error);
    try { await metrics?.end('error'); } catch {}
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

/** Format billing period for display, e.g. "January 2026" */
function formatBillingPeriod(year: number, month: number): string {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return `${monthNames[month - 1]} ${year}`;
}
