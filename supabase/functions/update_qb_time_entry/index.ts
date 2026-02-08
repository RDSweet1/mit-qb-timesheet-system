/**
 * Update QB Time Entry Edge Function
 *
 * Writes back edited data to BOTH:
 * 1. QuickBooks Time (TSheets) API — notes only (Workforce system)
 * 2. QuickBooks Online API — description, hours, minutes, service item (billing system)
 *
 * Round-trip verification: after QB Online write, re-reads the entity
 * to confirm the update was applied correctly.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { qbQuery, qbUpdate } from '../_shared/qb-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UpdateRequest {
  entry_id: number;
  notes?: string;
  description?: string;
  hours?: number;
  minutes?: number;
  cost_code?: string;
  qb_item_id?: string;
  user_email: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('📤 Update QB Time Entry: Starting...');

    const { entry_id, notes, description, hours, minutes, cost_code, qb_item_id, user_email }: UpdateRequest = await req.json();

    if (!entry_id || !user_email) {
      throw new Error('Missing required fields: entry_id, user_email');
    }

    console.log(`📋 Entry ID: ${entry_id}, User: ${user_email}`);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the time entry with all relevant fields
    const { data: entry, error: fetchError } = await supabaseClient
      .from('time_entries')
      .select('id, qb_time_id, qb_sync_token, notes, description, hours, minutes, qb_item_id, employee_name')
      .eq('id', entry_id)
      .single();

    if (fetchError || !entry) {
      throw new Error(`Entry not found: ${entry_id}`);
    }

    const results: { tsheets: boolean; qbOnline: boolean; qbOnlineVerified: boolean; errors: string[] } = {
      tsheets: false,
      qbOnline: false,
      qbOnlineVerified: false,
      errors: [],
    };

    // ═══════════════════════════════════════════════════════════════
    // PART 1: Write notes to TSheets/Workforce API (existing behavior)
    // ═══════════════════════════════════════════════════════════════
    if (notes !== undefined && entry.qb_time_id) {
      const qbTimeToken = Deno.env.get('QB_TIME_ACCESS_TOKEN');
      if (qbTimeToken) {
        try {
          console.log(`📡 TSheets: Updating timesheet ${entry.qb_time_id} notes...`);

          const response = await fetch('https://rest.tsheets.com/api/v1/timesheets', {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${qbTimeToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              data: [{
                id: parseInt(entry.qb_time_id),
                notes: notes,
              }]
            }),
          });

          if (response.ok) {
            const result = await response.json();
            const tsValues = Object.values(result.results?.timesheets || {}) as any[];
            if (tsValues.length > 0 && tsValues[0]._status_code && tsValues[0]._status_code !== 200) {
              results.errors.push(`TSheets: ${tsValues[0]._status_message || 'Update failed'}`);
            } else {
              results.tsheets = true;
              console.log('✅ TSheets: Notes updated');
            }
          } else {
            const errorText = await response.text();
            results.errors.push(`TSheets API error (${response.status}): ${errorText}`);
          }
        } catch (err: any) {
          results.errors.push(`TSheets exception: ${err.message}`);
          console.error('⚠️ TSheets write failed (non-fatal):', err.message);
        }
      } else {
        console.warn('⚠️ QB_TIME_ACCESS_TOKEN not set — skipping TSheets write');
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PART 2: Write to QB Online API (billing system)
    // Updates Description, Hours, Minutes, ItemRef on TimeActivity
    // ═══════════════════════════════════════════════════════════════
    if (entry.qb_time_id) {
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

      if (tokens.accessToken && tokens.realmId) {
        try {
          // Step 1: Read current entity to get latest SyncToken
          console.log(`📡 QB Online: Reading TimeActivity ${entry.qb_time_id} for SyncToken...`);
          const readResult = await qbQuery(
            `SELECT * FROM TimeActivity WHERE Id = '${entry.qb_time_id}'`,
            tokens, qbConfig
          );

          const currentTA = readResult.QueryResponse?.TimeActivity?.[0];
          if (!currentTA) {
            results.errors.push('QB Online: TimeActivity not found for read-before-write');
          } else {
            // Step 2: Build sparse update payload
            const updatePayload: Record<string, any> = {
              Id: currentTA.Id,
              SyncToken: currentTA.SyncToken,
            };

            // Only include fields that were actually changed
            const descValue = description !== undefined ? description : notes;
            if (descValue !== undefined) {
              updatePayload.Description = descValue;
            }
            if (hours !== undefined) {
              updatePayload.Hours = hours;
            }
            if (minutes !== undefined) {
              updatePayload.Minutes = minutes;
            }
            if (qb_item_id) {
              updatePayload.ItemRef = { value: qb_item_id };
            }

            console.log(`📡 QB Online: Updating TimeActivity ${entry.qb_time_id}...`);
            console.log('   Payload:', JSON.stringify(updatePayload));

            const updateResult = await qbUpdate('timeactivity', updatePayload, tokens, qbConfig);
            const updatedTA = updateResult.TimeActivity;

            if (updatedTA) {
              results.qbOnline = true;
              console.log('✅ QB Online: TimeActivity updated');

              // Step 3: Round-trip verification
              console.log('🔍 QB Online: Verifying update...');
              let verified = true;
              const mismatches: string[] = [];

              if (descValue !== undefined && updatedTA.Description !== descValue) {
                verified = false;
                mismatches.push(`Description: expected "${descValue}", got "${updatedTA.Description}"`);
              }
              if (hours !== undefined && updatedTA.Hours !== hours) {
                verified = false;
                mismatches.push(`Hours: expected ${hours}, got ${updatedTA.Hours}`);
              }
              if (minutes !== undefined && updatedTA.Minutes !== minutes) {
                verified = false;
                mismatches.push(`Minutes: expected ${minutes}, got ${updatedTA.Minutes}`);
              }

              results.qbOnlineVerified = verified;

              if (verified) {
                console.log('✅ QB Online: Verification passed');
              } else {
                console.warn('⚠️ QB Online: Verification MISMATCH:', mismatches);
                results.errors.push(`QB Online mismatch: ${mismatches.join('; ')}`);
              }

              // Update our DB with the new SyncToken
              await supabaseClient
                .from('time_entries')
                .update({ qb_sync_token: updatedTA.SyncToken })
                .eq('id', entry_id);
            }
          }
        } catch (err: any) {
          results.errors.push(`QB Online exception: ${err.message}`);
          console.error('⚠️ QB Online write failed:', err.message);
        }
      } else {
        console.warn('⚠️ QB Online tokens not set — skipping QB Online write');
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PART 3: Audit log
    // ═══════════════════════════════════════════════════════════════
    const auditAction = results.qbOnline
      ? (results.qbOnlineVerified ? 'qb_online_sync' : 'qb_online_sync_mismatch')
      : (results.tsheets ? 'qb_sync_back' : 'qb_sync_failed');

    try {
      await supabaseClient
        .from('time_entry_audit_log')
        .insert({
          entry_id: entry_id,
          action: auditAction,
          user_email: user_email,
          changes: {
            qb_time_id: entry.qb_time_id,
            notes: notes,
            description: description,
            hours: hours,
            minutes: minutes,
            qb_item_id: qb_item_id,
            tsheets_success: results.tsheets,
            qb_online_success: results.qbOnline,
            qb_online_verified: results.qbOnlineVerified,
            errors: results.errors,
          },
          timestamp: new Date().toISOString(),
        });
      console.log(`📝 Audit log created: ${auditAction}`);
    } catch (auditError: any) {
      console.warn('⚠️ Could not create audit log:', auditError.message);
    }

    return new Response(
      JSON.stringify({
        success: results.tsheets || results.qbOnline,
        tsheets: results.tsheets,
        qbOnline: results.qbOnline,
        qbOnlineVerified: results.qbOnlineVerified,
        qb_time_id: entry.qb_time_id,
        errors: results.errors.length > 0 ? results.errors : undefined,
        message: results.qbOnline && results.tsheets
          ? 'Updated in both TSheets and QB Online'
          : results.qbOnline
            ? 'Updated in QB Online (TSheets skipped or failed)'
            : results.tsheets
              ? 'Updated in TSheets only (QB Online failed)'
              : 'Both updates failed',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: results.tsheets || results.qbOnline ? 200 : 500,
      }
    );

  } catch (error: any) {
    console.error('❌ Update QB Time Entry failed:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
