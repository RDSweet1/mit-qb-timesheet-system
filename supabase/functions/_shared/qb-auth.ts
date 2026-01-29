/**
 * QuickBooks OAuth and Token Management
 * Shared utility for all QB API calls
 */

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
    throw new Error(`Token refresh failed: ${response.status} - ${error}`);
  }

  const data = await response.json();

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

  // Try with current token
  let response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${tokens.accessToken}`,
      'Accept': 'application/json',
      ...options.headers
    }
  });

  // If 401, refresh token and retry
  if (response.status === 401) {
    console.log('Access token expired, refreshing...');

    const newTokens = await refreshQBTokens(tokens.refreshToken, config);

    // TODO: Save new tokens to storage (Key Vault or Supabase)
    // For now, just use them for retry
    tokens.accessToken = newTokens.accessToken;
    tokens.refreshToken = newTokens.refreshToken;

    // Retry with new token
    response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'Accept': 'application/json',
        ...options.headers
      }
    });
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
    throw new Error(`QB Query failed: ${response.status} - ${error}`);
  }

  return await response.json();
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
    throw new Error(`QB Create failed: ${response.status} - ${error}`);
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
    throw new Error(`QB Update failed: ${response.status} - ${error}`);
  }

  return await response.json();
}
