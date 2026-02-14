-- Add columns to support QB-synced overhead items alongside manual entries
ALTER TABLE overhead_line_items
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS qb_account_name TEXT,
  ADD COLUMN IF NOT EXISTS qb_account_id TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

UPDATE overhead_line_items SET source = 'manual' WHERE source IS NULL;

-- Partial unique index: only QB-synced items are deduplicated by account ID
CREATE UNIQUE INDEX IF NOT EXISTS overhead_qb_account_unique
  ON overhead_line_items (qb_account_id) WHERE source = 'qb_sync';
