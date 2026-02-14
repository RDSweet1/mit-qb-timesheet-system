/**
 * sync-overhead-transactions — Pull individual expense transactions from QB ProfitAndLossDetail
 * and manage vendor-based overhead categorization.
 *
 * Accepts: { startDate?, endDate?, materializeOnly? }
 * - startDate/endDate: date range (defaults to trailing 12 months)
 * - materializeOnly: skip QB fetch, just re-aggregate overhead_transactions → overhead_line_items
 *
 * Returns: { success, txn_count, vendor_count, categories, total_annual, weekly_amount }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { qbApiCall, loadQBTokens } from '../_shared/qb-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Map QB account names to overhead categories (auto-suggest)
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

// Accounts to skip — tracked elsewhere or not true overhead
const EXCLUDED_ACCOUNTS = new Set([
  'Payroll Expenses',
  'consulting Expenses',
  'Bank Service Charges',
  'Banking Transfer',
  'Reconciliation Discrepancies',
  'Loss/Collections',
]);

interface Transaction {
  txn_date: string;
  txn_type: string;
  txn_num: string;
  vendor_name: string;
  memo: string;
  qb_account_name: string;
  qb_account_id: string;
  split_account: string;
  amount: number;
}

/**
 * Parse ProfitAndLossDetail report into individual transactions.
 * The report structure has nested sections for expense accounts,
 * with column headers that tell us the field positions.
 */
function parseTransactions(report: any): Transaction[] {
  const transactions: Transaction[] = [];

  // Build column index from report header using MetaData ColKey
  const columns = report?.Columns?.Column || [];

  // Walk the nested structure to find the Expenses section
  // Structure: Row[] → "Ordinary Income/Expenses" section → "Expenses" section
  const reportRows = report?.Rows?.Row || [];

  function findExpenseSection(rows: any[]): any | null {
    for (const row of rows) {
      if (row.type !== 'Section') continue;
      const headerVal = row.Header?.ColData?.[0]?.value || '';
      if (headerVal === 'Expenses') return row;
      // Recurse into nested sections (e.g. "Ordinary Income/Expenses")
      const nested = row.Rows?.Row || [];
      const found = findExpenseSection(nested);
      if (found) return found;
    }
    return null;
  }

  const expenseSection = findExpenseSection(reportRows);

  if (!expenseSection?.Rows?.Row) return transactions;

  function walkRows(rows: any[], parentAccountName?: string, parentAccountId?: string) {
    for (const row of rows) {
      if (row.type === 'Data' && row.ColData) {
        const txn = extractTransaction(row.ColData, columns, parentAccountName, parentAccountId);
        if (txn) transactions.push(txn);
      } else if (row.type === 'Section') {
        const sectionName = row.Header?.ColData?.[0]?.value || '';
        const sectionId = row.Header?.ColData?.[0]?.id || '';
        const childRows = row.Rows?.Row || [];
        walkRows(childRows, sectionName, sectionId);
      }
    }
  }

  walkRows(expenseSection.Rows.Row);
  return transactions;
}

function extractTransaction(
  colData: any[],
  columns: any[],
  parentAccountName?: string,
  parentAccountId?: string
): Transaction | null {
  // ProfitAndLossDetail columns: Date, Transaction Type, Num, Name, Memo/Description, Split, Amount, Balance
  // Use MetaData ColKey for reliable field mapping
  const fieldMap: Record<string, number> = {};
  columns.forEach((col: any, i: number) => {
    // Primary: use MetaData ColKey (e.g. "tx_date", "txn_type", "doc_num", "name", "memo", "split_acc", "subt_nat_amount")
    const metaKey = (col.MetaData || []).find((m: any) => m.Name === 'ColKey')?.Value || '';
    if (metaKey) fieldMap[metaKey.toLowerCase()] = i;
    // Fallback: ColTitle
    const title = (col.ColTitle || '').toLowerCase();
    if (title && !(title in fieldMap)) fieldMap[title] = i;
  });

  function getVal(keys: string[]): string {
    for (const k of keys) {
      const idx = fieldMap[k];
      if (idx !== undefined && colData[idx]) return colData[idx].value || '';
    }
    return '';
  }

  function getId(keys: string[]): string {
    for (const k of keys) {
      const idx = fieldMap[k];
      if (idx !== undefined && colData[idx]) return colData[idx].id || '';
    }
    return '';
  }

  const dateStr = getVal(['tx_date', 'date']);
  const txnType = getVal(['txn_type', 'transaction type']);
  const txnNum = getVal(['doc_num', 'num']);
  const vendor = getVal(['name']);
  const memo = getVal(['memo', 'memo/description']);
  const splitAccount = getVal(['split_acc', 'split']);
  const amountStr = getVal(['subt_nat_amount', 'amount']);
  const amount = parseFloat(amountStr) || 0;

  // Account name comes from the parent section header (e.g. "Automobile Expense")
  const accountName = parentAccountName || '';
  const accountId = parentAccountId || '';

  // Skip if no date or zero amount (summary/total rows)
  if (!dateStr || amount === 0) return null;

  return {
    txn_date: dateStr,
    txn_type: txnType,
    txn_num: txnNum,
    vendor_name: vendor,
    memo: memo,
    qb_account_name: accountName,
    qb_account_id: accountId,
    split_account: splitAccount,
    amount: Math.abs(amount), // expenses are positive in our system
  };
}

/**
 * Materialize overhead_transactions → overhead_line_items
 * Groups by category, sums amounts, upserts with source='vendor_txn'
 */
async function materialize(supabase: any, periodStart: string, periodEnd: string) {
  // Load all overhead transactions that are marked as overhead
  const { data: txns, error: txnErr } = await supabase
    .from('overhead_transactions')
    .select('category, amount, is_overhead')
    .eq('is_overhead', true)
    .not('category', 'is', null);

  if (txnErr) throw new Error(`Failed to load transactions: ${txnErr.message}`);

  // Group by category
  const byCategory: Record<string, { total: number; count: number }> = {};
  for (const txn of (txns || [])) {
    const cat = txn.category;
    if (!cat) continue;
    if (!byCategory[cat]) byCategory[cat] = { total: 0, count: 0 };
    byCategory[cat].total += Number(txn.amount);
    byCategory[cat].count++;
  }

  // Delete existing vendor_txn rows
  await supabase
    .from('overhead_line_items')
    .delete()
    .eq('source', 'vendor_txn');

  // Insert new aggregated rows
  const rows = Object.entries(byCategory).map(([category, data]) => ({
    category,
    vendor: `${data.count} transactions`,
    annual_amount: Number(data.total.toFixed(2)),
    frequency: 'annual',
    notes: `Aggregated from ${data.count} vendor transactions`,
    source: 'vendor_txn',
    is_active: true,
    txn_count: data.count,
    period_start: periodStart,
    period_end: periodEnd,
    last_synced_at: new Date().toISOString(),
  }));

  if (rows.length > 0) {
    const { error: insertErr } = await supabase
      .from('overhead_line_items')
      .insert(rows);
    if (insertErr) throw new Error(`Failed to materialize: ${insertErr.message}`);
  }

  const totalAnnual = rows.reduce((s, r) => s + r.annual_amount, 0);
  return { categories: Object.keys(byCategory).length, totalAnnual, rows };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const materializeOnly = body.materializeOnly === true;

    // Default date range: trailing 12 months
    const now = new Date();
    const defaultStart = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const startDate = body.startDate || defaultStart.toISOString().split('T')[0];
    const endDate = body.endDate || now.toISOString().split('T')[0];

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, serviceKey);

    if (materializeOnly) {
      console.log('sync-overhead-transactions: Materialize only mode');
      const result = await materialize(supabase, startDate, endDate);
      const weeklyAmount = result.totalAnnual / 52;
      return new Response(
        JSON.stringify({
          success: true,
          materialize_only: true,
          categories: result.categories,
          total_annual: result.totalAnnual,
          weekly_amount: weeklyAmount,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`sync-overhead-transactions: Fetching P&L Detail for ${startDate} to ${endDate}`);

    // Load QB tokens and fetch ProfitAndLossDetail
    const loaded = await loadQBTokens();
    const tokens = loaded.tokens;
    const config = loaded.config;

    const endpoint = `/v3/company/${tokens.realmId}/reports/ProfitAndLossDetail?start_date=${startDate}&end_date=${endDate}&columns=tx_date,txn_type,doc_num,name,memo,split_acc,subt_nat_amount,account_name&minorversion=75`;
    const response = await qbApiCall(endpoint, tokens, config, { method: 'GET' });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`QB P&L Detail fetch failed: ${response.status} - ${error}`);
    }

    const report = await response.json();
    const transactions = parseTransactions(report);
    console.log(`sync-overhead-transactions: Parsed ${transactions.length} transactions`);

    // Load vendor mappings
    const { data: vendorMappings } = await supabase
      .from('overhead_vendor_mappings')
      .select('*');
    const vendorMap: Record<string, { category: string; is_overhead: boolean }> = {};
    for (const m of (vendorMappings || [])) {
      vendorMap[m.vendor_name.toLowerCase()] = { category: m.category, is_overhead: m.is_overhead };
    }

    // Load existing overrides (category_source='override')
    const { data: existingOverrides } = await supabase
      .from('overhead_transactions')
      .select('txn_date, txn_type, txn_num, vendor_name, qb_account_name, amount, category, is_overhead')
      .eq('category_source', 'override');
    const overrideMap = new Map<string, { category: string; is_overhead: boolean }>();
    for (const o of (existingOverrides || [])) {
      const key = `${o.txn_date}|${o.txn_type}|${o.txn_num}|${o.vendor_name}|${o.qb_account_name}|${o.amount}`;
      overrideMap.set(key, { category: o.category, is_overhead: o.is_overhead });
    }

    // Resolve categories and prepare upserts
    const vendorNames = new Set<string>();
    const upsertRows = [];

    for (const txn of transactions) {
      const overrideKey = `${txn.txn_date}|${txn.txn_type}|${txn.txn_num}|${txn.vendor_name}|${txn.qb_account_name}|${txn.amount}`;
      const override = overrideMap.get(overrideKey);

      let category: string | null = null;
      let categorySource = 'auto';
      let isOverhead = true;

      if (override) {
        // Preserve existing override
        category = override.category;
        isOverhead = override.is_overhead;
        categorySource = 'override';
      } else if (txn.vendor_name && vendorMap[txn.vendor_name.toLowerCase()]) {
        // Use vendor mapping
        const mapping = vendorMap[txn.vendor_name.toLowerCase()];
        category = mapping.category;
        isOverhead = mapping.is_overhead;
        categorySource = 'vendor';
      } else if (EXCLUDED_ACCOUNTS.has(txn.qb_account_name)) {
        // Excluded account
        isOverhead = false;
        categorySource = 'auto';
      } else if (ACCOUNT_CATEGORY_MAP[txn.qb_account_name]) {
        // Auto-suggest from QB account
        category = ACCOUNT_CATEGORY_MAP[txn.qb_account_name];
        categorySource = 'auto';
      }

      if (txn.vendor_name) vendorNames.add(txn.vendor_name);

      upsertRows.push({
        txn_date: txn.txn_date,
        txn_type: txn.txn_type || null,
        txn_num: txn.txn_num || null,
        vendor_name: txn.vendor_name || null,
        memo: txn.memo || null,
        qb_account_name: txn.qb_account_name || null,
        qb_account_id: txn.qb_account_id || null,
        split_account: txn.split_account || null,
        amount: txn.amount,
        category,
        category_source: categorySource,
        is_overhead: isOverhead,
        sync_period_start: startDate,
        sync_period_end: endDate,
        synced_at: new Date().toISOString(),
      });
    }

    // Batch upsert transactions (preserve overrides on conflict)
    let upsertCount = 0;
    const batchSize = 100;
    for (let i = 0; i < upsertRows.length; i += batchSize) {
      const batch = upsertRows.slice(i, i + batchSize);
      const { error: upsertErr } = await supabase
        .from('overhead_transactions')
        .upsert(batch, {
          onConflict: 'txn_date,txn_type,txn_num,vendor_name,qb_account_name,amount',
          ignoreDuplicates: false,
        });

      if (upsertErr) {
        console.error(`sync-overhead-transactions: Batch upsert error at ${i}:`, upsertErr.message);
        // For rows that fail unique constraint due to nulls, try individual inserts
        for (const row of batch) {
          const { error: singleErr } = await supabase
            .from('overhead_transactions')
            .upsert(row, {
              onConflict: 'txn_date,txn_type,txn_num,vendor_name,qb_account_name,amount',
              ignoreDuplicates: true,
            });
          if (!singleErr) upsertCount++;
        }
      } else {
        upsertCount += batch.length;
      }
    }

    console.log(`sync-overhead-transactions: Upserted ${upsertCount} transactions`);

    // Materialize totals into overhead_line_items
    const matResult = await materialize(supabase, startDate, endDate);
    const totalAnnual = matResult.totalAnnual;
    const weeklyAmount = totalAnnual / 52;

    console.log(`sync-overhead-transactions: Done. ${upsertCount} txns, ${vendorNames.size} vendors, ${matResult.categories} categories, $${totalAnnual.toFixed(2)} annual, $${weeklyAmount.toFixed(2)}/week`);

    return new Response(
      JSON.stringify({
        success: true,
        txn_count: upsertCount,
        vendor_count: vendorNames.size,
        categories: matResult.categories,
        total_annual: totalAnnual,
        weekly_amount: weeklyAmount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('sync-overhead-transactions error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
