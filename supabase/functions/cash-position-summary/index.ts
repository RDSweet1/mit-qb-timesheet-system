/**
 * Cash Position Summary Edge Function
 *
 * Returns a comprehensive financial snapshot in one call:
 * - Bank + CC account balances (live from QB)
 * - Open bills / A/P (live from QB)
 * - CC expense breakdown by account + category (from daily_review_transactions)
 * - A/R totals (from qb_invoice_balances)
 * - Computed net position: Cash − CC Debt + A/R − A/P
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { loadQBTokens, qbQuery } from '../_shared/qb-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('💰 Cash Position Summary: Starting...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, serviceKey);

    const { tokens, config } = await loadQBTokens();

    // Run all 4 queries in parallel
    const [accountsResult, billsResult, ccExpenseResult, arResult] = await Promise.all([
      // 1. QB account balances (Bank + Credit Card)
      qbQuery(
        "SELECT Id, Name, AccountType, CurrentBalance, Active FROM Account WHERE Active = true MAXRESULTS 100",
        tokens,
        config
      ),

      // 2. Open bills (A/P) from QB
      qbQuery(
        "SELECT Id, VendorRef, TxnDate, DueDate, TotalAmt, Balance FROM Bill WHERE Balance > '0' MAXRESULTS 500",
        tokens,
        config
      ),

      // 3. CC expense breakdown from daily_review_transactions (Purchases only)
      supabase
        .from('daily_review_transactions')
        .select('qb_account_name, category, total_amount')
        .eq('qb_entity_type', 'Purchase'),

      // 4. A/R totals from qb_invoice_balances
      supabase
        .from('qb_invoice_balances')
        .select('balance')
        .gt('balance', 0),
    ]);

    // --- Process account balances ---
    const allAccounts = accountsResult?.QueryResponse?.Account || [];
    const accounts = allAccounts
      .filter((a: any) => a.AccountType === 'Bank' || a.AccountType === 'Credit Card')
      .map((a: any) => ({
        id: a.Id,
        name: a.Name,
        accountType: a.AccountType,
        currentBalance: Number(a.CurrentBalance || 0),
        active: a.Active,
      }))
      .sort((a: any, b: any) => {
        // Bank first, then CC; within type sort by balance desc
        if (a.accountType !== b.accountType) return a.accountType === 'Bank' ? -1 : 1;
        return Math.abs(b.currentBalance) - Math.abs(a.currentBalance);
      });

    console.log(`  Accounts: ${accounts.length} (${accounts.filter((a: any) => a.accountType === 'Bank').length} bank, ${accounts.filter((a: any) => a.accountType === 'Credit Card').length} CC)`);

    // --- Process open bills ---
    const allBills = billsResult?.QueryResponse?.Bill || [];
    const today = new Date();
    const openBills = allBills.map((b: any) => {
      const dueDate = b.DueDate ? new Date(b.DueDate + 'T00:00:00') : null;
      const daysUntilDue = dueDate
        ? Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      return {
        id: b.Id,
        vendorName: b.VendorRef?.name || 'Unknown Vendor',
        txnDate: b.TxnDate,
        dueDate: b.DueDate || null,
        totalAmount: Number(b.TotalAmt || 0),
        balance: Number(b.Balance || 0),
        isOverdue: daysUntilDue !== null && daysUntilDue < 0,
        daysUntilDue,
      };
    }).sort((a: any, b: any) => {
      // Sort by due date ascending (soonest first)
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });

    console.log(`  Open bills: ${openBills.length}`);

    // --- Process CC expense breakdown ---
    const ccTxns = ccExpenseResult.data || [];
    // Group by account + category
    const breakdownMap: Record<string, { totalAmount: number; transactionCount: number }> = {};
    for (const txn of ccTxns) {
      const acct = txn.qb_account_name || 'Unknown Account';
      const cat = txn.category || 'Uncategorized';
      const key = `${acct}|||${cat}`;
      if (!breakdownMap[key]) {
        breakdownMap[key] = { totalAmount: 0, transactionCount: 0 };
      }
      breakdownMap[key].totalAmount += Number(txn.total_amount || 0);
      breakdownMap[key].transactionCount += 1;
    }

    const ccExpenseBreakdown = Object.entries(breakdownMap).map(([key, val]) => {
      const [accountName, category] = key.split('|||');
      return {
        accountName,
        category,
        totalAmount: val.totalAmount,
        transactionCount: val.transactionCount,
      };
    }).sort((a, b) => {
      // Sort by account, then by amount desc
      if (a.accountName !== b.accountName) return a.accountName.localeCompare(b.accountName);
      return b.totalAmount - a.totalAmount;
    });

    console.log(`  CC expense categories: ${ccExpenseBreakdown.length}`);

    // --- Compute totals ---
    const totalCash = accounts
      .filter((a: any) => a.accountType === 'Bank')
      .reduce((s: number, a: any) => s + a.currentBalance, 0);

    const totalCCDebt = accounts
      .filter((a: any) => a.accountType === 'Credit Card')
      .reduce((s: number, a: any) => s + a.currentBalance, 0);

    const arRows = arResult.data || [];
    const totalAR = arRows.reduce((s: number, r: any) => s + Number(r.balance || 0), 0);
    const arCount = arRows.length;

    const totalAP = openBills.reduce((s: number, b: any) => s + b.balance, 0);
    const apCount = openBills.length;

    const netPosition = totalCash - totalCCDebt + totalAR - totalAP;

    const totals = {
      totalCash,
      totalCCDebt,
      totalAR,
      totalAP,
      netPosition,
      arCount,
      apCount,
    };

    console.log(`  Totals: Cash=${totalCash.toFixed(2)}, CC=${totalCCDebt.toFixed(2)}, AR=${totalAR.toFixed(2)}, AP=${totalAP.toFixed(2)}, Net=${netPosition.toFixed(2)}`);
    console.log('💰 Cash Position Summary: Done.');

    return new Response(
      JSON.stringify({
        success: true,
        accounts,
        openBills,
        ccExpenseBreakdown,
        totals,
        fetchedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (err: any) {
    console.error('❌ Cash Position Summary error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message, stack: err.stack }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
