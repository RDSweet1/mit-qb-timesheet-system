/**
 * ar-sync-payments — Sync QB invoice payment status into invoice_log
 *
 * Polls QB Online for all open invoices, compares to invoice_log,
 * updates ar_status / amount_paid / balance_due, and logs payments.
 *
 * Called: manually from AR page + pg_cron daily at 8 AM
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

    console.log('💰 AR Sync Payments: starting...');

    // 1. Get all invoice_log rows that are not yet fully paid
    const { data: openInvoices, error: fetchError } = await supabase
      .from('invoice_log')
      .select('id, qb_invoice_id, qb_customer_id, customer_name, total_amount, amount_paid, balance_due, ar_status')
      .not('qb_invoice_id', 'is', null)
      .not('ar_status', 'in', '("paid","void","attorney")');

    if (fetchError) throw fetchError;
    if (!openInvoices?.length) {
      return new Response(JSON.stringify({ success: true, message: 'No open invoices to sync', synced: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📋 Checking ${openInvoices.length} open invoices against QB...`);

    // 2. Query QB for invoice status in batches of 50
    const qbIds = openInvoices.map(i => `'${i.qb_invoice_id}'`).join(',');
    const qbResult = await qbQuery(
      `SELECT Id, DocNumber, Balance, TotalAmt, EmailStatus, TxnStatus FROM Invoice WHERE Id IN (${qbIds})`,
      tokens,
      qbConfig
    );

    const qbInvoices: any[] = qbResult?.QueryResponse?.Invoice || [];
    const qbMap = new Map(qbInvoices.map(inv => [inv.Id, inv]));

    let updated = 0;
    let newPayments = 0;

    for (const inv of openInvoices) {
      const qb = qbMap.get(inv.qb_invoice_id);
      if (!qb) continue;

      const qbBalance = parseFloat(qb.Balance ?? '0');
      const qbTotal = parseFloat(qb.TotalAmt ?? inv.total_amount ?? '0');
      const amountPaid = parseFloat((qbTotal - qbBalance).toFixed(2));
      const prevPaid = parseFloat(inv.amount_paid ?? '0');

      // Determine new AR status
      let newStatus = inv.ar_status;
      if (qbBalance === 0 && qbTotal > 0) {
        newStatus = 'paid';
      } else if (amountPaid > 0 && qbBalance > 0) {
        newStatus = 'partial';
      }

      // Only update if something changed
      if (newStatus !== inv.ar_status || Math.abs(amountPaid - prevPaid) > 0.01) {
        const updates: Record<string, any> = {
          amount_paid: amountPaid,
          balance_due: qbBalance,
          ar_status: newStatus,
        };

        // Clear billing hold and reset stage if now paid
        if (newStatus === 'paid') {
          updates.billing_hold = false;
          updates.next_action_date = null;
        }

        await supabase.from('invoice_log').update(updates).eq('id', inv.id);
        updated++;

        // Log a new payment if amount increased
        if (amountPaid > prevPaid + 0.01) {
          const paymentAmount = parseFloat((amountPaid - prevPaid).toFixed(2));
          await supabase.from('ar_payments').insert({
            invoice_log_id: inv.id,
            qb_invoice_id: inv.qb_invoice_id,
            qb_customer_id: inv.qb_customer_id,
            customer_name: inv.customer_name,
            payment_date: new Date().toISOString().split('T')[0],
            amount: paymentAmount,
            method: 'qb_payments',
            source: 'qb_synced',
            notes: `QB sync: balance was $${inv.balance_due ?? qbTotal}, now $${qbBalance}`,
            logged_by: 'system',
          });

          await supabase.from('ar_activity_log').insert({
            invoice_log_id: inv.id,
            qb_invoice_id: inv.qb_invoice_id,
            qb_customer_id: inv.qb_customer_id,
            activity_type: 'payment',
            description: `Payment of $${paymentAmount.toFixed(2)} received via QB (balance: $${qbBalance.toFixed(2)} remaining)`,
            performed_by: 'system',
            metadata: { source: 'qb_sync', amount: paymentAmount, new_balance: qbBalance, new_status: newStatus },
          });
          newPayments++;
          console.log(`✅ Payment logged for ${inv.customer_name}: $${paymentAmount}`);
        }

        if (newStatus === 'paid') {
          console.log(`🎉 Invoice ${inv.qb_invoice_id} (${inv.customer_name}) marked PAID`);
        }
      }
    }

    console.log(`✅ AR Sync complete: ${updated} invoices updated, ${newPayments} new payments logged`);

    return new Response(
      JSON.stringify({ success: true, checked: openInvoices.length, updated, newPayments }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ AR Sync Payments failed:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
