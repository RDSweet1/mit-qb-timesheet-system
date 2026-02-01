# QuickBooks Time Integration Setup

**Goal:** Sync actual clock in/out times from QuickBooks Time (where they live until billed)

## Why We Need This

- ✅ **QB Time** has actual start/end times (clock in/out)
- ❌ **QB Online** only has duration (hours + minutes)
- 🎯 **Solution:** Sync from QB Time API to get real times

---

## Step 1: Add Database Columns

Run this in Supabase SQL Editor:
https://supabase.com/dashboard/project/migcpasmtbdojqphqyzc/sql

```sql
-- Add QB Time timesheet ID column
ALTER TABLE time_entries
ADD COLUMN IF NOT EXISTS qb_time_timesheet_id TEXT UNIQUE;

-- Add index for QB Time lookups
CREATE INDEX IF NOT EXISTS idx_time_entries_qb_time_id
ON time_entries(qb_time_timesheet_id);

-- Add QB Time sync timestamp
ALTER TABLE time_entries
ADD COLUMN IF NOT EXISTS qb_time_synced_at TIMESTAMPTZ;

-- Add comments
COMMENT ON COLUMN time_entries.qb_time_timesheet_id IS 'QuickBooks Time (TSheets) timesheet ID';
COMMENT ON COLUMN time_entries.qb_time_synced_at IS 'Last sync from QB Time API';
```

---

## Step 2: Get QB Time OAuth Credentials

### 2.1 Create QB Time App

1. Go to: https://developer.intuit.com
2. Create a new app (or use existing)
3. Enable **QuickBooks Time API** (separate from QB Online!)
4. Get your credentials:
   - Client ID
   - Client Secret

### 2.2 Authorize Access

Run this OAuth flow to get access token:

```bash
# 1. Get authorization URL
https://appcenter.intuit.com/connect/oauth2?client_id=YOUR_CLIENT_ID&redirect_uri=YOUR_REDIRECT&response_type=code&scope=openid profile email

# 2. User authorizes in browser
# 3. Exchange code for tokens
curl -X POST https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=YOUR_CODE&redirect_uri=YOUR_REDIRECT" \
  -u "CLIENT_ID:CLIENT_SECRET"
```

You'll get:
- `access_token` - Use this for API calls
- `refresh_token` - Use to get new access tokens

---

## Step 3: Configure Supabase Secrets

Add these environment variables in Supabase:
https://supabase.com/dashboard/project/migcpasmtbdojqphqyzc/settings/functions

```
QB_TIME_CLIENT_ID=your_client_id_here
QB_TIME_CLIENT_SECRET=your_client_secret_here
QB_TIME_ACCESS_TOKEN=your_access_token_here
QB_TIME_REFRESH_TOKEN=your_refresh_token_here
```

**Note:** These are SEPARATE from QB_CLIENT_ID, QB_ACCESS_TOKEN (QB Online)

---

## Step 4: Deploy QB Time Sync Function

The function is already created at:
`supabase/functions/qb-time-sync/index.ts`

Deploy it:

```powershell
cd C:\SourceCode\WeeklyTimeBillingQB
npx supabase functions deploy qb-time-sync
```

---

## Step 5: Test the Sync

Test script:

```powershell
$response = Invoke-RestMethod `
    -Uri "https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/qb-time-sync" `
    -Method POST `
    -Headers @{
        "Authorization" = "Bearer ANON_KEY"
        "Content-Type" = "application/json"
    } `
    -Body (@{
        startDate = "2025-12-01"
        endDate = "2025-12-31"
    } | ConvertTo-Json)

$response | ConvertTo-Json
```

Expected output:
```json
{
  "success": true,
  "synced": 96,
  "errors": 0,
  "total": 96,
  "dateRange": { "start": "2025-12-01", "end": "2025-12-31" }
}
```

---

## Step 6: Verify Start/End Times

Check database:

```sql
SELECT
    employee_name,
    txn_date,
    start_time,  -- Should now have values! ✅
    end_time,    -- Should now have values! ✅
    hours,
    minutes
FROM time_entries
WHERE qb_time_timesheet_id IS NOT NULL
LIMIT 5;
```

---

## What This Fixes

**Before (QB Online sync):**
```
start_time: NULL
end_time: NULL
hours: 1
minutes: 44
Display: "1h 44m" (lump sum) ❌
```

**After (QB Time sync):**
```
start_time: "09:15:00"
end_time: "10:59:00"
hours: 1
minutes: 44
Display: "9:15 AM - 10:59 AM (1h 44m)" ✅
```

---

## Next Steps

After QB Time sync works:

1. **Update Frontend** - Display start/end times instead of just duration
2. **Dual Sync Strategy** - Sync from both:
   - QB Time → actual times
   - QB Online → billing status, customer info
3. **Matching Logic** - Link same entry from both systems

---

## Need Help?

QuickBooks Time API Docs: https://tsheetsteam.github.io/api_docs/

Common Issues:
- **401 Unauthorized** - Access token expired, use refresh token
- **No data** - Check date range, verify QB Time has entries
- **Missing times** - Entries might be "on the clock" (not ended yet)
