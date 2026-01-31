-- Add Lock Mechanism to Time Entries
-- Prevents accidental edits that could conflict with QuickBooks data

-- Add lock/unlock columns
ALTER TABLE time_entries
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS unlocked_by TEXT,
ADD COLUMN IF NOT EXISTS unlocked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS edit_warning_acknowledged BOOLEAN DEFAULT false;

-- Add edit permission to app_users
ALTER TABLE app_users
ADD COLUMN IF NOT EXISTS can_edit_time_entries BOOLEAN DEFAULT false;

-- Create index for locked entries
CREATE INDEX IF NOT EXISTS idx_time_entries_locked
ON time_entries(is_locked);

-- Update RLS policy - only unlocked entries can be edited, and only by authorized users
DROP POLICY IF EXISTS "Approved users can update approval status" ON time_entries;

CREATE POLICY "Authorized users can unlock and edit time entries" ON time_entries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt()->>'email'
        AND (can_edit_time_entries = true OR can_approve_time = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt()->>'email'
        AND (can_edit_time_entries = true OR can_approve_time = true)
    )
  );

-- Function to unlock a time entry (requires acknowledgment)
CREATE OR REPLACE FUNCTION unlock_time_entry(
  entry_id INTEGER,
  user_email TEXT
) RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  -- Check if user has permission
  IF NOT EXISTS (
    SELECT 1 FROM app_users
    WHERE email = user_email
      AND (can_edit_time_entries = true OR can_approve_time = true)
  ) THEN
    RAISE EXCEPTION 'User does not have permission to unlock time entries';
  END IF;

  -- Unlock the entry
  UPDATE time_entries
  SET
    is_locked = false,
    unlocked_by = user_email,
    unlocked_at = NOW(),
    edit_warning_acknowledged = true
  WHERE id = entry_id;

  -- Return the updated entry
  SELECT jsonb_build_object(
    'success', true,
    'message', 'Entry unlocked. WARNING: Changes will not sync back to QuickBooks.',
    'unlocked_at', NOW(),
    'unlocked_by', user_email
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to lock a time entry (prevent edits)
CREATE OR REPLACE FUNCTION lock_time_entry(
  entry_id INTEGER,
  user_email TEXT
) RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  -- Lock the entry
  UPDATE time_entries
  SET
    is_locked = true,
    edit_warning_acknowledged = false
  WHERE id = entry_id;

  SELECT jsonb_build_object(
    'success', true,
    'message', 'Entry locked. Protected from accidental edits.',
    'locked_at', NOW()
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to bulk lock entries (after QB sync)
CREATE OR REPLACE FUNCTION lock_all_qb_entries() RETURNS INTEGER AS $$
DECLARE
  affected_count INTEGER;
BEGIN
  UPDATE time_entries
  SET
    is_locked = true,
    edit_warning_acknowledged = false
  WHERE qb_time_id IS NOT NULL  -- Only QB-synced entries
    AND is_locked = false;

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION unlock_time_entry TO authenticated;
GRANT EXECUTE ON FUNCTION lock_time_entry TO authenticated;
GRANT EXECUTE ON FUNCTION lock_all_qb_entries TO service_role;

-- Add comments
COMMENT ON COLUMN time_entries.is_locked IS
'Prevents editing. Default TRUE for QB-synced entries. Must be explicitly unlocked to edit.';

COMMENT ON COLUMN time_entries.unlocked_by IS
'Email of user who unlocked this entry for editing. NULL if never unlocked.';

COMMENT ON COLUMN time_entries.edit_warning_acknowledged IS
'User acknowledged that changes will NOT sync back to QuickBooks.';

-- Create view for unlocked entries (audit trail)
CREATE OR REPLACE VIEW unlocked_time_entries AS
SELECT
  te.id,
  te.txn_date,
  te.employee_name,
  c.display_name as customer_name,
  te.hours,
  te.minutes,
  te.unlocked_by,
  te.unlocked_at,
  te.is_locked
FROM time_entries te
LEFT JOIN customers c ON te.qb_customer_id = c.qb_customer_id
WHERE te.unlocked_at IS NOT NULL
ORDER BY te.unlocked_at DESC;

GRANT SELECT ON unlocked_time_entries TO authenticated;
