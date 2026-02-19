/**
 * sync-payments — Pull Payment, Deposit, and Invoice balance data from QB Online.
 *
 * Accepts: { startDate?, endDate? }
 * - Defaults to trailing 12 months if no dates supplied.
 *
 * Syncs three entity types:
 *  1. Payment (ReceivePayment) → qb_payments
 *  2. Deposit → qb_deposits
 *  3. Invoice (balance/status snapshot) → qb_invoice_balances
 *
 * Returns: { success, payments_count, deposits_count, invoices_count }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { qbQuery, loadQBTokens } from '../_shared/qb-auth.ts';
import { validateDateRange } from '../_shared/date-validation.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 100;
const QB_PAGE_SIZE = 1000;

/**
 * Paginated QB query — fetches all pages of results for an entity.
 */
async function qbQueryAll(
  entityType: string,
  whereClause: string,
  tokens: any,
  config: any,
  selectFields?: string
): Promise<any[]> {
  const allResults: any[] = [];
  let startPos = 1;

  while (true) {
    const fields = selectFields || '*';
    const query = `SELECT ${fields} FROM ${entityType} WHERE ${whereClause} STARTPOSITION ${startPos} MAXRESULTS ${QB_PAGE_SIZE}`;
    const data = await qbQuery(query, tokens, config);
    const records = data?.QueryResponse?.[entityType] || [];
    allResults.push(...records);

    if (records.length < QB_PAGE_SIZE) break;
    startPos += QB_PAGE_SIZE;
  }

  return allResults;
}

/**
 * Transform QB Payment into our DB row.
 */
function transformPayment(p: any): any {
  const linkedInvoices = (p.Line || [])
    .filter((line: any) => line.LinkedTxn)
    .flatMap((line: any) =>
      (line.LinkedTxn || [])
        .filter((lt: any) => lt.TxnType === 'Invoice')
        .map((lt: any) => ({ invoiceId: lt.TxnId, amount: line.Amount }))
    );

  return {
    qb_payment_id: p.Id,
    txn_date: p.TxnDate,
    qb_customer_id: p.CustomerRef?.value || null,
    customer_name: p.CustomerRef?.name || null,
    total_amount: Number(p.TotalAmt || 0),
    payment_method: p.PaymentMethodRef?.name || null,
    payment_ref_num: p.PaymentRefNum || null,
    deposit_to_account: p.DepositToAccountRef?.name || null,
    unapplied_amount: Number(p.UnappliedAmt || 0),
    linked_invoices: linkedInvoices,
    sync_token: p.SyncToken || null,
    synced_at: new Date().toISOString(),
  };
}

/**
 * Transform QB Deposit into our DB row.
 */
function transformDeposit(d: any): any {
  const lineItems = (d.Line || []).map((line: any) => ({
    amount: line.Amount,
    description: line.Description || null,
    entityRef: line.DepositLineDetail?.Entity?.value || null,
    entityName: line.DepositLineDetail?.Entity?.name || null,
    accountRef: line.DepositLineDetail?.AccountRef?.value || null,
    accountName: line.DepositLineDetail?.AccountRef?.name || null,
  }));

  return {
    qb_deposit_id: d.Id,
    txn_date: d.TxnDate,
    total_amount: Number(d.TotalAmt || 0),
    deposit_to_account: d.DepositToAccountRef?.name || null,
    line_items: lineItems,
    memo: d.PrivateNote || null,
    synced_at: new Date().toISOString(),
  };
}

/**
 * Transform QB Invoice into our DB row with derived status.
 */
function transformInvoice(inv: any): any {
  const totalAmt = Number(inv.TotalAmt || 0);
  const balance = Number(inv.Balance || 0);

  let status = 'Open';
  if (balance === 0) {
    status = 'Paid';
  } else if (balance < totalAmt) {
    status = 'Partial';
  } else if (inv.DueDate) {
    const due = new Date(inv.DueDate + 'T00:00:00');
    if (due < new Date()) status = 'Overdue';
  }

  return {
    qb_invoice_id: inv.Id,
    invoice_number: inv.DocNumber || null,
    qb_customer_id: inv.CustomerRef?.value || null,
    customer_name: inv.CustomerRef?.name || null,
    txn_date: inv.TxnDate || null,
    due_date: inv.DueDate || null,
    total_amount: totalAmt,
    balance: balance,
    status,
    synced_at: new Date().toISOString(),
  };
}

/**
 * Batch upsert rows into a table.
 */
async function batchUpsert(
  supabase: any,
  table: string,
  rows: any[],
  conflictColumn: string
): Promise<number> {
  let count = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from(table)
      .upsert(batch, { onConflict: conflictColumn, ignoreDuplicates: false });

    if (error) {
      console.error(`sync-payments: Batch upsert error on ${table} at offset ${i}:`, error.message);
      // Fall back to individual upserts
      for (const row of batch) {
        const { error: singleErr } = await supabase
          .from(table)
          .upsert(row, { onConflict: conflictColumn, ignoreDuplicates: true });
        if (!singleErr) count++;
      }
    } else {
      count += batch.length;
    }
  }
  return count;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));

    // Default to trailing 12 months
    const now = new Date();
    const defaultStart = new Date(now.getFullYear() - 1, now.getMonth(), 1)
      .toISOString().split('T')[0];
    const defaultEnd = now.toISOString().split('T')[0];

    const dateRange = validateDateRange(
      body.startDate || defaultStart,
      body.endDate || defaultEnd,
      { maxRangeDays: 400, allowEmpty: false }
    );
    if (!dateRange.valid) {
      return new Response(
        JSON.stringify({ success: false, error: dateRange.error }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const { startDate, endDate } = dateRange;
    console.log(`sync-payments: Fetching data for ${startDate} to ${endDate}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, serviceKey);

    const loaded = await loadQBTokens();
    const { tokens, config } = loaded;

    // --- 1. Payments ---
    console.log('sync-payments: Fetching Payments...');
    const payments = await qbQueryAll(
      'Payment',
      `TxnDate >= '${startDate}' AND TxnDate <= '${endDate}'`,
      tokens, config
    );
    console.log(`sync-payments: Got ${payments.length} payments`);

    const paymentRows = payments.map(transformPayment);
    const paymentsCount = await batchUpsert(supabase, 'qb_payments', paymentRows, 'qb_payment_id');

    // --- 2. Deposits ---
    console.log('sync-payments: Fetching Deposits...');
    const deposits = await qbQueryAll(
      'Deposit',
      `TxnDate >= '${startDate}' AND TxnDate <= '${endDate}'`,
      tokens, config
    );
    console.log(`sync-payments: Got ${deposits.length} deposits`);

    const depositRows = deposits.map(transformDeposit);
    const depositsCount = await batchUpsert(supabase, 'qb_deposits', depositRows, 'qb_deposit_id');

    // --- 3. Invoice balances (all recently updated invoices) ---
    console.log('sync-payments: Fetching Invoice balances...');
    const invoices = await qbQueryAll(
      'Invoice',
      `MetaData.LastUpdatedTime >= '${startDate}T00:00:00'`,
      tokens, config,
      'Id, DocNumber, CustomerRef, TxnDate, DueDate, TotalAmt, Balance, MetaData'
    );
    console.log(`sync-payments: Got ${invoices.length} invoices`);

    const invoiceRows = invoices.map(transformInvoice);
    const invoicesCount = await batchUpsert(supabase, 'qb_invoice_balances', invoiceRows, 'qb_invoice_id');

    console.log(`sync-payments: Done. ${paymentsCount} payments, ${depositsCount} deposits, ${invoicesCount} invoices`);

    return new Response(
      JSON.stringify({
        success: true,
        payments_count: paymentsCount,
        deposits_count: depositsCount,
        invoices_count: invoicesCount,
        date_range: { startDate, endDate },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('sync-payments error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
