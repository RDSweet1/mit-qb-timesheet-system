/**
 * Sync Customer Emails from QuickBooks Online
 * Pulls PrimaryEmailAddr from QB Customer records and updates the customers table.
 * Schedule: pg_cron Sunday 8:00 PM EST (or manual)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { loadQBTokens, qbQuery } from '../_shared/qb-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Load QB tokens (DB first, then env vars)
    const { tokens, config } = await loadQBTokens();

    console.log('Syncing customer emails from QuickBooks...');

    // Query all active customers with email addresses
    const query = `SELECT Id, DisplayName, FullyQualifiedName, PrimaryEmailAddr, CompanyName, Active FROM Customer WHERE Active = true MAXRESULTS 1000`;
    const qbData = await qbQuery(query, tokens, config);

    const customers = qbData.QueryResponse?.Customer || [];
    console.log(`Found ${customers.length} active QB customers`);

    let emailsFound = 0;
    let emailsUpdated = 0;
    let matchErrors = 0;

    // Get all our customers for matching
    const { data: ourCustomers } = await supabase
      .from('customers')
      .select('id, qb_customer_id, display_name, email');

    // Build multiple lookups: by QB numeric Id, by DisplayName, and by FullyQualifiedName
    // Our qb_customer_id may contain: numeric QB ID (from qb-online-sync) OR
    // jobcode name (from qb-time-sync, e.g. "AccessResto.Tarflower.VedderPrice")
    const lookupById: Record<string, { id: number; currentEmail: string | null; name: string }> = {};
    const lookupByName: Record<string, { id: number; currentEmail: string | null; name: string }> = {};
    for (const c of ourCustomers || []) {
      const entry = { id: c.id, currentEmail: c.email, name: c.qb_customer_id };
      lookupById[c.qb_customer_id] = entry;
      // Also index by display_name for fuzzy matching
      if (c.display_name) {
        lookupByName[c.display_name.toLowerCase()] = entry;
      }
    }

    const noMatch: string[] = [];

    for (const qbCust of customers) {
      const email = qbCust.PrimaryEmailAddr?.Address;
      if (!email) continue;
      emailsFound++;

      // Try matching strategies:
      // 1. By QB Id (numeric, stored as qb_customer_id by qb-online-sync)
      // 2. By DisplayName (stored as qb_customer_id by qb-time-sync)
      // 3. By FullyQualifiedName (QB uses ":" separator, our table uses "." separator)
      // 4. By display_name case-insensitive match
      let match = lookupById[qbCust.Id]
        || lookupById[qbCust.DisplayName]
        || lookupById[qbCust.FullyQualifiedName]
        || lookupById[qbCust.FullyQualifiedName?.replace(/:/g, '.')]
        || lookupByName[qbCust.DisplayName?.toLowerCase()];

      if (!match) {
        noMatch.push(qbCust.DisplayName);
        continue;
      }

      // Skip if email hasn't changed
      if (match.currentEmail === email) continue;

      const { error } = await supabase
        .from('customers')
        .update({
          email,
          synced_at: new Date().toISOString(),
        })
        .eq('id', match.id);

      if (error) {
        console.error(`Error updating email for ${qbCust.DisplayName}:`, error.message);
        matchErrors++;
      } else {
        emailsUpdated++;
        console.log(`Updated email for ${qbCust.DisplayName}: ${email}`);
      }
    }

    if (noMatch.length > 0) {
      console.log(`No match for ${noMatch.length} QB customers: ${noMatch.slice(0, 10).join(', ')}${noMatch.length > 10 ? '...' : ''}`);
    }

    console.log(`Done: ${emailsFound} emails found, ${emailsUpdated} updated, ${matchErrors} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        total_qb_customers: customers.length,
        emails_found: emailsFound,
        emails_updated: emailsUpdated,
        errors: matchErrors,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error syncing customer emails:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
