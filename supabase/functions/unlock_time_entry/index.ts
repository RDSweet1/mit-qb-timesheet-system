/**
 * Unlock Time Entry Edge Function
 *
 * Allows a user to unlock a time entry for editing.
 * Validates permissions and approval status before unlocking.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UnlockRequest {
  entry_id: number;
  user_email: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🔓 Unlock Time Entry: Starting...');

    // Parse request
    const { entry_id, user_email }: UnlockRequest = await req.json();

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
      .select('id, is_locked, approval_status, unlocked_by, employee_name')
      .eq('id', entry_id)
      .single();

    if (fetchError || !entry) {
      throw new Error(`Entry not found: ${entry_id}`);
    }

    console.log(`📊 Current state: locked=${entry.is_locked}, status=${entry.approval_status}`);

    // 2. Validation checks
    if (!entry.is_locked) {
      return new Response(
        JSON.stringify({
          success: false,
          message: `Entry is already unlocked by ${entry.unlocked_by}`,
          entry
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    // 3. Check if entry is invoiced (cannot unlock)
    if (entry.approval_status === 'invoiced') {
      throw new Error('Cannot unlock invoiced entries. Contact administrator if changes are needed.');
    }

    // 4. Check user permissions
    const { data: user, error: userError } = await supabaseClient
      .from('app_users')
      .select('email, can_edit_time, is_admin')
      .eq('email', user_email)
      .single();

    if (userError || !user) {
      throw new Error(`User not found: ${user_email}`);
    }

    if (!user.can_edit_time && !user.is_admin) {
      throw new Error('User does not have permission to edit time entries');
    }

    console.log(`✅ User has permission: can_edit_time=${user.can_edit_time}, is_admin=${user.is_admin}`);

    // 5. Unlock the entry
    const { data: updatedEntry, error: updateError } = await supabaseClient
      .from('time_entries')
      .update({
        is_locked: false,
        unlocked_by: user_email,
        unlocked_at: new Date().toISOString()
      })
      .eq('id', entry_id)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to unlock entry: ${updateError.message}`);
    }

    console.log(`🔓 Entry ${entry_id} unlocked successfully by ${user_email}`);

    // 6. Log the action in audit log (if table exists)
    try {
      await supabaseClient
        .from('time_entry_audit_log')
        .insert({
          entry_id: entry_id,
          action: 'unlock',
          user_email: user_email,
          changes: {
            old: { is_locked: true, unlocked_by: null, unlocked_at: null },
            new: { is_locked: false, unlocked_by: user_email, unlocked_at: updatedEntry.unlocked_at }
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
        message: `Entry unlocked successfully. You can now edit this time entry.`,
        entry: updatedEntry,
        warning: entry.approval_status === 'approved'
          ? 'This entry was approved. Editing will reset approval status to pending.'
          : null
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error: any) {
    console.error('❌ Unlock failed:', error);

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
