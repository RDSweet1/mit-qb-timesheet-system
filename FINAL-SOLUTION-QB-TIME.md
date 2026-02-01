# FINAL SOLUTION: Get Clock Times from QuickBooks Time API

## The Problem (Confirmed)

✅ Workforce creates clock in/out entries
✅ QB Online UI shows the times
❌ QB Online API returns NULL for StartTime/EndTime
❌ All 96+ entries in database have `start_time: NULL`, `end_time: NULL`

## The Solution

Access clock times via **QuickBooks Time API** (which Workforce syncs to).

---

## Step 1: Verify QB Time Access

Since you use Workforce (now integrated in QB Online), you have QB Time.

**Test access:**
1. Go to: https://quickbooks.intuit.com/app/time
2. OR: https://app.tsheets.com
3. Login with your QB credentials
4. You should see time entries with clock in/out times

If you can access this, you have QB Time! ✅

---

## Step 2: Get QB Time API Token

### Option A: Quick OAuth Flow (5 minutes)

Run this script:
```powershell
cd C:\SourceCode\WeeklyTimeBillingQB
.\get-qb-time-token.ps1
```

It will:
1. Open browser for authorization
2. You authorize QB Time access
3. Copy the authorization code
4. Paste into PowerShell
5. Get access token → Save to file

### Option B: Manual via Intuit Developer Portal

1. Go to: https://developer.intuit.com
2. Select your app (or create new one)
3. Add **QuickBooks Time** scope:
   - `com.intuit.quickbooks.payroll.timetracking`
4. Run OAuth flow with new scope
5. Get access token

---

## Step 3: Configure Supabase Secret

Add token to Supabase Edge Functions:
https://supabase.com/dashboard/project/migcpasmtbdojqphqyzc/settings/functions

Click "Add new secret":
```
Name: QB_TIME_ACCESS_TOKEN
Value: [paste your token here]
```

---

## Step 4: Add Database Column

Run this in Supabase SQL Editor:
https://supabase.com/dashboard/project/migcpasmtbdojqphqyzc/sql

```sql
-- Add QB Time columns (if not exists)
ALTER TABLE time_entries
ADD COLUMN IF NOT EXISTS qb_time_timesheet_id TEXT UNIQUE;

ALTER TABLE time_entries
ADD COLUMN IF NOT EXISTS qb_time_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_time_entries_qb_time_id
ON time_entries(qb_time_timesheet_id);
```

---

## Step 5: Deploy QB Time Sync Function

Already created! Just deploy:

```powershell
cd C:\SourceCode\WeeklyTimeBillingQB
npx supabase functions deploy qb-time-sync
```

---

## Step 6: Sync from QB Time

Test the sync:

```powershell
$response = Invoke-RestMethod `
    -Uri "https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/qb-time-sync" `
    -Method POST `
    -Headers @{
        "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZ2NwYXNtdGJkb2pxcGhxeXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2OTk3MjYsImV4cCI6MjA4NTI3NTcyNn0.90w8O2oX76uPTuFp092jTCZoL95lJ7YnaOPMGcRP2fQ"
        "Content-Type" = "application/json"
    } `
    -Body '{"startDate":"2025-12-01","endDate":"2025-12-31"}'

$response | ConvertTo-Json
```

Expected result:
```json
{
  "success": true,
  "synced": 96,
  "errors": 0
}
```

---

## Step 7: Verify Times Populated

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

Expected result:
```
employee_name   | txn_date   | start_time | end_time | hours | minutes
----------------|------------|------------|----------|-------|--------
Fred Ferraiuolo | 2025-12-31 | 09:15:00   | 10:59:00 | 1     | 44
```

---

## Step 8: Update Frontend

Modify time entry display to show:
- **If has start/end**: "9:15 AM - 10:59 AM (1h 44m)"
- **If lump sum only**: "1h 44m"

---

## Why Both QB Online AND QB Time?

You need BOTH syncs because they provide different data:

| Data | QB Online API | QB Time API |
|------|---------------|-------------|
| Start/End Times | ❌ NULL | ✅ Has times |
| Customer | ✅ Has | ❌ May not have |
| Billing Status | ✅ Has | ❌ No |
| Invoice Link | ✅ Has | ❌ No |
| Lump Sum Entries | ✅ Has | ❌ May not have |

**Strategy:**
1. Sync from QB Time → Get clock times
2. Sync from QB Online → Get billing data
3. Match entries by date + employee + duration
4. Merge data in database

---

## Files Ready

Already created and committed:
- ✅ `supabase/functions/qb-time-sync/index.ts`
- ✅ `sql/add-qb-time-columns.sql`
- ✅ `get-qb-time-token.ps1`
- ✅ `test-qb-time-api.ps1`

Just need the QB Time token to proceed!

---

## Sources

- [Powerful time & payroll tracking with the Time API](https://blogs.intuit.com/2025/11/24/powerful-time-payroll-tracking-with-the-time-api-payroll-compensation/)
- [The QuickBooks Time app is now QuickBooks Workforce](https://quickbooks.intuit.com/r/product-update/workforce-app/)
- [QuickBooks Time API Reference](https://tsheetsteam.github.io/api_docs/)
- [How to Set Up QuickBooks Time in QuickBooks Online](https://www.dancingnumbers.com/set-up-quickbooks-time-quickbooks-online/)

---

## Ready to Start?

Let me know when you want to:
1. Run the OAuth flow to get QB Time token
2. Or if you have questions about any step

Then we'll get those clock times displaying! 🎯
