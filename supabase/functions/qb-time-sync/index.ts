/**
 * Sync Time Entries from QuickBooks Time (formerly TSheets)
 *
 * This syncs the actual clock in/out times from QB Time, which is the source
 * of truth for start_time and end_time. QB Online only has duration.
 *
 * API Docs: https://tsheetsteam.github.io/api_docs/
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QBTimeTimesheet {
  id: number;
  user_id: number;
  jobcode_id: number;
  start: string;  // ISO 8601 timestamp
  end: string;    // ISO 8601 timestamp
  duration: number; // seconds
  date: string;   // YYYY-MM-DD
  notes: string;
  customfields?: Record<string, string>;
  on_the_clock: boolean;
}

interface QBTimeUser {
  id: number;
  first_name: string;
  last_name: string;
  username: string;
}

interface QBTimeJobcode {
  id: number;
  name: string;
  short_code?: string;
  parent_id?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🕐 QB Time Sync: Starting timesheet sync...');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // QB Time credentials (separate from QB Online!)
    const qbTimeToken = Deno.env.get('QB_TIME_ACCESS_TOKEN');
    if (!qbTimeToken) {
      throw new Error('❌ QB_TIME_ACCESS_TOKEN not configured');
    }

    console.log('✅ QB Time: Token loaded');

    // Parse request body for date range
    const body = await req.json().catch(() => ({}));
    const { startDate, endDate } = body;

    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

    console.log(`📅 QB Time: Syncing timesheets from ${start} to ${end}`);

    // Fetch timesheets from QB Time
    const url = `https://rest.tsheets.com/api/v1/timesheets?start_date=${start}&end_date=${end}`;
    console.log('🌐 QB Time: Calling API:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${qbTimeToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`QB Time API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    console.log('✅ QB Time: API response received');

    // Extract data
    const timesheets: QBTimeTimesheet[] = Object.values(data.results?.timesheets || {});
    const users: Record<number, QBTimeUser> = data.supplemental_data?.users || {};
    const jobcodes: Record<number, QBTimeJobcode> = data.supplemental_data?.jobcodes || {};

    console.log(`📊 QB Time: Found ${timesheets.length} timesheets`);
    console.log(`👥 QB Time: ${Object.keys(users).length} users, ${Object.keys(jobcodes).length} jobcodes`);

    if (timesheets.length > 0) {
      const sample = timesheets[0];
      const sampleUser = users[sample.user_id];
      console.log(`📝 Sample: ${sampleUser?.first_name} ${sampleUser?.last_name} - ${sample.date} - ${sample.start} to ${sample.end}`);
    }

    // Sync timesheets to database
    let syncedCount = 0;
    let errorCount = 0;

    for (const ts of timesheets) {
      const user = users[ts.user_id];
      const jobcode = jobcodes[ts.jobcode_id];

      const employeeName = user ? `${user.first_name} ${user.last_name}` : `User ${ts.user_id}`;
      const costCode = jobcode?.short_code || jobcode?.name || `Jobcode ${ts.jobcode_id}`;

      console.log(`  ⏰ Processing: ${employeeName} - ${ts.date} (${ts.duration}s)`);

      // Convert duration from seconds to hours + minutes
      const totalMinutes = Math.floor(ts.duration / 60);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;

      // Extract start and end times (just the time portion)
      const startTime = ts.start ? new Date(ts.start).toISOString().split('T')[1].substring(0, 8) : null;
      const endTime = ts.end ? new Date(ts.end).toISOString().split('T')[1].substring(0, 8) : null;

      try {
        const { error } = await supabaseClient
          .from('time_entries')
          .upsert({
            // Use QB Time ID as unique identifier
            qb_time_timesheet_id: ts.id.toString(),

            // Employee info
            employee_name: employeeName,

            // Date and TIME - THIS IS THE KEY DATA FROM QB TIME!
            txn_date: ts.date,
            start_time: startTime,  // ✅ Actual clock-in time!
            end_time: endTime,      // ✅ Actual clock-out time!
            hours: hours,
            minutes: minutes,

            // Job/Cost code
            cost_code: costCode,
            service_item_name: jobcode?.name || null,

            // Notes
            notes: ts.notes || null,

            // Default values (will be updated by QB Online sync if available)
            billable_status: 'Billable',
            approval_status: 'pending',
            is_locked: true,  // Lock by default

            synced_at: new Date().toISOString()
          }, {
            onConflict: 'qb_time_timesheet_id',
            ignoreDuplicates: false
          });

        if (error) {
          errorCount++;
          console.error(`    ❌ Error syncing timesheet ${ts.id}:`, error.message);
        } else {
          syncedCount++;
          console.log(`    ✅ Synced (${startTime} - ${endTime})`);
        }
      } catch (err: any) {
        errorCount++;
        console.error(`    ❌ Exception syncing timesheet ${ts.id}:`, err.message);
      }
    }

    console.log(`✅ QB Time Sync: Complete - Synced: ${syncedCount}, Errors: ${errorCount}`);

    const result = {
      success: true,
      synced: syncedCount,
      errors: errorCount,
      total: timesheets.length,
      users: Object.keys(users).length,
      jobcodes: Object.keys(jobcodes).length,
      dateRange: { start, end }
    };

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error: any) {
    console.error('❌ QB Time Sync: Fatal error:', error);
    console.error('Stack:', error.stack);

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
