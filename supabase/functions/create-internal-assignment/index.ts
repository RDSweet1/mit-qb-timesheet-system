/**
 * Create Internal Assignment
 * Sharon assigns time entries to field techs for clarification.
 * Creates assignment rows, messages, tokens, sends email.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail, getDefaultEmailSender } from '../_shared/outlook-email.ts';
import { clarificationRequestEmail, ClarificationEntry } from '../_shared/email-templates.ts';

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

    const outlookConfig = {
      tenantId: Deno.env.get('AZURE_TENANT_ID') ?? '',
      clientId: Deno.env.get('AZURE_CLIENT_ID') ?? '',
      clientSecret: Deno.env.get('AZURE_CLIENT_SECRET') ?? '',
    };

    const {
      time_entry_ids,
      assignee_email,
      assignee_name,
      assignee_user_id,
      create_user_if_missing,
      question,
      admin_email,
    } = await req.json();

    // Validate required fields
    if (!time_entry_ids?.length || !assignee_email || !assignee_name || !question || !admin_email) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: time_entry_ids, assignee_email, assignee_name, question, admin_email' }),
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

    // Resolve assignee user_id
    let resolvedUserId = assignee_user_id || null;

    if (!resolvedUserId) {
      // Look up existing user by email
      const { data: existingUser } = await supabaseClient
        .from('app_users')
        .select('id')
        .eq('email', assignee_email.toLowerCase())
        .single();

      if (existingUser) {
        resolvedUserId = existingUser.id;
      } else if (create_user_if_missing) {
        // Create viewer-level user
        const { data: newUser, error: createErr } = await supabaseClient
          .from('app_users')
          .insert({
            email: assignee_email.toLowerCase(),
            display_name: assignee_name,
            can_view: true,
            is_admin: false,
            can_edit_time: false,
            can_manage_users: false,
            can_send_reminders: false,
            can_create_invoices: false,
          })
          .select('id')
          .single();

        if (!createErr && newUser) {
          resolvedUserId = newUser.id;
        }
      }
    }

    // Fetch time entries
    const { data: timeEntries, error: entriesErr } = await supabaseClient
      .from('time_entries')
      .select('id, txn_date, employee_name, qb_customer_id, cost_code, description, hours, minutes')
      .in('id', time_entry_ids);

    if (entriesErr || !timeEntries?.length) {
      return new Response(
        JSON.stringify({ success: false, error: 'No valid time entries found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Look up customer names
    const customerIds = [...new Set(timeEntries.map(e => e.qb_customer_id))];
    const { data: customers } = await supabaseClient
      .from('customers')
      .select('qb_customer_id, display_name')
      .in('qb_customer_id', customerIds);

    const customerMap: Record<string, string> = {};
    (customers || []).forEach(c => { customerMap[c.qb_customer_id] = c.display_name; });

    // Generate batch ID for grouping
    const batchId = crypto.randomUUID();

    // Create assignment + token for each entry
    const assignmentIds: number[] = [];
    let firstTokenUuid: string | null = null;

    for (const entry of timeEntries) {
      // Create assignment
      const { data: assignment, error: assignErr } = await supabaseClient
        .from('internal_assignments')
        .insert({
          time_entry_id: entry.id,
          assigned_by: admin_email,
          assigned_to_user_id: resolvedUserId,
          assigned_to_email: assignee_email,
          assigned_to_name: assignee_name,
          question,
          status: 'pending',
          batch_id: batchId,
        })
        .select('id')
        .single();

      if (assignErr || !assignment) {
        console.error('Error creating assignment:', assignErr);
        continue;
      }

      assignmentIds.push(assignment.id);

      // Create first message (admin asking question)
      await supabaseClient
        .from('internal_messages')
        .insert({
          assignment_id: assignment.id,
          sender_email: admin_email,
          sender_name: adminName,
          sender_role: 'admin',
          message: question,
        });

      // Create review token (30-day expiry)
      const { data: tokenRow } = await supabaseClient
        .from('internal_review_tokens')
        .insert({
          assignment_id: assignment.id,
        })
        .select('token')
        .single();

      if (tokenRow && !firstTokenUuid) {
        firstTokenUuid = tokenRow.token;
      }

      // Flag time entry
      await supabaseClient
        .from('time_entries')
        .update({ has_active_clarification: true })
        .eq('id', entry.id);
    }

    if (!assignmentIds.length || !firstTokenUuid) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create assignments' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build email with all entries
    const siteUrl = Deno.env.get('SITE_URL') || 'https://rdsweet1.github.io/mit-qb-frontend';
    const clarifyUrl = `${siteUrl}/clarify?token=${firstTokenUuid}&batch=${batchId}`;

    const emailEntries: ClarificationEntry[] = timeEntries.map(e => {
      const d = new Date(e.txn_date + 'T00:00:00');
      return {
        date: d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }),
        employee: e.employee_name,
        customer: customerMap[e.qb_customer_id] || e.qb_customer_id,
        costCode: e.cost_code || undefined,
        description: e.description || undefined,
        hours: (e.hours + e.minutes / 60).toFixed(2),
      };
    });

    const htmlBody = clarificationRequestEmail({
      assigneeName: assignee_name,
      adminName,
      question,
      entries: emailEntries,
      clarifyUrl,
    });

    // Send email
    const fromEmail = await getDefaultEmailSender(supabaseClient);
    await sendEmail(
      {
        from: fromEmail,
        to: [assignee_email],
        subject: `Clarification Requested — ${timeEntries.length} Time ${timeEntries.length === 1 ? 'Entry' : 'Entries'} — MIT Consulting`,
        htmlBody,
      },
      outlookConfig
    );

    return new Response(
      JSON.stringify({
        success: true,
        assignments_created: assignmentIds.length,
        batch_id: batchId,
        token: firstTokenUuid,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error creating internal assignment:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
