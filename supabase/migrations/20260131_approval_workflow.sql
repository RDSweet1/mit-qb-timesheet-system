-- Add Approval Workflow to Time Entries
-- Adds approval_status column with 4 states: pending, approved, invoiced, rejected

-- Add approval columns
ALTER TABLE time_entries
ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS approved_by TEXT,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Add permission column to app_users
ALTER TABLE app_users
ADD COLUMN IF NOT EXISTS can_approve_time BOOLEAN DEFAULT false;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_time_entries_approval_status
ON time_entries(approval_status);

CREATE INDEX IF NOT EXISTS idx_time_entries_pending
ON time_entries(txn_date, approval_status)
WHERE approval_status = 'pending';

-- Comments
COMMENT ON COLUMN time_entries.approval_status IS
'Internal approval status: pending (needs review), approved (ready to invoice), invoiced (already billed), rejected (won''t be billed)';

COMMENT ON COLUMN time_entries.billable_status IS
'QuickBooks billable status: Billable, NotBillable, HasBeenBilled. This is READ-ONLY from QB.';
