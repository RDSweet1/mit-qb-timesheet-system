/**
 * Send Weekly Time Summary Reports
 * Sends "DO NOT PAY" preview emails to customers via Microsoft Outlook
 * Shows time worked with estimated billing (not an invoice)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail, getDefaultEmailSender } from '../_shared/outlook-email.ts';
import { weeklyReportEmail, type EntryRow } from '../_shared/email-templates.ts';
import { shouldRun } from '../_shared/schedule-gate.ts';
import { createReportPeriodAndToken, generateReportNumber } from '../_shared/report-period-helpers.ts';
import { startMetrics } from '../_shared/metrics.ts';
import { shouldSync } from '../_shared/sync-guard.ts';
import { getAppSetting } from '../_shared/config.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let metrics: Awaited<ReturnType<typeof startMetrics>> | undefined;

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    metrics = await startMetrics('send-reminder', supabaseClient);

    // Schedule gate — skip if paused or outside scheduled window
    let body: any = {};
    try { body = await req.clone().json(); } catch {}
    const outlookConfig = {
      tenantId: Deno.env.get('AZURE_TENANT_ID') ?? '',
      clientId: Deno.env.get('AZURE_CLIENT_ID') ?? '',
      clientSecret: Deno.env.get('AZURE_CLIENT_SECRET') ?? '',
    };

    if (!body.manual) {
      const gate = await shouldRun('send-reminder', supabaseClient, { outlookConfig });
      if (!gate.run) {
        return new Response(JSON.stringify({ skipped: true, reason: gate.reason }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Store gate.complete for later — we'll call it at the end
      (globalThis as any).__gateComplete = gate.complete;
    }

    // Get date range (last week by default)
    const today = new Date();
    const lastMonday = new Date(today);
    lastMonday.setDate(today.getDate() - ((today.getDay() + 6) % 7 + 7));
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);

    const startDate = lastMonday.toISOString().split('T')[0];
    const endDate = lastSunday.toISOString().split('T')[0];

    metrics.setMeta('startDate', startDate);
    metrics.setMeta('endDate', endDate);
    console.log(`Sending weekly reports for ${startDate} to ${endDate}`);

    // Sync guard: skip qb-time-sync if a recent run already covers this date range
    const syncCheck = await shouldSync(supabaseClient, {
      startDate,
      endDate,
    });

    if (syncCheck.shouldSync) {
      console.log(`🔄 Sync guard: syncing — ${syncCheck.reason}`);
      const syncResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/qb-time-sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ startDate, endDate })
      });
      metrics.addApiCall();

      if (!syncResponse.ok) {
        throw new Error('Failed to sync time entries before sending reports');
      }
    } else {
      console.log(`⏭️ Sync guard: skipping qb-time-sync — ${syncCheck.reason}`);
    }

    // Read gentle language setting
    const gentleSetting = await getAppSetting(supabaseClient, 'gentle_review_language');
    const gentle = gentleSetting === 'true';

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

      const reportNumber = generateReportNumber(startDate);

      // Map entries to template format
      const entryRows: EntryRow[] = entries.map((e: any) => {
        const hours = (e.hours + (e.minutes / 60)).toFixed(2);
        const txnDate = new Date(e.txn_date + 'T00:00:00');
        const dayName = txnDate.toLocaleDateString('en-US', { weekday: 'short' });
        const dateStr = `${dayName} ${txnDate.getMonth() + 1}/${txnDate.getDate()}`;
        // Format clock in/out times (e.g., "8:00 AM")
        const fmtTime = (iso: string | null) => {
          if (!iso) return undefined;
          const d = new Date(iso);
          return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
        };
        return {
          date: dateStr,
          employee: e.employee_name || 'Unknown',
          costCode: e.cost_code || 'General',
          description: e.notes || '-',
          hours,
          startTime: fmtTime(e.start_time),
          endTime: fmtTime(e.end_time),
        };
      });

      // Skip customers without email
      if (!customer.email) continue;

      // Create report_period + review_token (need reviewUrl for email)
      const { reportPeriodId, reviewUrl } = await createReportPeriodAndToken(supabaseClient, {
        customerId: customer.id,
        qbCustomerId: customer.qb_customer_id,
        customerName: customer.display_name,
        weekStart: startDate,
        weekEnd: endDate,
        totalHours,
        entryCount: entries.length,
        reportNumber,
      });

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
        gentle,
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
      if (emailResult.success && reportPeriodId) {
        await supabaseClient.from('report_periods').update({
          email_log_id: emailLogRow?.id || null,
        }).eq('id', reportPeriodId);
      }

      metrics.addEntries(1);
      if (!emailResult.success) metrics.addError();
      metrics.addApiCall(); // Outlook Graph API call

      results.push({
        customer: customer.display_name,
        hours: totalHours,
        amount: estimatedAmount,
        emailSent: emailResult.success
      });
    }

    await metrics.end(results.length === 0 ? 'error' : 'success');

    // Mark schedule gate as successful
    if ((globalThis as any).__gateComplete) {
      await (globalThis as any).__gateComplete('success');
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
    try { await metrics?.end('error'); } catch {}
    if ((globalThis as any).__gateComplete) {
      await (globalThis as any).__gateComplete('error');
    }
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
