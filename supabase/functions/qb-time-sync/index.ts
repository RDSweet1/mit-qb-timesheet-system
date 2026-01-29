/**
 * Sync Time Entries from QuickBooks
 * Fetches TimeActivity records with:
 * - Separate Description and Notes fields
 * - Clock in/out OR lump sum support
 * - Cost code references for rate lookup
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

    // Parse request body for date range
    const body = await req.json().catch(() => ({}));
    const { startDate, endDate, customerId, billableOnly = true } = body;

    // Default to last 7 days if not specified
    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

    console.log(`Syncing time entries from ${start} to ${end}`);

    // Build query
    let query = `SELECT * FROM TimeActivity WHERE TxnDate >= '${start}' AND TxnDate <= '${end}'`;
    if (customerId) {
      query += ` AND CustomerRef = '${customerId}'`;
    }
    if (billableOnly) {
      query += ` AND BillableStatus = 'Billable'`;
    }

    const qbData = await qbQuery(query, tokens, qbConfig);
    const timeActivities = qbData.QueryResponse?.TimeActivity || [];

    console.log(`Found ${timeActivities.length} time entries`);

    // Sync customers first (create if not exists)
    const customerIds = new Set(timeActivities.map(ta => ta.CustomerRef?.value).filter(Boolean));
    for (const custId of customerIds) {
      const ta = timeActivities.find(t => t.CustomerRef?.value === custId);
      if (ta?.CustomerRef) {
        await supabaseClient
          .from('customers')
          .upsert({
            qb_customer_id: custId,
            display_name: ta.CustomerRef.name || 'Unknown',
            is_active: true,
            synced_at: new Date().toISOString()
          }, {
            onConflict: 'qb_customer_id'
          });
      }
    }

    // Sync time entries
    let syncedCount = 0;
    for (const ta of timeActivities) {
      // Resolve cost code from service item
      let costCode = null;
      if (ta.ItemRef?.value) {
        const { data: serviceItem } = await supabaseClient
          .from('service_items')
          .select('code')
          .eq('qb_item_id', ta.ItemRef.value)
          .single();
        costCode = serviceItem?.code || ta.ItemRef.name;
      }

      const { error } = await supabaseClient
        .from('time_entries')
        .upsert({
          qb_time_id: ta.Id,
          qb_sync_token: ta.SyncToken,

          // References
          qb_customer_id: ta.CustomerRef?.value,
          qb_employee_id: ta.EmployeeRef?.value,
          employee_name: ta.EmployeeRef?.name || ta.NameOf,

          // Date and time
          txn_date: ta.TxnDate,
          start_time: ta.StartTime || null, // NULL for lump sum
          end_time: ta.EndTime || null,     // NULL for lump sum
          hours: ta.Hours || 0,
          minutes: ta.Minutes || 0,

          // Cost code / Service item
          qb_item_id: ta.ItemRef?.value || null,
          cost_code: costCode,
          service_item_name: ta.ItemRef?.name || null,

          // Work details - SEPARATE FIELDS per user requirement
          description: ta.Description || null,  // What: PM, estimator, consultant, etc.
          notes: ta.Notes || null,              // Additional details

          // Billing
          billable_status: ta.BillableStatus,

          synced_at: new Date().toISOString()
        }, {
          onConflict: 'qb_time_id'
        });

      if (error) {
        console.error(`Error syncing time entry ${ta.Id}:`, error);
      } else {
        syncedCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced: syncedCount,
        total: timeActivities.length,
        dateRange: { start, end }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error syncing time entries:', error);
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
