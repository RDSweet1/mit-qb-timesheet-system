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
import { validateDateRange } from '../_shared/date-validation.ts';
import { startMetrics } from '../_shared/metrics.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let metrics: Awaited<ReturnType<typeof startMetrics>> | undefined;

  try {
    console.log('🔄 QB Sync: Starting time entry sync...');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    metrics = await startMetrics('qb-online-sync', supabaseClient);
    console.log('✅ QB Sync: Supabase client created');

    const qbConfig = {
      clientId: Deno.env.get('QB_CLIENT_ID') ?? '',
      clientSecret: Deno.env.get('QB_CLIENT_SECRET') ?? '',
      environment: (Deno.env.get('QB_ENVIRONMENT') ?? 'sandbox') as 'sandbox' | 'production'
    };
    console.log(`✅ QB Sync: Config loaded - Environment: ${qbConfig.environment}`);

    // Validate QB credentials exist
    if (!qbConfig.clientId || !qbConfig.clientSecret) {
      throw new Error('❌ QB credentials missing: QB_CLIENT_ID or QB_CLIENT_SECRET not set');
    }

    const tokens = {
      accessToken: Deno.env.get('QB_ACCESS_TOKEN') ?? '',
      refreshToken: Deno.env.get('QB_REFRESH_TOKEN') ?? '',
      realmId: Deno.env.get('QB_REALM_ID') ?? ''
    };

    // Validate tokens exist
    if (!tokens.accessToken || !tokens.refreshToken || !tokens.realmId) {
      throw new Error('❌ QB tokens missing: QB_ACCESS_TOKEN, QB_REFRESH_TOKEN, or QB_REALM_ID not set');
    }
    console.log(`✅ QB Sync: Tokens loaded - RealmId: ${tokens.realmId}`);

    // Parse request body for date range
    const body = await req.json().catch(() => ({}));
    const { startDate, endDate, customerId, billableOnly = false } = body;
    console.log(`📅 QB Sync: Request params - startDate: ${startDate}, endDate: ${endDate}, customerId: ${customerId}, billableOnly: ${billableOnly}`);

    const dateRange = validateDateRange(startDate, endDate);
    if (!dateRange.valid) {
      return new Response(JSON.stringify({ error: dateRange.error }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }
    const start = dateRange.startDate;
    const end = dateRange.endDate;

    metrics.setMeta('startDate', start);
    metrics.setMeta('endDate', end);
    console.log(`📅 QB Sync: Date range - ${start} to ${end}`);

    // Build base query
    let baseQuery = `SELECT * FROM TimeActivity WHERE TxnDate >= '${start}' AND TxnDate <= '${end}'`;
    if (customerId) {
      baseQuery += ` AND CustomerRef = '${customerId}'`;
    }
    if (billableOnly) {
      baseQuery += ` AND BillableStatus = 'Billable'`;
    }

    // Paginate — QB defaults to 100 results, max 1000 per page
    console.log('🌐 QB Sync: Calling QuickBooks API (paginated)...');
    const timeActivities: any[] = [];
    let startPosition = 1;
    const pageSize = 1000;

    while (true) {
      const query = `${baseQuery} STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`;
      console.log(`🔍 QB Sync: Query - ${query}`);

      const qbData = await qbQuery(query, tokens, qbConfig);
      metrics.addApiCall();
      const page = qbData.QueryResponse?.TimeActivity || [];
      timeActivities.push(...page);

      console.log(`📄 QB Sync: Page at position ${startPosition} returned ${page.length} entries`);

      if (page.length < pageSize) break; // Last page
      startPosition += pageSize;
    }

    console.log(`✅ QB Sync: Found ${timeActivities.length} time entries from QuickBooks`);

    if (timeActivities.length > 0) {
      console.log(`📝 QB Sync: Sample entry - Customer: ${timeActivities[0].CustomerRef?.name}, Employee: ${timeActivities[0].EmployeeRef?.name}, Date: ${timeActivities[0].TxnDate}`);
      console.log('🔍 QB Online: === FULL FIRST ENTRY FOR DIAGNOSIS ===');
      console.log(JSON.stringify(timeActivities[0], null, 2));
      console.log('⏰ QB Online: Time fields check:');
      console.log(`  - StartTime: ${timeActivities[0].StartTime}`);
      console.log(`  - EndTime: ${timeActivities[0].EndTime}`);
      console.log(`  - Hours: ${timeActivities[0].Hours}`);
      console.log(`  - Minutes: ${timeActivities[0].Minutes}`);
      console.log('🔍 QB Online: Checking ALL fields for time-related data...');
      Object.keys(timeActivities[0]).forEach(key => {
        if (key.toLowerCase().includes('time') || key.toLowerCase().includes('clock') || key.toLowerCase().includes('start') || key.toLowerCase().includes('end')) {
          console.log(`  - ${key}: ${JSON.stringify(timeActivities[0][key])}`);
        }
      });
      console.log('=== END DIAGNOSIS ===');
    }

    // Sync customers first (create if not exists)
    const customerIds = new Set(timeActivities.map(ta => ta.CustomerRef?.value).filter(Boolean));
    console.log(`👥 QB Sync: Found ${customerIds.size} unique customers to sync`);

    for (const custId of customerIds) {
      const ta = timeActivities.find(t => t.CustomerRef?.value === custId);
      if (ta?.CustomerRef) {
        console.log(`  💼 Syncing customer: ${ta.CustomerRef.name} (ID: ${custId})`);
        const { error } = await supabaseClient
          .from('customers')
          .upsert({
            qb_customer_id: custId,
            display_name: ta.CustomerRef.name || 'Unknown',
            is_active: true,
            synced_at: new Date().toISOString()
          }, {
            onConflict: 'qb_customer_id'
          });

        if (error) {
          console.error(`  ❌ Error syncing customer ${custId}:`, error.message);
        } else {
          console.log(`  ✅ Customer ${ta.CustomerRef.name} synced`);
        }
      }
    }
    console.log(`✅ QB Sync: Customer sync complete`);

    // Sync time entries
    console.log(`⏰ QB Sync: Starting time entry sync (${timeActivities.length} entries)...`);
    let syncedCount = 0;
    let errorCount = 0;

    for (const ta of timeActivities) {
      const entryInfo = `${ta.EmployeeRef?.name} - ${ta.CustomerRef?.name} - ${ta.TxnDate} (${ta.Hours || 0}h${ta.Minutes || 0}m)`;
      console.log(`  📝 Processing: ${entryInfo}`);

      // Resolve cost code from service item
      let costCode = null;
      if (ta.ItemRef?.value) {
        const { data: serviceItem, error: serviceError } = await supabaseClient
          .from('service_items')
          .select('code')
          .eq('qb_item_id', ta.ItemRef.value)
          .single();

        if (serviceError) {
          console.warn(`    ⚠️  Service item ${ta.ItemRef.value} not found: ${serviceError.message}`);
        }

        costCode = serviceItem?.code || ta.ItemRef.name;
        console.log(`    🔧 Service: ${ta.ItemRef.name}, Cost Code: ${costCode}`);
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
        errorCount++;
        metrics.addError();
        console.error(`    ❌ Error syncing time entry ${ta.Id}:`, error.message, error.details);
      } else {
        syncedCount++;
        metrics.addEntries(1);
        console.log(`    ✅ Synced successfully`);
      }
    }

    console.log(`✅ QB Sync: Time entry sync complete - Synced: ${syncedCount}, Errors: ${errorCount}`);
    await metrics.end(errorCount > 0 && syncedCount === 0 ? 'error' : 'success');

    const result = {
      success: true,
      synced: syncedCount,
      errors: errorCount,
      total: timeActivities.length,
      customers: customerIds.size,
      dateRange: { start, end }
    };

    console.log(`🎉 QB Sync: Complete!`, result);

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('❌ QB Sync: Fatal error:', error);
    console.error('Stack trace:', error.stack);
    try { await metrics?.end('error'); } catch {}

    const errorDetails = {
      success: false,
      error: error.message,
      stack: error.stack,
      name: error.name
    };

    return new Response(
      JSON.stringify(errorDetails),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
