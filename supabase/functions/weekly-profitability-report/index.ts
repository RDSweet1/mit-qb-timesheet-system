/**
 * Weekly Profitability Report
 * Calculates labor cost vs billing revenue, overhead breakdown, unbilled time
 * Stores snapshot and emails report to configured recipients
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail, getDefaultEmailSender } from '../_shared/outlook-email.ts';
import { profitabilityReportEmail } from '../_shared/email-templates.ts';

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
      clientSecret: Deno.env.get('AZURE_CLIENT_SECRET') ?? '',
    };

    // Parse optional date range from request body
    let weekStart: string;
    let weekEnd: string;

    try {
      const body = await req.json();
      if (body.weekStart && body.weekEnd) {
        weekStart = body.weekStart;
        weekEnd = body.weekEnd;
      } else {
        throw new Error('use defaults');
      }
    } catch {
      // Default: previous Monday to Sunday
      const today = new Date();
      const lastMonday = new Date(today);
      lastMonday.setDate(today.getDate() - ((today.getDay() + 6) % 7 + 7));
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      weekStart = lastMonday.toISOString().split('T')[0];
      weekEnd = lastSunday.toISOString().split('T')[0];
    }

    console.log(`Generating profitability report for ${weekStart} to ${weekEnd}`);

    // Fetch all data in parallel
    const [
      { data: entries },
      { data: serviceItems },
      { data: costRates },
      { data: customers },
      { data: recipients },
    ] = await Promise.all([
      supabaseClient
        .from('time_entries')
        .select('*')
        .gte('txn_date', weekStart)
        .lte('txn_date', weekEnd)
        .order('txn_date', { ascending: true }),
      supabaseClient
        .from('service_items')
        .select('qb_item_id, name, unit_price, overhead_category'),
      supabaseClient
        .from('employee_cost_rates')
        .select('*')
        .eq('is_active', true),
      supabaseClient
        .from('customers')
        .select('qb_customer_id, display_name, is_internal'),
      supabaseClient
        .from('report_recipients')
        .select('*')
        .eq('is_active', true)
        .in('report_type', ['profitability', 'all']),
    ]);

    if (!entries || entries.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No time entries for this period' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build lookup maps
    const serviceItemMap: Record<string, { name: string; unitPrice: number; overheadCategory: string | null }> = {};
    const itemIdByName: Record<string, string> = {};
    for (const si of (serviceItems || [])) {
      serviceItemMap[si.qb_item_id] = {
        name: si.name,
        unitPrice: si.unit_price || 0,
        overheadCategory: si.overhead_category,
      };
      if (si.name) {
        itemIdByName[si.name] = si.qb_item_id;
        itemIdByName[si.name.toLowerCase()] = si.qb_item_id;
      }
    }

    const costRateMap: Record<string, { baseRate: number; loadedRate: number; fixedWeeklyHours: number; qbEmployeeId: string | null }> = {};
    for (const cr of (costRates || [])) {
      costRateMap[cr.employee_name] = {
        baseRate: parseFloat(cr.base_hourly_rate) || 0,
        loadedRate: parseFloat(cr.fully_loaded_rate) || 0,
        fixedWeeklyHours: parseFloat(cr.fixed_weekly_hours) || 0,
        qbEmployeeId: cr.qb_employee_id || null,
      };
    }

    const customerMap: Record<string, { name: string; isInternal: boolean }> = {};
    for (const c of (customers || [])) {
      customerMap[c.qb_customer_id] = {
        name: c.display_name,
        isInternal: c.is_internal || false,
      };
    }

    // Process each entry
    let totalHours = 0;
    let billableHours = 0;
    let overheadHours = 0;
    let billableRevenue = 0;
    let laborCost = 0;
    let overheadCost = 0;
    let unbilledEntryCount = 0;
    let unbilledHours = 0;

    const categoryBreakdown: Record<string, { hours: number; cost: number }> = {
      admin: { hours: 0, cost: 0 },
      marketing: { hours: 0, cost: 0 },
      training: { hours: 0, cost: 0 },
      events: { hours: 0, cost: 0 },
    };

    const employeeBreakdown: Record<string, {
      totalHours: number;
      billableHours: number;
      overheadHours: number;
      laborCost: number;
      revenue: number;
    }> = {};

    interface UnbilledEntry {
      date: string;
      employee: string;
      customer: string;
      hours: number;
      serviceItemName: string;
    }
    const unbilledEntries: UnbilledEntry[] = [];

    for (const entry of entries) {
      const hours = (entry.hours || 0) + ((entry.minutes || 0) / 60);
      totalHours += hours;

      const employeeName = entry.employee_name || 'Unknown';
      const employeeCost = costRateMap[employeeName];
      const loadedRate = employeeCost?.loadedRate || 0;
      const entryCost = hours * loadedRate;
      laborCost += entryCost;

      // Initialize employee breakdown
      if (!employeeBreakdown[employeeName]) {
        employeeBreakdown[employeeName] = {
          totalHours: 0, billableHours: 0, overheadHours: 0, laborCost: 0, revenue: 0,
        };
      }
      employeeBreakdown[employeeName].totalHours += hours;
      employeeBreakdown[employeeName].laborCost += entryCost;

      // Resolve service item
      let resolvedItemId = entry.qb_item_id;
      if (!resolvedItemId && entry.service_item_name) {
        const sName = entry.service_item_name;
        resolvedItemId = itemIdByName[sName] || itemIdByName[sName.toLowerCase()];
        if (!resolvedItemId && sName.includes(':')) {
          const leafName = sName.split(':').pop()!.trim();
          resolvedItemId = itemIdByName[leafName] || itemIdByName[leafName.toLowerCase()];
          if (!resolvedItemId) {
            const parentName = sName.split(':')[0].trim();
            resolvedItemId = itemIdByName[parentName] || itemIdByName[parentName.toLowerCase()];
          }
        }
      }

      const serviceItem = resolvedItemId ? serviceItemMap[resolvedItemId] : null;
      const customer = customerMap[entry.qb_customer_id];

      // Classify: overhead or billable
      let isOverhead = false;
      let overheadCategory = 'admin'; // default for unclassified internal

      if (customer?.isInternal) {
        isOverhead = true;
        overheadCategory = serviceItem?.overheadCategory || 'admin';
      } else if (serviceItem?.overheadCategory) {
        isOverhead = true;
        overheadCategory = serviceItem.overheadCategory;
      }

      if (isOverhead) {
        overheadHours += hours;
        overheadCost += entryCost;
        employeeBreakdown[employeeName].overheadHours += hours;

        if (categoryBreakdown[overheadCategory]) {
          categoryBreakdown[overheadCategory].hours += hours;
          categoryBreakdown[overheadCategory].cost += entryCost;
        } else {
          categoryBreakdown[overheadCategory] = { hours, cost: entryCost };
        }
      } else {
        billableHours += hours;
        const billingRate = serviceItem?.unitPrice || 0;
        const revenue = hours * billingRate;
        billableRevenue += revenue;
        employeeBreakdown[employeeName].billableHours += hours;
        employeeBreakdown[employeeName].revenue += revenue;

        // Check if unbilled (no resolved item)
        if (!resolvedItemId) {
          unbilledEntryCount++;
          unbilledHours += hours;
          unbilledEntries.push({
            date: entry.txn_date,
            employee: employeeName,
            customer: customer?.name || entry.customer_name || 'Unknown',
            hours,
            serviceItemName: entry.service_item_name || '(none)',
          });
        }
      }
    }

    // Auto-fill overhead for salaried employees with fixed_weekly_hours
    // Group by qb_employee_id so name variants (e.g., "R. David Sweet" / "Robert David Sweet")
    // share one pool and don't double-count.
    // - No time entries: add full fixed hours as overhead (e.g., Chimene)
    // - Some entries but under fixed hours: fill the gap as admin overhead (e.g., David)
    const fixedHoursProcessed = new Set<string>(); // track by qb_employee_id or name
    for (const [empName, rates] of Object.entries(costRateMap)) {
      if (rates.fixedWeeklyHours <= 0) continue;

      // Deduplicate by qb_employee_id — only process once per actual person
      const dedupKey = rates.qbEmployeeId || empName;
      if (fixedHoursProcessed.has(dedupKey)) continue;
      fixedHoursProcessed.add(dedupKey);

      // Sum logged hours across ALL name variants for this employee
      let loggedHours = 0;
      let primaryName = empName; // name to attribute the gap-fill hours to
      for (const [variantName, variantRates] of Object.entries(costRateMap)) {
        const variantKey = variantRates.qbEmployeeId || variantName;
        if (variantKey === dedupKey && employeeBreakdown[variantName]) {
          loggedHours += employeeBreakdown[variantName].totalHours;
          primaryName = variantName; // use a name that has entries
        }
      }

      const gap = rates.fixedWeeklyHours - loggedHours;
      if (gap <= 0) continue;

      const cost = gap * rates.loadedRate;

      totalHours += gap;
      overheadHours += gap;
      laborCost += cost;
      overheadCost += cost;

      categoryBreakdown['admin'].hours += gap;
      categoryBreakdown['admin'].cost += cost;

      const existing = employeeBreakdown[primaryName];
      if (existing) {
        existing.totalHours += gap;
        existing.overheadHours += gap;
        existing.laborCost += cost;
      } else {
        employeeBreakdown[empName] = {
          totalHours: gap,
          billableHours: 0,
          overheadHours: gap,
          laborCost: cost,
          revenue: 0,
        };
      }

      console.log(`Auto-filled overhead: ${primaryName} — ${gap.toFixed(1)} hrs gap (logged ${loggedHours.toFixed(1)} of ${rates.fixedWeeklyHours}), $${cost.toFixed(2)} cost`);
    }

    const grossMargin = billableRevenue - laborCost;
    const marginPercent = billableRevenue > 0 ? (grossMargin / billableRevenue) * 100 : 0;
    const utilizationPercent = totalHours > 0 ? (billableHours / totalHours) * 100 : 0;

    // Store snapshot
    const { data: snapshot, error: snapError } = await supabaseClient
      .from('profitability_snapshots')
      .upsert({
        week_start: weekStart,
        week_end: weekEnd,
        total_hours: parseFloat(totalHours.toFixed(2)),
        billable_hours: parseFloat(billableHours.toFixed(2)),
        overhead_hours: parseFloat(overheadHours.toFixed(2)),
        billable_revenue: parseFloat(billableRevenue.toFixed(2)),
        labor_cost: parseFloat(laborCost.toFixed(2)),
        overhead_cost: parseFloat(overheadCost.toFixed(2)),
        gross_margin: parseFloat(grossMargin.toFixed(2)),
        margin_percent: parseFloat(marginPercent.toFixed(1)),
        utilization_percent: parseFloat(utilizationPercent.toFixed(1)),
        breakdown_by_category: categoryBreakdown,
        breakdown_by_employee: employeeBreakdown,
        unbilled_entry_count: unbilledEntryCount,
        unbilled_hours: parseFloat(unbilledHours.toFixed(2)),
        created_at: new Date().toISOString(),
      }, { onConflict: 'week_start,week_end' })
      .select()
      .single();

    if (snapError) {
      console.error('Failed to store snapshot:', snapError);
    }

    // Send email to recipients
    let emailsSent = 0;
    if (recipients && recipients.length > 0) {
      const fromEmail = await getDefaultEmailSender(supabaseClient);

      const fmtStart = new Date(weekStart + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      });
      const fmtEnd = new Date(weekEnd + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      });

      const unbilledTimeUrl = 'https://rdsweet1.github.io/mit-qb-frontend/analytics/unbilled-time';

      const htmlBody = profitabilityReportEmail({
        periodStart: fmtStart,
        periodEnd: fmtEnd,
        totalHours,
        billableHours,
        overheadHours,
        utilizationPercent,
        billableRevenue,
        laborCost,
        grossMargin,
        marginPercent,
        categoryBreakdown,
        employeeBreakdown,
        unbilledEntryCount,
        unbilledHours,
        unbilledEntries: unbilledEntries.slice(0, 5),
        unbilledTimeUrl,
      });

      const recipientEmails = recipients.map((r: any) => r.email);

      const emailResult = await sendEmail(
        {
          from: fromEmail,
          to: recipientEmails,
          subject: `Weekly Profitability Report — ${fmtStart} – ${fmtEnd}`,
          htmlBody,
        },
        outlookConfig
      );

      if (emailResult.success) {
        emailsSent = recipientEmails.length;
      } else {
        console.error('Failed to send profitability email:', emailResult.error);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        snapshot: {
          weekStart,
          weekEnd,
          totalHours: parseFloat(totalHours.toFixed(2)),
          billableHours: parseFloat(billableHours.toFixed(2)),
          overheadHours: parseFloat(overheadHours.toFixed(2)),
          billableRevenue: parseFloat(billableRevenue.toFixed(2)),
          laborCost: parseFloat(laborCost.toFixed(2)),
          grossMargin: parseFloat(grossMargin.toFixed(2)),
          marginPercent: parseFloat(marginPercent.toFixed(1)),
          utilizationPercent: parseFloat(utilizationPercent.toFixed(1)),
          unbilledEntryCount,
          unbilledHours: parseFloat(unbilledHours.toFixed(2)),
        },
        emailsSent,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Error generating profitability report:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
