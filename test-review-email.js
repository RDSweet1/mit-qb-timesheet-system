/**
 * Test script: Send review portal test email
 * Sends to david@, skisner@, SFoster@ with a real review portal link
 *
 * Usage: node test-review-email.js
 */

require('dotenv').config({ override: true });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TEST_RECIPIENTS = [
  'david@mitigationconsulting.com',
  'skisner@mitigationconsulting.com',
  'SFoster@mitigationconsulting.com',
];

const PORTAL_BASE_URL = 'https://rdsweet1.github.io/mit-qb-frontend/review';

// Helper: Supabase REST API call
async function sbQuery(table, params = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
  });
  if (!res.ok) throw new Error(`Supabase query ${table} failed: ${await res.text()}`);
  return res.json();
}

async function sbInsert(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase insert ${table} failed: ${await res.text()}`);
  return res.json();
}

async function sbUpsert(table, data, onConflict) {
  const conflictParam = onConflict ? `?on_conflict=${onConflict}` : '';
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${conflictParam}`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation,resolution=merge-duplicates',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase upsert ${table} failed: ${await res.text()}`);
  return res.json();
}

async function main() {
  console.log('1. Finding a customer with recent time entries...');

  // Get most recent billable entries
  const recentEntries = await sbQuery(
    'time_entries',
    'select=qb_customer_id,txn_date,employee_name,cost_code,description,hours,minutes' +
    '&billable_status=eq.Billable&order=txn_date.desc&limit=50'
  );

  if (!recentEntries?.length) {
    console.error('No recent entries found');
    return;
  }

  // Group by customer
  const byCustomer = {};
  for (const e of recentEntries) {
    if (!byCustomer[e.qb_customer_id]) byCustomer[e.qb_customer_id] = [];
    byCustomer[e.qb_customer_id].push(e);
  }

  // Pick customer with most entries
  let bestCustomerId = null;
  let bestCount = 0;
  for (const [cid, entries] of Object.entries(byCustomer)) {
    if (entries.length > bestCount) {
      bestCount = entries.length;
      bestCustomerId = cid;
    }
  }

  const entries = byCustomer[bestCustomerId];
  console.log(`   Found ${entries.length} entries for customer ${bestCustomerId}`);

  // Get customer info
  const customers = await sbQuery('customers', `qb_customer_id=eq.${bestCustomerId}&limit=1`);
  const customer = customers[0];
  if (!customer) {
    console.error('Customer not found');
    return;
  }
  console.log(`   Customer: ${customer.display_name}`);

  // Determine week range
  const dates = entries.map(e => e.txn_date).sort();
  const startDate = new Date(dates[0] + 'T00:00:00');
  const dayOfWeek = startDate.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(startDate);
  monday.setDate(startDate.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const weekStartStr = monday.toISOString().split('T')[0];
  const weekEndStr = sunday.toISOString().split('T')[0];
  console.log(`   Week: ${weekStartStr} to ${weekEndStr}`);

  // Filter to this week
  let weekEntries = entries.filter(e => e.txn_date >= weekStartStr && e.txn_date <= weekEndStr);
  if (weekEntries.length === 0) {
    console.log('   No entries in computed week, using first 10 entries');
    weekEntries = entries.slice(0, 10);
  }
  console.log(`   Entries in week: ${weekEntries.length}`);

  // 2. Send test email (edge function creates report_period + review_token automatically)
  console.log('\n2. Sending test email to:', TEST_RECIPIENTS.join(', '));
  console.log('   (Edge function will create report_period + review_token with review button)');

  const totalHours = weekEntries.reduce((sum, e) => sum + e.hours + (e.minutes / 60), 0);

  const reportEntries = weekEntries.map(e => {
    const txnDate = new Date(e.txn_date + 'T00:00:00');
    const dayName = txnDate.toLocaleDateString('en-US', { weekday: 'short' });
    const dateStr = `${dayName} ${txnDate.getMonth() + 1}/${txnDate.getDate()}`;
    return {
      date: dateStr,
      employee: e.employee_name || 'Unknown',
      customer: customer.display_name,
      costCode: e.cost_code || 'General',
      hours: (e.hours + e.minutes / 60).toFixed(2),
      billable: 'Billable',
      description: e.description || '-',
    };
  });

  const response = await fetch(`${SUPABASE_URL}/functions/v1/email_time_report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      report: {
        startDate: weekStartStr,
        endDate: weekEndStr,
        entries: reportEntries,
        summary: {
          totalEntries: reportEntries.length,
          totalHours: totalHours.toFixed(2),
        },
      },
      recipient: TEST_RECIPIENTS[0],
      cc: TEST_RECIPIENTS.slice(1),
      customerId: customer.qb_customer_id,
    }),
  });

  const result = await response.json();

  if (result.success) {
    console.log('\n--- TEST EMAIL SENT SUCCESSFULLY ---');
    console.log(`Message ID: ${result.messageId}`);
    if (result.reviewUrl) {
      console.log(`\nReview Portal URL (paste in browser to test):`);
      console.log(`  ${result.reviewUrl}`);
    } else {
      console.log('\nWARNING: No reviewUrl returned — check edge function logs');
    }
  } else {
    console.error('\nFailed to send email:', result.error);
  }
}

main().catch(console.error);
