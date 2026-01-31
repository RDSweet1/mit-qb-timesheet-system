# Deploy billableOnly Fix

**Issue:** QB sync returns 0 entries even though there are many time entries in QuickBooks.

**Root Cause:** The Edge Function was filtering to only `BillableStatus = 'Billable'` entries, excluding `NotBillable` and `HasBeenBilled` entries.

**Fix:** Changed default to `billableOnly = false` to sync ALL time entries.

---

## Changes Made ✅

### 1. Edge Function (`supabase/functions/qb-time-sync/index.ts`)
- Line 58: Changed `billableOnly = true` → `billableOnly = false`
- Committed: afcc11d

### 2. Frontend (`frontend/app/time-entries-enhanced/page.tsx`)
- Line 123: Added `billableOnly: false` to request body
- Committed: 1cf64e8 (in frontend submodule)

---

## Deployment Steps

### Option A: Manual Edge Function Deployment (Recommended)

#### 1. Deploy Edge Function via Supabase Dashboard

**Steps:**
1. Go to: https://supabase.com/dashboard/project/migcpasmtbdojqphqyzc/functions
2. Find `qb-time-sync` function
3. Click on it
4. Click **"Deploy new version"** or **"Update"**
5. The new code should be automatically pulled from your repo

**OR** use the CLI:

```bash
cd /c/SourceCode/WeeklyTimeBillingQB
npx supabase functions deploy qb-time-sync --project-ref migcpasmtbdojqphqyzc
```

#### 2. Build and Deploy Frontend

```bash
cd /c/SourceCode/WeeklyTimeBillingQB/frontend

# Build
npm run build

# Push to trigger GitHub Pages deployment
cd ..
git add frontend  # Update submodule reference
git commit -m "Update frontend submodule with billableOnly fix"
git push origin master

# Also push frontend submodule
cd frontend
git push origin main
```

---

### Option B: Quick Test (Without Full Deployment)

You can test the fix immediately using the API:

```bash
curl -X POST "https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/qb-time-sync" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZ2NwYXNtdGJkb2pxcGhxeXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgxODE0OTcsImV4cCI6MjA1Mzc1NzQ5N30.ZiV5jqcW3C78i-rWLNKfMZUfPLo-vGXaS1_1YEYyyvE" \
  -H "Content-Type: application/json" \
  -d '{"startDate":"2025-12-01","endDate":"2026-01-31","billableOnly":false}'
```

**Expected Result:**
```json
{
  "success": true,
  "synced": 90,
  "total": 100,
  "dateRange": {"start": "2025-12-01", "end": "2026-01-31"}
}
```

This confirms the fix works at the Edge Function level.

---

## Verification

### After Edge Function Deployment

Test via API (Edge Function should now default to false):

```bash
# WITHOUT billableOnly parameter (should get all entries now)
curl -X POST "https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/qb-time-sync" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"startDate":"2025-12-01","endDate":"2026-01-31"}'
```

**Before Fix:** `{"synced":0,"total":0}`
**After Fix:** `{"synced":90,"total":100}`

### After Frontend Deployment

1. Wait 2-3 minutes for GitHub Pages to rebuild
2. Visit: https://rdsweet1.github.io/mit-qb-frontend/
3. Navigate to **Time Entries** page
4. Click **"Sync from QB"**
5. Select date range: December 1, 2025 - January 31, 2026
6. Click **"Sync"**

**Expected:** Should see ~90+ time entries in the table!

---

## Understanding BillableStatus Values

QuickBooks uses these values for `BillableStatus`:

- **`Billable`** - Time that should be billed to the customer (was the only one syncing before)
- **`NotBillable`** - Time that shouldn't be billed (now syncs)
- **`HasBeenBilled`** - Time already included in an invoice (now syncs)

Your time entries are likely marked as `NotBillable` or `HasBeenBilled`, which is why they weren't showing up.

---

## If You Want to Filter by Billable Status

You can still filter after syncing! The `time_entries` table includes a `billable_status` column.

**Example query in your app:**
```sql
SELECT * FROM time_entries
WHERE billable_status = 'Billable'
  AND txn_date >= '2025-12-01'
  AND txn_date <= '2026-01-31'
```

**Or** you can add a filter toggle in the frontend UI to show/hide non-billable entries.

---

## Rollback (If Needed)

If you need to revert to only syncing billable entries:

### Edge Function
```typescript
const { startDate, endDate, customerId, billableOnly = true } = body;
```

### Frontend
```typescript
const requestBody = { startDate, endDate, billableOnly: true };
```

---

## Summary

**Before:**
- ❌ Synced only `BillableStatus = 'Billable'` entries
- ❌ Returned 0 out of 100+ entries

**After:**
- ✅ Syncs ALL time entries regardless of billable status
- ✅ Returns ~90 entries from December 2025 - January 2026
- ✅ Can still filter by billable_status in the app if needed

---

**Next:** Deploy the Edge Function update to see all your time entries!
