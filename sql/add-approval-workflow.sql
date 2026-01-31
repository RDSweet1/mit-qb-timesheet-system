-- Add Approval Workflow to Time Entries
-- This adds a separate approval status independent of QuickBooks' billable_status

-- Add approval_status column
ALTER TABLE time_entries
ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending';

-- Add approval tracking fields
ALTER TABLE time_entries
ADD COLUMN IF NOT EXISTS approved_by TEXT,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Create index for filtering by approval status
CREATE INDEX IF NOT EXISTS idx_time_entries_approval_status
ON time_entries(approval_status);

-- Create index for pending approvals query
CREATE INDEX IF NOT EXISTS idx_time_entries_pending
ON time_entries(txn_date, approval_status)
WHERE approval_status = 'pending';

-- Add comment explaining the workflow
COMMENT ON COLUMN time_entries.approval_status IS
'Internal approval status: pending (needs review), approved (ready to invoice), invoiced (already billed), rejected (won''t be billed)';

COMMENT ON COLUMN time_entries.billable_status IS
'QuickBooks billable status: Billable, NotBillable, HasBeenBilled. This is READ-ONLY from QB.';

-- Create a view for pending approvals (ready to review)
CREATE OR REPLACE VIEW pending_time_entries AS
SELECT
  te.*,
  c.display_name as customer_name,
  si.name as service_name,
  si.unit_price as hourly_rate,
  (te.hours + (te.minutes::decimal / 60)) * si.unit_price as estimated_amount
FROM time_entries te
LEFT JOIN customers c ON te.qb_customer_id = c.qb_customer_id
LEFT JOIN service_items si ON te.qb_item_id = si.qb_item_id
WHERE te.approval_status = 'pending'
ORDER BY te.txn_date DESC, te.employee_name;

-- Create a view for approved entries (ready to invoice)
CREATE OR REPLACE VIEW approved_time_entries AS
SELECT
  te.*,
  c.display_name as customer_name,
  si.name as service_name,
  si.unit_price as hourly_rate,
  (te.hours + (te.minutes::decimal / 60)) * si.unit_price as amount
FROM time_entries te
LEFT JOIN customers c ON te.qb_customer_id = c.qb_customer_id
LEFT JOIN service_items si ON te.qb_item_id = si.qb_item_id
WHERE te.approval_status = 'approved'
ORDER BY c.display_name, te.txn_date;

-- Create a view for invoiced entries (historical)
CREATE OR REPLACE VIEW invoiced_time_entries AS
SELECT
  te.*,
  c.display_name as customer_name,
  si.name as service_name,
  si.unit_price as hourly_rate,
  (te.hours + (te.minutes::decimal / 60)) * si.unit_price as amount
FROM time_entries te
LEFT JOIN customers c ON te.qb_customer_id = c.qb_customer_id
LEFT JOIN service_items si ON te.qb_item_id = si.qb_item_id
WHERE te.approval_status = 'invoiced'
ORDER BY te.txn_date DESC;

-- Update RLS policies to allow authenticated users to update approval status
CREATE POLICY "Authenticated users can update approval status" ON time_entries
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Function to approve time entries
CREATE OR REPLACE FUNCTION approve_time_entry(
  entry_id INTEGER,
  user_email TEXT
) RETURNS void AS $$
BEGIN
  UPDATE time_entries
  SET
    approval_status = 'approved',
    approved_by = user_email,
    approved_at = NOW()
  WHERE id = entry_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reject time entries
CREATE OR REPLACE FUNCTION reject_time_entry(
  entry_id INTEGER,
  user_email TEXT,
  reason TEXT
) RETURNS void AS $$
BEGIN
  UPDATE time_entries
  SET
    approval_status = 'rejected',
    approved_by = user_email,
    approved_at = NOW(),
    rejection_reason = reason
  WHERE id = entry_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to bulk approve time entries
CREATE OR REPLACE FUNCTION bulk_approve_time_entries(
  entry_ids INTEGER[],
  user_email TEXT
) RETURNS INTEGER AS $$
DECLARE
  affected_count INTEGER;
BEGIN
  UPDATE time_entries
  SET
    approval_status = 'approved',
    approved_by = user_email,
    approved_at = NOW()
  WHERE id = ANY(entry_ids)
    AND approval_status = 'pending';

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark entries as invoiced
CREATE OR REPLACE FUNCTION mark_entries_invoiced(
  entry_ids INTEGER[],
  invoice_id TEXT
) RETURNS INTEGER AS $$
DECLARE
  affected_count INTEGER;
BEGIN
  UPDATE time_entries
  SET
    approval_status = 'invoiced'
  WHERE id = ANY(entry_ids);

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION approve_time_entry TO authenticated;
GRANT EXECUTE ON FUNCTION reject_time_entry TO authenticated;
GRANT EXECUTE ON FUNCTION bulk_approve_time_entries TO authenticated;
GRANT EXECUTE ON FUNCTION mark_entries_invoiced TO service_role;

-- Create summary view for approval workflow
CREATE OR REPLACE VIEW approval_summary AS
SELECT
  approval_status,
  COUNT(*) as entry_count,
  SUM(hours + (minutes::decimal / 60)) as total_hours,
  SUM(
    (hours + (minutes::decimal / 60)) *
    COALESCE(si.unit_price, 0)
  ) as total_amount
FROM time_entries te
LEFT JOIN service_items si ON te.qb_item_id = si.qb_item_id
GROUP BY approval_status;

GRANT SELECT ON pending_time_entries TO authenticated;
GRANT SELECT ON approved_time_entries TO authenticated;
GRANT SELECT ON invoiced_time_entries TO authenticated;
GRANT SELECT ON approval_summary TO authenticated;
