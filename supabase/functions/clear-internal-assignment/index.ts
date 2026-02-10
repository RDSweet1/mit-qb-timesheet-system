/**
 * Clear Internal Assignment
 * Sharon clears (resolves) an assignment from the dashboard.
 * Optionally applies suggested description to the time entry.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    const { assignment_id, admin_email, final_message, apply_suggested_description } = await req.json();

    if (!assignment_id || !admin_email) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate admin permissions
    const { data: adminUser } = await supabaseClient
      .from('app_users')
      .select('id, is_admin, can_edit_time, display_name')
      .eq('email', admin_email.toLowerCase())
      .single();

    if (!adminUser?.is_admin && !adminUser?.can_edit_time) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminName = adminUser.display_name || admin_email.split('@')[0];

    // Fetch assignment
    const { data: assignment, error: assignErr } = await supabaseClient
      .from('internal_assignments')
      .select('*')
      .eq('id', assignment_id)
      .single();

    if (assignErr || !assignment) {
      return new Response(
        JSON.stringify({ success: false, error: 'Assignment not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date().toISOString();

    // 1. Update assignment status
    await supabaseClient
      .from('internal_assignments')
      .update({
        status: 'cleared',
        cleared_at: now,
        cleared_by: admin_email,
      })
      .eq('id', assignment.id);

    // 2. If apply_suggested_description, update the time entry
    if (apply_suggested_description && assignment.suggested_description) {
      await supabaseClient
        .from('time_entries')
        .update({
          description: assignment.suggested_description,
          manually_edited: true,
          edit_count: supabaseClient.rpc ? undefined : 1, // increment handled below
          updated_at: now,
          updated_by: admin_email,
        })
        .eq('id', assignment.time_entry_id);

      // Increment edit_count via raw SQL update
      await supabaseClient.rpc('increment_edit_count', { entry_id: assignment.time_entry_id }).catch(() => {
        // If RPC doesn't exist, just set manually_edited which is the important flag
        console.log('increment_edit_count RPC not found, skipping');
      });
    }

    // 3. Clear has_active_clarification flag if no other active assignments
    const { data: otherActive } = await supabaseClient
      .from('internal_assignments')
      .select('id')
      .eq('time_entry_id', assignment.time_entry_id)
      .in('status', ['pending', 'responded'])
      .neq('id', assignment.id)
      .limit(1);

    if (!otherActive?.length) {
      await supabaseClient
        .from('time_entries')
        .update({ has_active_clarification: false })
        .eq('id', assignment.time_entry_id);
    }

    // 4. Optional closing message
    if (final_message) {
      await supabaseClient
        .from('internal_messages')
        .insert({
          assignment_id: assignment.id,
          sender_email: admin_email,
          sender_name: adminName,
          sender_role: 'admin',
          message: final_message,
        });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Assignment cleared',
        description_applied: !!(apply_suggested_description && assignment.suggested_description),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error clearing assignment:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
