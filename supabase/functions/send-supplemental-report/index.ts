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
import { supplementalReportEmail, type EntryRow } from '../_shared/email-templates.ts';
import { getPortalUrl } from '../_shared/config.ts';

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

    // Build change descriptions
    const hoursDiff = totalHours - originalHours;
    const changeDescriptions: string[] = [];
    if (newEntryCount > 0) {
      changeDescriptions.push(`${newEntryCount} new time ${newEntryCount === 1 ? 'entry' : 'entries'} added (${newEntryHours.toFixed(2)} hours)`);
    }
    if (noteChanges.length > 0) {
      changeDescriptions.push(`${noteChanges.length} work description${noteChanges.length === 1 ? '' : 's'} updated`);
    }
    if (hoursDiff !== 0 && newEntryCount === 0) {
      changeDescriptions.push(`Hours adjusted by ${hoursDiff > 0 ? '+' : ''}${hoursDiff.toFixed(2)}`);
    }

    // Format dates
    const fmtStart = new Date(week_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const fmtEnd = new Date(week_end + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const fmtGenerated = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const fmtOriginalSent = originalSentAt
      ? new Date(originalSentAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : 'a previous date';
    const originalReportNumber = reportPeriod?.report_number || undefined;
    const uniqueDays = new Set(classifiedEntries.map((e: any) => e.txn_date)).size;

    // Generate report number for supplemental
    const weekNum = Math.ceil((new Date(week_start + 'T00:00:00').getTime() - new Date(new Date(week_start).getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
    const reportNumber = `SR-${new Date(week_start).getFullYear()}-${String(weekNum).padStart(2, '0')}`;

    // Map entries to template format
    const entryRows: EntryRow[] = classifiedEntries.map((e: any) => {
      const txnDate = new Date(e.txn_date + 'T00:00:00');
      const dayName = txnDate.toLocaleDateString('en-US', { weekday: 'short' });
      const dateStr = `${dayName} ${txnDate.getMonth() + 1}/${txnDate.getDate()}`;

      // Build change note for this entry
      let changeNote: string | undefined;
      const nc = noteChanges.find(n => n.entry_id === e.id);
      if (nc) {
        changeNote = 'Description updated';
      } else if (e._isNew) {
        changeNote = 'New entry added after original report';
      }

      return {
        date: dateStr,
        employee: e.employee_name || 'Unknown',
        costCode: e.cost_code || 'General',
        description: e.description || '-',
        hours: e._hours.toFixed(2),
        isNew: e._isNew,
        isUpdated: e._hasNoteChange,
        changeNote,
      };
    });

    // Create or reuse review token for the review portal link
    let reviewUrl: string | undefined;
    if (reportPeriod?.id) {
      // Check for existing review token
      const { data: existingToken } = await supabase
        .from('review_tokens')
        .select('token')
        .eq('report_period_id', reportPeriod.id)
        .is('customer_action', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (existingToken?.token) {
        reviewUrl = `${getPortalUrl('review')}?token=${existingToken.token}`;
      } else {
        // Create new token
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        const { data: tokenRow } = await supabase.from('review_tokens').insert({
          report_period_id: reportPeriod.id,
          expires_at: expiresAt.toISOString(),
        }).select('token').single();

        if (tokenRow?.token) {
          reviewUrl = `${getPortalUrl('review')}?token=${tokenRow.token}`;
        }
      }
    }

    // Generate HTML using shared template
    const htmlBody = supplementalReportEmail({
      customerName,
      reportNumber,
      periodStart: fmtStart,
      periodEnd: fmtEnd,
      generatedDate: fmtGenerated,
      originalSentDate: fmtOriginalSent,
      originalReportNumber,
      originalHours,
      originalCount: originalEntryCount,
      entries: entryRows,
      totalHours,
      entryCount: classifiedEntries.length,
      daysActive: uniqueDays,
      changes: changeDescriptions,
      reviewUrl,
    });

    // Send email
    const fromEmail = await getDefaultEmailSender(supabase);
    const emailResult = await sendEmail(
      {
        from: fromEmail,
        to: [customerEmail],
        cc: ['skisner@mitigationconsulting.com', 'david@mitigationconsulting.com'],
        subject: `Supplemental Time & Activity Report — ${customerName} — ${fmtStart} – ${fmtEnd}`,
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

// Old generateSupplementalEmail removed — now uses shared email-templates.ts
