/**
 * Add QB Time Integration Columns
 *
 * Adds columns to support syncing from QuickBooks Time (formerly TSheets)
 * which is the source of truth for actual clock in/out times.
 */

-- Add QB Time timesheet ID column
ALTER TABLE time_entries
ADD COLUMN IF NOT EXISTS qb_time_timesheet_id TEXT UNIQUE;

-- Add index for QB Time lookups
CREATE INDEX IF NOT EXISTS idx_time_entries_qb_time_id
ON time_entries(qb_time_timesheet_id);

-- Add QB Time sync timestamp
ALTER TABLE time_entries
ADD COLUMN IF NOT EXISTS qb_time_synced_at TIMESTAMPTZ;

-- Add comment
COMMENT ON COLUMN time_entries.qb_time_timesheet_id IS 'QuickBooks Time (TSheets) timesheet ID - source of truth for start/end times';
COMMENT ON COLUMN time_entries.qb_time_synced_at IS 'Last sync timestamp from QuickBooks Time API';

-- Note: start_time and end_time columns already exist from initial migration
-- They will be populated by QB Time sync instead of QB Online sync
