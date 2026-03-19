/**
 * Promote Time Entries to QB Online
 *
 * Creates TimeActivity records in QB Online for approved entries
 * that originated from Workforce. Marks entries as promoted and
 * stores the QB Online ID for dedup and future edits.
 *
 * Idempotency: skips already-promoted entries, qb_online_id UNIQUE
 * index prevents double-create at DB level.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { loadQBTokens, qbCreate } from '../_shared/qb-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PromoteRequest {
  entryIds: number[];
  userEmail: string;
}

interface EntryResult {
  id: number;
  status: 'promoted' | 'failed' | 'skipped';
  qb_online_id?: string;
  error?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { entryIds, userEmail }: PromoteRequest = await req.json();

    if (!entryIds?.length || !userEmail) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing entryIds or userEmail' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Promote: Starting for ${entryIds.length} entries by ${userEmail}`);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { tokens, config } = await loadQBTokens();

    // ── Load lookup maps ──────────────────────────────────────

    // Employees: display_name → QB Online ID
    const { data: employeeRows } = await supabaseClient
      .from('employees')
      .select('qb_employee_id, display_name')
      .eq('is_active', true);

    const employeeMap = new Map<string, string>();
    for (const emp of employeeRows || []) {
      // Map by display_name (case-insensitive) and by QB ID
      employeeMap.set(emp.display_name.toLowerCase(), emp.qb_employee_id);
      employeeMap.set(emp.qb_employee_id, emp.qb_employee_id);
    }

    // Customers: display_name → QB numeric ID
    const { data: customerRows } = await supabaseClient
      .from('customers')
      .select('qb_customer_id, display_name')
      .eq('is_active', true);

    const customerMap = new Map<string, string>();
    for (const cust of customerRows || []) {
      customerMap.set(cust.display_name.toLowerCase(), cust.qb_customer_id);
      customerMap.set(cust.qb_customer_id, cust.qb_customer_id);
    }

    // ── Fetch entries ─────────────────────────────────────────

    const { data: entries, error: fetchError } = await supabaseClient
      .from('time_entries')
      .select('id, qb_time_id, qb_employee_id, employee_name, qb_customer_id, txn_date, start_time, end_time, hours, minutes, qb_item_id, service_item_name, description, notes, billable_status, promotion_status, qb_online_id')
      .in('id', entryIds);

    if (fetchError) {
      throw new Error(`Failed to fetch entries: ${fetchError.message}`);
    }

    if (!entries?.length) {
      return new Response(
        JSON.stringify({ success: true, promoted: 0, failed: 0, skipped: 0, results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // ── Mark as pending ───────────────────────────────────────

    const eligibleIds = entries
      .filter(e => e.promotion_status !== 'promoted' && e.promotion_status !== 'pending')
      .map(e => e.id);

    if (eligibleIds.length > 0) {
      await supabaseClient
        .from('time_entries')
        .update({ promotion_status: 'pending' })
        .in('id', eligibleIds);
    }

    // ── Promote each entry ────────────────────────────────────

    const results: EntryResult[] = [];
    let promotedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const entry of entries) {
      // Skip already promoted
      if (entry.promotion_status === 'promoted' || entry.qb_online_id) {
        results.push({ id: entry.id, status: 'skipped', qb_online_id: entry.qb_online_id || undefined });
        skippedCount++;
        continue;
      }

      try {
        // Resolve employee QB ID
        const employeeRef = resolveRef(entry.qb_employee_id, entry.employee_name, employeeMap, 'employee');
        if (!employeeRef) {
          throw new Error(`Cannot resolve employee: ${entry.employee_name} (qb_employee_id: ${entry.qb_employee_id})`);
        }

        // Resolve customer QB ID
        const customerRef = resolveCustomerRef(entry.qb_customer_id, customerMap);
        if (!customerRef) {
          throw new Error(`Cannot resolve customer: ${entry.qb_customer_id}`);
        }

        // Build TimeActivity payload
        const payload: Record<string, any> = {
          NameOf: 'Employee',
          EmployeeRef: { value: employeeRef },
          CustomerRef: { value: customerRef },
          TxnDate: entry.txn_date,
          BillableStatus: entry.billable_status || 'Billable',
        };

        // Use StartTime/EndTime if available, else Hours/Minutes
        if (entry.start_time && entry.end_time) {
          payload.StartTime = entry.start_time;
          payload.EndTime = entry.end_time;
        } else {
          payload.Hours = entry.hours || 0;
          payload.Minutes = entry.minutes || 0;
        }

        // Description (use description field, fall back to notes)
        if (entry.description || entry.notes) {
          payload.Description = entry.description || entry.notes;
        }

        // Service item / cost code
        if (entry.qb_item_id) {
          payload.ItemRef = { value: entry.qb_item_id };
        }

        console.log(`Promote: Creating TimeActivity for entry ${entry.id} (${entry.employee_name} - ${entry.txn_date})`);

        // Create in QB Online
        const createResult = await qbCreate('timeactivity', payload, tokens, config);
        const createdTA = createResult.TimeActivity;

        if (!createdTA?.Id) {
          throw new Error('QB Online returned no TimeActivity ID');
        }

        console.log(`Promote: Created QB Online TimeActivity ${createdTA.Id} for entry ${entry.id}`);

        // Update our DB with the QB Online ID
        const now = new Date().toISOString();
        await supabaseClient
          .from('time_entries')
          .update({
            qb_online_id: createdTA.Id,
            qb_sync_token: createdTA.SyncToken,
            promotion_status: 'promoted',
            promoted_at: now,
            promoted_by: userEmail,
          })
          .eq('id', entry.id);

        // Audit log
        await supabaseClient
          .from('time_entry_audit_log')
          .insert({
            entry_id: entry.id,
            action: 'promoted_to_qb',
            user_email: userEmail,
            changes: {
              qb_online_id: createdTA.Id,
              qb_sync_token: createdTA.SyncToken,
              payload,
            },
            timestamp: now,
          });

        results.push({ id: entry.id, status: 'promoted', qb_online_id: createdTA.Id });
        promotedCount++;

      } catch (err: any) {
        console.error(`Promote: Failed for entry ${entry.id}:`, err.message);

        await supabaseClient
          .from('time_entries')
          .update({ promotion_status: 'failed' })
          .eq('id', entry.id);

        // Audit log for failure
        await supabaseClient
          .from('time_entry_audit_log')
          .insert({
            entry_id: entry.id,
            action: 'promotion_failed',
            user_email: userEmail,
            changes: { error: err.message },
            timestamp: new Date().toISOString(),
          });

        results.push({ id: entry.id, status: 'failed', error: err.message });
        failedCount++;
      }
    }

    console.log(`Promote: Done — ${promotedCount} promoted, ${failedCount} failed, ${skippedCount} skipped`);

    return new Response(
      JSON.stringify({
        success: true,
        promoted: promotedCount,
        failed: failedCount,
        skipped: skippedCount,
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Promote: Fatal error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

/**
 * Resolve an employee reference to a QB Online numeric ID.
 * If qb_employee_id is already numeric, use it directly.
 * Otherwise, look up by employee_name in the employees table.
 */
function resolveRef(
  qbEmployeeId: string | null,
  employeeName: string,
  employeeMap: Map<string, string>,
  _label: string
): string | null {
  // If qb_employee_id looks numeric, it's already a QB Online ID
  if (qbEmployeeId && /^\d+$/.test(qbEmployeeId)) {
    return qbEmployeeId;
  }

  // Try exact match on the stored ID (may be a name from Workforce sync)
  if (qbEmployeeId) {
    const byId = employeeMap.get(qbEmployeeId.toLowerCase());
    if (byId) return byId;
  }

  // Try by employee_name
  const byName = employeeMap.get(employeeName.toLowerCase());
  if (byName) return byName;

  return null;
}

/**
 * Resolve a customer reference to a QB Online numeric ID.
 * If qb_customer_id is already numeric, use it directly.
 * Otherwise, look up by display_name in the customers table.
 */
function resolveCustomerRef(
  qbCustomerId: string | null,
  customerMap: Map<string, string>
): string | null {
  if (!qbCustomerId) return null;

  // If already numeric, it's a QB Online ID
  if (/^\d+$/.test(qbCustomerId)) {
    return qbCustomerId;
  }

  // Look up by name
  const byName = customerMap.get(qbCustomerId.toLowerCase());
  return byName || null;
}
