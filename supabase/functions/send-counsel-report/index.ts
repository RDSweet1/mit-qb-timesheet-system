/**
 * Send Counsel Billing Report — emails a clean, professional billing summary
 * to attorneys/counsel recipients selected in the UI.
 *
 * Uses the counselBillingReportEmail() template (inline CSS, Outlook-safe).
 * Sends via Microsoft Graph API (application permissions).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail, getDefaultEmailSender } from '../_shared/outlook-email.ts';
import { counselBillingReportEmail } from '../_shared/email-templates.ts';

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

    const body = await req.json();
    const { to, cc, bcc, subject, reportData, sentBy } = body;

    if (!to || !Array.isArray(to) || to.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'At least one "to" recipient is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (!reportData?.customer?.name || !reportData?.invoices) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing reportData (customer, invoices, timeEntries, summary)' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const outlookConfig = {
      tenantId: Deno.env.get('AZURE_TENANT_ID') ?? '',
      clientId: Deno.env.get('AZURE_CLIENT_ID') ?? '',
      clientSecret: Deno.env.get('AZURE_CLIENT_SECRET') ?? '',
    };

    const fromEmail = await getDefaultEmailSender(supabaseClient);

    // Generate the report date
    const generatedDate = new Date().toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });

    // Render the email HTML
    const htmlBody = counselBillingReportEmail({
      customerName: reportData.customer.name,
      periodStart: reportData.dateRange.start,
      periodEnd: reportData.dateRange.end,
      generatedDate,
      invoices: reportData.invoices,
      timeEntries: reportData.timeEntries || [],
      summary: reportData.summary,
    });

    // Build the email subject
    const emailSubject = subject || `Comprehensive Billing Summary — ${reportData.customer.name}`;

    // Send via Graph API
    const result = await sendEmail(
      {
        from: fromEmail,
        to,
        cc: cc || [],
        bcc: bcc || [],
        subject: emailSubject,
        htmlBody,
      },
      outlookConfig,
    );

    if (!result.success) {
      console.error('Email send failed:', result.error);
      return new Response(
        JSON.stringify({ success: false, error: result.error || 'Email send failed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log(`Counsel billing report sent to ${to.join(', ')} by ${sentBy || 'unknown'}`);

    return new Response(
      JSON.stringify({
        success: true,
        messageId: result.messageId,
        recipientCount: to.length + (cc?.length || 0) + (bcc?.length || 0),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in send-counsel-report:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
