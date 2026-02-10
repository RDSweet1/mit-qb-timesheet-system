-- Internal Clarification Loop
-- Enables structured Q&A between admin (Sharon) and field techs about time entries

-- ─── New Tables ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS internal_assignments (
  id BIGSERIAL PRIMARY KEY,
  time_entry_id INTEGER REFERENCES time_entries(id) ON DELETE CASCADE,
  assigned_by TEXT NOT NULL,
  assigned_to_user_id UUID REFERENCES app_users(id),
  assigned_to_email TEXT NOT NULL,
  assigned_to_name TEXT NOT NULL,
  question TEXT NOT NULL,
  suggested_description TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'responded', 'cleared', 'cancelled')),
  batch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  cleared_at TIMESTAMPTZ,
  cleared_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS internal_messages (
  id BIGSERIAL PRIMARY KEY,
  assignment_id BIGINT NOT NULL REFERENCES internal_assignments(id) ON DELETE CASCADE,
  sender_email TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('admin', 'assignee')),
  message TEXT NOT NULL,
  suggested_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS internal_review_tokens (
  id BIGSERIAL PRIMARY KEY,
  assignment_id BIGINT NOT NULL REFERENCES internal_assignments(id) ON DELETE CASCADE,
  token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  first_opened_at TIMESTAMPTZ,
  last_opened_at TIMESTAMPTZ,
  open_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Add clarification flag to time_entries ──────────────────────────

ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS has_active_clarification BOOLEAN NOT NULL DEFAULT false;

-- ─── Indexes ─────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_internal_assignments_time_entry
  ON internal_assignments(time_entry_id);
CREATE INDEX IF NOT EXISTS idx_internal_assignments_status
  ON internal_assignments(status);
CREATE INDEX IF NOT EXISTS idx_internal_assignments_batch
  ON internal_assignments(batch_id);
CREATE INDEX IF NOT EXISTS idx_internal_assignments_assigned_to
  ON internal_assignments(assigned_to_email);
CREATE INDEX IF NOT EXISTS idx_internal_messages_assignment
  ON internal_messages(assignment_id);
CREATE INDEX IF NOT EXISTS idx_internal_review_tokens_token
  ON internal_review_tokens(token);
CREATE INDEX IF NOT EXISTS idx_internal_review_tokens_assignment
  ON internal_review_tokens(assignment_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_has_clarification
  ON time_entries(has_active_clarification) WHERE has_active_clarification = true;

-- ─── RLS Policies ────────────────────────────────────────────────────

ALTER TABLE internal_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_review_tokens ENABLE ROW LEVEL SECURITY;

-- internal_assignments: anon can SELECT + UPDATE, service_role bypasses
CREATE POLICY "anon_select_internal_assignments" ON internal_assignments
  FOR SELECT TO anon USING (true);
CREATE POLICY "anon_update_internal_assignments" ON internal_assignments
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- internal_messages: anon can SELECT + INSERT (Sharon replies from frontend)
CREATE POLICY "anon_select_internal_messages" ON internal_messages
  FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_internal_messages" ON internal_messages
  FOR INSERT TO anon WITH CHECK (true);

-- internal_review_tokens: anon can SELECT + UPDATE (visit tracking)
CREATE POLICY "anon_select_internal_review_tokens" ON internal_review_tokens
  FOR SELECT TO anon USING (true);
CREATE POLICY "anon_update_internal_review_tokens" ON internal_review_tokens
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ─── Updated_at trigger for internal_assignments ─────────────────────

CREATE OR REPLACE FUNCTION update_internal_assignment_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_internal_assignment_updated_at
  BEFORE UPDATE ON internal_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_internal_assignment_updated_at();
