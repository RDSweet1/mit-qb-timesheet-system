/**
 * Report Reconciliation Edge Function
 * Runs Monday at 9:30 AM (after weekly reports at 9:00 AM)
 *
 * 1. Detects missed reports (customers with billable time but no 'sent' report_periods row)
 * 2. Detects late entries (time entries synced after the report was sent) for past 4 weeks
 * 3. Sends reconciliation email to Sharon Kisner
 * 4. Logs results to reconciliation_log
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail, getDefaultEmailSender } from '../_shared/outlook-email.ts';
import { emailWrapper, emailHeader, emailFooter, contentSection, COLORS } from '../_shared/email-templates.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RECIPIENTS = [
  'skisner@mitigationconsulting.com',
  'david@mitigationconsulting.com'
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const outlookConfig = {
      tenantId: Deno.env.get('AZURE_TENANT_ID') ?? '',
      clientId: Deno.env.get('AZURE_CLIENT_ID') ?? '',
      clientSecret: Deno.env.get('AZURE_CLIENT_SECRET') ?? ''
    };

    // Calculate last week's date range
    const today = new Date();
    const lastMonday = new Date(today);
    lastMonday.setDate(today.getDate() - ((today.getDay() + 6) % 7 + 7));
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);

    const weekStart = lastMonday.toISOString().split('T')[0];
    const weekEnd = lastSunday.toISOString().split('T')[0];

    console.log(`Reconciliation for week ${weekStart} to ${weekEnd}`);

    // =========================================================
    // 1. DETECT MISSED REPORTS
    // Find customers with billable time but no 'sent' report_periods row
    // =========================================================

    // Build customer name lookup from customers table
    const { data: allCustomers } = await supabase
      .from('customers')
      .select('qb_customer_id, display_name')
      .eq('is_active', true);

    const customerNameMap: Record<string, string> = {};
    if (allCustomers) {
      for (const c of allCustomers) {
        customerNameMap[c.qb_customer_id] = c.display_name;
      }
    }

    // Get all customers with billable time entries for last week
    const { data: timeByCustomer } = await supabase
      .from('time_entries')
      .select('qb_customer_id, hours, minutes')
      .gte('txn_date', weekStart)
      .lte('txn_date', weekEnd)
      .eq('billable_status', 'Billable');

    // Aggregate by customer
    const customerTimeMap: Record<string, { name: string; hours: number; count: number }> = {};
    if (timeByCustomer) {
      for (const entry of timeByCustomer) {
        const key = entry.qb_customer_id;
        if (!customerTimeMap[key]) {
          customerTimeMap[key] = { name: customerNameMap[key] || key, hours: 0, count: 0 };
        }
        customerTimeMap[key].hours += entry.hours + (entry.minutes / 60);
        customerTimeMap[key].count += 1;
      }
    }

    // Get sent report_periods for last week
    const { data: sentPeriods } = await supabase
      .from('report_periods')
      .select('qb_customer_id, status, total_hours, entry_count')
      .eq('week_start', weekStart)
      .in('status', ['sent', 'supplemental_sent']);

    const sentCustomerIds = new Set((sentPeriods || []).map(p => p.qb_customer_id));

    // Missed = has billable time but no sent report
    const missedReports: Array<{ qb_customer_id: string; name: string; hours: number; count: number }> = [];
    for (const [qbId, data] of Object.entries(customerTimeMap)) {
      if (!sentCustomerIds.has(qbId)) {
        missedReports.push({ qb_customer_id: qbId, name: data.name, hours: data.hours, count: data.count });
      }
    }

    // =========================================================
    // 2. DETECT LATE ENTRIES (past 4 weeks)
    // Time entries where txn_date is in a sent week but synced_at > sent_at
    // =========================================================

    const fourWeeksAgo = new Date(lastMonday);
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 21); // 3 more weeks back
    const fourWeeksStart = fourWeeksAgo.toISOString().split('T')[0];

    // Get all sent report_periods from past 4 weeks
    const { data: recentPeriods } = await supabase
      .from('report_periods')
      .select('*')
      .gte('week_start', fourWeeksStart)
      .eq('status', 'sent')
      .not('sent_at', 'is', null);

    const lateEntriesByCustomer: Array<{
      qb_customer_id: string;
      name: string;
      week_start: string;
      late_count: number;
      late_hours: number;
      entries: Array<{ date: string; employee: string; hours: number }>;
    }> = [];

    if (recentPeriods) {
      for (const period of recentPeriods) {
        // Find entries for this week that were synced after the report was sent
        const { data: lateEntries } = await supabase
          .from('time_entries')
          .select('txn_date, employee_name, hours, minutes, synced_at')
          .eq('qb_customer_id', period.qb_customer_id)
          .gte('txn_date', period.week_start)
          .lte('txn_date', period.week_end)
          .eq('billable_status', 'Billable')
          .gt('synced_at', period.sent_at);

        if (lateEntries && lateEntries.length > 0) {
          let totalLateHours = 0;
          const entryDetails = lateEntries.map(e => {
            const h = e.hours + (e.minutes / 60);
            totalLateHours += h;
            return { date: e.txn_date, employee: e.employee_name || 'Unknown', hours: h };
          });

          lateEntriesByCustomer.push({
            qb_customer_id: period.qb_customer_id,
            name: period.customer_name || 'Unknown',
            week_start: period.week_start,
            late_count: lateEntries.length,
            late_hours: totalLateHours,
            entries: entryDetails
          });

          // Update report_periods with late entry counts
          await supabase
            .from('report_periods')
            .update({
              late_entry_count: lateEntries.length,
              late_entry_hours: totalLateHours,
              updated_at: new Date().toISOString()
            })
            .eq('id', period.id);
        }
      }
    }

    // =========================================================
    // 3. DETECT BACK TIME (retroactive entries)
    // Time entries where synced_at is >7 days after the week they belong to
    // These are entries added for past weeks that were never included in any report
    // =========================================================

    // Look at entries synced in the last 7 days that belong to older weeks
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentSyncCutoff = sevenDaysAgo.toISOString();

    const { data: recentlySyncedEntries } = await supabase
      .from('time_entries')
      .select('qb_customer_id, employee_name, txn_date, hours, minutes, synced_at')
      .gt('synced_at', recentSyncCutoff)
      .eq('billable_status', 'Billable')
      .lt('txn_date', weekStart) // entry date is before last week = back time
      .order('txn_date', { ascending: true });

    interface BackTimeWeek {
      week_label: string;
      week_start: string;
      entries: Array<{ date: string; employee: string; customer: string; hours: number; synced_at: string }>;
      total_hours: number;
    }

    const backTimeByWeek: Record<string, BackTimeWeek> = {};

    if (recentlySyncedEntries && recentlySyncedEntries.length > 0) {
      for (const entry of recentlySyncedEntries) {
        // Calculate what week this entry belongs to (Mon-Sun)
        const entryDate = new Date(entry.txn_date + 'T12:00:00');
        const dayOfWeek = entryDate.getDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const entryMonday = new Date(entryDate);
        entryMonday.setDate(entryDate.getDate() + mondayOffset);
        const entrySunday = new Date(entryMonday);
        entrySunday.setDate(entryMonday.getDate() + 6);

        const entryWeekStart = entryMonday.toISOString().split('T')[0];
        const entryWeekEnd = entrySunday.toISOString().split('T')[0];
        const weekKey = entryWeekStart;
        const hrs = entry.hours + (entry.minutes / 60);
        const customerName = customerNameMap[entry.qb_customer_id] || entry.qb_customer_id;

        if (!backTimeByWeek[weekKey]) {
          backTimeByWeek[weekKey] = {
            week_label: `${entryWeekStart} to ${entryWeekEnd}`,
            week_start: entryWeekStart,
            entries: [],
            total_hours: 0
          };
        }
        backTimeByWeek[weekKey].entries.push({
          date: entry.txn_date,
          employee: entry.employee_name || 'Unknown',
          customer: customerName,
          hours: hrs,
          synced_at: entry.synced_at
        });
        backTimeByWeek[weekKey].total_hours += hrs;
      }
    }

    const backTimeWeeks = Object.values(backTimeByWeek).sort((a, b) => a.week_start.localeCompare(b.week_start));

    // =========================================================
    // 4. BUILD STATUS SUMMARY
    // =========================================================

    const totalCustomersWithTime = Object.keys(customerTimeMap).length;
    const reportsSent = sentPeriods?.length || 0;
    const noTimePeriods = await supabase
      .from('report_periods')
      .select('id', { count: 'exact', head: true })
      .eq('week_start', weekStart)
      .eq('status', 'no_time');
    const noTimeCount = noTimePeriods?.count || 0;

    // =========================================================
    // 4. SEND RECONCILIATION EMAIL TO SHARON
    // =========================================================

    const hasIssues = missedReports.length > 0 || lateEntriesByCustomer.length > 0 || backTimeWeeks.length > 0;
    const fromEmail = await getDefaultEmailSender(supabase);

    const htmlBody = generateReconciliationEmail(
      weekStart,
      weekEnd,
      reportsSent,
      missedReports,
      lateEntriesByCustomer,
      backTimeWeeks,
      noTimeCount,
      totalCustomersWithTime
    );

    const subject = hasIssues
      ? `⚠️ Weekly Report Reconciliation - ${weekStart} (Action Required)`
      : `✅ Weekly Report Reconciliation - ${weekStart} (All Clear)`;

    const emailResult = await sendEmail(
      {
        from: fromEmail,
        to: RECIPIENTS,
        subject,
        htmlBody
      },
      outlookConfig
    );

    // =========================================================
    // 6. LOG TO RECONCILIATION_LOG
    // =========================================================

    await supabase.from('reconciliation_log').insert({
      week_analyzed: weekStart,
      total_customers: totalCustomersWithTime,
      reports_sent: reportsSent,
      reports_missed: missedReports.length,
      no_time_customers: noTimeCount,
      late_entry_customers: lateEntriesByCustomer.length,
      missed_reports: missedReports,
      late_entries: lateEntriesByCustomer,
      email_sent_to: RECIPIENTS.join(', '),
      email_sent_at: emailResult.success ? new Date().toISOString() : null,
      status: emailResult.success ? 'completed' : 'failed',
      error_message: emailResult.error || null
    });

    return new Response(
      JSON.stringify({
        success: true,
        week: weekStart,
        reportsSent,
        missedReports: missedReports.length,
        lateEntryCustomers: lateEntriesByCustomer.length,
        emailSent: emailResult.success
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Reconciliation error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

/**
 * Generate HTML reconciliation email
 */
function generateReconciliationEmail(
  weekStart: string,
  weekEnd: string,
  reportsSent: number,
  missedReports: Array<{ name: string; hours: number; count: number }>,
  lateEntries: Array<{ name: string; week_start: string; late_count: number; late_hours: number; entries: Array<{ date: string; employee: string; hours: number }> }>,
  backTimeWeeks: Array<{ week_label: string; week_start: string; entries: Array<{ date: string; employee: string; customer: string; hours: number; synced_at: string }>; total_hours: number }>,
  noTimeCount: number,
  totalCustomersWithTime: number
): string {
  const hasIssues = missedReports.length > 0 || lateEntries.length > 0 || backTimeWeeks.length > 0;

  // Status summary row for each category
  const summaryRows = `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">Reports Sent</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">
        <span style="background: #d4edda; color: #155724; padding: 4px 12px; border-radius: 12px; font-weight: bold;">${reportsSent}</span>
      </td>
    </tr>
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">Missed Reports</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">
        <span style="background: ${missedReports.length > 0 ? '#f8d7da' : '#d4edda'}; color: ${missedReports.length > 0 ? '#721c24' : '#155724'}; padding: 4px 12px; border-radius: 12px; font-weight: bold;">${missedReports.length}</span>
      </td>
    </tr>
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">Customers with Late Entries</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">
        <span style="background: ${lateEntries.length > 0 ? '#fff3cd' : '#d4edda'}; color: ${lateEntries.length > 0 ? '#856404' : '#155724'}; padding: 4px 12px; border-radius: 12px; font-weight: bold;">${lateEntries.length}</span>
      </td>
    </tr>
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">Customers with No Time</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">
        <span style="background: #e2e3e5; color: #383d41; padding: 4px 12px; border-radius: 12px; font-weight: bold;">${noTimeCount}</span>
      </td>
    </tr>
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">Back Time (past weeks with new entries)</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">
        <span style="background: ${backTimeWeeks.length > 0 ? '#e8daef' : '#d4edda'}; color: ${backTimeWeeks.length > 0 ? '#6c3483' : '#155724'}; padding: 4px 12px; border-radius: 12px; font-weight: bold;">${backTimeWeeks.length} week(s)</span>
      </td>
    </tr>
  `;

  // Missed reports section
  let missedSection = '';
  if (missedReports.length > 0) {
    const missedRows = missedReports.map(r => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${r.name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${r.hours.toFixed(2)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${r.count}</td>
      </tr>
    `).join('');

    missedSection = `
      <div style="margin: 20px 0; padding: 15px; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 5px;">
        <h3 style="margin: 0 0 10px 0; color: #721c24;">🚨 Missed Reports</h3>
        <p style="color: #721c24; margin: 0 0 10px 0;">These customers had billable time but no weekly report was sent:</p>
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 5px;">
          <thead>
            <tr style="background: #f0f0f0;">
              <th style="padding: 8px; text-align: left;">Customer</th>
              <th style="padding: 8px; text-align: center;">Hours</th>
              <th style="padding: 8px; text-align: center;">Entries</th>
            </tr>
          </thead>
          <tbody>${missedRows}</tbody>
        </table>
      </div>
    `;
  }

  // Late entries section
  let lateSection = '';
  if (lateEntries.length > 0) {
    const lateRows = lateEntries.map(l => {
      const entryDetails = l.entries.map(e =>
        `${e.date} - ${e.employee} (${e.hours.toFixed(2)}h)`
      ).join('<br>');
      return `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${l.name}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">Week of ${l.week_start}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${l.late_count}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${l.late_hours.toFixed(2)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; font-size: 12px;">${entryDetails}</td>
        </tr>
      `;
    }).join('');

    lateSection = `
      <div style="margin: 20px 0; padding: 15px; background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px;">
        <h3 style="margin: 0 0 10px 0; color: #856404;">⏰ Late Entries Detected</h3>
        <p style="color: #856404; margin: 0 0 10px 0;">These time entries were synced after the weekly report was already sent:</p>
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 5px;">
          <thead>
            <tr style="background: #f0f0f0;">
              <th style="padding: 8px; text-align: left;">Customer</th>
              <th style="padding: 8px; text-align: left;">Report Week</th>
              <th style="padding: 8px; text-align: center;">Late Entries</th>
              <th style="padding: 8px; text-align: center;">Late Hours</th>
              <th style="padding: 8px; text-align: left;">Details</th>
            </tr>
          </thead>
          <tbody>${lateRows}</tbody>
        </table>
      </div>
    `;
  }

  // Back time section
  let backTimeSection = '';
  if (backTimeWeeks.length > 0) {
    const totalBackHours = backTimeWeeks.reduce((sum, w) => sum + w.total_hours, 0);
    const totalBackEntries = backTimeWeeks.reduce((sum, w) => sum + w.entries.length, 0);

    const weekBlocks = backTimeWeeks.map(week => {
      const rows = week.entries.map(e => `
        <tr>
          <td style="padding: 6px 8px; border-bottom: 1px solid #f0f0f0;">${e.date}</td>
          <td style="padding: 6px 8px; border-bottom: 1px solid #f0f0f0;">${e.customer}</td>
          <td style="padding: 6px 8px; border-bottom: 1px solid #f0f0f0;">${e.employee}</td>
          <td style="padding: 6px 8px; border-bottom: 1px solid #f0f0f0; text-align: center;">${e.hours.toFixed(2)}</td>
        </tr>
      `).join('');

      return `
        <div style="margin: 10px 0; border: 1px solid #d5c8e8; border-radius: 5px; overflow: hidden;">
          <div style="background: #e8daef; padding: 8px 12px; font-weight: bold; color: #6c3483;">
            Week of ${week.week_label} — ${week.entries.length} entries, ${week.total_hours.toFixed(2)} hours
          </div>
          <table style="width: 100%; border-collapse: collapse; background: white; font-size: 13px;">
            <thead>
              <tr style="background: #f8f4fc;">
                <th style="padding: 6px 8px; text-align: left;">Date</th>
                <th style="padding: 6px 8px; text-align: left;">Customer</th>
                <th style="padding: 6px 8px; text-align: left;">Employee</th>
                <th style="padding: 6px 8px; text-align: center;">Hours</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    }).join('');

    backTimeSection = `
      <div style="margin: 20px 0; padding: 15px; background: #f5eef8; border: 1px solid #d5c8e8; border-radius: 5px;">
        <h3 style="margin: 0 0 5px 0; color: #6c3483;">🕐 Back Time Added to Past Weeks</h3>
        <p style="color: #6c3483; margin: 0 0 15px 0;">
          ${totalBackEntries} time entries (${totalBackHours.toFixed(2)} hours) were recently synced for past weeks that may not have been included in the original reports.
          These weeks may need supplemental reports sent to the affected customers.
        </p>
        ${weekBlocks}
      </div>
    `;
  }

  // Action items
  let actionItems = '';
  if (hasIssues) {
    const items: string[] = [];
    if (missedReports.length > 0) {
      items.push(`<li>Send supplemental reports to ${missedReports.length} customer(s) with missed reports</li>`);
      items.push('<li>Investigate why the weekly report was not sent (check send-reminder logs)</li>');
    }
    if (lateEntries.length > 0) {
      items.push(`<li>Review ${lateEntries.length} customer(s) with late time entries — consider sending updated reports</li>`);
      items.push('<li>Remind technicians to submit time before Monday 9 AM cutoff</li>');
    }
    if (backTimeWeeks.length > 0) {
      const affectedWeeks = backTimeWeeks.map(w => w.week_label).join('; ');
      items.push(`<li>Review back time for ${backTimeWeeks.length} past week(s) and send supplemental reports as needed: ${affectedWeeks}</li>`);
    }
    actionItems = `
      <div style="margin: 20px 0; padding: 15px; background: #e8f4f8; border: 1px solid #bee5eb; border-radius: 5px;">
        <h3 style="margin: 0 0 10px 0; color: #0c5460;">📋 Action Items</h3>
        <ul style="color: #0c5460; margin: 0; padding-left: 20px;">${items.join('')}</ul>
      </div>
    `;
  }

  const header = emailHeader({
    color: hasIssues ? COLORS.red : COLORS.green,
    title: `${hasIssues ? '&#9888;' : '&#10004;'} Weekly Report Reconciliation`,
    subtitle: 'Internal &mdash; Not for client distribution',
    periodStart: weekStart,
    periodEnd: weekEnd,
  });

  const body = contentSection(`
    <p style="margin: 0 0 12px;">Hi Sharon &amp; David,</p>
    <p style="margin: 0 0 16px;">Here's the weekly report reconciliation summary${hasIssues ? ' &mdash; <strong>action may be required</strong>' : ' &mdash; all reports sent successfully'}.</p>

    <h3 style="margin: 0 0 12px; color: ${COLORS.textDark}; font-size: 15px;">Summary</h3>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${COLORS.white}; border-radius: 5px; border-collapse: collapse;">
      <tbody>${summaryRows}</tbody>
    </table>

    ${missedSection}
    ${lateSection}
    ${backTimeSection}
    ${actionItems}

    ${!hasIssues ? '<div style="margin: 20px 0; padding: 15px; background: #d4edda; border: 1px solid #c3e6cb; border-radius: 5px; text-align: center;"><p style="color: #155724; margin: 0; font-weight: bold;">All weekly reports were sent on time with no late entries detected. No action needed.</p></div>' : ''}
  `);

  const footer = emailFooter({ internal: true });

  return emailWrapper(`${header}${body}${footer}`);
}
