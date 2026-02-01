#!/usr/bin/env node
/**
 * Quick test script to verify QuickBooks OAuth connection
 * Run: node test-qb-connection.js
 * 
 * Requires .env file with:
 *   QB_ACCESS_TOKEN
 *   QB_REALM_ID
 *   QB_ENVIRONMENT (sandbox or production)
 */

require('dotenv').config();

const ACCESS_TOKEN = process.env.QB_ACCESS_TOKEN;
const REALM_ID = process.env.QB_REALM_ID;
const ENVIRONMENT = process.env.QB_ENVIRONMENT || 'sandbox';

const BASE_URL = ENVIRONMENT === 'production' 
  ? 'https://quickbooks.api.intuit.com'
  : 'https://sandbox-quickbooks.api.intuit.com';

async function testConnection() {
  console.log('🔗 Testing QuickBooks API Connection...\n');
  console.log(`Environment: ${ENVIRONMENT}`);
  console.log(`Realm ID: ${REALM_ID}`);
  console.log(`Base URL: ${BASE_URL}\n`);

  if (!ACCESS_TOKEN || !REALM_ID) {
    console.error('❌ Missing QB_ACCESS_TOKEN or QB_REALM_ID in .env file');
    process.exit(1);
  }

  try {
    // Test 1: Get Company Info
    console.log('📋 Test 1: Fetching Company Info...');
    const companyResponse = await fetch(
      `${BASE_URL}/v3/company/${REALM_ID}/companyinfo/${REALM_ID}?minorversion=75`,
      {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!companyResponse.ok) {
      const error = await companyResponse.text();
      throw new Error(`Company Info failed: ${companyResponse.status} - ${error}`);
    }

    const companyData = await companyResponse.json();
    console.log(`✅ Connected to: ${companyData.CompanyInfo.CompanyName}`);
    console.log(`   Country: ${companyData.CompanyInfo.Country}`);
    console.log(`   Industry: ${companyData.CompanyInfo.IndustryType || 'Not set'}\n`);

    // Test 2: Get Service Items (Cost Codes)
    console.log('📋 Test 2: Fetching Service Items (Cost Codes)...');
    const itemsResponse = await fetch(
      `${BASE_URL}/v3/company/${REALM_ID}/query?minorversion=75`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/text',
          'Accept': 'application/json'
        },
        body: "SELECT * FROM Item WHERE Type = 'Service' AND Active = true"
      }
    );

    if (!itemsResponse.ok) {
      const error = await itemsResponse.text();
      throw new Error(`Service Items query failed: ${itemsResponse.status} - ${error}`);
    }

    const itemsData = await itemsResponse.json();
    const items = itemsData.QueryResponse?.Item || [];
    
    console.log(`✅ Found ${items.length} service items:\n`);
    
    if (items.length > 0) {
      console.log('   Name                              | Rate      | ID');
      console.log('   ----------------------------------|-----------|--------');
      items.forEach(item => {
        const name = (item.Name || '').padEnd(35).substring(0, 35);
        const rate = item.UnitPrice ? `$${item.UnitPrice.toFixed(2)}`.padStart(9) : '     N/A ';
        console.log(`   ${name} | ${rate} | ${item.Id}`);
      });
    } else {
      console.log('   (No service items found - you may need to create cost codes in QuickBooks)');
    }

    // Test 3: Get Recent Time Activities
    console.log('\n📋 Test 3: Fetching Recent Time Activities...');
    const timeResponse = await fetch(
      `${BASE_URL}/v3/company/${REALM_ID}/query?minorversion=75`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/text',
          'Accept': 'application/json'
        },
        body: "SELECT * FROM TimeActivity MAXRESULTS 5"
      }
    );

    if (!timeResponse.ok) {
      const error = await timeResponse.text();
      throw new Error(`Time Activities query failed: ${timeResponse.status} - ${error}`);
    }

    const timeData = await timeResponse.json();
    const activities = timeData.QueryResponse?.TimeActivity || [];
    
    console.log(`✅ Found ${timeData.QueryResponse?.totalCount || 0} total time activities (showing up to 5):\n`);
    
    if (activities.length > 0) {
      activities.forEach(ta => {
        console.log(`   Date: ${ta.TxnDate}`);
        console.log(`   Employee: ${ta.EmployeeRef?.name || ta.VendorRef?.name || 'N/A'}`);
        console.log(`   Customer: ${ta.CustomerRef?.name || 'N/A'}`);
        console.log(`   Hours: ${ta.Hours || 0}h ${ta.Minutes || 0}m`);
        console.log(`   Description: ${(ta.Description || 'N/A').substring(0, 50)}`);
        console.log(`   Billable: ${ta.BillableStatus}`);
        console.log('   ---');
      });
    } else {
      console.log('   (No time activities found)');
    }

    console.log('\n✅ All tests passed! QuickBooks connection is working.\n');

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    
    if (error.message.includes('401')) {
      console.error('\n💡 Access token may be expired. Get new tokens from OAuth Playground.');
    }
    
    process.exit(1);
  }
}

testConnection();
