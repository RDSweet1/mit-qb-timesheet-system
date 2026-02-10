/**
 * Preview Invoices — generates comparison data between our time entries and QB existing invoices.
 * Stores results in invoice_staging for the frontend to display and for execute-invoices to act on.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { qbQuery } from '../_shared/qb-auth.ts';

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
    const { periodStart, periodEnd, createdBy } = body;

    if (!periodStart || !periodEnd) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: periodStart, periodEnd' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Preview invoices for ${periodStart} to ${periodEnd}`);

    // 1. Get all billable time entries for the period with service item rates
    const { data: entries, error: entriesError } = await supabaseClient
      .from('time_entries')
      .select(`*, service_items!inner(unit_price, name, qb_item_id)`)
      .gte('txn_date', periodStart)
      .lte('txn_date', periodEnd)
      .eq('billable_status', 'Billable')
      .order('txn_date', { ascending: true });

    if (entriesError) {
      throw new Error(`Failed to fetch time entries: ${entriesError.message}`);
    }

    if (!entries || entries.length === 0) {
      return new Response(
        JSON.stringify({ success: true, batchId: null, customers: [], message: 'No billable time entries found for this period' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Get service items for rate lookup
    const { data: serviceItems } = await supabaseClient
      .from('service_items')
      .select('*');

    const ratesByItemId: Record<string, number> = {};
    const namesByItemId: Record<string, string> = {};
    for (const item of serviceItems || []) {
      ratesByItemId[item.qb_item_id] = item.unit_price;
      namesByItemId[item.qb_item_id] = item.name;
    }

    // 3. Get all customers (for id/name/email mapping)
    const { data: customers } = await supabaseClient
      .from('customers')
      .select('*');

    const customerMap: Record<string, any> = {};
    for (const c of customers || []) {
      customerMap[c.qb_customer_id] = c;
    }

    // 4. Group entries by qb_customer_id and build line items
    const customerGroups: Record<string, typeof entries> = {};
    for (const entry of entries) {
      const custId = entry.qb_customer_id;
      if (!custId) continue;
      if (!customerGroups[custId]) customerGroups[custId] = [];
      customerGroups[custId].push(entry);
    }

    // 5. Query QB for existing invoices in this period
    let qbInvoicesByCustomer: Record<string, any[]> = {};
    try {
      const qbResult = await qbQuery(
        `SELECT * FROM Invoice WHERE TxnDate >= '${periodStart}' AND TxnDate <= '${periodEnd}'`,
        tokens,
        qbConfig
      );
      const qbInvoices = qbResult.QueryResponse?.Invoice || [];
      for (const inv of qbInvoices) {
        const custRef = inv.CustomerRef?.value;
        if (custRef) {
          if (!qbInvoicesByCustomer[custRef]) qbInvoicesByCustomer[custRef] = [];
          qbInvoicesByCustomer[custRef].push(inv);
        }
      }
      console.log(`Found ${qbInvoices.length} existing QB invoices for period`);
    } catch (err) {
      console.error('Warning: Failed to query QB invoices, proceeding without comparison:', err);
    }

    // 6. Check invoice_log for already-created invoices
    const { data: existingLogs } = await supabaseClient
      .from('invoice_log')
      .select('*')
      .gte('billing_period_start', periodStart)
      .lte('billing_period_end', periodEnd);

    const logsByCustomerId: Record<number, any> = {};
    for (const log of existingLogs || []) {
      logsByCustomerId[log.customer_id] = log;
    }

    // 7. Build staging rows
    const batchId = crypto.randomUUID();
    const stagingRows: any[] = [];

    for (const [qbCustId, custEntries] of Object.entries(customerGroups)) {
      const customer = customerMap[qbCustId];
      const customerId = customer?.id;
      const customerName = customer?.display_name || custEntries[0]?.customer_name || 'Unknown';

      // Build line items (same logic as create-invoices)
      let totalHours = 0;
      let totalAmount = 0;
      const lineItems = custEntries.map((entry: any) => {
        const hours = entry.hours + (entry.minutes / 60);
        const rate = ratesByItemId[entry.qb_item_id] || 0;
        const amount = hours * rate;
        totalHours += hours;
        totalAmount += amount;

        let timeDetail = '';
        if (entry.start_time && entry.end_time) {
          const start = new Date(entry.start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          const end = new Date(entry.end_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          timeDetail = `${start} - ${end}`;
        } else {
          timeDetail = 'Lump Sum';
        }

        let description = `${entry.txn_date} | ${entry.employee_name} | ${timeDetail}`;
        if (entry.description) description += `\n${entry.description}`;
        if (entry.notes) description += `\nNotes: ${entry.notes}`;

        return {
          DetailType: 'SalesItemLineDetail',
          Amount: parseFloat(amount.toFixed(2)),
          SalesItemLineDetail: {
            ItemRef: { value: entry.qb_item_id },
            Qty: parseFloat(hours.toFixed(2)),
            UnitPrice: rate
          },
          Description: description,
          // Extra fields for display (not sent to QB)
          _display: {
            date: entry.txn_date,
            employee: entry.employee_name,
            service: namesByItemId[entry.qb_item_id] || 'Unknown',
            hours: parseFloat(hours.toFixed(2)),
            rate,
            amount: parseFloat(amount.toFixed(2))
          }
        };
      });

      // Determine comparison status
      const qbInvoices = qbInvoicesByCustomer[qbCustId] || [];
      const existingLog = customerId ? logsByCustomerId[customerId] : null;

      let comparisonStatus = 'new';
      let qbInvoice: any = null;
      let differences: any = null;

      if (qbInvoices.length > 0) {
        // Use the most recent QB invoice for this customer in the period
        qbInvoice = qbInvoices.sort((a: any, b: any) =>
          new Date(b.MetaData?.CreateTime || 0).getTime() - new Date(a.MetaData?.CreateTime || 0).getTime()
        )[0];

        const qbTotal = parseFloat(qbInvoice.TotalAmt || 0);
        const ourTotal = parseFloat(totalAmount.toFixed(2));

        if (Math.abs(qbTotal - ourTotal) < 0.01) {
          comparisonStatus = 'exists_match';
        } else {
          comparisonStatus = 'exists_different';
          differences = {
            ourTotal: ourTotal,
            qbTotal: qbTotal,
            difference: parseFloat((ourTotal - qbTotal).toFixed(2)),
            ourLineCount: lineItems.length,
            qbLineCount: (qbInvoice.Line || []).filter((l: any) => l.DetailType === 'SalesItemLineDetail').length
          };
        }
      } else if (existingLog) {
        comparisonStatus = 'already_logged';
      }

      // Default action based on comparison
      let defaultAction = 'pending';
      if (comparisonStatus === 'new') defaultAction = 'create_new';
      else if (comparisonStatus === 'exists_match') defaultAction = 'skip';
      else if (comparisonStatus === 'exists_different') defaultAction = 'pending';
      else if (comparisonStatus === 'already_logged') defaultAction = 'skip';

      stagingRows.push({
        batch_id: batchId,
        customer_id: customerId,
        qb_customer_id: qbCustId,
        customer_name: customerName,
        period_start: periodStart,
        period_end: periodEnd,
        our_total_hours: parseFloat(totalHours.toFixed(2)),
        our_total_amount: parseFloat(totalAmount.toFixed(2)),
        our_line_items: lineItems,
        our_time_entry_ids: custEntries.map((e: any) => e.qb_time_id),
        qb_existing_invoice_id: qbInvoice?.Id || null,
        qb_existing_invoice_number: qbInvoice?.DocNumber || null,
        qb_existing_sync_token: qbInvoice?.SyncToken || null,
        qb_existing_total: qbInvoice ? parseFloat(qbInvoice.TotalAmt || 0) : null,
        qb_existing_line_items: qbInvoice?.Line || null,
        comparison_status: comparisonStatus,
        differences,
        action: defaultAction,
        created_by: createdBy || 'system'
      });
    }

    // 8. Clean up old pending staging rows (older than 7 days)
    await supabaseClient
      .from('invoice_staging')
      .delete()
      .eq('result_status', 'pending')
      .lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    // 9. Insert staging rows
    const { data: inserted, error: insertError } = await supabaseClient
      .from('invoice_staging')
      .insert(stagingRows)
      .select();

    if (insertError) {
      throw new Error(`Failed to insert staging rows: ${insertError.message}`);
    }

    console.log(`Inserted ${inserted?.length || 0} staging rows for batch ${batchId}`);

    // 10. Build response with display-friendly data
    const customerPreviews = (inserted || []).map(row => ({
      stagingId: row.id,
      customerId: row.customer_id,
      qbCustomerId: row.qb_customer_id,
      customerName: row.customer_name,
      totalHours: row.our_total_hours,
      totalAmount: row.our_total_amount,
      lineItems: row.our_line_items,
      lineItemCount: (row.our_line_items as any[]).length,
      qbExistingInvoiceId: row.qb_existing_invoice_id,
      qbExistingInvoiceNumber: row.qb_existing_invoice_number,
      qbExistingTotal: row.qb_existing_total,
      comparisonStatus: row.comparison_status,
      differences: row.differences,
      action: row.action
    }));

    // Summary counts
    const summary = {
      totalCustomers: customerPreviews.length,
      newInvoices: customerPreviews.filter(c => c.comparisonStatus === 'new').length,
      existsMatch: customerPreviews.filter(c => c.comparisonStatus === 'exists_match').length,
      existsDifferent: customerPreviews.filter(c => c.comparisonStatus === 'exists_different').length,
      alreadyLogged: customerPreviews.filter(c => c.comparisonStatus === 'already_logged').length
    };

    return new Response(
      JSON.stringify({
        success: true,
        batchId,
        customers: customerPreviews,
        summary
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in preview-invoices:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
