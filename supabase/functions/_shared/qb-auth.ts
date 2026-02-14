/**
 * QuickBooks OAuth and Token Management
 * Shared utility for all QB API calls
 *
 * Token persistence: After auto-refresh, new tokens are saved to the
 * qb_tokens table so the next function invocation uses current tokens.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchWithRetry } from './fetch-retry.ts';

export interface QBTokens {
  accessToken: string;
  refreshToken: string;
  realmId: string;
  expiresAt?: number;
}

export interface QBConfig {
  clientId: string;
  clientSecret: string;
  environment: 'sandbox' | 'production';
}

/**
 * Load QB tokens from database (falls back to env vars if not in DB)
 */
export async function loadQBTokens(): Promise<{ tokens: QBTokens; config: QBConfig }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data } = await supabase
    .from('qb_tokens')
    .select('*')
    .eq('id', 'production')
    .single();

  if (data) {
    console.log('🔑 QB Auth: Loaded tokens from database (updated: ' + data.updated_at + ')');
    return {
      tokens: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        realmId: data.realm_id,
      },
      config: {
        clientId: data.client_id,
        clientSecret: data.client_secret,
        environment: 'production',
      }
    };
  }

  // Fall back to env vars
  console.log('🔑 QB Auth: No DB tokens found, using env vars');
  return {
    tokens: {
      accessToken: Deno.env.get('QB_ACCESS_TOKEN') ?? '',
      refreshToken: Deno.env.get('QB_REFRESH_TOKEN') ?? '',
      realmId: Deno.env.get('QB_REALM_ID') ?? '',
    },
    config: {
      clientId: Deno.env.get('QB_CLIENT_ID') ?? '',
      clientSecret: Deno.env.get('QB_CLIENT_SECRET') ?? '',
      environment: (Deno.env.get('QB_ENVIRONMENT') ?? 'production') as 'production' | 'sandbox',
    }
  };
}

/**
 * Save refreshed QB tokens to database for persistence across invocations
 */
async function saveQBTokens(tokens: QBTokens, config: QBConfig): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, serviceKey);

    const { error } = await supabase
      .from('qb_tokens')
      .upsert({
        id: 'production',
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        realm_id: tokens.realmId,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error('❌ QB Auth: Failed to save tokens to DB:', error.message);
    } else {
      console.log('💾 QB Auth: Tokens saved to database');
    }
  } catch (e) {
    console.error('❌ QB Auth: Error saving tokens:', e.message);
  }
}

/**
 * Get QB API base URL based on environment
 */
export function getQBBaseUrl(environment: string): string {
  return environment === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
}

/**
 * Refresh QB access token
 */
export async function refreshQBTokens(
  refreshToken: string,
  config: QBConfig
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  console.log('🔄 QB Auth: Refreshing access token...');
  const authHeader = btoa(`${config.clientId}:${config.clientSecret}`);

  const response = await fetch(
    'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Authorization': `Basic ${authHeader}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    const intuitTid = response.headers.get('intuit_tid');
    console.error(`❌ QB Auth: Token refresh failed: ${response.status}`, { error, intuit_tid: intuitTid });
    throw new Error(`Token refresh failed: ${response.status} - ${error} [intuit_tid: ${intuitTid}]`);
  }

  const data = await response.json();
  console.log('✅ QB Auth: Token refreshed successfully', { expiresIn: data.expires_in });

  // IMPORTANT: Refresh token may rotate!
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token, // This might be different from input!
    expiresIn: data.expires_in
  };
}

/**
 * Make authenticated QB API call with automatic token refresh
 */
export async function qbApiCall(
  endpoint: string,
  tokens: QBTokens,
  config: QBConfig,
  options: RequestInit = {}
): Promise<Response> {
  const baseUrl = getQBBaseUrl(config.environment);
  const url = `${baseUrl}${endpoint}`;

  console.log(`🌐 QB API: ${options.method || 'GET'} ${endpoint}`);

  // Try with current token (retry on transient errors)
  let response = await fetchWithRetry(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${tokens.accessToken}`,
      'Accept': 'application/json',
      ...options.headers
    }
  }, { label: 'QB API', maxRetries: 3 });

  console.log(`📡 QB API: Response status ${response.status}`);

  // If 401, refresh token and retry
  if (response.status === 401) {
    console.log('⚠️  QB API: Access token expired, refreshing...');

    const newTokens = await refreshQBTokens(tokens.refreshToken, config);

    // Persist new tokens so the next function invocation has them
    tokens.accessToken = newTokens.accessToken;
    tokens.refreshToken = newTokens.refreshToken;
    await saveQBTokens(tokens, config);

    console.log('🔄 QB API: Retrying request with new token...');

    // Retry with new token
    response = await fetchWithRetry(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'Accept': 'application/json',
        ...options.headers
      }
    }, { label: 'QB API (after refresh)', maxRetries: 3 });

    console.log(`📡 QB API: Retry response status ${response.status}`);
  }

  return response;
}

/**
 * Query QB using SQL-like syntax
 */
export async function qbQuery(
  query: string,
  tokens: QBTokens,
  config: QBConfig
): Promise<any> {
  console.log(`🔍 QB Query: Executing - ${query}`);

  const response = await qbApiCall(
    `/v3/company/${tokens.realmId}/query?minorversion=75`,
    tokens,
    config,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/text'
      },
      body: query
    }
  );

  if (!response.ok) {
    const error = await response.text();
    const intuitTid = response.headers.get('intuit_tid');
    console.error(`❌ QB Query failed: ${response.status}`, { error, intuit_tid: intuitTid, query });
    throw new Error(`QB Query failed: ${response.status} - ${error} [intuit_tid: ${intuitTid}]`);
  }

  const data = await response.json();
  const recordCount = data.QueryResponse?.totalCount || Object.keys(data.QueryResponse || {}).reduce((sum, key) => {
    const value = data.QueryResponse[key];
    return sum + (Array.isArray(value) ? value.length : 0);
  }, 0);

  console.log(`✅ QB Query: Success - ${recordCount} records returned`);

  return data;
}

/**
 * Create entity in QB (POST)
 */
export async function qbCreate(
  entityType: string,
  data: any,
  tokens: QBTokens,
  config: QBConfig
): Promise<any> {
  const response = await qbApiCall(
    `/v3/company/${tokens.realmId}/${entityType}?minorversion=75`,
    tokens,
    config,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    }
  );

  if (!response.ok) {
    const error = await response.text();
    const intuitTid = response.headers.get('intuit_tid');
    console.error(`QB Create failed: ${response.status} - ${error}`, { intuit_tid: intuitTid });
    throw new Error(`QB Create failed: ${response.status} - ${error} [intuit_tid: ${intuitTid}]`);
  }

  return await response.json();
}

/**
 * Update entity in QB (POST with sparse update)
 */
export async function qbUpdate(
  entityType: string,
  data: any,
  tokens: QBTokens,
  config: QBConfig
): Promise<any> {
  const response = await qbApiCall(
    `/v3/company/${tokens.realmId}/${entityType}?minorversion=75`,
    tokens,
    config,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ...data, sparse: true })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    const intuitTid = response.headers.get('intuit_tid');
    console.error(`QB Update failed: ${response.status} - ${error}`, { intuit_tid: intuitTid });
    throw new Error(`QB Update failed: ${response.status} - ${error} [intuit_tid: ${intuitTid}]`);
  }

  return await response.json();
}
