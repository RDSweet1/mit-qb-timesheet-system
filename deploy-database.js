#!/usr/bin/env node
/**
 * Deploy Database Schema to Supabase
 * Run: node deploy-database.js
 */

require('dotenv').config();
const fs = require('fs');
const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

// Read schema file
const schemaSQL = fs.readFileSync('./sql/schema.sql', 'utf8');

// Split into individual statements (rough split by semicolon + newline)
const statements = schemaSQL
  .split(';\n')
  .map(s => s.trim())
  .filter(s => s && !s.startsWith('--'));

console.log('🚀 Deploying Database Schema to Supabase...');
console.log(`📊 Found ${statements.length} SQL statements\n`);

// Extract connection info from URL
const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)[1];
const dbUrl = `https://${projectRef}.supabase.co/rest/v1/`;

console.log('✅ Connection Info:');
console.log(`   Project: ${projectRef}`);
console.log(`   URL: ${SUPABASE_URL}\n`);

console.log('📋 Deployment Instructions:\n');
console.log('Since automated SQL execution requires direct database access,');
console.log('please follow these steps:\n');
console.log('1. Go to: https://supabase.com/dashboard/project/' + projectRef);
console.log('2. Click "SQL Editor" in the left sidebar');
console.log('3. Click "New Query"');
console.log('4. Copy the contents of sql/schema.sql');
console.log('5. Paste into the editor');
console.log('6. Click "Run" (or press Ctrl+Enter)\n');

console.log('📄 Schema file location:');
console.log('   ' + __dirname + '\\sql\\schema.sql\n');

console.log('✨ After running the schema, the following tables will be created:');
console.log('   • customers (QB customer cache)');
console.log('   • service_items (cost codes with rates)');
console.log('   • time_entries (time tracking with description & notes)');
console.log('   • invoice_log (monthly billing history)');
console.log('   • email_log (weekly reminder tracking)');
console.log('   • app_users (authorized users)\n');

console.log('🔒 Row Level Security will be enabled for all tables');
console.log('🔑 Service role has full access (for Edge Functions)\n');

// Verify we can connect to Supabase
const testUrl = new URL('/rest/v1/', SUPABASE_URL);
const options = {
  method: 'HEAD',
  headers: {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
  }
};

console.log('🔍 Testing Supabase connection...');
const req = https.request(testUrl, options, (res) => {
  if (res.statusCode === 200 || res.statusCode === 404) {
    console.log('✅ Connection successful!\n');
    console.log('🎯 Next Steps:');
    console.log('   1. Run the schema in Supabase SQL Editor (instructions above)');
    console.log('   2. Deploy Edge Functions: npm run deploy:functions');
    console.log('   3. Test the system: npm run test:system\n');
  } else {
    console.error('❌ Connection failed. Status:', res.statusCode);
  }
});

req.on('error', (e) => {
  console.error('❌ Connection error:', e.message);
});

req.end();
