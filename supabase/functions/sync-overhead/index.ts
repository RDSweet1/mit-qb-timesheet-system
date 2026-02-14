/**
 * sync-overhead — Pull expense accounts from QB P&L and upsert into overhead_line_items
 *
 * Accepts: { year?: number }
 * Returns: { success, created, updated, total_annual, weekly_amount, items }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { qbApiCall, loadQBTokens } from '../_shared/qb-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Map QB account names to overhead categories
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
};

// Accounts to skip — tracked elsewhere or not true overhead
const EXCLUDED_ACCOUNTS = new Set([
  'Payroll Expenses',          // tracked via employee_cost_rates
  'consulting Expenses',       // subcontractors, not overhead
  'Bank Service Charges',      // banking fees, not operational overhead
  'Banking Transfer',          // transfers, not expenses
  'Reconciliation Discrepancies', // accounting adjustments
  'Loss/Collections',          // bad debt, not recurring overhead
]);

interface ExpenseItem {
  name: string;
  accountId: string;
  amount: number;
  parentName?: string;
}

function flattenExpenses(rows: any[]): ExpenseItem[] {
  const items: ExpenseItem[] = [];

  for (const row of rows) {
    if (row.type === 'Data' && row.ColData) {
      items.push({
        name: row.ColData[0]?.value || '',
        accountId: row.ColData[0]?.id || '',
        amount: parseFloat(row.ColData[1]?.value) || 0,
      });
    } else if (row.type === 'Section') {
      // Nested section (e.g. Dues and Subscriptions → Software Subscriptions)
      const parentName = row.Header?.ColData?.[0]?.value || '';
      const children = row.Rows?.Row || [];
      for (const child of children) {
        if (child.type === 'Data' && child.ColData) {
          items.push({
            name: child.ColData[0]?.value || '',
            accountId: child.ColData[0]?.id || '',
            amount: parseFloat(child.ColData[1]?.value) || 0,
            parentName,
          });
        }
      }
      // If parent has amount beyond children, add the difference
      const childTotal = children
        .filter((c: any) => c.type === 'Data' && c.ColData)
        .reduce((s: number, c: any) => s + (parseFloat(c.ColData[1]?.value) || 0), 0);
      const parentTotal = parseFloat(row.Summary?.ColData?.[1]?.value) || 0;
      if (Math.abs(parentTotal - childTotal) > 0.01) {
        items.push({
          name: parentName,
          accountId: row.Header?.ColData?.[0]?.id || '',
          amount: parentTotal - childTotal,
        });
      }
    }
  }

  return items;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { year } = await req.json().catch(() => ({}));
    const targetYear = year || new Date().getFullYear();
    const startDate = `${targetYear}-01-01`;
    const endDate = `${targetYear}-12-31`;

    console.log(`sync-overhead: Fetching P&L for ${startDate} to ${endDate}`);

    // Load QB tokens and fetch P&L
    const loaded = await loadQBTokens();
    const tokens = loaded.tokens;
    const config = loaded.config;

    const endpoint = `/v3/company/${tokens.realmId}/reports/ProfitAndLoss?start_date=${startDate}&end_date=${endDate}&summarize_by=Total&minorversion=75`;
    const response = await qbApiCall(endpoint, tokens, config, { method: 'GET' });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`QB P&L fetch failed: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const report = data;
    const reportRows = report?.Rows?.Row || [];

    // Find the Expenses section
    const expenseSection = reportRows.find((r: any) => r.type === 'Section' && r.group === 'Expenses');
    if (!expenseSection || !expenseSection.Rows?.Row) {
      throw new Error('No Expenses section found in P&L report');
    }

    // Flatten expense items
    const allExpenses = flattenExpenses(expenseSection.Rows.Row);
    console.log(`sync-overhead: Found ${allExpenses.length} expense line items`);

    // Filter and map to overhead categories
    const overheadItems = allExpenses
      .filter(item => !EXCLUDED_ACCOUNTS.has(item.name))
      .filter(item => {
        const category = ACCOUNT_CATEGORY_MAP[item.name] || ACCOUNT_CATEGORY_MAP[item.parentName || ''];
        return !!category;
      })
      .map(item => ({
        ...item,
        category: ACCOUNT_CATEGORY_MAP[item.name] || ACCOUNT_CATEGORY_MAP[item.parentName || ''] || 'Other',
      }));

    console.log(`sync-overhead: ${overheadItems.length} items after filtering (excluded ${allExpenses.length - overheadItems.length})`);

    // Upsert into overhead_line_items
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, serviceKey);

    let created = 0;
    let updated = 0;
    const syncedItems: Array<{ name: string; category: string; amount: number; action: string }> = [];

    for (const item of overheadItems) {
      // Skip negative or zero amounts
      if (item.amount <= 0) {
        console.log(`sync-overhead: Skipping ${item.name} (amount: ${item.amount})`);
        continue;
      }

      // Check if this QB account already exists
      const { data: existing } = await supabase
        .from('overhead_line_items')
        .select('id, annual_amount')
        .eq('qb_account_id', item.accountId)
        .eq('source', 'qb_sync')
        .single();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('overhead_line_items')
          .update({
            category: item.category,
            vendor: item.name,
            annual_amount: item.amount,
            qb_account_name: item.name,
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) {
          console.error(`sync-overhead: Failed to update ${item.name}:`, error.message);
        } else {
          updated++;
          syncedItems.push({ name: item.name, category: item.category, amount: item.amount, action: 'updated' });
        }
      } else {
        // Insert new
        const { error } = await supabase
          .from('overhead_line_items')
          .insert({
            category: item.category,
            vendor: item.name,
            annual_amount: item.amount,
            frequency: 'annual',
            notes: `QB P&L ${targetYear} sync`,
            source: 'qb_sync',
            qb_account_name: item.name,
            qb_account_id: item.accountId,
            last_synced_at: new Date().toISOString(),
            is_active: true,
          });

        if (error) {
          console.error(`sync-overhead: Failed to insert ${item.name}:`, error.message);
        } else {
          created++;
          syncedItems.push({ name: item.name, category: item.category, amount: item.amount, action: 'created' });
        }
      }
    }

    // Compute totals from all active items
    const { data: allItems } = await supabase
      .from('overhead_line_items')
      .select('annual_amount')
      .eq('is_active', true);

    const totalAnnual = (allItems || []).reduce((s: number, i: any) => s + Number(i.annual_amount), 0);
    const weeklyAmount = totalAnnual / 52;

    console.log(`sync-overhead: Done. Created ${created}, updated ${updated}. Total annual: $${totalAnnual.toFixed(2)}, weekly: $${weeklyAmount.toFixed(2)}`);

    return new Response(
      JSON.stringify({
        success: true,
        year: targetYear,
        created,
        updated,
        total_annual: totalAnnual,
        weekly_amount: weeklyAmount,
        items: syncedItems,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('sync-overhead error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
