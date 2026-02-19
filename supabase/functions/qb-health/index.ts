/**
 * qb-health — Comprehensive connectivity and staleness health check.
 *
 * Probes:
 *   1. QB Online API (CompanyInfo query — lightweight, read-only)
 *   2. QB Time / Workforce API (current_user endpoint)
 *   3. Token freshness (qb_tokens.updated_at vs. now)
 *   4. Supabase write health (insert + delete test row in function_metrics)
 *   5. Sync staleness for all sync-driven tables
 *
 * Returns a structured report with pass/fail per probe and an overall status.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { loadQBTokens, qbApiCall } from '../_shared/qb-auth.ts';
import { fetchWithRetry } from '../_shared/fetch-retry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProbeResult {
  status: 'pass' | 'fail' | 'warn';
  message: string;
  latencyMs?: number;
  detail?: Record<string, unknown>;
}

/**
 * Probe 1: QB Online API — hit CompanyInfo (cheapest read-only endpoint).
 */
async function probeQBOnline(tokens: any, config: any): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const endpoint = `/v3/company/${tokens.realmId}/companyinfo/${tokens.realmId}?minorversion=75`;
    const response = await qbApiCall(endpoint, tokens, config, { method: 'GET' });
    const latencyMs = Date.now() - start;

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown');
      return {
        status: 'fail',
        message: `QB Online returned ${response.status}`,
        latencyMs,
        detail: { statusCode: response.status, error: errorText.substring(0, 200) },
      };
    }

    const data = await response.json();
    const companyName = data?.CompanyInfo?.CompanyName || 'unknown';
    return {
      status: 'pass',
      message: `Connected to "${companyName}"`,
      latencyMs,
      detail: { companyName, realmId: tokens.realmId },
    };
  } catch (err) {
    return {
      status: 'fail',
      message: `QB Online error: ${err.message}`,
      latencyMs: Date.now() - start,
    };
  }
}

/**
 * Probe 2: QB Time / Workforce API — hit current_user endpoint.
 */
async function probeQBTime(): Promise<ProbeResult> {
  const token = Deno.env.get('QB_TIME_ACCESS_TOKEN') ?? '';
  if (!token) {
    return { status: 'fail', message: 'QB_TIME_ACCESS_TOKEN env var is not set' };
  }

  const start = Date.now();
  try {
    const response = await fetchWithRetry(
      'https://rest.tsheets.com/api/v1/current_user',
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      },
      { label: 'QB Time Health', maxRetries: 1 }
    );
    const latencyMs = Date.now() - start;

    if (!response.ok) {
      return {
        status: 'fail',
        message: `Workforce API returned ${response.status}`,
        latencyMs,
        detail: { statusCode: response.status },
      };
    }

    const data = await response.json();
    const users = data?.results?.users || {};
    const firstUser = Object.values(users)[0] as any;
    const companyName = firstUser?.company_name || 'unknown';
    return {
      status: 'pass',
      message: `Workforce API connected (${companyName})`,
      latencyMs,
      detail: { companyName },
    };
  } catch (err) {
    return {
      status: 'fail',
      message: `Workforce API error: ${err.message}`,
      latencyMs: Date.now() - start,
    };
  }
}

/**
 * Probe 3: Token freshness — check qb_tokens.updated_at and expires_at.
 */
async function probeTokenFreshness(supabase: any): Promise<ProbeResult> {
  try {
    const { data, error } = await supabase
      .from('qb_tokens')
      .select('updated_at, expires_at')
      .eq('id', 'production')
      .single();

    if (error || !data) {
      return {
        status: 'fail',
        message: 'No QB token record found in database',
        detail: { error: error?.message },
      };
    }

    const updatedAt = new Date(data.updated_at);
    const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
    const now = new Date();
    const ageMinutes = Math.round((now.getTime() - updatedAt.getTime()) / 60000);
    const ageDays = (ageMinutes / 1440).toFixed(1);

    // Access token expires ~1hr — warn if it's been more than 50min since refresh
    // Refresh token expires ~101 days — fail if token is older than 90 days
    let status: 'pass' | 'warn' | 'fail' = 'pass';
    let message = `Token last refreshed ${ageMinutes}min ago (${ageDays} days)`;

    if (ageMinutes > 90 * 1440) {
      // Over 90 days — refresh token likely expired or near expiry
      status = 'fail';
      message = `CRITICAL: Token is ${ageDays} days old — refresh token may be expired`;
    } else if (ageMinutes > 60 * 1440) {
      // Over 60 days — getting stale
      status = 'warn';
      message = `Token is ${ageDays} days old — refresh within 30 days to avoid expiry`;
    }

    return {
      status,
      message,
      detail: {
        updatedAt: data.updated_at,
        expiresAt: data.expires_at,
        ageMinutes,
        ageDays: parseFloat(ageDays),
      },
    };
  } catch (err) {
    return { status: 'fail', message: `Token check error: ${err.message}` };
  }
}

/**
 * Probe 4: Supabase write health — insert and immediately delete a test row.
 */
async function probeSupabaseWrite(supabase: any): Promise<ProbeResult> {
  const start = Date.now();
  try {
    // Insert
    const { data, error: insertErr } = await supabase
      .from('function_metrics')
      .insert({
        function_name: 'qb-health-probe',
        status: 'success',
        duration_ms: 0,
      })
      .select('id')
      .single();

    if (insertErr) {
      return {
        status: 'fail',
        message: `Supabase INSERT failed: ${insertErr.message}`,
        latencyMs: Date.now() - start,
      };
    }

    // Delete the probe row
    const { error: deleteErr } = await supabase
      .from('function_metrics')
      .delete()
      .eq('id', data.id);

    const latencyMs = Date.now() - start;

    if (deleteErr) {
      return {
        status: 'warn',
        message: `Supabase write OK but cleanup failed: ${deleteErr.message}`,
        latencyMs,
      };
    }

    return {
      status: 'pass',
      message: 'Supabase read/write healthy',
      latencyMs,
    };
  } catch (err) {
    return {
      status: 'fail',
      message: `Supabase write error: ${err.message}`,
      latencyMs: Date.now() - start,
    };
  }
}

/**
 * Probe 5: Sync staleness — check most recent synced_at for each data table.
 */
async function probeSyncStaleness(supabase: any): Promise<ProbeResult> {
  const tables = [
    { table: 'time_entries', dateCol: 'synced_at', label: 'Time Entries' },
    { table: 'qb_payments', dateCol: 'synced_at', label: 'QB Payments' },
    { table: 'qb_deposits', dateCol: 'synced_at', label: 'QB Deposits' },
    { table: 'qb_invoice_balances', dateCol: 'synced_at', label: 'Invoice Balances' },
    { table: 'overhead_transactions', dateCol: 'synced_at', label: 'Overhead Transactions' },
  ];

  const now = new Date();
  const results: Record<string, { lastSynced: string | null; ageHours: number | null; status: string }> = {};
  let worstStatus: 'pass' | 'warn' | 'fail' = 'pass';
  const staleItems: string[] = [];

  for (const { table, dateCol, label } of tables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select(dateCol)
        .not(dateCol, 'is', null)
        .order(dateCol, { ascending: false })
        .limit(1);

      if (error) {
        results[label] = { lastSynced: null, ageHours: null, status: `error: ${error.message}` };
        continue;
      }

      if (!data || data.length === 0) {
        results[label] = { lastSynced: null, ageHours: null, status: 'no data' };
        continue;
      }

      const lastSynced = new Date(data[0][dateCol]);
      const ageHours = Math.round((now.getTime() - lastSynced.getTime()) / 3600000);

      let tableStatus = 'fresh';
      if (ageHours > 168) {
        // Over 7 days — stale
        tableStatus = 'stale';
        staleItems.push(`${label} (${ageHours}h)`);
        if (worstStatus !== 'fail') worstStatus = 'warn';
      } else if (ageHours > 48) {
        tableStatus = 'aging';
      }

      results[label] = {
        lastSynced: data[0][dateCol],
        ageHours,
        status: tableStatus,
      };
    } catch (err) {
      results[label] = { lastSynced: null, ageHours: null, status: `error: ${err.message}` };
    }
  }

  const message = staleItems.length > 0
    ? `${staleItems.length} table(s) stale: ${staleItems.join(', ')}`
    : 'All synced tables are fresh';

  return {
    status: worstStatus,
    message,
    detail: results as unknown as Record<string, unknown>,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, serviceKey);

    // Load QB Online tokens
    let qbOnlineResult: ProbeResult;
    try {
      const { tokens, config } = await loadQBTokens();
      qbOnlineResult = await probeQBOnline(tokens, config);
    } catch (err) {
      qbOnlineResult = { status: 'fail', message: `Token load failed: ${err.message}` };
    }

    // Run remaining probes in parallel
    const [qbTimeResult, tokenResult, writeResult, stalenessResult] = await Promise.all([
      probeQBTime(),
      probeTokenFreshness(supabase),
      probeSupabaseWrite(supabase),
      probeSyncStaleness(supabase),
    ]);

    const probes = {
      qb_online: qbOnlineResult,
      qb_time: qbTimeResult,
      token_freshness: tokenResult,
      supabase_write: writeResult,
      sync_staleness: stalenessResult,
    };

    // Overall status: fail if any probe fails, warn if any warns
    const allStatuses = Object.values(probes).map(p => p.status);
    let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (allStatuses.includes('fail')) overall = 'unhealthy';
    else if (allStatuses.includes('warn')) overall = 'degraded';

    const response = {
      status: overall,
      timestamp: new Date().toISOString(),
      probes,
    };

    console.log(`qb-health: ${overall}`, JSON.stringify(response, null, 2));

    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: overall === 'unhealthy' ? 503 : 200,
      }
    );
  } catch (error) {
    console.error('qb-health error:', error);
    return new Response(
      JSON.stringify({ status: 'unhealthy', error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
