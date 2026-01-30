# QuickBooks Online OAuth 2.0 Setup Guide

## Step 1: Create Developer Account & App

1. **Go to Intuit Developer Portal**
   - https://developer.intuit.com
   - Sign in or create account (use your Intuit/QuickBooks credentials)

2. **Create a New App**
   - Click **Dashboard** → **Create an App**
   - Select **QuickBooks Online and Payments**
   - Enter App Name (e.g., "Timesheet Invoicing System")
   - Select Scope: **Accounting** (`com.intuit.quickbooks.accounting`)
   - Click **Create App**

3. **Get Your Credentials**
   - Go to **Keys & OAuth** tab
   - You'll see two environments:
     - **Development** (Sandbox) — for testing
     - **Production** — for real data
   - Copy these for each environment:
     - **Client ID**
     - **Client Secret**

4. **Add Redirect URI**
   - Under **Redirect URIs**, add your callback URL
   - For initial setup/testing, you can use Intuit's OAuth Playground:
     ```
     https://developer.intuit.com/v2/OAuth2Playground/RedirectUrl
     ```
   - For production, add your actual callback (e.g., `https://your-app.com/api/qb/callback`)

---

## Step 2: Get Initial Tokens (Using OAuth Playground)

The easiest way to get your first access/refresh tokens:

1. **Go to OAuth 2.0 Playground**
   - https://developer.intuit.com/app/developer/playground

2. **Select Your App**
   - Choose the app you just created
   - Select scope: **Accounting**

3. **Connect to QuickBooks**
   - Click **Get authorization code**
   - Log into your QuickBooks account
   - Select the company to connect
   - Authorize the app

4. **Get Tokens**
   - Click **Get tokens**
   - You'll receive:
     - **Access Token** (expires in 1 hour)
     - **Refresh Token** (expires in ~100 days)
     - **Realm ID** (your QuickBooks Company ID)

5. **Save These Immediately!**
   - Store in Azure Key Vault (per our spec):
     ```
     qb-access-token = <access token>
     qb-refresh-token = <refresh token>
     qb-realm-id = <realm id>
     qb-token-expires-at = <current time + 1 hour>
     ```

---

## Step 3: Understanding the OAuth Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        INITIAL AUTHORIZATION                         │
│                        (One-time, manual)                           │
│                                                                     │
│  1. User clicks "Connect to QuickBooks"                             │
│     ↓                                                               │
│  2. Redirect to Intuit authorization URL:                           │
│     https://appcenter.intuit.com/connect/oauth2                     │
│       ?client_id=YOUR_CLIENT_ID                                     │
│       &scope=com.intuit.quickbooks.accounting                       │
│       &redirect_uri=YOUR_CALLBACK_URL                               │
│       &response_type=code                                           │
│       &state=random_state_string                                    │
│     ↓                                                               │
│  3. User logs into QuickBooks, selects company, approves            │
│     ↓                                                               │
│  4. Intuit redirects back to YOUR_CALLBACK_URL with:                │
│       ?code=AUTHORIZATION_CODE&state=random_state_string&realmId=XX │
│     ↓                                                               │
│  5. Exchange code for tokens (POST to token endpoint)               │
│     ↓                                                               │
│  6. Store access_token, refresh_token, realm_id in Key Vault        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        ONGOING API CALLS                            │
│                        (Automated)                                  │
│                                                                     │
│  1. Get tokens from Key Vault                                       │
│     ↓                                                               │
│  2. Check if access_token expired                                   │
│     ↓                                                               │
│  3a. If expired → Refresh tokens (POST to token endpoint)           │
│      → Save NEW refresh_token to Key Vault (it rotates!)            │
│     ↓                                                               │
│  3b. If valid → Use access_token                                    │
│     ↓                                                               │
│  4. Make API call with Bearer token                                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Step 4: Token Exchange Code

### Initial Code → Token Exchange

```typescript
// Exchange authorization code for tokens
async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const response = await fetch(
    "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "Authorization": `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirectUri
      })
    }
  );
  
  const data = await response.json();
  
  // data contains:
  // {
  //   "access_token": "eyJlbmMi...",
  //   "refresh_token": "AB11234...",
  //   "token_type": "bearer",
  //   "expires_in": 3600,           // 1 hour
  //   "x_refresh_token_expires_in": 8726400  // ~100 days
  // }
  
  return data;
}
```

### Refresh Token (Automated)

```typescript
// Refresh expired access token
async function refreshAccessToken(refreshToken: string) {
  const response = await fetch(
    "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "Authorization": `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken
      })
    }
  );
  
  const data = await response.json();
  
  // CRITICAL: Save the NEW refresh_token!
  // Intuit may rotate it on every refresh
  // data.refresh_token may be different from what you sent
  
  return data;
}
```

---

## Step 5: API Endpoints Reference

| Purpose | URL |
|---------|-----|
| Authorization | `https://appcenter.intuit.com/connect/oauth2` |
| Token Exchange/Refresh | `https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer` |
| Sandbox API Base | `https://sandbox-quickbooks.api.intuit.com` |
| Production API Base | `https://quickbooks.api.intuit.com` |
| Revoke Token | `https://developer.api.intuit.com/v2/oauth2/tokens/revoke` |

---

## Step 6: Quick Start Checklist

### Development/Sandbox Setup
- [ ] Create Intuit Developer account
- [ ] Create app with Accounting scope
- [ ] Copy Development Client ID & Secret
- [ ] Add redirect URI for OAuth Playground
- [ ] Use OAuth Playground to get initial tokens
- [ ] Note your Sandbox Realm ID
- [ ] Store tokens in Azure Key Vault

### Production Setup
- [ ] Switch to Production settings in your app
- [ ] Copy Production Client ID & Secret
- [ ] Add production redirect URI
- [ ] Complete OAuth flow with real QuickBooks account
- [ ] Note your Production Realm ID
- [ ] Store production tokens in Key Vault (separate secrets)

---

## Common Issues & Solutions

### "invalid_grant" Error
- Authorization code expired (they're single-use and expire in ~10 minutes)
- Redirect URI doesn't match exactly (check trailing slashes, http vs https)
- Code already used

### "invalid_client" Error
- Wrong Client ID or Secret
- Using Development credentials against Production or vice versa

### Refresh Token Stops Working
- Refresh tokens expire after ~100 days if not used
- **Solution:** Set up daily cron job to proactively refresh (per our spec)

### "Token is not valid" on API Calls
- Access token expired (they last 1 hour)
- Using wrong Realm ID
- Missing `?minorversion=75` on API calls

---

## Environment Variables to Set

```bash
# QuickBooks OAuth
QB_CLIENT_ID=ABxxxxxxxxxxxxxxxxxxxxxxxx
QB_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx

# For Azure Key Vault (stores the tokens)
AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_KV_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_KV_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
AZURE_VAULT_NAME=your-vault-name
```

---

## Next Steps After OAuth Setup

1. **Test API Connection**
   ```bash
   curl -X GET \
     "https://sandbox-quickbooks.api.intuit.com/v3/company/YOUR_REALM_ID/companyinfo/YOUR_REALM_ID?minorversion=75" \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
     -H "Accept: application/json"
   ```

2. **Sync Service Items** (get your cost codes)
   ```bash
   curl -X POST \
     "https://sandbox-quickbooks.api.intuit.com/v3/company/YOUR_REALM_ID/query?minorversion=75" \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
     -H "Content-Type: application/text" \
     -H "Accept: application/json" \
     -d "SELECT * FROM Item WHERE Type = 'Service'"
   ```

3. **Deploy Edge Functions**
   - Start with `sync-service-items` 
   - Then `qb-time-sync`
   - Test before enabling invoice creation
