/**
 * QB Reports — Pull financial reports from QuickBooks Online
 * Supports: ProfitAndLoss, BalanceSheet, etc.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { qbApiCall, loadQBTokens, type QBTokens, type QBConfig } from '../_shared/qb-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { report, startDate, endDate, summarizeBy } = await req.json();

    // Load tokens from DB (with env var fallback)
    const loaded = await loadQBTokens();
    const tokens = loaded.tokens;
    const config = loaded.config;

    const reportType = report || 'ProfitAndLoss';
    const start = startDate || '2026-01-01';
    const end = endDate || new Date().toISOString().split('T')[0];
    const summary = summarizeBy || 'Total';

    const endpoint = `/v3/company/${tokens.realmId}/reports/${reportType}?start_date=${start}&end_date=${end}&summarize_by=${summary}&minorversion=75`;

    console.log(`Fetching QB report: ${reportType} from ${start} to ${end}`);

    const response = await qbApiCall(endpoint, tokens, config, { method: 'GET' });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`QB report failed: ${response.status} - ${error}`);
    }

    const data = await response.json();

    return new Response(
      JSON.stringify({ success: true, report: data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Error fetching QB report:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
