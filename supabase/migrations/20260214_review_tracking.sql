-- Review tracking tables for customer review portal
-- Enables: review tokens, follow-up reminders, customer actions, auto-accept
-- Created: 2026-02-14

-- ================================================
-- 1. Expand report_periods status values and add columns
-- ================================================
ALTER TABLE report_periods
  DROP CONSTRAINT IF EXISTS report_periods_status_check;

ALTER TABLE report_periods
  ADD CONSTRAINT report_periods_status_check
  CHECK (status IN ('pending', 'sent', 'supplemental_sent', 'accepted', 'disputed', 'no_time'));

ALTER TABLE report_periods
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

-- ================================================
-- 2. REVIEW TOKENS TABLE
-- One token per report_period, used as URL auth for customer portal
-- ================================================
CREATE TABLE IF NOT EXISTS review_tokens (
  id BIGSERIAL PRIMARY KEY,
  report_period_id BIGINT NOT NULL REFERENCES report_periods(id) ON DELETE CASCADE,
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- sent_at + 5 business days
  first_opened_at TIMESTAMPTZ,
  last_opened_at TIMESTAMPTZ,
  open_count INTEGER DEFAULT 0,
  customer_action TEXT CHECK (customer_action IN ('accepted', 'disputed', 'notes_submitted')),
  customer_action_at TIMESTAMPTZ,
  customer_notes TEXT,
  customer_ip TEXT,
  customer_user_agent TEXT,
  UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_review_tokens_token ON review_tokens(token);
CREATE INDEX IF NOT EXISTS idx_review_tokens_report_period ON review_tokens(report_period_id);

-- Enable RLS
ALTER TABLE review_tokens ENABLE ROW LEVEL SECURITY;

-- Anon can SELECT by token (for the public review portal page)
DROP POLICY IF EXISTS "Anon can read review tokens by token" ON review_tokens;
CREATE POLICY "Anon can read review tokens by token" ON review_tokens
  FOR SELECT TO anon USING (true);

-- Anon can UPDATE (for recording opens and customer actions from portal)
DROP POLICY IF EXISTS "Anon can update review tokens" ON review_tokens;
CREATE POLICY "Anon can update review tokens" ON review_tokens
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Service role full access
DROP POLICY IF EXISTS "Service role full access on review_tokens" ON review_tokens;
CREATE POLICY "Service role full access on review_tokens" ON review_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE review_tokens IS 'Unique tokens for customer review portal links. One per report_period.';
COMMENT ON COLUMN review_tokens.token IS 'UUID used in the review URL — unguessable, no login required';
COMMENT ON COLUMN review_tokens.customer_action IS 'What the customer did: accepted, disputed, or submitted notes';

-- ================================================
-- 3. REVIEW FOLLOW-UPS TABLE
-- Tracks each follow-up reminder email sent
-- ================================================
CREATE TABLE IF NOT EXISTS review_follow_ups (
  id BIGSERIAL PRIMARY KEY,
  report_period_id BIGINT NOT NULL REFERENCES report_periods(id) ON DELETE CASCADE,
  review_token_id BIGINT REFERENCES review_tokens(id) ON DELETE CASCADE,
  follow_up_number INTEGER NOT NULL, -- 1=48h, 2=24h, 3=final notice, 4=accepted confirmation
  email_type TEXT NOT NULL
    CHECK (email_type IN ('48h_reminder', '24h_reminder', 'final_notice', 'accepted_confirmation', 'action_confirmation', 'dispute_alert')),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  email_log_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_follow_ups_report_period
  ON review_follow_ups(report_period_id);
CREATE INDEX IF NOT EXISTS idx_review_follow_ups_type
  ON review_follow_ups(email_type, sent_at DESC);

-- Enable RLS
ALTER TABLE review_follow_ups ENABLE ROW LEVEL SECURITY;

-- Anon can read (frontend Reports page needs this)
DROP POLICY IF EXISTS "Anon can read review_follow_ups" ON review_follow_ups;
CREATE POLICY "Anon can read review_follow_ups" ON review_follow_ups
  FOR SELECT TO anon USING (true);

-- Service role full access
DROP POLICY IF EXISTS "Service role full access on review_follow_ups" ON review_follow_ups;
CREATE POLICY "Service role full access on review_follow_ups" ON review_follow_ups
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE review_follow_ups IS 'Tracks each follow-up reminder email in the 3-day review sequence';

-- ================================================
-- 4. ALTER EMAIL_LOG — add follow_up_number
-- ================================================
ALTER TABLE email_log
  ADD COLUMN IF NOT EXISTS follow_up_number INTEGER;
