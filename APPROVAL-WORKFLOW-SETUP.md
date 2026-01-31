# Time Entry Approval Workflow Setup

## Overview

This adds a proper approval workflow on top of QuickBooks data, allowing you to review and approve time entries before invoicing.

## The Problem You Identified

QuickBooks only has:
- `Billable` - QB says it should be billed
- `NotBillable` - QB says don't bill
- `HasBeenBilled` - QB says already invoiced

**But you need:** A way to review entries BEFORE they become invoices.

## The Solution

Add a separate `approval_status` field with this workflow:

```
┌─────────────────┐
│ 1. PENDING      │ ← New entries start here
│                 │   (Synced from QB, needs review)
└────────┬────────┘
         │
         ├─── Approve ───┐
         │               ↓
         │        ┌──────────────┐
         │        │ 2. APPROVED  │
         │        │              │
         │        │ (Ready to    │
         │        │  invoice)    │
         │        └──────┬───────┘
         │               │
         │               │ Include in invoice
         │               ↓
         │        ┌──────────────┐
         │        │ 3. INVOICED  │
         │        │              │
         │        │ (Billed to   │
         │        │  customer)   │
         │        └──────────────┘
         │
         └─── Reject ───┐
                        ↓
                 ┌──────────────┐
                 │ 4. REJECTED  │
                 │              │
                 │ (Won't bill) │
                 └──────────────┘
```

## Installation Steps

### Step 1: Run the Migration

1. Go to: https://supabase.com/dashboard/project/migcpasmtbdojqphqyzc/sql
2. Click **"New query"**
3. Copy the entire contents of `sql/add-approval-workflow.sql`
4. Paste into the SQL editor
5. Click **"Run"**

Expected output: `Success. No rows returned`

### Step 2: Verify Installation

Run this query to check the new columns:

```sql
SELECT
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_name = 'time_entries'
  AND column_name IN ('approval_status', 'approved_by', 'approved_at', 'rejection_reason');
```

Expected: 4 rows showing the new columns.

### Step 3: Test the Views

```sql
-- See all pending entries
SELECT * FROM pending_time_entries LIMIT 10;

-- See approval summary
SELECT * FROM approval_summary;
```

## What Gets Added

### New Columns on `time_entries`

1. **`approval_status`** - TEXT, default 'pending'
   - Values: `pending`, `approved`, `invoiced`, `rejected`

2. **`approved_by`** - TEXT
   - Email of user who approved/rejected

3. **`approved_at`** - TIMESTAMPTZ
   - When approved/rejected

4. **`rejection_reason`** - TEXT
   - Why entry was rejected (optional)

### New Database Views

1. **`pending_time_entries`**
   - Shows all entries needing approval
   - Includes customer name, service, estimated amount
   - Ordered by date

2. **`approved_time_entries`**
   - Shows entries ready to invoice
   - Grouped by customer
   - Includes calculated amounts

3. **`invoiced_time_entries`**
   - Historical records of billed time
   - Read-only reference

4. **`approval_summary`**
   - Counts and totals by status
   - Dashboard stats

### New Functions

1. **`approve_time_entry(entry_id, user_email)`**
   - Approve a single entry
   - Tracks who and when

2. **`reject_time_entry(entry_id, user_email, reason)`**
   - Reject an entry with reason
   - Prevents accidental billing

3. **`bulk_approve_time_entries(entry_ids[], user_email)`**
   - Approve multiple entries at once
   - Returns count of approved

4. **`mark_entries_invoiced(entry_ids[], invoice_id)`**
   - Mark entries as invoiced
   - Called when creating QB invoice

## Usage Examples

### Approve a Time Entry

```sql
SELECT approve_time_entry(
  123,  -- entry ID
  'manager@example.com'
);
```

### Reject a Time Entry

```sql
SELECT reject_time_entry(
  124,  -- entry ID
  'manager@example.com',
  'Duplicate entry - already billed on previous invoice'
);
```

### Bulk Approve for Week

```sql
SELECT bulk_approve_time_entries(
  ARRAY(
    SELECT id FROM time_entries
    WHERE approval_status = 'pending'
      AND txn_date >= '2026-01-20'
      AND txn_date <= '2026-01-26'
  ),
  'manager@example.com'
);
```

### Get Pending Entries Count

```sql
SELECT COUNT(*) FROM time_entries
WHERE approval_status = 'pending';
```

## UI Integration (Next Steps)

After running the migration, you'll want to add:

### 1. Approval Queue Page

Show all pending entries with:
- Employee name, Customer, Date, Hours
- Description/Notes
- Estimated amount
- Approve/Reject buttons
- Bulk approve checkbox

### 2. Status Badges

In the time entries list, show color-coded badges:
- 🟡 **Pending** - Yellow
- 🟢 **Approved** - Green
- 🔵 **Invoiced** - Blue
- 🔴 **Rejected** - Red

### 3. Filter by Status

Add dropdown filter:
- All Statuses
- Pending Approval
- Approved (Ready to Invoice)
- Invoiced
- Rejected

### 4. Dashboard Widget

Show approval summary:
```
Pending Approval: 23 entries ($2,340.50)
Ready to Invoice: 45 entries ($4,890.00)
Invoiced This Month: 167 entries ($18,230.00)
```

## Workflow Integration

### When Syncing from QuickBooks

All new entries get `approval_status = 'pending'`:

```typescript
// In qb-time-sync Edge Function
await supabaseClient
  .from('time_entries')
  .upsert({
    // ... existing fields
    approval_status: 'pending',  // NEW: Default for synced entries
  });
```

### When Creating Invoices

Only include entries with `approval_status = 'approved'`:

```typescript
// Get approved entries for invoice
const { data: entries } = await supabase
  .from('time_entries')
  .select('*')
  .eq('qb_customer_id', customerId)
  .eq('approval_status', 'approved')  // ONLY approved
  .gte('txn_date', startDate)
  .lte('txn_date', endDate);

// After creating invoice, mark as invoiced
await supabase.rpc('mark_entries_invoiced', {
  entry_ids: entries.map(e => e.id),
  invoice_id: createdInvoice.Id
});
```

## QuickBooks Relationship

**Important:** This approval workflow is SEPARATE from QuickBooks' `billable_status`.

- **`billable_status`** - What QuickBooks says (READ-ONLY from QB)
- **`approval_status`** - What YOU say (managed in your app)

Both fields exist independently:
- You can approve a QB "NotBillable" entry (override)
- You can reject a QB "Billable" entry (error/duplicate)
- Most commonly: QB "Billable" → You approve → Invoice

## Rollback (If Needed)

To remove the approval workflow:

```sql
ALTER TABLE time_entries
  DROP COLUMN IF EXISTS approval_status,
  DROP COLUMN IF EXISTS approved_by,
  DROP COLUMN IF EXISTS approved_at,
  DROP COLUMN IF EXISTS rejection_reason;

DROP VIEW IF EXISTS pending_time_entries;
DROP VIEW IF EXISTS approved_time_entries;
DROP VIEW IF EXISTS invoiced_time_entries;
DROP VIEW IF EXISTS approval_summary;

DROP FUNCTION IF EXISTS approve_time_entry;
DROP FUNCTION IF EXISTS reject_time_entry;
DROP FUNCTION IF EXISTS bulk_approve_time_entries;
DROP FUNCTION IF EXISTS mark_entries_invoiced;
```

## Summary

**Before:**
- Time entries synced from QB
- No review process
- Directly to invoicing
- Risk of billing errors

**After:**
- Time entries start as "Pending"
- Manager reviews and approves
- Only approved entries invoiced
- Full audit trail of who approved when

---

**Ready to install?** Go to the Supabase SQL Editor and run `sql/add-approval-workflow.sql`!
