/**
 * Send Weekly Time Summary Reports
 * Sends "DO NOT PAY" preview emails to customers via Microsoft Outlook
 * Shows time worked with estimated billing (not an invoice)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail, getDefaultEmailSender } from '../_shared/outlook-email.ts';
import { weeklyReportEmail, type EntryRow } from '../_shared/email-templates.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PORTAL_BASE_URL = 'https://rdsweet1.github.io/mit-qb-frontend/review';

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
        // Record no_time status for this customer/week
        await supabaseClient.from('report_periods').upsert({
          customer_id: customer.id,
          qb_customer_id: customer.qb_customer_id,
          customer_name: customer.display_name,
          week_start: startDate,
          week_end: endDate,
          status: 'no_time',
          total_hours: 0,
          entry_count: 0,
          updated_at: new Date().toISOString()
        }, { onConflict: 'qb_customer_id,week_start' });
        continue;
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

      // Count unique days
      const uniqueDays = new Set(entries.map((e: any) => e.txn_date)).size;

      // Format dates for display
      const fmtStart = new Date(startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const fmtEnd = new Date(endDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const fmtGenerated = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      // Generate report number: WR-YYYY-WW
      const weekNum = Math.ceil((new Date(startDate + 'T00:00:00').getTime() - new Date(new Date(startDate).getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
      const reportNumber = `WR-${new Date(startDate).getFullYear()}-${String(weekNum).padStart(2, '0')}`;

      // Map entries to template format
      const entryRows: EntryRow[] = entries.map((e: any) => {
        const hours = (e.hours + (e.minutes / 60)).toFixed(2);
        const txnDate = new Date(e.txn_date + 'T00:00:00');
        const dayName = txnDate.toLocaleDateString('en-US', { weekday: 'short' });
        const dateStr = `${dayName} ${txnDate.getMonth() + 1}/${txnDate.getDate()}`;
        return {
          date: dateStr,
          employee: e.employee_name || 'Unknown',
          costCode: e.cost_code || 'General',
          description: e.description || '-',
          hours,
        };
      });

      // Skip customers without email
      if (!customer.email) continue;

      // 1. Create report_period FIRST (need ID for review token)
      const { data: rpRow } = await supabaseClient.from('report_periods').upsert({
        customer_id: customer.id,
        qb_customer_id: customer.qb_customer_id,
        customer_name: customer.display_name,
        week_start: startDate,
        week_end: endDate,
        status: 'sent',
        total_hours: totalHours,
        entry_count: entries.length,
        report_number: reportNumber,
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'qb_customer_id,week_start' }).select('id').single();

      // 2. Create review token (need token UUID for email link)
      let reviewUrl: string | undefined;
      if (rpRow?.id) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        const { data: tokenRow } = await supabaseClient.from('review_tokens').insert({
          report_period_id: rpRow.id,
          expires_at: expiresAt.toISOString(),
        }).select('token').single();

        if (tokenRow?.token) {
          reviewUrl = `${PORTAL_BASE_URL}?token=${tokenRow.token}`;
        }
      }

      // 3. Generate HTML email WITH review portal link
      const htmlBody = weeklyReportEmail({
        customerName: customer.display_name,
        reportNumber,
        periodStart: fmtStart,
        periodEnd: fmtEnd,
        generatedDate: fmtGenerated,
        entries: entryRows,
        totalHours,
        entryCount: entries.length,
        daysActive: uniqueDays,
        reviewUrl,
      });

      // 4. Send email
      const emailResult = await sendEmail(
        {
          from: fromEmail,
          to: [customer.email],
          subject: `Weekly Time & Activity Report — ${customer.display_name} — ${fmtStart} – ${fmtEnd}`,
          htmlBody
        },
        outlookConfig
      );

      // 5. Log email
      const { data: emailLogRow } = await supabaseClient.from('email_log').insert({
        customer_id: customer.id,
        email_type: 'weekly_reminder',
        week_start: startDate,
        week_end: endDate,
        total_hours: totalHours,
        estimated_amount: estimatedAmount,
        resend_id: emailResult.messageId || null
      }).select('id').single();

      // 6. Update report_period with email_log_id
      if (emailResult.success && rpRow?.id) {
        await supabaseClient.from('report_periods').update({
          email_log_id: emailLogRow?.id || null,
        }).eq('id', rpRow.id);
      }

      results.push({
        customer: customer.display_name,
        hours: totalHours,
        amount: estimatedAmount,
        emailSent: emailResult.success
      });
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

// Old generateWeeklyReportEmail removed — now uses shared email-templates.ts
