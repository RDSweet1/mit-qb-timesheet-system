/**
 * Email Time Report Edge Function
 *
 * Sends time entry reports via email using Microsoft Graph API (Outlook).
 * Called from the UI when Sharon manually sends reports per-customer.
 * Creates report_period + review_token and includes review portal link.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { weeklyReportEmail, type EntryRow } from '../_shared/email-templates.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PORTAL_BASE_URL = 'https://rdsweet1.github.io/mit-qb-frontend/review';

interface ReportEntry {
  date: string;
  employee: string;
  customer: string;
  costCode: string;
  hours: string;
  billable: string;
  description: string | null;
  id?: number; // Time entry ID for tracking
}

interface ReportRequest {
  report: {
    startDate: string;
    endDate: string;
    entries: ReportEntry[];
    summary: {
      totalEntries: number;
      totalHours: string;
    };
  };
  recipient: string;
  cc?: string[]; // CC recipients (e.g., Sharon + David in production mode)
  entryIds?: number[]; // IDs of time entries being sent
  customerId?: string; // Customer ID for tracking
  sentBy?: string; // User who approved/sent
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('📧 Email Report: Starting...');

    const { report, recipient, cc, entryIds, customerId, sentBy }: ReportRequest = await req.json();

    if (!report || !recipient) {
      throw new Error('Missing required fields: report and recipient');
    }

    console.log(`📊 Report: ${report.entries.length} entries, Recipient: ${recipient}`);

    // Get Azure credentials from environment
    const tenantId = Deno.env.get('AZURE_TENANT_ID');
    const clientId = Deno.env.get('AZURE_CLIENT_ID');
    const clientSecret = Deno.env.get('AZURE_CLIENT_SECRET');
    const fromEmail = Deno.env.get('FROM_EMAIL') || 'accounting@mitigationconsulting.com';

    if (!tenantId || !clientId || !clientSecret) {
      throw new Error('Azure credentials not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Get access token from Microsoft
    console.log('🔑 Getting Azure access token...');

    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        }),
      }
    );

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      throw new Error(`Failed to get access token: ${error}`);
    }

    const { access_token } = await tokenResponse.json();
    console.log('✅ Access token obtained');

    // 2. Build HTML email
    const customerName = report.entries.length > 0 ? report.entries[0].customer : 'Customer';
    const totalHours = parseFloat(report.summary.totalHours);
    const uniqueDays = new Set(report.entries.map(e => e.date)).size;

    // Format dates for display
    const fmtStart = new Date(report.startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const fmtEnd = new Date(report.endDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const fmtGenerated = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // Generate report number
    const weekNum = Math.ceil((new Date(report.startDate + 'T00:00:00').getTime() - new Date(new Date(report.startDate).getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
    const reportNumber = `WR-${new Date(report.startDate).getFullYear()}-${String(weekNum).padStart(2, '0')}`;

    // 3. Create report_period + review_token BEFORE building email
    let reviewUrl: string | undefined;

    if (customerId) {
      // Look up customer record
      const { data: customer } = await supabase
        .from('customers')
        .select('id, qb_customer_id, display_name')
        .eq('qb_customer_id', customerId)
        .single();

      if (customer) {
        const { data: rpRow } = await supabase.from('report_periods').upsert({
          customer_id: customer.id,
          qb_customer_id: customer.qb_customer_id,
          customer_name: customer.display_name,
          week_start: report.startDate,
          week_end: report.endDate,
          status: 'sent',
          total_hours: totalHours,
          entry_count: report.summary.totalEntries,
          report_number: reportNumber,
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'qb_customer_id,week_start' }).select('id').single();

        if (rpRow?.id) {
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 7);

          const { data: tokenRow } = await supabase.from('review_tokens').insert({
            report_period_id: rpRow.id,
            expires_at: expiresAt.toISOString(),
          }).select('token').single();

          if (tokenRow?.token) {
            reviewUrl = `${PORTAL_BASE_URL}?token=${tokenRow.token}`;
            console.log(`🔗 Review URL created: ${reviewUrl}`);
          }
        }
      }
    }

    // Map to shared template entry format
    const entryRows: EntryRow[] = report.entries.map(e => ({
      date: e.date,
      employee: e.employee,
      costCode: e.costCode || 'General',
      description: e.description || '-',
      hours: e.hours,
    }));

    const emailBody = weeklyReportEmail({
      customerName,
      reportNumber,
      periodStart: fmtStart,
      periodEnd: fmtEnd,
      generatedDate: fmtGenerated,
      entries: entryRows,
      totalHours,
      entryCount: report.summary.totalEntries,
      daysActive: uniqueDays,
      reviewUrl,
    });

    const emailSubject = `Weekly Time & Activity Report — ${customerName} — ${fmtStart} – ${fmtEnd}`;

    // 4. Create and send email via Microsoft Graph API
    console.log('📤 Creating email message...');

    // Step 4a: Create the message in Drafts
    const createResponse = await fetch(
      `https://graph.microsoft.com/v1.0/users/${fromEmail}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject: emailSubject,
          body: {
            contentType: 'HTML',
            content: emailBody,
          },
          toRecipients: [
            {
              emailAddress: {
                address: recipient,
              },
            },
          ],
          ccRecipients: (cc || []).map((email: string) => ({
            emailAddress: { address: email },
          })),
          // Request delivery and read receipts
          isDeliveryReceiptRequested: true,
          isReadReceiptRequested: true,
        }),
      }
    );

    if (!createResponse.ok) {
      const error = await createResponse.text();
      throw new Error(`Failed to create email: ${error}`);
    }

    const createdMessage = await createResponse.json();
    const messageId = createdMessage.id;
    console.log('📧 Message created with ID:', messageId);

    // Step 4b: Send the message
    console.log('📤 Sending email...');
    const sendResponse = await fetch(
      `https://graph.microsoft.com/v1.0/users/${fromEmail}/messages/${messageId}/send`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
        },
      }
    );

    if (!sendResponse.ok) {
      const error = await sendResponse.text();
      throw new Error(`Failed to send email: ${error}`);
    }

    console.log('✅ Email sent successfully');

    // 5. Store email tracking data
    if (entryIds && entryIds.length > 0) {
      try {
        console.log('📝 Storing email tracking data...');

        const { data: trackingData, error: trackingError } = await supabase
          .from('email_tracking')
          .insert({
            time_entry_ids: entryIds,
            customer_id: customerId || 'unknown',
            recipient_email: recipient,
            sent_by: sentBy || fromEmail,
            sent_at: new Date().toISOString(),
            message_id: messageId,
            status: 'sent'
          })
          .select()
          .single();

        if (trackingError) {
          console.error('⚠️ Failed to store tracking data:', trackingError);
        } else {
          console.log('✅ Tracking data stored:', trackingData?.id);

          // Log to audit log
          const auditLogs = entryIds.map(id => ({
            time_entry_id: id,
            email_tracking_id: trackingData?.id,
            action: 'sent',
            performed_by: sentBy || fromEmail,
            performed_at: new Date().toISOString(),
            details: {
              recipient,
              message_id: messageId,
              customer_id: customerId
            }
          }));

          await supabase.from('approval_audit_log').insert(auditLogs);
        }
      } catch (err) {
        console.error('⚠️ Tracking error (non-fatal):', err);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Report emailed to ${recipient}`,
        messageId: messageId,
        reviewUrl: reviewUrl || null,
        tracking: entryIds ? {
          entryCount: entryIds.length,
          tracked: true
        } : { tracked: false }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('❌ Email failed:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
