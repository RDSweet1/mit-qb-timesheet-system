/**
 * Update QB Time Entry Edge Function
 *
 * Writes back edited notes to QuickBooks Time (TSheets) API.
 * Called after a user saves notes in the app to keep QB Time in sync.
 *
 * TSheets API: PUT /api/v1/timesheets
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UpdateRequest {
  entry_id: number;
  notes: string;
  user_email: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('📤 Update QB Time Entry: Starting...');

    const { entry_id, notes, user_email }: UpdateRequest = await req.json();

    if (!entry_id || notes === undefined || !user_email) {
      throw new Error('Missing required fields: entry_id, notes, user_email');
    }

    console.log(`📋 Entry ID: ${entry_id}, User: ${user_email}`);

    // Get QB Time access token
    const qbTimeToken = Deno.env.get('QB_TIME_ACCESS_TOKEN');
    if (!qbTimeToken) {
      throw new Error('QB_TIME_ACCESS_TOKEN not configured');
    }

    // Create Supabase client to look up the QB Time ID
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the time entry to find its QB Time ID
    const { data: entry, error: fetchError } = await supabaseClient
      .from('time_entries')
      .select('id, qb_time_id, notes, employee_name')
      .eq('id', entry_id)
      .single();

    if (fetchError || !entry) {
      throw new Error(`Entry not found: ${entry_id}`);
    }

    if (!entry.qb_time_id) {
      throw new Error(`Entry ${entry_id} has no QB Time ID — cannot sync back`);
    }

    console.log(`📡 Updating QB Time timesheet ${entry.qb_time_id}...`);

    // Call TSheets API to update the timesheet notes
    const response = await fetch('https://rest.tsheets.com/api/v1/timesheets', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${qbTimeToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [
          {
            id: parseInt(entry.qb_time_id),
            notes: notes,
          }
        ]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`QB Time API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ QB Time API response:', JSON.stringify(result));

    // Check for per-item errors in the response
    const timesheets = result.results?.timesheets || {};
    const tsValues = Object.values(timesheets) as any[];
    if (tsValues.length > 0 && tsValues[0]._status_code && tsValues[0]._status_code !== 200) {
      throw new Error(`QB Time update failed: ${tsValues[0]._status_message || 'Unknown error'}`);
    }

    // Log the sync-back in audit log
    try {
      await supabaseClient
        .from('time_entry_audit_log')
        .insert({
          entry_id: entry_id,
          action: 'qb_sync_back',
          user_email: user_email,
          changes: {
            qb_time_id: entry.qb_time_id,
            notes: notes,
          },
          timestamp: new Date().toISOString(),
        });
      console.log('📝 Audit log created for QB sync-back');
    } catch (auditError: any) {
      console.warn('⚠️ Could not create audit log:', auditError.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Notes synced back to QB Time (timesheet ${entry.qb_time_id})`,
        qb_time_id: entry.qb_time_id,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error: any) {
    console.error('❌ Update QB Time Entry failed:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
