/**
 * Email Time Report Edge Function
 *
 * Sends time entry reports via email using Microsoft Graph API (Outlook)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { report, recipient, entryIds, customerId, sentBy }: ReportRequest = await req.json();

    if (!report || !recipient) {
      throw new Error('Missing required fields: report and recipient');
    }

    console.log(`📊 Report: ${report.entries.length} entries, Recipient: ${recipient}`);

    // Get Azure credentials from environment
    const tenantId = Deno.env.get('AZURE_TENANT_ID');
    const clientId = Deno.env.get('AZURE_CLIENT_ID');
    const clientSecret = Deno.env.get('AZURE_CLIENT_SECRET');
    const fromEmail = Deno.env.get('FROM_EMAIL') || 'timesheets@nextgenrestoration.com';

    if (!tenantId || !clientId || !clientSecret) {
      throw new Error('Azure credentials not configured');
    }

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

    // 2. Build HTML email content
    const emailBody = buildEmailHTML(report);

    // 3. Create and send email via Microsoft Graph API
    console.log('📤 Creating email message...');

    // Step 3a: Create the message in Drafts
    const createResponse = await fetch(
      `https://graph.microsoft.com/v1.0/users/${fromEmail}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject: `Time Entry Report: ${report.startDate} to ${report.endDate}`,
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

    // Step 3b: Send the message
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

    // 4. Store email tracking data
    if (entryIds && entryIds.length > 0) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (supabaseUrl && supabaseKey) {
          const supabase = createClient(supabaseUrl, supabaseKey);

          console.log('📝 Storing email tracking data...');

          // Insert into email_tracking table
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

/**
 * Build HTML email body for time report
 */
function buildEmailHTML(report: ReportRequest['report']): string {
  const entriesByCustomer = new Map<string, ReportEntry[]>();

  // Group entries by customer
  report.entries.forEach(entry => {
    if (!entriesByCustomer.has(entry.customer)) {
      entriesByCustomer.set(entry.customer, []);
    }
    entriesByCustomer.get(entry.customer)!.push(entry);
  });

  // Build customer sections
  let customerSections = '';
  entriesByCustomer.forEach((entries, customer) => {
    const customerTotal = entries.reduce((sum, e) => sum + parseFloat(e.hours), 0).toFixed(2);

    customerSections += `
      <div style="margin-bottom: 30px;">
        <h3 style="color: #2563eb; margin-bottom: 10px;">${customer}</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Date</th>
              <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Employee</th>
              <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Cost Code</th>
              <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Description</th>
              <th style="padding: 8px; text-align: right; border: 1px solid #e5e7eb;">Hours</th>
              <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Billable</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map(entry => `
              <tr>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${entry.date}</td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${entry.employee}</td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${entry.costCode}</td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${entry.description || ''}</td>
                <td style="padding: 8px; text-align: right; border: 1px solid #e5e7eb;">${entry.hours}</td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">
                  <span style="padding: 2px 8px; border-radius: 4px; background-color: ${entry.billable === 'Billable' ? '#dcfce7' : '#f3f4f6'}; color: ${entry.billable === 'Billable' ? '#166534' : '#374151'};">
                    ${entry.billable}
                  </span>
                </td>
              </tr>
            `).join('')}
            <tr style="background-color: #f9fafb; font-weight: bold;">
              <td colspan="4" style="padding: 8px; border: 1px solid #e5e7eb; text-align: right;">Subtotal:</td>
              <td style="padding: 8px; text-align: right; border: 1px solid #e5e7eb;">${customerTotal} hrs</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb;"></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Time Entry Report</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #2563eb; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h1 style="margin: 0;">Time Entry Report</h1>
        <p style="margin: 10px 0 0 0;">Period: ${report.startDate} to ${report.endDate}</p>
      </div>

      <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="margin: 0 0 10px 0; color: #1f2937;">Summary</h2>
        <p style="margin: 5px 0;"><strong>Total Entries:</strong> ${report.summary.totalEntries}</p>
        <p style="margin: 5px 0;"><strong>Total Hours:</strong> ${report.summary.totalHours} hrs</p>
      </div>

      <h2 style="color: #1f2937; margin-bottom: 15px;">Entries by Customer</h2>

      ${customerSections}

      <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 12px;">
        <p>Generated by MIT QB Timesheet System</p>
        <p>This is an automated email. Please do not reply.</p>
      </div>
    </body>
    </html>
  `;
}
