/**
 * Auto Enroll User Edge Function
 *
 * Called after Azure AD login succeeds. Checks if user exists in app_users,
 * creates them with default viewer permissions if not, or updates last_login if they do.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EnrollRequest {
  email: string;
  display_name: string;
  entra_id: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('👤 Auto Enroll User: Starting...');

    const { email, display_name, entra_id }: EnrollRequest = await req.json();

    if (!email) {
      throw new Error('Missing required field: email');
    }

    console.log(`📋 Email: ${email}, Name: ${display_name}`);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Check if user exists
    const { data: existingUser, error: fetchError } = await supabaseClient
      .from('app_users')
      .select('*')
      .eq('email', email)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 = "not found" which is expected for new users
      throw new Error(`Database error: ${fetchError.message}`);
    }

    if (existingUser) {
      // User exists - update last_login and entra_id if still placeholder
      console.log(`✅ Existing user found: ${existingUser.display_name}`);

      const updates: Record<string, any> = {
        last_login: new Date().toISOString(),
      };

      if (existingUser.entra_id?.startsWith('pending-')) {
        updates.entra_id = entra_id;
        updates.display_name = display_name || existingUser.display_name;
      }

      const { data: updatedUser, error: updateError } = await supabaseClient
        .from('app_users')
        .update(updates)
        .eq('id', existingUser.id)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Failed to update user: ${updateError.message}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          user: updatedUser,
          is_new: false,
          permissions: {
            can_view: updatedUser.can_view,
            can_send_reminders: updatedUser.can_send_reminders,
            can_create_invoices: updatedUser.can_create_invoices,
            is_admin: updatedUser.is_admin,
            can_edit_time: updatedUser.can_edit_time,
            can_manage_users: updatedUser.can_manage_users,
          }
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    // New user - insert with default viewer permissions
    console.log(`🆕 Creating new user: ${email}`);

    const { data: newUser, error: insertError } = await supabaseClient
      .from('app_users')
      .insert({
        entra_id: entra_id || `auto-${Date.now()}`,
        email: email,
        display_name: display_name || email.split('@')[0],
        can_view: true,
        can_send_reminders: false,
        can_create_invoices: false,
        is_admin: false,
        can_edit_time: false,
        can_manage_users: false,
        last_login: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to create user: ${insertError.message}`);
    }

    console.log(`✅ New user created: ${newUser.display_name}`);

    return new Response(
      JSON.stringify({
        success: true,
        user: newUser,
        is_new: true,
        permissions: {
          can_view: newUser.can_view,
          can_send_reminders: newUser.can_send_reminders,
          can_create_invoices: newUser.can_create_invoices,
          is_admin: newUser.is_admin,
          can_edit_time: newUser.can_edit_time,
          can_manage_users: newUser.can_manage_users,
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error: any) {
    console.error('❌ Auto Enroll failed:', error);

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
