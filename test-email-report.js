require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

console.log('🧪 Testing Email Report Function...\n');

// Sample report data
const testReport = {
  startDate: '2026-01-01',
  endDate: '2026-01-31',
  entries: [
    {
      date: '2026-01-30',
      employee: 'Netausha Austin',
      customer: 'Susag TB',
      costCode: 'SA2AT',
      hours: '3.15',
      billable: 'Billable',
      notes: 'Test entry'
    },
    {
      date: '2026-01-30',
      employee: 'Fred Ferraiuolo',
      customer: 'ClarionHotel.ClaimsReso',
      costCode: 'TWIA',
      hours: '2.00',
      billable: 'Billable',
      notes: null
    }
  ],
  summary: {
    totalEntries: 2,
    totalHours: '5.2'
  }
};

// Test email address (change to your email)
const recipient = process.env.TEST_EMAIL || 'david@mitigationconsulting.com';

console.log(`📧 Sending test report to: ${recipient}\n`);

fetch(`${supabaseUrl}/functions/v1/email_time_report`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${supabaseAnonKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    report: testReport,
    recipient: recipient
  })
})
.then(async response => {
  console.log('Status:', response.status, response.statusText);

  const text = await response.text();
  console.log('\n📊 Response:');

  try {
    const data = JSON.parse(text);
    console.log(JSON.stringify(data, null, 2));

    if (data.success) {
      console.log('\n✅ SUCCESS! Email sent.');
      console.log(`📬 Check inbox for: ${recipient}`);
    } else {
      console.log('\n❌ FAILED!');
      console.log('Error:', data.error);
    }
  } catch (e) {
    console.error('Failed to parse response:', text);
  }
})
.catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
