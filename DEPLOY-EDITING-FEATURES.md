# Deployment Guide: Time Entry Editing Features

## Changes Implemented

### 1. ✅ Fixed Description Bug
**File:** `supabase/functions/qb-time-sync/index.ts`
- **Before:** `description: ts.notes || ''` (BUG - copied notes to description)
- **After:** `description: jobcode?.short_code ? '${jobcode.short_code} - ${jobcode.name}' : jobcode?.name || costCode`
- **Result:** Description now shows cost code info, notes stay in notes field

### 2. ✅ Created Lock/Unlock Edge Functions
**Files Created:**
- `supabase/functions/unlock_time_entry/index.ts` - Unlock entries for editing
- `supabase/functions/lock_time_entry/index.ts` - Lock entries after editing

**Features:**
- Permission checks (can_edit_time or is_admin)
- Prevents unlocking invoiced entries
- Warns if unlocking approved entries
- Audit logging for all lock/unlock actions
- Validates user is the unlocker or admin before allowing lock

### 3. ✅ Created Database Migration
**File:** `supabase/migrations/20260203_time_entry_editing.sql`

**Schema Changes:**
- Added `updated_at`, `updated_by`, `manually_edited`, `edit_count` to time_entries
- Created `time_entry_audit_log` table with indexes
- Updated RLS policies for editing
- Created `calculate_duration()` function
- Added triggers for auto-calculating duration and audit logging

---

## Deployment Steps

### Step 1: Deploy Database Migration

**Option A: Using Supabase CLI (Recommended)**
```bash
cd C:\SourceCode\WeeklyTimeBillingQB

# Login to Supabase (if not already)
supabase login

# Link to your project (if not already linked)
supabase link --project-ref YOUR_PROJECT_REF

# Run migration
supabase db push

# Or manually run the specific migration
supabase db push supabase/migrations/20260203_time_entry_editing.sql
```

**Option B: Using Supabase Dashboard**
1. Go to https://supabase.com/dashboard/project/YOUR_PROJECT/editor
2. Click "SQL Editor"
3. Click "New Query"
4. Copy contents of `supabase/migrations/20260203_time_entry_editing.sql`
5. Paste and click "Run"
6. Verify: Check that `time_entry_audit_log` table exists

---

### Step 2: Deploy Edge Functions

**Deploy unlock_time_entry:**
```bash
cd C:\SourceCode\WeeklyTimeBillingQB

supabase functions deploy unlock_time_entry --no-verify-jwt
```

**Deploy lock_time_entry:**
```bash
supabase functions deploy lock_time_entry --no-verify-jwt
```

**Verify Deployment:**
```bash
# List deployed functions
supabase functions list

# Test unlock function
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/unlock_time_entry \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "entry_id": 1,
    "user_email": "test@example.com"
  }'
```

---

### Step 3: Redeploy qb-time-sync (Description Fix)

```bash
supabase functions deploy qb-time-sync --no-verify-jwt
```

**Test the fix:**
```bash
# Run a sync and check that descriptions are now jobcode names, not notes
node test-qb-time-sync-2026.js
```

Then check database:
```sql
SELECT
  id,
  cost_code,
  description,  -- Should be jobcode name now
  notes         -- Should be user notes
FROM time_entries
LIMIT 10;
```

---

## Testing Checklist

### Test Description Fix
- [ ] Run QB Time sync
- [ ] Check `description` field contains cost code name (not notes)
- [ ] Check `notes` field contains user notes from QB Time
- [ ] Verify existing entries with description=notes still work

### Test Unlock Function
- [ ] Call unlock_time_entry with valid entry_id
- [ ] Verify entry is now unlocked in database
- [ ] Check `unlocked_by` and `unlocked_at` are set
- [ ] Verify audit log entry created
- [ ] Try unlocking invoiced entry (should fail)
- [ ] Try unlocking with user without permission (should fail)
- [ ] Try unlocking already unlocked entry (should return friendly message)

### Test Lock Function
- [ ] Call lock_time_entry on unlocked entry
- [ ] Verify entry is now locked in database
- [ ] Check `unlocked_by` and `unlocked_at` are cleared
- [ ] Verify audit log entry created
- [ ] Try locking as different user (should fail if not admin)
- [ ] Try locking already locked entry (should return friendly message)

### Test Database Triggers
- [ ] Update start_time and end_time directly in database
- [ ] Verify hours and minutes are auto-calculated
- [ ] Check audit log entry was created automatically
- [ ] Verify `manually_edited` flag can be set

---

## Verification Queries

```sql
-- Check audit log table exists and has data
SELECT * FROM time_entry_audit_log
ORDER BY timestamp DESC
LIMIT 10;

-- Check new fields exist on time_entries
SELECT
  id,
  updated_at,
  updated_by,
  manually_edited,
  edit_count
FROM time_entries
LIMIT 5;

-- Test duration calculation function
SELECT * FROM calculate_duration(
  '2026-02-03 09:00:00',
  '2026-02-03 17:30:00'
);
-- Should return: hours=8, minutes=30

-- Check RLS policies
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename IN ('time_entries', 'time_entry_audit_log');
```

---

## Rollback Plan (If Needed)

If something goes wrong, here's how to rollback:

### Rollback Database Migration:
```sql
-- Drop audit log table
DROP TABLE IF EXISTS time_entry_audit_log CASCADE;

-- Remove triggers
DROP TRIGGER IF EXISTS trigger_update_duration ON time_entries;
DROP TRIGGER IF EXISTS trigger_log_changes ON time_entries;

-- Remove functions
DROP FUNCTION IF EXISTS calculate_duration;
DROP FUNCTION IF EXISTS update_time_entry_duration;
DROP FUNCTION IF EXISTS log_time_entry_changes;

-- Remove new columns (optional - data will be lost!)
ALTER TABLE time_entries
DROP COLUMN IF EXISTS updated_at,
DROP COLUMN IF EXISTS updated_by,
DROP COLUMN IF EXISTS manually_edited,
DROP COLUMN IF EXISTS edit_count;
```

### Rollback Edge Functions:
```bash
# Delete deployed functions
supabase functions delete unlock_time_entry
supabase functions delete lock_time_entry
```

### Rollback Description Fix:
```typescript
// In qb-time-sync/index.ts, change back to:
description: ts.notes || '',
```
Then redeploy:
```bash
supabase functions deploy qb-time-sync
```

---

## Next Steps After Deployment

Once these are deployed successfully:

1. **Test in UI:**
   - Frontend lock/unlock buttons should now work
   - Check browser console for any errors
   - Try unlocking and locking entries

2. **Monitor Logs:**
   ```bash
   # Watch edge function logs
   supabase functions logs unlock_time_entry --tail
   supabase functions logs lock_time_entry --tail
   ```

3. **Build Edit UI (Future):**
   - Create TimeEntryEditor component
   - Add inline editing form
   - Implement update_time_entry edge function
   - See PHASE 3 in planning document

---

## Troubleshooting

### Issue: "Function not found"
**Solution:** Verify function is deployed:
```bash
supabase functions list
```

### Issue: "Invalid API key"
**Solution:** Check edge function URL uses correct project ref and anon key

### Issue: "User does not have permission"
**Solution:** Ensure user has `can_edit_time = true` in app_users table:
```sql
UPDATE app_users
SET can_edit_time = true
WHERE email = 'user@example.com';
```

### Issue: "Entry not found"
**Solution:** Check entry_id exists in time_entries table

### Issue: RLS policy blocking updates
**Solution:** Verify RLS policies are correct:
```sql
-- Check what policies exist
SELECT * FROM pg_policies WHERE tablename = 'time_entries';
```

---

## Environment Variables Needed

Make sure these are set in Supabase:
- `SUPABASE_URL` (auto-set)
- `SUPABASE_SERVICE_ROLE_KEY` (auto-set)
- `QB_TIME_ACCESS_TOKEN` (for sync function)

Frontend .env.local needs:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## Success Indicators

✅ **Deployment Successful When:**
1. All 3 edge functions deployed (qb-time-sync, unlock_time_entry, lock_time_entry)
2. Database migration ran without errors
3. Audit log table exists with indexes
4. Triggers are active and working
5. Lock/unlock works in frontend UI
6. Descriptions show cost code names after sync
7. Audit logs are being created

---

## Support

If issues occur:
1. Check Supabase function logs
2. Check browser console for frontend errors
3. Run verification queries above
4. Check audit log for clues
5. Review this deployment guide

For questions, see planning document: `time-entry-editing-plan.md`
