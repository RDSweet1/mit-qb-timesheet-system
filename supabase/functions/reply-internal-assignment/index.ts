/**
 * Reply Internal Assignment
 * Sharon replies from dashboard, sets status back to pending, emails assignee.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail, getDefaultEmailSender } from '../_shared/outlook-email.ts';
import { clarificationFollowUpEmail } from '../_shared/email-templates.ts';

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

    const { assignment_id, admin_email, message } = await req.json();

    if (!assignment_id || !admin_email || !message) {
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

    if (assignment.status === 'cleared' || assignment.status === 'cancelled') {
      return new Response(
        JSON.stringify({ success: false, error: 'Assignment is already ' + assignment.status }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert admin reply message
    await supabaseClient
      .from('internal_messages')
      .insert({
        assignment_id: assignment.id,
        sender_email: admin_email,
        sender_name: adminName,
        sender_role: 'admin',
        message,
      });

    // Set status back to pending (awaiting assignee response)
    await supabaseClient
      .from('internal_assignments')
      .update({ status: 'pending' })
      .eq('id', assignment.id);

    // Fetch time entry for email context
    const { data: timeEntry } = await supabaseClient
      .from('time_entries')
      .select('txn_date, employee_name, qb_customer_id, hours, minutes')
      .eq('id', assignment.time_entry_id)
      .single();

    let customerName = '';
    if (timeEntry) {
      const { data: customer } = await supabaseClient
        .from('customers')
        .select('display_name')
        .eq('qb_customer_id', timeEntry.qb_customer_id)
        .single();
      customerName = customer?.display_name || timeEntry.qb_customer_id;
    }

    // Find the token for this assignment to build the clarify URL
    const { data: tokenRow } = await supabaseClient
      .from('internal_review_tokens')
      .select('token')
      .eq('assignment_id', assignment.id)
      .single();

    const siteUrl = Deno.env.get('SITE_URL') || 'https://rdsweet1.github.io/mit-qb-frontend';
    const clarifyUrl = tokenRow
      ? `${siteUrl}/clarify?token=${tokenRow.token}`
      : siteUrl;

    const entryDate = timeEntry
      ? new Date(timeEntry.txn_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Unknown';
    const entryHours = timeEntry
      ? (timeEntry.hours + timeEntry.minutes / 60).toFixed(2)
      : '0.00';

    const htmlBody = clarificationFollowUpEmail({
      assigneeName: assignment.assigned_to_name,
      adminName,
      message,
      entryDate,
      entryEmployee: timeEntry?.employee_name || 'Unknown',
      entryCustomer: customerName,
      entryHours,
      clarifyUrl,
    });

    const fromEmail = await getDefaultEmailSender(supabaseClient);
    await sendEmail(
      {
        from: fromEmail,
        to: [assignment.assigned_to_email],
        subject: `Follow-Up: Clarification Request — MIT Consulting`,
        htmlBody,
      },
      outlookConfig
    );

    return new Response(
      JSON.stringify({ success: true, message: 'Reply sent' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error replying to assignment:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
