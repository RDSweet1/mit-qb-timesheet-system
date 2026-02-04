-- Add email tracking fields (extending existing approval system)
-- Created: 2026-02-04

-- Add email tracking columns to time_entries (if they don't exist)
ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_to TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_receipt_declined BOOLEAN DEFAULT FALSE;

-- Create index for filtering by sent status
CREATE INDEX IF NOT EXISTS idx_time_entries_sent_at
  ON time_entries(sent_at) WHERE sent_at IS NOT NULL;

-- Create email tracking table for audit trail
CREATE TABLE IF NOT EXISTS email_tracking (
  id BIGSERIAL PRIMARY KEY,
  time_entry_ids INTEGER[] NOT NULL,
  customer_id TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  sent_by TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  read_receipt_declined BOOLEAN DEFAULT FALSE,
  message_id TEXT,
  status TEXT DEFAULT 'sent',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for email tracking
CREATE INDEX IF NOT EXISTS idx_email_tracking_customer
  ON email_tracking(customer_id);

CREATE INDEX IF NOT EXISTS idx_email_tracking_entries
  ON email_tracking USING GIN(time_entry_ids);

CREATE INDEX IF NOT EXISTS idx_email_tracking_message_id
  ON email_tracking(message_id) WHERE message_id IS NOT NULL;

-- Create audit log table for all approval/send actions
CREATE TABLE IF NOT EXISTS approval_audit_log (
  id BIGSERIAL PRIMARY KEY,
  time_entry_id INTEGER,
  email_tracking_id INTEGER REFERENCES email_tracking(id),
  action TEXT NOT NULL, -- 'approved', 'sent', 'delivered', 'read', 'declined_read'
  performed_by TEXT NOT NULL,
  performed_at TIMESTAMPTZ DEFAULT NOW(),
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_log_entry
  ON approval_audit_log(time_entry_id, performed_at DESC) WHERE time_entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_email
  ON approval_audit_log(email_tracking_id, performed_at DESC) WHERE email_tracking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_action
  ON approval_audit_log(action, performed_at DESC);

-- Add comments for documentation
COMMENT ON COLUMN time_entries.sent_at IS 'Timestamp when timesheet was emailed to customer';
COMMENT ON COLUMN time_entries.sent_to IS 'Email address where timesheet was sent';
COMMENT ON COLUMN time_entries.delivered_at IS 'Timestamp when delivery receipt received';
COMMENT ON COLUMN time_entries.read_at IS 'Timestamp when read receipt received';
COMMENT ON COLUMN time_entries.read_receipt_declined IS 'TRUE if recipient declined to send read receipt';
COMMENT ON TABLE email_tracking IS 'Tracks emails sent to customers with delivery and read receipt status';
COMMENT ON TABLE approval_audit_log IS 'Audit trail for all approval and email tracking events';
