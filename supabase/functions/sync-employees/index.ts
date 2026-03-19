/**
 * Sync Employees from QuickBooks Online
 * Fetches all active employees with their QB IDs for promotion lookup
 * Pattern: follows sync-service-items exactly
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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { tokens, config } = await loadQBTokens();

    console.log('Syncing employees from QuickBooks Online...');

    const query = `SELECT Id, DisplayName, GivenName, FamilyName, PrimaryEmailAddr, Active FROM Employee`;
    const qbData = await qbQuery(query, tokens, config);
    const employees = qbData.QueryResponse?.Employee || [];

    console.log(`Found ${employees.length} employees`);

    let syncedCount = 0;
    const errors: Array<{ empId: string; error: string }> = [];

    for (const emp of employees) {
      const { error } = await supabaseClient
        .from('employees')
        .upsert({
          qb_employee_id: emp.Id,
          display_name: emp.DisplayName,
          given_name: emp.GivenName || null,
          family_name: emp.FamilyName || null,
          email: emp.PrimaryEmailAddr?.Address || null,
          is_active: emp.Active === true || emp.Active === 'true',
          synced_at: new Date().toISOString()
        }, {
          onConflict: 'qb_employee_id'
        });

      if (error) {
        console.error(`Error syncing employee ${emp.Id}:`, error);
        errors.push({ empId: emp.Id, error: error.message });
      } else {
        syncedCount++;
      }
    }

    console.log(`Successfully synced ${syncedCount}/${employees.length} employees`);

    return new Response(
      JSON.stringify({
        success: syncedCount > 0,
        synced: syncedCount,
        total: employees.length,
        errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
        employees: employees.slice(0, 10).map((e: any) => ({
          id: e.Id,
          name: e.DisplayName,
          email: e.PrimaryEmailAddr?.Address || null,
        }))
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error: any) {
    console.error('Error syncing employees:', error);
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
