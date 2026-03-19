-- Promote time entries to QB Online
-- Adds tracking columns and employees lookup table

-- New columns on time_entries for promotion tracking
ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS qb_online_id TEXT,
  ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS promoted_by TEXT,
  ADD COLUMN IF NOT EXISTS promotion_status TEXT DEFAULT NULL
    CHECK (promotion_status IN ('pending', 'promoted', 'failed', 'skipped'));

-- Unique index prevents double-create at DB level
CREATE UNIQUE INDEX IF NOT EXISTS idx_time_entries_qb_online_id
  ON time_entries(qb_online_id) WHERE qb_online_id IS NOT NULL;

-- Index for quick lookup of entries needing promotion retry
CREATE INDEX IF NOT EXISTS idx_time_entries_promotion_status
  ON time_entries(promotion_status) WHERE promotion_status IS NOT NULL;

-- Employees lookup table (QB Online Employee IDs)
CREATE TABLE IF NOT EXISTS employees (
  id BIGSERIAL PRIMARY KEY,
  qb_employee_id TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  given_name TEXT,
  family_name TEXT,
  email TEXT,
  is_active BOOLEAN DEFAULT true,
  synced_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for employees table
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_employees" ON employees
  FOR SELECT TO anon USING (true);

CREATE POLICY "service_role_all_employees" ON employees
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RLS for new time_entries columns (already covered by existing policies)
-- No additional RLS needed since time_entries policies use SELECT * / UPDATE
