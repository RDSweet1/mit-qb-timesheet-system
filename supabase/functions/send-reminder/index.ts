/**
 * Send Weekly Time Summary Reports
 * Sends "DO NOT PAY" preview emails to customers via Microsoft Outlook
 * Shows time worked with estimated billing (not an invoice)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail, getDefaultEmailSender } from '../_shared/outlook-email.ts';

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
      clientSecret: Deno.env.get('AZURE_CLIENT_SECRET') ?? ''
    };

    // Get date range (last week by default)
    const today = new Date();
    const lastMonday = new Date(today);
    lastMonday.setDate(today.getDate() - ((today.getDay() + 6) % 7 + 7));
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);

    const startDate = lastMonday.toISOString().split('T')[0];
    const endDate = lastSunday.toISOString().split('T')[0];

    console.log(`Sending weekly reports for ${startDate} to ${endDate}`);

    // First, sync latest time from QB
    const syncResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/qb-time-sync`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ startDate, endDate })
    });

    if (!syncResponse.ok) {
      throw new Error('Failed to sync time entries before sending reports');
    }

    // Get customers with billable time in this period
    const { data: customers } = await supabaseClient
      .from('customers')
      .select('*')
      .eq('is_active', true);

    if (!customers || customers.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No active customers found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = [];
    const fromEmail = await getDefaultEmailSender(supabaseClient);

    for (const customer of customers) {
      // Get time entries for this customer
      const { data: entries } = await supabaseClient
        .from('time_entries')
        .select(`
          *,
          service_items!inner(unit_price)
        `)
        .eq('qb_customer_id', customer.qb_customer_id)
        .gte('txn_date', startDate)
        .lte('txn_date', endDate)
        .eq('billable_status', 'Billable')
        .order('txn_date', { ascending: true });

      if (!entries || entries.length === 0) {
        continue; // Skip customers with no time
      }

      // Calculate totals
      let totalHours = 0;
      let estimatedAmount = 0;

      entries.forEach(entry => {
        const hours = entry.hours + (entry.minutes / 60);
        totalHours += hours;
        const rate = entry.service_items?.unit_price || 0;
        estimatedAmount += hours * rate;
      });

      // Generate HTML email
      const htmlBody = generateWeeklyReportEmail(
        customer.display_name,
        entries,
        totalHours,
        estimatedAmount,
        startDate,
        endDate
      );

      // Send email
      if (customer.email) {
        const emailResult = await sendEmail(
          {
            from: fromEmail,
            to: [customer.email],
            subject: `Weekly Time Summary - ${startDate} to ${endDate}`,
            htmlBody
          },
          outlookConfig
        );

        // Log email
        await supabaseClient.from('email_log').insert({
          customer_id: customer.id,
          email_type: 'weekly_reminder',
          week_start: startDate,
          week_end: endDate,
          total_hours: totalHours,
          estimated_amount: estimatedAmount,
          resend_id: emailResult.messageId || null
        });

        results.push({
          customer: customer.display_name,
          hours: totalHours,
          amount: estimatedAmount,
          emailSent: emailResult.success
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        reportsSent: results.length,
        results
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error sending weekly reports:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});

/**
 * Generate HTML email with "DO NOT PAY" disclaimer
 */
function generateWeeklyReportEmail(
  customerName: string,
  entries: any[],
  totalHours: number,
  estimatedAmount: number,
  startDate: string,
  endDate: string
): string {
  const rows = entries.map(e => {
    const hours = (e.hours + (e.minutes / 60)).toFixed(2);

    // Show time in/out if available, otherwise "Lump Sum"
    let timeDisplay = 'Lump Sum';
    if (e.start_time && e.end_time) {
      const start = new Date(e.start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const end = new Date(e.end_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      timeDisplay = `${start} - ${end}`;
    }

    return `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${e.txn_date}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${e.employee_name || 'Unknown'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${e.cost_code || 'General'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${timeDisplay}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${hours}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${e.description || '-'}</td>
      </tr>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { background: #0066cc; color: white; padding: 20px; text-align: center; border-radius: 5px; }
        .content { padding: 20px; background: #f9f9f9; margin-top: 20px; border-radius: 5px; }
        .disclaimer { background: #fff3cd; border: 2px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px; font-weight: bold; color: #856404; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; background: white; }
        th { background: #f0f0f0; padding: 10px; text-align: left; font-weight: bold; }
        .total { font-size: 18px; font-weight: bold; margin: 20px 0; padding: 15px; background: #e8f4f8; border-radius: 5px; }
        .footer { font-size: 12px; color: #666; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Weekly Time Summary</h1>
          <p>${startDate} to ${endDate}</p>
        </div>

        <div class="content">
          <p>Dear ${customerName},</p>

          <div class="disclaimer">
            ⚠️ <strong>DO NOT PAY THIS SUMMARY.</strong><br>
            This is for your information only to update you on work-in-progress completed on your project this week.
            Billing will be consolidated at the end of the month, and a billing statement will be sent to you.
          </div>

          <p>Here's a summary of time worked on your project:</p>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>Cost Code</th>
                <th>Time</th>
                <th>Hours</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>

          <div class="total">
            <p>Total Hours: ${totalHours.toFixed(2)}</p>
            ${estimatedAmount > 0 ? `<p>Estimated Amount: $${estimatedAmount.toFixed(2)}</p>` : ''}
          </div>

          <p><em>This is a preview of time tracked this week. Final amounts will appear on your monthly invoice.</em></p>
        </div>

        <div class="footer">
          <p>Questions about this summary? Please reply to this email or contact us at accounting@mitigationconsulting.com</p>
          <p><strong>MIT Consulting</strong> | Mitigation Inspection & Testing</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
