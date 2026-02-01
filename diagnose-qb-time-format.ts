/**
 * Diagnostic script to check QB TimeActivity response format
 * Run this in Supabase Edge Function to see actual QB API response
 */

import { qbQuery } from './supabase/functions/_shared/qb-auth.ts';

const qbConfig = {
  clientId: Deno.env.get('QB_CLIENT_ID') ?? '',
  clientSecret: Deno.env.get('QB_CLIENT_SECRET') ?? '',
  environment: 'production' as 'sandbox' | 'production'
};

const tokens = {
  accessToken: Deno.env.get('QB_ACCESS_TOKEN') ?? '',
  refreshToken: Deno.env.get('QB_REFRESH_TOKEN') ?? '',
  realmId: Deno.env.get('QB_REALM_ID') ?? ''
};

// Query one time entry
const query = "SELECT * FROM TimeActivity WHERE TxnDate >= '2025-12-01' MAXRESULTS 1";

const result = await qbQuery(query, tokens, qbConfig);
const timeActivity = result.QueryResponse?.TimeActivity?.[0];

console.log('=== FULL QB TIME ACTIVITY RESPONSE ===');
console.log(JSON.stringify(timeActivity, null, 2));

console.log('\n=== KEY FIELDS ===');
console.log('StartTime:', timeActivity?.StartTime);
console.log('EndTime:', timeActivity?.EndTime);
console.log('Hours:', timeActivity?.Hours);
console.log('Minutes:', timeActivity?.Minutes);
console.log('TxnDate:', timeActivity?.TxnDate);

console.log('\n=== ALL FIELDS ===');
Object.keys(timeActivity || {}).forEach(key => {
  console.log(`${key}:`, timeActivity[key]);
});
