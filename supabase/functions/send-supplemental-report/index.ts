/**
 * Send Supplemental Report
 * Manually triggered from the Reports page when back time or note changes are detected
 * for a week that was already reported to a customer.
 *
 * Shows: what changed (new entries, note edits), updated totals vs original, full updated list.
 *
 * NOTE: Currently manual-only. Could be changed to automatic once we're confident the
 * detection and content are correct. Sharon needs to review/edit notes to explain changes
 * before sending, and note changes should be tracked in the audit log.
 *
 * Input: { qb_customer_id, week_start, week_end }
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
    const { qb_customer_id, week_start, week_end } = await req.json();

    if (!qb_customer_id || !week_start || !week_end) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: qb_customer_id, week_start, week_end' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const outlookConfig = {
      tenantId: Deno.env.get('AZURE_TENANT_ID') ?? '',
      clientId: Deno.env.get('AZURE_CLIENT_ID') ?? '',
      clientSecret: Deno.env.get('AZURE_CLIENT_SECRET') ?? ''
    };

    // Get the original report_period to know when it was sent
    const { data: reportPeriod } = await supabase
      .from('report_periods')
      .select('*')
      .eq('qb_customer_id', qb_customer_id)
      .eq('week_start', week_start)
      .single();

    const originalSentAt = reportPeriod?.sent_at || null;
    const originalHours = reportPeriod?.total_hours || 0;
    const originalEntryCount = reportPeriod?.entry_count || 0;

    // Get customer info
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('qb_customer_id', qb_customer_id)
      .single();

    // Fallback: if customer not found by qb_customer_id (may be display name format)
    let customerName = customer?.display_name || qb_customer_id;
    let customerEmail = customer?.email;

    if (!customer) {
      // Try matching by display_name since some time_entries use display name as qb_customer_id
      const { data: custByName } = await supabase
        .from('customers')
        .select('*')
        .eq('display_name', qb_customer_id)
        .single();
      if (custByName) {
        customerName = custByName.display_name;
        customerEmail = custByName.email;
      }
    }

    if (!customerEmail) {
      return new Response(
        JSON.stringify({ success: false, error: `No email address found for customer: ${customerName}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Get ALL current billable entries for this customer/week
    const { data: allEntries } = await supabase
      .from('time_entries')
      .select(`
        id, txn_date, employee_name, cost_code, start_time, end_time,
        hours, minutes, description, notes, synced_at, manually_edited,
        service_items!inner(unit_price)
      `)
      .eq('qb_customer_id', qb_customer_id)
      .gte('txn_date', week_start)
      .lte('txn_date', week_end)
      .eq('billable_status', 'Billable')
      .order('txn_date', { ascending: true });

    if (!allEntries || allEntries.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No billable entries found for this customer/week' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Classify entries: new (synced after original report) vs existing
    // Also get note changes from audit log
    const entryIds = allEntries.map(e => e.id);

    let noteChanges: Array<{
      entry_id: number;
      old_notes: string;
      new_notes: string;
      changed_by: string;
      changed_at: string;
    }> = [];

    if (originalSentAt) {
      // Get audit log entries for note changes since the report was sent
      const { data: auditRows } = await supabase
        .from('time_entry_audit_log')
        .select('entry_id, changes, user_email, timestamp')
        .in('entry_id', entryIds)
        .gt('timestamp', originalSentAt)
        .eq('action', 'edit')
        .order('timestamp', { ascending: true });

      if (auditRows) {
        for (const audit of auditRows) {
          const oldNotes = audit.changes?.old?.notes || audit.changes?.old?.description;
          const newNotes = audit.changes?.new?.notes || audit.changes?.new?.description;
          if (oldNotes !== undefined && newNotes !== undefined && oldNotes !== newNotes) {
            noteChanges.push({
              entry_id: audit.entry_id,
              old_notes: oldNotes || '(empty)',
              new_notes: newNotes || '(empty)',
              changed_by: audit.user_email || 'Unknown',
              changed_at: audit.timestamp
            });
          }
        }
      }
    }

    // Calculate totals
    let totalHours = 0;
    let estimatedAmount = 0;
    let newEntryCount = 0;
    let newEntryHours = 0;

    const classifiedEntries = allEntries.map(e => {
      const hrs = e.hours + (e.minutes / 60);
      totalHours += hrs;
      const rate = e.service_items?.unit_price || 0;
      estimatedAmount += hrs * rate;

      const isNew = originalSentAt && e.synced_at && new Date(e.synced_at) > new Date(originalSentAt);
      const hasNoteChange = noteChanges.some(nc => nc.entry_id === e.id);

      if (isNew) {
        newEntryCount++;
        newEntryHours += hrs;
      }

      return { ...e, _hours: hrs, _isNew: isNew, _hasNoteChange: hasNoteChange };
    });

    // Generate supplemental email
    const htmlBody = generateSupplementalEmail(
      customerName,
      classifiedEntries,
      noteChanges,
      totalHours,
      estimatedAmount,
      originalHours,
      originalEntryCount,
      newEntryCount,
      newEntryHours,
      week_start,
      week_end,
      originalSentAt
    );

    // Send email
    const fromEmail = await getDefaultEmailSender(supabase);
    const emailResult = await sendEmail(
      {
        from: fromEmail,
        to: [customerEmail],
        cc: ['skisner@mitigationconsulting.com', 'david@mitigationconsulting.com'],
        subject: `Updated Time Summary - ${week_start} to ${week_end}`,
        htmlBody
      },
      outlookConfig
    );

    // Log email
    const { data: emailLogRow } = await supabase.from('email_log').insert({
      customer_id: customer?.id || null,
      email_type: 'supplemental_report',
      week_start,
      week_end,
      total_hours: totalHours,
      estimated_amount: estimatedAmount,
      is_supplemental: true,
      report_period_id: reportPeriod?.id || null,
      resend_id: emailResult.messageId || null
    }).select('id').single();

    // Update report_periods
    if (reportPeriod) {
      await supabase
        .from('report_periods')
        .update({
          status: 'supplemental_sent',
          supplemental_sent_at: new Date().toISOString(),
          total_hours: totalHours,
          entry_count: allEntries.length,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportPeriod.id);
    } else {
      // Create a new report_periods row if one didn't exist
      await supabase.from('report_periods').upsert({
        customer_id: customer?.id?.toString() || qb_customer_id,
        qb_customer_id,
        customer_name: customerName,
        week_start,
        week_end,
        status: 'supplemental_sent',
        total_hours: totalHours,
        entry_count: allEntries.length,
        supplemental_sent_at: new Date().toISOString(),
        email_log_id: emailLogRow?.id || null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'qb_customer_id,week_start' });
    }

    return new Response(
      JSON.stringify({
        success: true,
        customer: customerName,
        emailSent: emailResult.success,
        totalHours,
        newEntries: newEntryCount,
        noteChanges: noteChanges.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Supplemental report error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

/**
 * Generate supplemental report HTML email
 *
 * NOTE: This is currently triggered manually. Could be automated once we're confident
 * the detection and content are correct. Sharon reviews/edits notes before sending.
 */
function generateSupplementalEmail(
  customerName: string,
  entries: Array<any>,
  noteChanges: Array<{ entry_id: number; old_notes: string; new_notes: string; changed_by: string; changed_at: string }>,
  totalHours: number,
  estimatedAmount: number,
  originalHours: number,
  originalEntryCount: number,
  newEntryCount: number,
  newEntryHours: number,
  startDate: string,
  endDate: string,
  originalSentAt: string | null
): string {
  const hoursDiff = totalHours - originalHours;
  const entryDiff = entries.length - originalEntryCount;
  const originalSentDate = originalSentAt
    ? new Date(originalSentAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : 'a previous date';

  // What Changed summary
  const changes: string[] = [];
  if (newEntryCount > 0) {
    changes.push(`${newEntryCount} new time ${newEntryCount === 1 ? 'entry' : 'entries'} added (${newEntryHours.toFixed(2)} hours)`);
  }
  if (noteChanges.length > 0) {
    changes.push(`${noteChanges.length} work description${noteChanges.length === 1 ? '' : 's'} updated`);
  }
  if (hoursDiff !== 0 && newEntryCount === 0) {
    changes.push(`Hours adjusted by ${hoursDiff > 0 ? '+' : ''}${hoursDiff.toFixed(2)}`);
  }

  // Build change summary section
  let changeSummary = '';
  if (changes.length > 0) {
    changeSummary = `
      <div style="margin: 20px 0; padding: 15px; background: #e8f4f8; border: 1px solid #bee5eb; border-radius: 5px;">
        <h3 style="margin: 0 0 10px 0; color: #0c5460;">What Changed</h3>
        <ul style="color: #0c5460; margin: 0; padding-left: 20px;">
          ${changes.map(c => `<li>${c}</li>`).join('')}
        </ul>
        <div style="margin-top: 12px; padding: 10px; background: white; border-radius: 4px;">
          <table style="width: 100%; font-size: 14px;">
            <tr>
              <td style="padding: 4px 0;">Originally reported:</td>
              <td style="padding: 4px 0; text-align: right; font-weight: bold;">${Number(originalHours).toFixed(2)} hours (${originalEntryCount} entries)</td>
            </tr>
            <tr>
              <td style="padding: 4px 0;">Updated total:</td>
              <td style="padding: 4px 0; text-align: right; font-weight: bold;">${totalHours.toFixed(2)} hours (${entries.length} entries)</td>
            </tr>
            ${hoursDiff !== 0 ? `
            <tr>
              <td style="padding: 4px 0;">Difference:</td>
              <td style="padding: 4px 0; text-align: right; font-weight: bold; color: ${hoursDiff > 0 ? '#c0392b' : '#27ae60'};">${hoursDiff > 0 ? '+' : ''}${hoursDiff.toFixed(2)} hours</td>
            </tr>` : ''}
          </table>
        </div>
      </div>
    `;
  }

  // Note changes section
  let noteChangeSection = '';
  if (noteChanges.length > 0) {
    const noteRows = noteChanges.map(nc => {
      const entry = entries.find(e => e.id === nc.entry_id);
      const entryDate = entry?.txn_date || 'Unknown';
      const employee = entry?.employee_name || 'Unknown';
      return `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee; vertical-align: top;">${entryDate}<br><span style="font-size: 11px; color: #666;">${employee}</span></td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; vertical-align: top; color: #999; text-decoration: line-through; font-size: 12px;">${nc.old_notes}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; vertical-align: top; font-size: 12px;">${nc.new_notes}</td>
        </tr>
      `;
    }).join('');

    noteChangeSection = `
      <div style="margin: 20px 0;">
        <h3 style="color: #333; margin-bottom: 10px;">Updated Work Descriptions</h3>
        <table style="width: 100%; border-collapse: collapse; background: white;">
          <thead>
            <tr style="background: #f0f0f0;">
              <th style="padding: 8px; text-align: left; width: 120px;">Entry</th>
              <th style="padding: 8px; text-align: left;">Previous Description</th>
              <th style="padding: 8px; text-align: left;">Updated Description</th>
            </tr>
          </thead>
          <tbody>${noteRows}</tbody>
        </table>
      </div>
    `;
  }

  // Full entry table (same format as original report, but new/changed rows highlighted)
  const entryRows = entries.map(e => {
    const hours = e._hours.toFixed(2);
    let timeDisplay = 'Lump Sum';
    if (e.start_time && e.end_time) {
      const start = new Date(e.start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const end = new Date(e.end_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      timeDisplay = `${start} - ${end}`;
    }

    const bgColor = e._isNew ? '#fff8e1' : e._hasNoteChange ? '#f3e5f5' : 'white';
    const tag = e._isNew
      ? '<span style="background: #ff9800; color: white; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: bold; margin-left: 4px;">NEW</span>'
      : e._hasNoteChange
        ? '<span style="background: #9c27b0; color: white; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: bold; margin-left: 4px;">UPDATED</span>'
        : '';

    return `
      <tr style="background: ${bgColor};">
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${e.txn_date}${tag}</td>
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
        .header { background: #e67e22; color: white; padding: 20px; text-align: center; border-radius: 5px; }
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
          <h1>Updated Time Summary</h1>
          <p>${startDate} to ${endDate}</p>
        </div>

        <div class="content">
          <p>Dear ${customerName},</p>

          <p>This is an <strong>updated summary</strong> for the week of ${startDate} to ${endDate}, supplementing the report originally sent on ${originalSentDate}. Time entries have been added or updated since the original report.</p>

          <div class="disclaimer">
            ⚠️ <strong>DO NOT PAY THIS SUMMARY.</strong><br>
            This is for your information only to update you on work-in-progress completed on your project.
            Billing will be consolidated at the end of the month, and a billing statement will be sent to you.
          </div>

          ${changeSummary}
          ${noteChangeSection}

          <h3 style="color: #333;">Complete Updated Time Log</h3>
          <p style="font-size: 13px; color: #666;">
            Entries marked <span style="background: #ff9800; color: white; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: bold;">NEW</span> were added after the original report.
            ${noteChanges.length > 0 ? 'Entries marked <span style="background: #9c27b0; color: white; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: bold;">UPDATED</span> have revised descriptions.' : ''}
          </p>

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
              ${entryRows}
            </tbody>
          </table>

          <div class="total">
            <p>Updated Total Hours: ${totalHours.toFixed(2)}</p>
            ${estimatedAmount > 0 ? `<p>Updated Estimated Amount: $${estimatedAmount.toFixed(2)}</p>` : ''}
            ${hoursDiff !== 0 ? `<p style="font-size: 14px; color: #666;">(Previously reported: ${Number(originalHours).toFixed(2)} hours — change: ${hoursDiff > 0 ? '+' : ''}${hoursDiff.toFixed(2)} hours)</p>` : ''}
          </div>

          <p><em>This is an updated preview of time tracked. Final amounts will appear on your monthly invoice.</em></p>
        </div>

        <div class="footer">
          <p>Questions about this updated summary? Please reply to this email or contact us at accounting@mitigationconsulting.com</p>
          <p><strong>MIT Consulting</strong> | Mitigation Inspection & Testing</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
