/**
 * Internal Clarify Response
 * Assignee submits response from /clarify page.
 * Inserts message, updates assignment, sends notification to admin.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail, getDefaultEmailSender } from '../_shared/outlook-email.ts';
import { clarificationResponseEmail } from '../_shared/email-templates.ts';

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

    const { token, message, suggested_description } = await req.json();

    if (!token || !message) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing token or message' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Validate token
    const { data: reviewToken, error: tokenErr } = await supabaseClient
      .from('internal_review_tokens')
      .select('*, internal_assignments(*)')
      .eq('token', token)
      .single();

    if (tokenErr || !reviewToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid token' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check expiry
    if (reviewToken.expires_at && new Date(reviewToken.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token has expired' }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const assignment = reviewToken.internal_assignments;

    // Check assignment status
    if (assignment.status === 'cleared' || assignment.status === 'cancelled') {
      return new Response(
        JSON.stringify({ success: false, error: 'This assignment has been ' + assignment.status }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date().toISOString();

    // 2. Insert message
    await supabaseClient
      .from('internal_messages')
      .insert({
        assignment_id: assignment.id,
        sender_email: assignment.assigned_to_email,
        sender_name: assignment.assigned_to_name,
        sender_role: 'assignee',
        message,
        suggested_description: suggested_description || null,
      });

    // 3. Update assignment
    const updates: Record<string, any> = {
      status: 'responded',
      suggested_description: suggested_description || assignment.suggested_description,
    };
    if (!assignment.responded_at) {
      updates.responded_at = now;
    }

    await supabaseClient
      .from('internal_assignments')
      .update(updates)
      .eq('id', assignment.id);

    // 4. Fetch time entry for email context
    const { data: timeEntry } = await supabaseClient
      .from('time_entries')
      .select('txn_date, employee_name, qb_customer_id, hours, minutes')
      .eq('id', assignment.time_entry_id)
      .single();

    // Look up customer name
    let customerName = '';
    if (timeEntry) {
      const { data: customer } = await supabaseClient
        .from('customers')
        .select('display_name')
        .eq('qb_customer_id', timeEntry.qb_customer_id)
        .single();
      customerName = customer?.display_name || timeEntry.qb_customer_id;
    }

    // 5. Look up admin display name
    const { data: adminUser } = await supabaseClient
      .from('app_users')
      .select('display_name')
      .eq('email', assignment.assigned_by.toLowerCase())
      .single();

    const adminName = adminUser?.display_name || assignment.assigned_by.split('@')[0];

    // 6. Send notification email to admin
    const siteUrl = Deno.env.get('SITE_URL') || 'https://rdsweet1.github.io/mit-qb-frontend';
    const dashboardUrl = `${siteUrl}/internal-review`;

    const entryDate = timeEntry
      ? new Date(timeEntry.txn_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Unknown';
    const entryHours = timeEntry
      ? (timeEntry.hours + timeEntry.minutes / 60).toFixed(2)
      : '0.00';

    const htmlBody = clarificationResponseEmail({
      adminName,
      assigneeName: assignment.assigned_to_name,
      message,
      suggestedDescription: suggested_description || undefined,
      entryDate,
      entryEmployee: timeEntry?.employee_name || 'Unknown',
      entryCustomer: customerName,
      entryHours,
      dashboardUrl,
    });

    const fromEmail = await getDefaultEmailSender(supabaseClient);
    await sendEmail(
      {
        from: fromEmail,
        to: [assignment.assigned_by],
        subject: `Clarification Response from ${assignment.assigned_to_name} — MIT Consulting`,
        htmlBody,
      },
      outlookConfig
    );

    return new Response(
      JSON.stringify({ success: true, message: 'Response submitted successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing clarification response:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
