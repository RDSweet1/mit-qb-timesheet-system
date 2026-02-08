-- Post-send edit tracking columns
-- When an entry is modified after being sent to a customer, these columns
-- track the reason and flag it for supplemental reporting.

ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS change_reason TEXT,
  ADD COLUMN IF NOT EXISTS post_send_edit BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS amended_at TIMESTAMPTZ;

-- Allow 'amended' as a valid approval_status value
-- (entry was sent, then changed — supplemental report required)
COMMENT ON COLUMN time_entries.change_reason IS 'Required reason when editing a sent/accepted entry';
COMMENT ON COLUMN time_entries.post_send_edit IS 'True if entry was modified after being sent to customer';
COMMENT ON COLUMN time_entries.amended_at IS 'When the post-send edit was made';

-- Add report_number to report_periods if not exists
ALTER TABLE report_periods
  ADD COLUMN IF NOT EXISTS report_number TEXT;

-- RLS: anon can update change_reason and post_send_edit columns
-- (existing update policy for anon should already cover time_entries updates)
