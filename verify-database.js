#!/usr/bin/env node
/**
 * Verify Database Deployment
 * Run: node verify-database.js
 */

const https = require('https');

const SUPABASE_URL = 'https://wppuhwrehjpsxjxqwsnr.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndwcHVod3JlaGpwc3hqeHF3c25yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzQxMjQ2MSwiZXhwIjoyMDc4OTg4NDYxfQ.1s0zfM6u4YYsb1js1nKUGegQzDWiCZvq2m6CTchpdgg';

const tables = [
  'customers',
  'service_items',
  'time_entries',
  'invoice_log',
  'email_log',
  'app_users',
  'email_senders'
];

console.log('🔍 Verifying Supabase Database Deployment...\n');

let completedChecks = 0;
const totalChecks = tables.length + 1; // tables + email senders check

function checkTable(tableName) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'wppuhwrehjpsxjxqwsnr.supabase.co',
      path: `/rest/v1/${tableName}?select=count`,
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`  ✅ ${tableName.padEnd(20)} - Exists`);
          resolve(true);
        } else {
          console.log(`  ❌ ${tableName.padEnd(20)} - Missing (Status: ${res.statusCode})`);
          resolve(false);
        }
        completedChecks++;
      });
    });

    req.on('error', (e) => {
      console.log(`  ❌ ${tableName.padEnd(20)} - Error: ${e.message}`);
      resolve(false);
      completedChecks++;
    });

    req.setTimeout(5000, () => {
      console.log(`  ⏱️ ${tableName.padEnd(20)} - Timeout`);
      req.destroy();
      resolve(false);
      completedChecks++;
    });

    req.end();
  });
}

function checkEmailSenders() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'wppuhwrehjpsxjxqwsnr.supabase.co',
      path: '/rest/v1/email_senders?select=email,display_name,is_default',
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const senders = JSON.parse(data);
            console.log(`\n📧 Email Senders (${senders.length} found):`);

            const expectedEmails = [
              'accounting@mitigationconsulting.com',
              'rdsweet1@gmail.com',
              'natashagarces11@gmail.com',
              'sharon@mitigationconsulting.com'
            ];

            const foundEmails = senders.map(s => s.email);
            const defaultSender = senders.find(s => s.is_default);

            expectedEmails.forEach(email => {
              if (foundEmails.includes(email)) {
                const sender = senders.find(s => s.email === email);
                const isDefault = sender.is_default ? ' (DEFAULT)' : '';
                console.log(`  ✅ ${sender.display_name}${isDefault}`);
              } else {
                console.log(`  ❌ ${email} - Missing`);
              }
            });

            if (senders.length === 4 && defaultSender) {
              resolve(true);
            } else {
              console.log(`\n  ⚠️ Expected 4 senders with 1 default, found ${senders.length}`);
              resolve(false);
            }
          } catch (e) {
            console.log('  ❌ Error parsing email senders:', e.message);
            resolve(false);
          }
        } else {
          console.log('  ❌ Could not fetch email senders (Status:', res.statusCode, ')');
          resolve(false);
        }
        completedChecks++;
      });
    });

    req.on('error', (e) => {
      console.log('  ❌ Error fetching email senders:', e.message);
      resolve(false);
      completedChecks++;
    });

    req.setTimeout(5000, () => {
      console.log('  ⏱️ Timeout fetching email senders');
      req.destroy();
      resolve(false);
      completedChecks++;
    });

    req.end();
  });
}

async function verify() {
  console.log('📊 Checking Tables:\n');

  const tableResults = await Promise.all(tables.map(checkTable));
  const emailResult = await checkEmailSenders();

  const allTablesExist = tableResults.every(r => r);
  const emailsConfigured = emailResult;

  console.log('\n' + '='.repeat(50));
  console.log('\n📋 Summary:\n');
  console.log(`  Tables: ${tableResults.filter(r => r).length}/${tables.length}`);
  console.log(`  Email Senders: ${emailsConfigured ? '✅' : '❌'}`);

  if (allTablesExist && emailsConfigured) {
    console.log('\n✅ Database deployment SUCCESSFUL!\n');
    console.log('🎯 Next Step: Configure Azure Graph API permissions');
    console.log('   See: deploy-step-2-azure.md\n');
    process.exit(0);
  } else {
    console.log('\n❌ Database deployment INCOMPLETE\n');
    console.log('📖 Please follow instructions in: deploy-step-1-database.md\n');
    process.exit(1);
  }
}

verify();
