/**
 * Create Monthly Invoices in QuickBooks
 * Creates detailed invoices with line items and marks time as billed
 * Invoices sent via QuickBooks built-in email system
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { qbCreate, qbUpdate } from '../_shared/qb-auth.ts';
import { buildRateLookups, buildLineItems } from '../_shared/invoice-line-builder.ts';

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

    // Parse request body
    const body = await req.json();
    const { customerId, periodStart, periodEnd, createdBy } = body;

    if (!customerId || !periodStart || !periodEnd) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: customerId, periodStart, periodEnd'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    console.log(`Creating invoice for customer ${customerId} from ${periodStart} to ${periodEnd}`);

    // First, sync latest time from QB
    const syncResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/qb-time-sync`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        startDate: periodStart,
        endDate: periodEnd,
        customerId,
        billableOnly: true
      })
    });

    if (!syncResponse.ok) {
      throw new Error('Failed to sync time entries before invoicing');
    }

    // Get customer
    const { data: customer } = await supabaseClient
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single();

    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }

    // Get unbilled time entries for this period
    const { data: entries } = await supabaseClient
      .from('time_entries')
      .select(`
        *,
        service_items!inner(unit_price, name)
      `)
      .eq('qb_customer_id', customer.qb_customer_id)
      .gte('txn_date', periodStart)
      .lte('txn_date', periodEnd)
      .eq('billable_status', 'Billable')
      .order('txn_date', { ascending: true });

    if (!entries || entries.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No billable time found for this period'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    // Get service items and build line items using shared builder
    const { data: serviceItems } = await supabaseClient
      .from('service_items')
      .select('*');

    const lookups = buildRateLookups(serviceItems || []);

    // Verify all entries have rates
    const missingRates = entries.filter((e: any) => !e.qb_item_id || !lookups.ratesByItemId[e.qb_item_id]);
    if (missingRates.length > 0) {
      console.warn(`Warning: ${missingRates.length} entries missing rate information`);
    }

    const { lineItems, totalHours, totalAmount } = buildLineItems(entries, lookups);

    // Create invoice in QuickBooks
    const invoiceData = {
      CustomerRef: { value: customer.qb_customer_id },
      TxnDate: periodEnd,
      DueDate: periodEnd, // Due upon receipt
      Line: lineItems,
      BillEmail: customer.email ? { Address: customer.email } : undefined,
      CustomerMemo: {
        value: `Professional services for period ${periodStart} to ${periodEnd}`
      }
    };

    console.log('Creating invoice in QuickBooks...');
    const qbResponse = await qbCreate('invoice', invoiceData, tokens, qbConfig);

    if (!qbResponse.Invoice) {
      throw new Error('Failed to create invoice in QuickBooks');
    }

    const invoice = qbResponse.Invoice;

    console.log(`Invoice created: ${invoice.Id}, DocNumber: ${invoice.DocNumber}`);

    // Mark time entries as HasBeenBilled in QB
    console.log('Marking time entries as billed...');
    let billedCount = 0;
    for (const entry of entries) {
      try {
        await qbUpdate(
          'timeactivity',
          {
            Id: entry.qb_time_id,
            SyncToken: entry.qb_sync_token,
            BillableStatus: 'HasBeenBilled'
          },
          tokens,
          qbConfig
        );
        billedCount++;
      } catch (error) {
        console.error(`Failed to mark entry ${entry.qb_time_id} as billed:`, error);
      }
    }

    // Update local cache
    await supabaseClient
      .from('time_entries')
      .update({ billable_status: 'HasBeenBilled' })
      .in('qb_time_id', entries.map(e => e.qb_time_id));

    // Log invoice creation
    await supabaseClient.from('invoice_log').insert({
      customer_id: customerId,
      qb_invoice_id: invoice.Id,
      qb_invoice_number: invoice.DocNumber,
      billing_period_start: periodStart,
      billing_period_end: periodEnd,
      total_hours: totalHours,
      total_amount: totalAmount,
      line_item_count: lineItems.length,
      time_entry_ids: entries.map(e => e.qb_time_id),
      status: 'created',
      created_by: createdBy || 'system'
    });

    return new Response(
      JSON.stringify({
        success: true,
        invoice: {
          id: invoice.Id,
          number: invoice.DocNumber,
          total: totalAmount,
          hours: totalHours,
          lineItems: lineItems.length
        },
        timeEntriesMarkedBilled: billedCount,
        message: 'Invoice created successfully in QuickBooks. You can now send it via the QuickBooks dashboard.'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error creating invoice:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
