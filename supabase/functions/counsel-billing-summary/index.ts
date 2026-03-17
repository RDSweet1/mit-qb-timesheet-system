/**
 * Counsel Billing Summary — Pull invoices from QB Online + time entries from Supabase
 *
 * Strategy: Invoices come from QB Online (authoritative for billing).
 * Time entries come primarily from Supabase (already synced, has Workforce clock times).
 * Falls back to QB Online TimeActivity only for date ranges not in our DB.
 * Descriptions/notes are stripped for opposing counsel use.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { qbQuery, loadQBTokens } from '../_shared/qb-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { customerId, startDate, endDate } = await req.json();
    if (!customerId) throw new Error('customerId is required');

    const start = startDate || '2020-01-01';
    const end = endDate || new Date().toISOString().split('T')[0];

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { tokens, config } = await loadQBTokens();

    // ── Resolve customer: find ALL qb_customer_id variants for this customer ──
    // First lookup by the provided ID
    const { data: custRows } = await supabase
      .from('customers')
      .select('qb_customer_id, display_name')
      .or(`qb_customer_id.eq.${customerId},display_name.eq.${customerId}`)
      .limit(5);

    let numericQbId = customerId;
    let customerName = customerId;
    const customerIdVariants: string[] = [customerId];

    if (custRows?.length) {
      customerName = custRows[0].display_name;
      // Now find ALL rows with this display_name (catches both "341" and "AccessResto..." variants)
      const { data: allVariants } = await supabase
        .from('customers')
        .select('qb_customer_id')
        .eq('display_name', customerName);

      for (const c of (allVariants || [])) {
        if (!customerIdVariants.includes(c.qb_customer_id)) {
          customerIdVariants.push(c.qb_customer_id);
        }
        if (/^\d+$/.test(c.qb_customer_id)) {
          numericQbId = c.qb_customer_id;
        }
      }
      // Also add the display_name itself as a variant (used as jobcode in Workforce)
      if (!customerIdVariants.includes(customerName)) {
        customerIdVariants.push(customerName);
      }
    }
    console.log(`Customer: ${customerName}, QB IDs: ${customerIdVariants.join(', ')}, numeric: ${numericQbId}`);

    // ── 1. Invoices from QB Online ──
    console.log(`Fetching invoices for customer ${numericQbId} from ${start} to ${end}`);
    const invoiceResult = await qbQuery(
      `SELECT * FROM Invoice WHERE CustomerRef = '${numericQbId}' AND TxnDate >= '${start}' AND TxnDate <= '${end}' ORDERBY TxnDate`,
      tokens,
      config
    );

    const rawInvoices = invoiceResult?.QueryResponse?.Invoice || [];
    const invoices = rawInvoices.map((inv: any) => ({
      Id: inv.Id,
      DocNumber: inv.DocNumber,
      TxnDate: inv.TxnDate,
      TotalAmt: inv.TotalAmt,
      Balance: inv.Balance,
      DueDate: inv.DueDate,
      Lines: (inv.Line || [])
        .filter((ln: any) => ln.DetailType === 'SalesItemLineDetail')
        .map((ln: any) => ({
          Description: '',
          Amount: ln.Amount,
          Qty: ln.SalesItemLineDetail?.Qty || 0,
          Rate: ln.SalesItemLineDetail?.UnitPrice || 0,
          ItemName: ln.SalesItemLineDetail?.ItemRef?.name || 'Unknown',
          ItemId: ln.SalesItemLineDetail?.ItemRef?.value || '',
        })),
    }));

    if (rawInvoices.length && rawInvoices[0]?.CustomerRef?.name) {
      customerName = rawInvoices[0].CustomerRef.name;
    }

    // ── 2. Time entries from Supabase (primary source — fast, has clock times) ──
    console.log(`Fetching time entries from Supabase for ${customerIdVariants.length} ID variants`);

    // Build OR filter for all customer ID variants
    const orFilter = customerIdVariants.map(id => `qb_customer_id.eq.${id}`).join(',');

    const { data: dbEntries, error: dbError } = await supabase
      .from('time_entries')
      .select('txn_date, employee_name, hours, minutes, start_time, end_time, service_item_name, billable_status')
      .or(orFilter)
      .gte('txn_date', start)
      .lte('txn_date', end)
      .order('txn_date', { ascending: true });

    if (dbError) {
      console.error('Supabase query error:', dbError);
    }

    // Deduplicate DB entries (Workforce + QB Online pairs)
    const seen = new Map<string, any>();
    for (const e of (dbEntries || [])) {
      const key = `${e.txn_date}|${e.employee_name}|${e.hours}|${e.minutes}`;
      if (seen.has(key)) {
        const existing = seen.get(key);
        // Prefer entry with clock times
        if (e.start_time && !existing.start_time) {
          existing.start_time = e.start_time;
          existing.end_time = e.end_time;
        }
        // Prefer proper service name over customer-as-jobcode
        if (e.service_item_name && !e.service_item_name.includes('AccessResto') &&
            existing.service_item_name?.includes('AccessResto')) {
          existing.service_item_name = e.service_item_name;
        }
      } else {
        seen.set(key, { ...e });
      }
    }

    const uniqueDbEntries = Array.from(seen.values());
    console.log(`Supabase: ${dbEntries?.length || 0} raw → ${uniqueDbEntries.length} deduplicated entries`);

    // ── 3. QB Online TimeActivity (only for entries NOT in our DB) ──
    // Find the earliest date in our DB to know what gap we need to fill from QB
    const earliestDbDate = uniqueDbEntries.length > 0 ? uniqueDbEntries[0].txn_date : end;
    let qbTimeEntries: any[] = [];

    if (earliestDbDate > start) {
      // We need QB Online data for the gap period
      const qbEnd = earliestDbDate; // up to where our DB starts
      console.log(`Fetching QB Online TimeActivity for gap: ${start} to ${qbEnd}`);

      const batchSize = 500;
      let startPosition = 1;
      let hasMore = true;

      while (hasMore) {
        const taResult = await qbQuery(
          `SELECT * FROM TimeActivity WHERE TxnDate >= '${start}' AND TxnDate < '${qbEnd}' STARTPOSITION ${startPosition} MAXRESULTS ${batchSize}`,
          tokens,
          config
        );
        const batch = taResult?.QueryResponse?.TimeActivity || [];
        const customerBatch = batch.filter((ta: any) =>
          ta.CustomerRef?.value === numericQbId
        );
        qbTimeEntries.push(...customerBatch);

        if (batch.length < batchSize) {
          hasMore = false;
        } else {
          startPosition += batchSize;
        }
      }
      console.log(`QB Online gap fill: ${qbTimeEntries.length} entries for ${start} to ${qbEnd}`);
    }

    // ── 4. Merge all entries ──
    const timeEntries: any[] = [];

    // Add QB Online entries (for the gap period)
    for (const ta of qbTimeEntries) {
      const empName = ta.EmployeeRef?.name || ta.VendorRef?.name || 'Unknown';
      const hours = ta.Hours || 0;
      const minutes = ta.Minutes || 0;
      const startTime = ta.StartTime || null;
      const endTime = ta.EndTime || null;

      let durationMatch: boolean | null = null;
      if (startTime && endTime) {
        const dur = (new Date(endTime).getTime() - new Date(startTime).getTime()) / 3600000;
        durationMatch = Math.abs(dur - (hours + minutes / 60)) < 0.09;
      }

      timeEntries.push({
        Id: ta.Id,
        TxnDate: ta.TxnDate,
        EmployeeName: empName,
        Hours: hours,
        Minutes: minutes,
        StartTime: startTime,
        EndTime: endTime,
        ServiceItem: ta.ItemRef?.name || 'Unassigned',
        BillableStatus: ta.BillableStatus || 'NotBillable',
        DurationMatch: durationMatch,
      });
    }

    // Add Supabase entries
    for (const e of uniqueDbEntries) {
      let durationMatch: boolean | null = null;
      if (e.start_time && e.end_time) {
        const dur = (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 3600000;
        durationMatch = Math.abs(dur - (e.hours + e.minutes / 60)) < 0.09;
      }

      timeEntries.push({
        Id: `db-${e.txn_date}-${e.employee_name}-${e.hours}-${e.minutes}`,
        TxnDate: e.txn_date,
        EmployeeName: e.employee_name,
        Hours: e.hours,
        Minutes: e.minutes,
        StartTime: e.start_time || null,
        EndTime: e.end_time || null,
        ServiceItem: e.service_item_name || 'Unassigned',
        BillableStatus: e.billable_status || 'NotBillable',
        DurationMatch: durationMatch,
      });
    }

    // Sort by date
    timeEntries.sort((a: any, b: any) => a.TxnDate.localeCompare(b.TxnDate));

    // ── 5. Summary ──
    const totalInvoiced = invoices.reduce((s: number, i: any) => s + i.TotalAmt, 0);
    const totalOutstanding = invoices.reduce((s: number, i: any) => s + i.Balance, 0);
    const totalPaid = totalInvoiced - totalOutstanding;
    const totalHours = timeEntries.reduce((s: number, e: any) => s + e.Hours + e.Minutes / 60, 0);
    const entriesWithClock = timeEntries.filter((e: any) => e.StartTime).length;
    const entriesWithMismatch = timeEntries.filter((e: any) => e.DurationMatch === false).length;

    const result = {
      success: true,
      customer: { name: customerName, id: numericQbId },
      dateRange: { start, end },
      invoices,
      timeEntries,
      summary: {
        totalInvoiced,
        totalPaid,
        totalOutstanding,
        invoiceCount: invoices.length,
        totalHours: Math.round(totalHours * 100) / 100,
        entryCount: timeEntries.length,
        entriesWithClockTimes: entriesWithClock,
        entriesWithDurationMismatch: entriesWithMismatch,
      },
    };

    console.log(`Done: ${invoices.length} invoices ($${totalInvoiced.toFixed(2)}), ${timeEntries.length} entries (${totalHours.toFixed(2)} hrs), ${entriesWithClock} with clock, ${entriesWithMismatch} mismatches`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Counsel billing summary error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
