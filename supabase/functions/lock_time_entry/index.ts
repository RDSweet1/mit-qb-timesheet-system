/**
 * Lock Time Entry Edge Function
 *
 * Locks a time entry after editing to prevent further modifications.
 * Can be called by the user who unlocked it or by an admin.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LockRequest {
  entry_id: number;
  user_email: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🔒 Lock Time Entry: Starting...');

    // Parse request
    const { entry_id, user_email }: LockRequest = await req.json();

    if (!entry_id || !user_email) {
      throw new Error('Missing required fields: entry_id and user_email');
    }

    console.log(`📋 Entry ID: ${entry_id}, User: ${user_email}`);

    // Create Supabase client with service role key (bypasses RLS)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Check if entry exists and get current state
    const { data: entry, error: fetchError } = await supabaseClient
      .from('time_entries')
      .select('id, is_locked, unlocked_by, approval_status, employee_name')
      .eq('id', entry_id)
      .single();

    if (fetchError || !entry) {
      throw new Error(`Entry not found: ${entry_id}`);
    }

    console.log(`📊 Current state: locked=${entry.is_locked}, unlocked_by=${entry.unlocked_by}`);

    // 2. Check if already locked
    if (entry.is_locked) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Entry is already locked',
          entry
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    // 3. Check user permissions
    const { data: user, error: userError } = await supabaseClient
      .from('app_users')
      .select('email, can_edit_time, is_admin')
      .eq('email', user_email)
      .single();

    if (userError || !user) {
      throw new Error(`User not found: ${user_email}`);
    }

    // 4. Verify user can lock this entry
    const isUnlocker = entry.unlocked_by === user_email;
    const isAdmin = user.is_admin;

    if (!isUnlocker && !isAdmin) {
      throw new Error(`Only the user who unlocked this entry (${entry.unlocked_by}) or an admin can lock it`);
    }

    console.log(`✅ User authorized to lock: is_unlocker=${isUnlocker}, is_admin=${isAdmin}`);

    // 5. Lock the entry
    const { data: updatedEntry, error: updateError } = await supabaseClient
      .from('time_entries')
      .update({
        is_locked: true,
        unlocked_by: null,
        unlocked_at: null
      })
      .eq('id', entry_id)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to lock entry: ${updateError.message}`);
    }

    console.log(`🔒 Entry ${entry_id} locked successfully by ${user_email}`);

    // 6. Log the action in audit log (if table exists)
    try {
      await supabaseClient
        .from('time_entry_audit_log')
        .insert({
          entry_id: entry_id,
          action: 'lock',
          user_email: user_email,
          changes: {
            old: { is_locked: false, unlocked_by: entry.unlocked_by, unlocked_at: entry.unlocked_at },
            new: { is_locked: true, unlocked_by: null, unlocked_at: null }
          },
          timestamp: new Date().toISOString()
        });
      console.log('📝 Audit log created');
    } catch (auditError) {
      // Non-critical error - audit log table might not exist yet
      console.warn('⚠️ Could not create audit log:', auditError.message);
    }

    // 7. Return success
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Entry locked successfully. Changes are now finalized.',
        entry: updatedEntry
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error: any) {
    console.error('❌ Lock failed:', error);

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
