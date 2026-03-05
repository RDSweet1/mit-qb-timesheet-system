/**
 * ar-full-sync — Pull ALL open AR invoices from QuickBooks into invoice_log
 *
 * Unlike ar-sync-payments (which only updates invoices already in our log),
 * this function queries QB for every open/unpaid invoice and upserts them all.
 *
 * Use cases:
 *   - Initial import of all existing QB AR
 *   - Catch invoices created directly in QB that we don't know about
 *   - Daily full reconciliation (can replace or supplement ar-sync-payments)
 *
 * Called: manually from AR dashboard or can be scheduled via pg_cron
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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const qbConfig = {
      clientId: Deno.env.get('QB_CLIENT_ID') ?? '',
      clientSecret: Deno.env.get('QB_CLIENT_SECRET') ?? '',
      environment: (Deno.env.get('QB_ENVIRONMENT') ?? 'production') as 'sandbox' | 'production',
    };
    const tokens = {
      accessToken: Deno.env.get('QB_ACCESS_TOKEN') ?? '',
      refreshToken: Deno.env.get('QB_REFRESH_TOKEN') ?? '',
      realmId: Deno.env.get('QB_REALM_ID') ?? '',
    };

    console.log('🔄 AR Full Sync: starting...');

    // Get all open invoices from QB (Balance > 0, not voided)
    // QB pagination: max 1000 per query; use STARTPOSITION for large data sets
    let allQBInvoices: any[] = [];
    let startPos = 1;
    const pageSize = 500;

    while (true) {
      const result = await qbQuery(
        `SELECT Id, DocNumber, CustomerRef, Balance, TotalAmt, TxnDate, DueDate,
                TxnStatus, EmailStatus, BillEmail, CustomerMemo, Line
         FROM Invoice
         WHERE Balance > '0' AND TxnStatus != 'Voided'
         STARTPOSITION ${startPos} MAXRESULTS ${pageSize}`,
        tokens,
        qbConfig
      );

      const page: any[] = result?.QueryResponse?.Invoice || [];
      allQBInvoices = allQBInvoices.concat(page);
      console.log(`  Page at ${startPos}: ${page.length} invoices`);

      if (page.length < pageSize) break;
      startPos += pageSize;
    }

    console.log(`📋 QB returned ${allQBInvoices.length} open invoices`);

    if (allQBInvoices.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No open invoices in QB', synced: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load existing invoice_log rows indexed by qb_invoice_id
    const { data: existing, error: existErr } = await supabase
      .from('invoice_log')
      .select('id, qb_invoice_id, balance_due, amount_paid, ar_status');

    if (existErr) throw existErr;

    const existingMap = new Map((existing || []).map(r => [r.qb_invoice_id, r]));

    // Load customer records for name + email lookup
    const { data: customers } = await supabase
      .from('customers')
      .select('qb_customer_id, display_name, email');

    const customerMap = new Map((customers || []).map(c => [c.qb_customer_id, c]));

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const missingCustomers: string[] = [];

    for (const qbInv of allQBInvoices) {
      const qbId = qbInv.Id;
      const qbCustomerId = qbInv.CustomerRef?.value;
      const balance = parseFloat(qbInv.Balance ?? '0');
      const total = parseFloat(qbInv.TotalAmt ?? '0');
      const amountPaid = parseFloat((total - balance).toFixed(2));

      const customer = customerMap.get(qbCustomerId);
      if (!customer) {
        missingCustomers.push(qbCustomerId);
      }

      const customerName = customer?.display_name || qbInv.CustomerRef?.name || qbCustomerId;
      const txnDate = qbInv.TxnDate; // YYYY-MM-DD
      const qbDueDate = qbInv.DueDate || txnDate;

      let arStatus = 'unpaid';
      if (balance === 0) arStatus = 'paid';
      else if (amountPaid > 0) arStatus = 'partial';

      const existing_row = existingMap.get(qbId);

      if (!existing_row) {
        // New invoice — insert into invoice_log
        // Compute next_action_date (+7 days from due date for Stage 1)
        const dueD = new Date(qbDueDate + 'T12:00:00Z');
        const nextActionDate = new Date(dueD.getTime() + 7 * 86400000).toISOString().split('T')[0];

        const { error: insertErr } = await supabase.from('invoice_log').insert({
          qb_invoice_id: qbId,
          qb_invoice_number: qbInv.DocNumber,
          qb_customer_id: qbCustomerId,
          customer_name: customerName,
          total_amount: total,
          amount_paid: amountPaid,
          balance_due: balance,
          due_date: qbDueDate,
          ar_status: arStatus,
          current_stage: 0,
          next_action_date: arStatus !== 'paid' ? nextActionDate : null,
          billing_hold: false,
          status: 'created',
          created_by: 'ar-full-sync',
        });

        if (insertErr) {
          console.error(`Failed to insert invoice ${qbId}:`, insertErr.message);
          skipped++;
        } else {
          inserted++;
          console.log(`✅ Imported: ${customerName} Invoice ${qbInv.DocNumber} — Balance $${balance}`);
        }
      } else {
        // Existing — update balance/status if changed
        const prevBalance = parseFloat(existing_row.balance_due ?? '0');
        const statusChanged = arStatus !== existing_row.ar_status && arStatus !== 'unpaid';
        const balanceChanged = Math.abs(balance - prevBalance) > 0.01;

        if (balanceChanged || statusChanged) {
          const updates: Record<string, any> = {
            balance_due: balance,
            amount_paid: amountPaid,
          };
          if (statusChanged) updates.ar_status = arStatus;
          if (arStatus === 'paid') {
            updates.billing_hold = false;
            updates.next_action_date = null;
          }
          await supabase.from('invoice_log').update(updates).eq('id', existing_row.id);
          updated++;
        } else {
          skipped++;
        }
      }
    }

    // Also check for invoices in our log that are PAID in QB but we missed
    // (full sync catches these since we query all open ones above — any in our log
    //  that no longer appear in QB with balance > 0 must be paid/voided)
    const qbOpenIds = new Set(allQBInvoices.map((i: any) => i.Id));
    const ourOpenInvoices = (existing || []).filter(r => !['paid', 'void', 'attorney'].includes(r.ar_status));
    const nowPaid = ourOpenInvoices.filter(r => !qbOpenIds.has(r.qb_invoice_id));

    for (const row of nowPaid) {
      await supabase.from('invoice_log').update({
        ar_status: 'paid',
        balance_due: 0,
        billing_hold: false,
        next_action_date: null,
      }).eq('id', row.id);
      updated++;
      console.log(`🎉 Marked PAID (no longer in QB open): ${row.qb_invoice_id}`);
    }

    const summary = {
      qbInvoices: allQBInvoices.length,
      inserted,
      updated,
      skipped,
      missingCustomers: [...new Set(missingCustomers)],
    };
    console.log('✅ AR Full Sync complete:', summary);

    return new Response(JSON.stringify({ success: true, ...summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('❌ AR Full Sync failed:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
