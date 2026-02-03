-- Migration: Add Time Entry Editing Support
-- Created: 2026-02-03
-- Purpose: Add fields and audit logging for time entry editing feature

-- 1. Add tracking fields to time_entries table
ALTER TABLE time_entries
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS updated_by TEXT,
ADD COLUMN IF NOT EXISTS manually_edited BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS edit_count INTEGER DEFAULT 0;

-- Add comment explaining manually_edited flag
COMMENT ON COLUMN time_entries.manually_edited IS 'Flag to prevent QB Time sync from overwriting manual edits';

-- 2. Create audit log table for tracking all changes
CREATE TABLE IF NOT EXISTS time_entry_audit_log (
  id BIGSERIAL PRIMARY KEY,
  entry_id BIGINT NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  action TEXT NOT NULL,  -- 'unlock', 'lock', 'edit', 'approve', 'reject', etc.
  user_email TEXT NOT NULL,
  changes JSONB,  -- Store old/new values as JSON
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT
);

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_log_entry_id ON time_entry_audit_log(entry_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON time_entry_audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON time_entry_audit_log(user_email);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON time_entry_audit_log(action);

-- 4. Add index for manually_edited entries (for sync filtering)
CREATE INDEX IF NOT EXISTS idx_time_entries_manually_edited
ON time_entries(manually_edited)
WHERE manually_edited = true;

-- 5. Create RLS policies for audit log
ALTER TABLE time_entry_audit_log ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read audit logs for entries they can see
CREATE POLICY "Users can view audit logs for their entries"
ON time_entry_audit_log
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM time_entries te
    WHERE te.id = time_entry_audit_log.entry_id
  )
);

-- Only service role can insert audit logs (from edge functions)
-- No direct INSERT policy for regular users

-- 6. Update RLS policies for time_entries to allow editing unlocked entries
-- Drop existing update policy if it exists (to recreate with new logic)
DROP POLICY IF EXISTS "Users can update time entries" ON time_entries;

-- Create new update policy with unlock check
CREATE POLICY "Users can update unlocked time entries"
ON time_entries
FOR UPDATE
TO authenticated
USING (
  -- Entry must be unlocked
  is_locked = false
  -- Entry must not be invoiced
  AND approval_status != 'invoiced'
  -- User must have edit permission
  AND EXISTS (
    SELECT 1 FROM app_users
    WHERE app_users.email = auth.jwt() ->> 'email'
    AND (app_users.can_edit_time = true OR app_users.is_admin = true)
  )
)
WITH CHECK (
  -- Same checks for the updated values
  is_locked = false
  AND approval_status != 'invoiced'
);

-- 7. Create helper function to calculate hours/minutes from timestamps
CREATE OR REPLACE FUNCTION calculate_duration(
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ
) RETURNS TABLE(hours INTEGER, minutes INTEGER) AS $$
BEGIN
  RETURN QUERY
  SELECT
    FLOOR(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600)::INTEGER AS hours,
    FLOOR((EXTRACT(EPOCH FROM (end_time - start_time)) % 3600) / 60)::INTEGER AS minutes;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 8. Create trigger to automatically update hours/minutes when times change
CREATE OR REPLACE FUNCTION update_time_entry_duration()
RETURNS TRIGGER AS $$
DECLARE
  duration_result RECORD;
BEGIN
  -- Only recalculate if start_time or end_time changed
  IF NEW.start_time IS DISTINCT FROM OLD.start_time OR NEW.end_time IS DISTINCT FROM OLD.end_time THEN
    IF NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL THEN
      SELECT * INTO duration_result FROM calculate_duration(NEW.start_time, NEW.end_time);
      NEW.hours := duration_result.hours;
      NEW.minutes := duration_result.minutes;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_update_duration ON time_entries;
CREATE TRIGGER trigger_update_duration
BEFORE UPDATE ON time_entries
FOR EACH ROW
EXECUTE FUNCTION update_time_entry_duration();

-- 9. Create trigger to track edits in audit log automatically
CREATE OR REPLACE FUNCTION log_time_entry_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if important fields changed
  IF (NEW.start_time IS DISTINCT FROM OLD.start_time)
     OR (NEW.end_time IS DISTINCT FROM OLD.end_time)
     OR (NEW.notes IS DISTINCT FROM OLD.notes)
     OR (NEW.is_locked IS DISTINCT FROM OLD.is_locked)
     OR (NEW.approval_status IS DISTINCT FROM OLD.approval_status) THEN

    INSERT INTO time_entry_audit_log (
      entry_id,
      action,
      user_email,
      changes,
      timestamp
    ) VALUES (
      NEW.id,
      CASE
        WHEN NEW.is_locked != OLD.is_locked THEN
          CASE WHEN NEW.is_locked THEN 'lock' ELSE 'unlock' END
        WHEN NEW.approval_status != OLD.approval_status THEN 'approval_change'
        ELSE 'edit'
      END,
      COALESCE(NEW.updated_by, auth.jwt() ->> 'email', 'system'),
      jsonb_build_object(
        'old', jsonb_build_object(
          'start_time', OLD.start_time,
          'end_time', OLD.end_time,
          'hours', OLD.hours,
          'minutes', OLD.minutes,
          'notes', OLD.notes,
          'is_locked', OLD.is_locked,
          'approval_status', OLD.approval_status
        ),
        'new', jsonb_build_object(
          'start_time', NEW.start_time,
          'end_time', NEW.end_time,
          'hours', NEW.hours,
          'minutes', NEW.minutes,
          'notes', NEW.notes,
          'is_locked', NEW.is_locked,
          'approval_status', NEW.approval_status
        )
      ),
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_log_changes ON time_entries;
CREATE TRIGGER trigger_log_changes
AFTER UPDATE ON time_entries
FOR EACH ROW
EXECUTE FUNCTION log_time_entry_changes();

-- 10. Add comments for documentation
COMMENT ON TABLE time_entry_audit_log IS 'Tracks all changes to time entries for compliance and auditing';
COMMENT ON COLUMN time_entry_audit_log.changes IS 'JSON object containing old and new values of changed fields';
COMMENT ON FUNCTION calculate_duration IS 'Calculates hours and minutes from two timestamps';
COMMENT ON FUNCTION update_time_entry_duration IS 'Trigger function to auto-calculate duration when times change';
COMMENT ON FUNCTION log_time_entry_changes IS 'Trigger function to automatically log changes to audit table';

-- Done!
-- Next steps: Deploy edge functions (lock_time_entry, unlock_time_entry)
