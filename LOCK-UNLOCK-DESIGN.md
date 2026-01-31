# Time Entry Lock/Unlock Design

## Problem Statement

Time entries synced from QuickBooks need to be **protected from accidental edits** that could create data inconsistencies. Changes made in the app won't sync back to QuickBooks, so edits must be **intentional and acknowledged**.

## Solution: Lock/Unlock Mechanism

All QB-synced time entries are **locked by default**. Users must explicitly unlock entries to edit them, with a warning that changes won't sync to QuickBooks.

---

## Database Schema

### New Columns on `time_entries`

```sql
is_locked BOOLEAN DEFAULT true                -- Entry is read-only
unlocked_by TEXT                              -- Who unlocked it
unlocked_at TIMESTAMPTZ                       -- When unlocked
edit_warning_acknowledged BOOLEAN DEFAULT false  -- User saw warning
```

### New Column on `app_users`

```sql
can_edit_time_entries BOOLEAN DEFAULT false   -- Permission to unlock/edit
```

### Current Status

✅ All 90+ existing entries are **locked** (`is_locked: true`)
✅ Permission control in place
✅ Approval status separate (`pending`, `approved`, `invoiced`, `rejected`)

---

## UI Flow

### 1. Viewing Locked Entries

**Time Entries List:**
```
┌─────────────────────────────────────────────────────┐
│ Employee    | Date       | Hours | Status   | Edit │
├─────────────────────────────────────────────────────┤
│ Fred F.     | 2025-12-15 | 8.0h  | Pending  |  🔒  │
│ Fred F.     | 2025-12-16 | 7.5h  | Pending  |  🔒  │
└─────────────────────────────────────────────────────┘
```

- **🔒 Lock icon** indicates entry is read-only
- Clicking fields shows: "Entry is locked. Click 🔒 to unlock."
- All input fields are **disabled** when locked

### 2. Unlock Confirmation Dialog

**User clicks lock icon:**

```
┌──────────────────────────────────────────────────┐
│  ⚠️  Unlock Time Entry?                          │
│                                                   │
│  This will allow you to edit this time entry.    │
│                                                   │
│  WARNING:                                         │
│  • Changes will NOT sync back to QuickBooks      │
│  • This creates a local-only modification        │
│  • Use only when necessary                       │
│                                                   │
│  Are you sure you want to unlock this entry?     │
│                                                   │
│  ┌─────────────┐  ┌──────────────────┐          │
│  │   Cancel    │  │  Yes, Unlock It  │          │
│  └─────────────┘  └──────────────────┘          │
└──────────────────────────────────────────────────┘
```

### 3. Unlocked State

After unlocking:

```
┌─────────────────────────────────────────────────────┐
│ Employee    | Date       | Hours | Status   | Edit │
├─────────────────────────────────────────────────────┤
│ Fred F.     | 2025-12-15 | 8.0h  | Pending  |  🔓  │
│                                               ↑     │
│                                    Unlocked by you  │
│                                    Jan 31, 2:45 PM  │
└─────────────────────────────────────────────────────┘
```

- **🔓 Open lock icon** indicates editable
- Fields are now **enabled**
- Shows who unlocked and when (tooltip)
- Click 🔓 to re-lock

### 4. Editing Unlocked Entry

```
┌──────────────────────────────────────────────────┐
│  Edit Time Entry                                  │
│  ⚠️  This entry is local-only (not in QB)        │
│                                                   │
│  Date: [2025-12-15 ▼]                            │
│  Hours: [8] Minutes: [0]                          │
│  Description: [Project management              ] │
│                                                   │
│  ┌─────────┐  ┌──────────┐  ┌─────────────┐    │
│  │  Cancel │  │   Save   │  │  Lock Again │    │
│  └─────────┘  └──────────┘  └─────────────┘    │
└──────────────────────────────────────────────────┘
```

---

## Permission System

### Who Can Unlock Entries?

Users with **either** permission:
- `can_edit_time_entries = true` (general editing)
- `can_approve_time = true` (approval workflow)

**To grant permission:**

```sql
UPDATE app_users
SET can_edit_time_entries = true
WHERE email = 'manager@example.com';
```

### Permission Levels

| Permission | Can View | Can Unlock | Can Edit | Can Approve |
|-----------|----------|-----------|----------|-------------|
| None | ✅ | ❌ | ❌ | ❌ |
| `can_edit_time_entries` | ✅ | ✅ | ✅ | ❌ |
| `can_approve_time` | ✅ | ✅ | ✅ | ✅ |
| Both | ✅ | ✅ | ✅ | ✅ |

---

## Functions Available

### Unlock Entry

```typescript
const result = await supabase.rpc('unlock_time_entry', {
  entry_id: 123,
  user_email: 'user@example.com'
});

// Returns:
// {
//   success: true,
//   message: 'Entry unlocked. WARNING: Changes will not sync back to QuickBooks.',
//   unlocked_at: '2026-01-31T14:45:00Z',
//   unlocked_by: 'user@example.com'
// }
```

### Lock Entry

```typescript
const result = await supabase.rpc('lock_time_entry', {
  entry_id: 123,
  user_email: 'user@example.com'
});

// Returns:
// {
//   success: true,
//   message: 'Entry locked. Protected from accidental edits.',
//   locked_at: '2026-01-31T14:46:00Z'
// }
```

### Lock All QB Entries (after sync)

```typescript
// Call after QB sync completes
const count = await supabase.rpc('lock_all_qb_entries');
console.log(`${count} entries locked`);
```

---

## Integration with QB Sync

### After QB Sync

When QB sync completes, automatically lock all synced entries:

```typescript
// In qb-time-sync Edge Function
await supabaseClient
  .from('time_entries')
  .upsert({
    // ... existing fields
    is_locked: true,  // LOCK by default
    unlocked_by: null,
    unlocked_at: null,
    edit_warning_acknowledged: false
  });
```

### Preventing Sync Conflicts

**QB is the source of truth** for locked entries:
- Locked entries are read-only in the app
- Unlocking allows local edits only
- Next QB sync will **overwrite** unlocked entries
- Warning must be shown to users

---

## Audit Trail

### View Unlocked Entries

```sql
SELECT * FROM unlocked_time_entries
ORDER BY unlocked_at DESC
LIMIT 20;
```

**Columns:**
- `id`, `txn_date`, `employee_name`, `customer_name`
- `hours`, `minutes`
- `unlocked_by`, `unlocked_at`
- `is_locked` (current status)

**Use cases:**
- See who's been editing entries
- Audit trail for compliance
- Identify frequently modified entries

---

## UI Components Needed

### 1. LockIcon Component

```tsx
<LockIcon
  isLocked={entry.is_locked}
  unlockedBy={entry.unlocked_by}
  unlockedAt={entry.unlocked_at}
  onToggle={() => handleLockToggle(entry.id)}
/>
```

### 2. UnlockConfirmDialog

```tsx
<UnlockConfirmDialog
  isOpen={showDialog}
  onConfirm={() => unlockEntry(entryId)}
  onCancel={() => setShowDialog(false)}
  entryDetails={entry}
/>
```

### 3. EditWarningBanner

```tsx
{!entry.is_locked && (
  <EditWarningBanner>
    ⚠️ This entry is unlocked. Changes will NOT sync to QuickBooks.
  </EditWarningBanner>
)}
```

### 4. UnlockAuditLog

```tsx
<UnlockAuditLog
  entries={unlockedEntries}
  onLockEntry={(id) => lockEntry(id)}
/>
```

---

## Workflow Examples

### Example 1: Fix Incorrect Hours

1. User notices QB entry has wrong hours
2. Clicks 🔒 lock icon
3. Sees warning dialog, clicks "Yes, Unlock It"
4. Entry unlocks, fields become editable
5. User changes 8.0h → 7.5h
6. Clicks "Save"
7. Entry remains unlocked (shows 🔓)
8. Next QB sync will overwrite with QB data (unless locked)

**Best Practice:** Lock again after editing to prevent accidental changes.

### Example 2: Bulk Lock After Sync

1. QB sync completes, adds 50 new entries
2. Edge Function automatically sets `is_locked: true`
3. All entries protected immediately
4. Users see 🔒 icons in UI

### Example 3: Approval Workflow + Lock

1. Entry syncs from QB → locked, pending approval
2. Manager unlocks → approves → locks
3. Entry is now: `is_locked: true`, `approval_status: 'approved'`
4. Can be included in invoice
5. After invoicing → `approval_status: 'invoiced'`

---

## Future Enhancements

### Smart Locking

- Auto-lock after 24 hours of being unlocked
- Lock when approval status changes
- Lock when included in invoice

### Conflict Detection

- Detect if QB data changed while unlocked
- Show diff and ask user to resolve
- Option to keep local or QB version

### Bulk Operations

- Unlock multiple entries at once
- Bulk lock all unlocked entries
- Export unlocked entries report

---

## Summary

**Before:**
- Time entries could be edited accidentally
- No warning about QB sync conflicts
- Risk of data inconsistency

**After:**
- ✅ All entries locked by default
- ✅ Explicit unlock with warning
- ✅ Audit trail of who/when unlocked
- ✅ Permission-based control
- ✅ Clear visual indicators (🔒/🔓)

**Key Principle:** **QuickBooks is the source of truth.** Local edits are allowed but must be intentional and acknowledged.
