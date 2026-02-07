/**
 * Manage Users Edge Function
 *
 * Admin-only function to list, create, update, and delete app users.
 * Verifies calling user has admin privileges before any action.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ManageRequest {
  action: 'list' | 'create' | 'update' | 'delete';
  admin_email: string;
  user_data?: {
    id?: string;
    email?: string;
    display_name?: string;
    entra_id?: string;
    can_view?: boolean;
    can_send_reminders?: boolean;
    can_create_invoices?: boolean;
    is_admin?: boolean;
    can_edit_time?: boolean;
    can_manage_users?: boolean;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('👥 Manage Users: Starting...');

    const { action, admin_email, user_data }: ManageRequest = await req.json();

    if (!action || !admin_email) {
      throw new Error('Missing required fields: action and admin_email');
    }

    console.log(`📋 Action: ${action}, Admin: ${admin_email}`);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify admin privileges
    const { data: admin, error: adminError } = await supabaseClient
      .from('app_users')
      .select('email, is_admin, can_manage_users')
      .eq('email', admin_email)
      .single();

    if (adminError || !admin) {
      throw new Error(`Admin user not found: ${admin_email}`);
    }

    if (!admin.is_admin && !admin.can_manage_users) {
      throw new Error('Insufficient permissions: admin or user management access required');
    }

    console.log(`✅ Admin verified: ${admin_email}`);

    switch (action) {
      case 'list': {
        const { data: users, error } = await supabaseClient
          .from('app_users')
          .select('*')
          .order('created_at', { ascending: true });

        if (error) throw new Error(`Failed to list users: ${error.message}`);

        return new Response(
          JSON.stringify({ success: true, users }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      case 'create': {
        if (!user_data?.email || !user_data?.display_name) {
          throw new Error('Missing required fields: email and display_name');
        }

        const { data: newUser, error } = await supabaseClient
          .from('app_users')
          .insert({
            entra_id: user_data.entra_id || `pending-entra-id-${user_data.email.split('@')[0]}`,
            email: user_data.email,
            display_name: user_data.display_name,
            can_view: user_data.can_view ?? true,
            can_send_reminders: user_data.can_send_reminders ?? false,
            can_create_invoices: user_data.can_create_invoices ?? false,
            is_admin: user_data.is_admin ?? false,
            can_edit_time: user_data.can_edit_time ?? false,
            can_manage_users: user_data.can_manage_users ?? false,
          })
          .select()
          .single();

        if (error) throw new Error(`Failed to create user: ${error.message}`);

        console.log(`✅ User created: ${newUser.email}`);

        return new Response(
          JSON.stringify({ success: true, user: newUser }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      case 'update': {
        if (!user_data?.id) {
          throw new Error('Missing required field: id');
        }

        const updateFields: Record<string, any> = {};
        if (user_data.display_name !== undefined) updateFields.display_name = user_data.display_name;
        if (user_data.can_view !== undefined) updateFields.can_view = user_data.can_view;
        if (user_data.can_send_reminders !== undefined) updateFields.can_send_reminders = user_data.can_send_reminders;
        if (user_data.can_create_invoices !== undefined) updateFields.can_create_invoices = user_data.can_create_invoices;
        if (user_data.is_admin !== undefined) updateFields.is_admin = user_data.is_admin;
        if (user_data.can_edit_time !== undefined) updateFields.can_edit_time = user_data.can_edit_time;
        if (user_data.can_manage_users !== undefined) updateFields.can_manage_users = user_data.can_manage_users;

        const { data: updatedUser, error } = await supabaseClient
          .from('app_users')
          .update(updateFields)
          .eq('id', user_data.id)
          .select()
          .single();

        if (error) throw new Error(`Failed to update user: ${error.message}`);

        console.log(`✅ User updated: ${updatedUser.email}`);

        return new Response(
          JSON.stringify({ success: true, user: updatedUser }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      case 'delete': {
        if (!user_data?.id) {
          throw new Error('Missing required field: id');
        }

        // Prevent self-deletion
        const { data: targetUser } = await supabaseClient
          .from('app_users')
          .select('email')
          .eq('id', user_data.id)
          .single();

        if (targetUser?.email === admin_email) {
          throw new Error('Cannot delete your own account');
        }

        const { error } = await supabaseClient
          .from('app_users')
          .delete()
          .eq('id', user_data.id);

        if (error) throw new Error(`Failed to delete user: ${error.message}`);

        console.log(`✅ User deleted: ${user_data.id}`);

        return new Response(
          JSON.stringify({ success: true, deleted: user_data.id }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error: any) {
    console.error('❌ Manage Users failed:', error);

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
