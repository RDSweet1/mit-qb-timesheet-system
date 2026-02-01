# Next Steps: Getting Start/End Times from QB Time

## The Situation

**What We Know:**
- ✅ Time entries exist in database (96 entries from Dec 2025)
- ✅ They have duration (hours + minutes)
- ❌ They're missing start_time and end_time (all NULL)
- 🎯 **Root Cause:** Data lives in QB Time until billed, then syncs to QB Online **without times**

**Why This Happens:**
- QB Time = Source of truth for clock in/out times
- QB Online = Gets duration only when synced from QB Time
- Our current sync = Uses QB Online API (no times available)

---

## Solution Options

### Option 1: Quick Test - Check Your QB Time Account

1. Go to: https://app.tsheets.com or https://quickbooks.intuit.com/time-tracking
2. Login with your QuickBooks account
3. Look at a December 2025 time entry
4. **Question:** Does it show actual clock in/out times?
   - If YES → Times exist in QB Time, we need API access
   - If NO → Times might not be tracked (lump sum entries)

### Option 2: Use Existing Integration (If Available)

**Check if you already have QB Time API access:**

Do you have:
- A TSheets/QB Time API token from before?
- An existing integration that accesses QB Time?
- Developer credentials specifically for QB Time?

If yes, provide the token and we can use it immediately.

### Option 3: Request QB Time API Scope

**Manual OAuth Flow** (requires you to authorize):

1. Run: `get-qb-time-token.ps1`
2. Browser opens → Login to QuickBooks
3. Authorize "QuickBooks Time" access
4. Copy the `code=XXXXX` from redirect URL
5. Paste into PowerShell prompt
6. Get access token → Configure in Supabase

**After getting token:**
```powershell
# Add to Supabase secrets
QB_TIME_ACCESS_TOKEN=your_token_here
```

Then deploy and sync!

### Option 4: Alternative - Extract Times from QB Time UI

If API access is difficult, you could:
1. Export QB Time data as CSV (includes clock in/out)
2. One-time import to populate start/end times
3. Keep using QB Online for ongoing syncs (duration only)

---

## What Happens After We Get QB Time Access

### 1. Run Database Migration
```sql
-- Already created: sql/add-qb-time-columns.sql
ALTER TABLE time_entries ADD COLUMN qb_time_timesheet_id TEXT UNIQUE;
```

### 2. Deploy QB Time Sync Function
```powershell
npx supabase functions deploy qb-time-sync
```

### 3. Sync from QB Time
```powershell
# Calls QB Time API, gets actual clock times
Invoke-RestMethod -Uri "https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/qb-time-sync" -Method POST -Body '{"startDate":"2025-12-01","endDate":"2025-12-31"}'
```

### 4. Verify Times Populated
```sql
SELECT employee_name, txn_date, start_time, end_time
FROM time_entries
WHERE start_time IS NOT NULL
LIMIT 5;
```

Expected result:
```
employee_name   | txn_date   | start_time | end_time
----------------|------------|------------|----------
Fred Ferraiuolo | 2025-12-31 | 09:15:00   | 10:59:00
```

### 5. Update Frontend to Display Times
Instead of "1h 44m" → Show "9:15 AM - 10:59 AM (1h 44m)"

---

## Your Choice

**Which path do you want to take?**

A. Try Option 1 - Check QB Time web interface to confirm times exist
B. Try Option 3 - Run OAuth flow properly with authorization code
C. Provide existing QB Time token if you have one
D. Use Option 4 - CSV export as workaround

Let me know and I'll help you complete it!

---

## Files Ready to Go

Already created:
- ✅ `supabase/functions/qb-time-sync/index.ts` - QB Time sync function
- ✅ `sql/add-qb-time-columns.sql` - Database migration
- ✅ `get-qb-time-token.ps1` - OAuth flow script
- ✅ `test-qb-time-api.ps1` - Test QB Time access

Just need the QB Time access token to proceed!
