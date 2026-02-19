/**
 * sync-daily-review — Pull expense entities from QB Online
 * for the daily financial review workflow.
 *
 * Accepts: { startDate?, endDate? }
 * - Defaults to trailing 7 days if no dates supplied.
 *
 * Syncs 5 entity types into daily_review_transactions:
 *   Purchase  — credit card charges (AmEx, MC), checks, debit card, cash
 *   Bill      — vendor bills (AP)
 *   BillPayment — payments on bills from bank/CC accounts
 *   Transfer  — bank-to-bank, CC payments
 *   VendorCredit — credits/refunds from vendors
 *
 * Auto-categorizes via overhead_vendor_mappings and ACCOUNT_CATEGORY_MAP.
 *
 * Returns: { success, counts by type, date_range }
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

// Map QB account names to overhead categories (same as sync-overhead-transactions)
const ACCOUNT_CATEGORY_MAP: Record<string, string> = {
  'Computer and Internet Expenses': 'IT',
  'Telephone Expense': 'Telecom',
  'Security': 'Security',
  'Automobile Expense': 'Auto',
  'Utilities': 'Reimbursement',
  'Repairs and Maintenance': 'Maintenance',
  'Taxes and Licenses': 'Taxes',
  'Dues and Subscriptions': 'Software',
  'Software Subscriptions': 'Software',
  'Payroll Medical': 'Medical',
  'Advertising and Promotion': 'Marketing',
  'Attorney Counsel Fees': 'Legal',
  'Professional Fees': 'Professional',
  'Office Supplies': 'Office',
  'Operating Equipment': 'Equipment',
  'Travel Expense': 'Travel',
  'Meals and Entertainment': 'Meals',
  'Continuing Education': 'Education',
  'Educational': 'Education',
  'Training Expense': 'Training',
  'Planning Marketing': 'Marketing',
  'Insurance Expense': 'Insurance',
  'Accounting': 'Accounting',
};

/**
 * Paginated QB query — fetches all pages of results for an entity.
 */
async function qbQueryAll(
  entityType: string,
  whereClause: string,
  tokens: any,
  config: any
): Promise<any[]> {
  const allResults: any[] = [];
  let startPos = 1;

  while (true) {
    const query = `SELECT * FROM ${entityType} WHERE ${whereClause} STARTPOSITION ${startPos} MAXRESULTS ${QB_PAGE_SIZE}`;
    const data = await qbQuery(query, tokens, config);
    const records = data?.QueryResponse?.[entityType] || [];
    allResults.push(...records);

    if (records.length < QB_PAGE_SIZE) break;
    startPos += QB_PAGE_SIZE;
  }

  return allResults;
}

/**
 * Look up vendor → category from overhead_vendor_mappings.
 */
async function loadVendorMappings(supabase: any): Promise<Record<string, string>> {
  const { data } = await supabase
    .from('overhead_vendor_mappings')
    .select('vendor_name, category');
  const map: Record<string, string> = {};
  for (const row of data || []) {
    if (row.vendor_name && row.category) {
      map[row.vendor_name] = row.category;
    }
  }
  return map;
}

/**
 * Auto-categorize based on vendor mapping, then account name.
 */
function autoCategory(
  vendorName: string | null,
  accountName: string | null,
  vendorMappings: Record<string, string>
): { category: string | null; source: string } {
  // Priority 1: vendor mapping
  if (vendorName && vendorMappings[vendorName]) {
    return { category: vendorMappings[vendorName], source: 'vendor' };
  }
  // Priority 2: account name map
  if (accountName && ACCOUNT_CATEGORY_MAP[accountName]) {
    return { category: ACCOUNT_CATEGORY_MAP[accountName], source: 'auto' };
  }
  return { category: null, source: 'auto' };
}

/**
 * Transform QB Purchase into our DB row.
 */
function transformPurchase(
  p: any,
  vendorMappings: Record<string, string>
): any {
  const vendorName = p.EntityRef?.name || null;
  const accountName = p.AccountRef?.name || null;
  const { category, source } = autoCategory(vendorName, accountName, vendorMappings);

  const lineItems = (p.Line || []).map((line: any) => ({
    Id: line.Id,
    LineNum: line.LineNum,
    DetailType: line.DetailType,
    Amount: line.Amount,
    Description: line.Description || null,
    AccountRef: line.AccountBasedExpenseLineDetail?.AccountRef || null,
    CustomerRef: line.AccountBasedExpenseLineDetail?.CustomerRef || null,
    ItemRef: line.ItemBasedExpenseLineDetail?.ItemRef || null,
  }));

  return {
    qb_entity_type: 'Purchase',
    qb_entity_id: p.Id,
    qb_sync_token: p.SyncToken || null,
    txn_class: 'expense',
    txn_date: p.TxnDate,
    total_amount: Number(p.TotalAmt || 0),
    vendor_name: vendorName,
    customer_name: null,
    qb_customer_id: null,
    memo: p.PrivateNote || null,
    payment_type: p.PaymentType || null,
    qb_account_name: accountName,
    qb_account_id: p.AccountRef?.value || null,
    line_items: lineItems,
    category,
    category_source: source,
    synced_at: new Date().toISOString(),
  };
}

/**
 * Transform QB Bill into our DB row.
 */
function transformBill(
  b: any,
  vendorMappings: Record<string, string>
): any {
  const vendorName = b.VendorRef?.name || null;
  const accountName = b.APAccountRef?.name || null;
  const { category, source } = autoCategory(vendorName, accountName, vendorMappings);

  const lineItems = (b.Line || []).map((line: any) => ({
    Id: line.Id,
    LineNum: line.LineNum,
    DetailType: line.DetailType,
    Amount: line.Amount,
    Description: line.Description || null,
    AccountRef: line.AccountBasedExpenseLineDetail?.AccountRef || null,
    CustomerRef: line.AccountBasedExpenseLineDetail?.CustomerRef || null,
    ItemRef: line.ItemBasedExpenseLineDetail?.ItemRef || null,
  }));

  return {
    qb_entity_type: 'Bill',
    qb_entity_id: b.Id,
    qb_sync_token: b.SyncToken || null,
    txn_class: 'expense',
    txn_date: b.TxnDate,
    total_amount: Number(b.TotalAmt || 0),
    vendor_name: vendorName,
    customer_name: null,
    qb_customer_id: null,
    memo: b.PrivateNote || null,
    payment_type: null,
    qb_account_name: accountName,
    qb_account_id: b.APAccountRef?.value || null,
    line_items: lineItems,
    category,
    category_source: source,
    synced_at: new Date().toISOString(),
  };
}

/**
 * Transform QB BillPayment into our DB row.
 * BillPayment represents paying a bill — money leaves bank/CC account.
 */
function transformBillPayment(
  bp: any,
  vendorMappings: Record<string, string>
): any {
  const vendorName = bp.VendorRef?.name || null;
  // BillPayment has CheckPayment or CreditCardPayment detail
  const checkDetail = bp.CheckPayment || {};
  const ccDetail = bp.CreditCardPayment || {};
  const accountName = checkDetail.BankAccountRef?.name || ccDetail.CCAccountRef?.name || null;
  const accountId = checkDetail.BankAccountRef?.value || ccDetail.CCAccountRef?.value || null;
  const paymentType = bp.PayType || null; // 'Check' or 'CreditCard'
  const { category, source } = autoCategory(vendorName, accountName, vendorMappings);

  const lineItems = (bp.Line || []).map((line: any) => ({
    Id: line.Id,
    LineNum: line.LineNum,
    DetailType: line.DetailType,
    Amount: line.Amount,
    Description: line.Description || null,
    LinkedTxn: line.LinkedTxn || null,
  }));

  return {
    qb_entity_type: 'BillPayment',
    qb_entity_id: bp.Id,
    qb_sync_token: bp.SyncToken || null,
    txn_class: 'expense',
    txn_date: bp.TxnDate,
    total_amount: Number(bp.TotalAmt || 0),
    vendor_name: vendorName,
    customer_name: null,
    qb_customer_id: null,
    memo: bp.PrivateNote || null,
    payment_type: paymentType,
    qb_account_name: accountName,
    qb_account_id: accountId,
    line_items: lineItems,
    category,
    category_source: source,
    synced_at: new Date().toISOString(),
  };
}

/**
 * Transform QB Transfer into our DB row.
 * Transfer moves money between accounts (e.g., paying CC from checking).
 */
function transformTransfer(
  t: any,
  _vendorMappings: Record<string, string>
): any {
  const fromAccount = t.FromAccountRef?.name || null;
  const toAccount = t.ToAccountRef?.name || null;
  const memo = t.PrivateNote || `${fromAccount || '?'} → ${toAccount || '?'}`;

  return {
    qb_entity_type: 'Transfer',
    qb_entity_id: t.Id,
    qb_sync_token: t.SyncToken || null,
    txn_class: 'expense',
    txn_date: t.TxnDate,
    total_amount: Number(t.Amount || 0),
    vendor_name: null,
    customer_name: null,
    qb_customer_id: null,
    memo,
    payment_type: 'Transfer',
    qb_account_name: fromAccount,
    qb_account_id: t.FromAccountRef?.value || null,
    line_items: [{
      DetailType: 'Transfer',
      Amount: Number(t.Amount || 0),
      Description: memo,
      AccountRef: t.ToAccountRef || null,
    }],
    category: null,
    category_source: 'auto',
    synced_at: new Date().toISOString(),
  };
}

/**
 * Transform QB VendorCredit into our DB row.
 * VendorCredit is a credit/refund from a vendor (reduces AP).
 */
function transformVendorCredit(
  vc: any,
  vendorMappings: Record<string, string>
): any {
  const vendorName = vc.VendorRef?.name || null;
  const accountName = vc.APAccountRef?.name || null;
  const { category, source } = autoCategory(vendorName, accountName, vendorMappings);

  const lineItems = (vc.Line || []).map((line: any) => ({
    Id: line.Id,
    LineNum: line.LineNum,
    DetailType: line.DetailType,
    Amount: line.Amount,
    Description: line.Description || null,
    AccountRef: line.AccountBasedExpenseLineDetail?.AccountRef || null,
    CustomerRef: line.AccountBasedExpenseLineDetail?.CustomerRef || null,
    ItemRef: line.ItemBasedExpenseLineDetail?.ItemRef || null,
  }));

  return {
    qb_entity_type: 'VendorCredit',
    qb_entity_id: vc.Id,
    qb_sync_token: vc.SyncToken || null,
    txn_class: 'expense',
    txn_date: vc.TxnDate,
    total_amount: -Math.abs(Number(vc.TotalAmt || 0)), // Negative — it's a credit
    vendor_name: vendorName,
    customer_name: null,
    qb_customer_id: null,
    memo: vc.PrivateNote || null,
    payment_type: null,
    qb_account_name: accountName,
    qb_account_id: vc.APAccountRef?.value || null,
    line_items: lineItems,
    category,
    category_source: source,
    synced_at: new Date().toISOString(),
  };
}

/**
 * Batch upsert rows — preserves review_status/category if already reviewed.
 * Uses ON CONFLICT to update only sync-related fields for reviewed items.
 */
async function batchUpsert(
  supabase: any,
  rows: any[]
): Promise<number> {
  let count = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    // For each row, check if it already exists and is reviewed
    // If reviewed, only update sync fields (amount, sync_token, line_items)
    // If not reviewed, update everything including category
    const { error } = await supabase
      .from('daily_review_transactions')
      .upsert(batch, {
        onConflict: 'qb_entity_type,qb_entity_id',
        ignoreDuplicates: false,
      });

    if (error) {
      console.error(`sync-daily-review: Batch upsert error at offset ${i}:`, error.message);
      // Fall back to individual upserts
      for (const row of batch) {
        // Check if already reviewed — if so, skip category/status fields
        const { data: existing } = await supabase
          .from('daily_review_transactions')
          .select('id, review_status, category, category_source')
          .eq('qb_entity_type', row.qb_entity_type)
          .eq('qb_entity_id', row.qb_entity_id)
          .maybeSingle();

        if (existing && existing.review_status !== 'pending') {
          // Preserve review state — only update sync fields
          const { error: updateErr } = await supabase
            .from('daily_review_transactions')
            .update({
              qb_sync_token: row.qb_sync_token,
              total_amount: row.total_amount,
              line_items: row.line_items,
              memo: row.memo,
              synced_at: row.synced_at,
            })
            .eq('id', existing.id);
          if (!updateErr) count++;
        } else {
          const { error: singleErr } = await supabase
            .from('daily_review_transactions')
            .upsert(row, {
              onConflict: 'qb_entity_type,qb_entity_id',
              ignoreDuplicates: false,
            });
          if (!singleErr) count++;
        }
      }
    } else {
      count += batch.length;
    }
  }
  return count;
}

/**
 * After upsert, restore review state for already-reviewed items.
 * The bulk upsert may overwrite category/status, so we fix them.
 */
async function preserveReviewedState(supabase: any): Promise<void> {
  // This is handled by the individual fallback above.
  // For the bulk path, we rely on the DB trigger to set updated_at
  // but category/status get overwritten. We fix this with a post-upsert query.
  // Actually — the better approach is to handle this at query time.
  // For Phase 1, the bulk upsert will overwrite pending items fully,
  // and the individual fallback preserves reviewed items.
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));

    // Default to trailing 7 days
    const now = new Date();
    const defaultStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
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
    console.log(`sync-daily-review: Fetching data for ${startDate} to ${endDate}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, serviceKey);

    const loaded = await loadQBTokens();
    const { tokens, config } = loaded;

    // Load vendor → category mappings for auto-categorization
    const vendorMappings = await loadVendorMappings(supabase);
    console.log(`sync-daily-review: Loaded ${Object.keys(vendorMappings).length} vendor mappings`);

    // --- 1. Purchases (CC charges, checks, debit, cash) ---
    console.log('sync-daily-review: Fetching Purchases...');
    const purchases = await qbQueryAll(
      'Purchase',
      `TxnDate >= '${startDate}' AND TxnDate <= '${endDate}'`,
      tokens, config
    );
    console.log(`sync-daily-review: Got ${purchases.length} purchases`);
    const purchaseRows = purchases.map(p => transformPurchase(p, vendorMappings));

    // --- 2. Bills (vendor invoices / AP) ---
    console.log('sync-daily-review: Fetching Bills...');
    const bills = await qbQueryAll(
      'Bill',
      `TxnDate >= '${startDate}' AND TxnDate <= '${endDate}'`,
      tokens, config
    );
    console.log(`sync-daily-review: Got ${bills.length} bills`);
    const billRows = bills.map(b => transformBill(b, vendorMappings));

    // --- 3. BillPayments (bill payments from bank/CC) ---
    console.log('sync-daily-review: Fetching BillPayments...');
    const billPayments = await qbQueryAll(
      'BillPayment',
      `TxnDate >= '${startDate}' AND TxnDate <= '${endDate}'`,
      tokens, config
    );
    console.log(`sync-daily-review: Got ${billPayments.length} bill payments`);
    const billPaymentRows = billPayments.map(bp => transformBillPayment(bp, vendorMappings));

    // --- 4. Transfers (bank-to-bank, CC payments) ---
    console.log('sync-daily-review: Fetching Transfers...');
    const transfers = await qbQueryAll(
      'Transfer',
      `TxnDate >= '${startDate}' AND TxnDate <= '${endDate}'`,
      tokens, config
    );
    console.log(`sync-daily-review: Got ${transfers.length} transfers`);
    const transferRows = transfers.map(t => transformTransfer(t, vendorMappings));

    // --- 5. VendorCredits (refunds/credits from vendors) ---
    console.log('sync-daily-review: Fetching VendorCredits...');
    const vendorCredits = await qbQueryAll(
      'VendorCredit',
      `TxnDate >= '${startDate}' AND TxnDate <= '${endDate}'`,
      tokens, config
    );
    console.log(`sync-daily-review: Got ${vendorCredits.length} vendor credits`);
    const vendorCreditRows = vendorCredits.map(vc => transformVendorCredit(vc, vendorMappings));

    // --- 6. Upsert all rows ---
    const allRows = [...purchaseRows, ...billRows, ...billPaymentRows, ...transferRows, ...vendorCreditRows];
    console.log(`sync-daily-review: Upserting ${allRows.length} transactions...`);

    // Before bulk upsert, snapshot reviewed items so we can restore them
    const { data: reviewedItems } = await supabase
      .from('daily_review_transactions')
      .select('id, qb_entity_type, qb_entity_id, review_status, category, category_source, reviewed_by, reviewed_at')
      .neq('review_status', 'pending');

    const reviewedMap = new Map<string, any>();
    for (const item of reviewedItems || []) {
      reviewedMap.set(`${item.qb_entity_type}:${item.qb_entity_id}`, item);
    }

    const upsertCount = await batchUpsert(supabase, allRows);

    // Restore review state for items that were already reviewed
    let restoredCount = 0;
    for (const [key, item] of reviewedMap) {
      const { error } = await supabase
        .from('daily_review_transactions')
        .update({
          review_status: item.review_status,
          category: item.category,
          category_source: item.category_source,
          reviewed_by: item.reviewed_by,
          reviewed_at: item.reviewed_at,
        })
        .eq('qb_entity_type', item.qb_entity_type)
        .eq('qb_entity_id', item.qb_entity_id);
      if (!error) restoredCount++;
    }

    if (restoredCount > 0) {
      console.log(`sync-daily-review: Restored review state for ${restoredCount} previously-reviewed items`);
    }

    console.log(`sync-daily-review: Done. ${purchaseRows.length} purchases, ${billRows.length} bills, ${billPaymentRows.length} bill payments, ${transferRows.length} transfers, ${vendorCreditRows.length} vendor credits, ${upsertCount} upserted`);

    return new Response(
      JSON.stringify({
        success: true,
        purchases_count: purchaseRows.length,
        bills_count: billRows.length,
        bill_payments_count: billPaymentRows.length,
        transfers_count: transferRows.length,
        vendor_credits_count: vendorCreditRows.length,
        total_upserted: upsertCount,
        reviewed_preserved: restoredCount,
        date_range: { startDate, endDate },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('sync-daily-review error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
