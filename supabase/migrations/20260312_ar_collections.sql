-- AR Collections: Accounts Receivable tracking, dunning sequence, payment log
-- Due date = 1st of month following billing period + 3 days (all reports accepted)
-- Dunning: Day +7 (Stage 1), +15 (Stage 2 / project hold), +30, +45, +60 (attorney)

-- ─────────────────────────────────────────────────────────────────
-- 1. Extend invoice_log with AR tracking columns
-- ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Due date: 1st of next month + 3 days from billing period end
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_log' AND column_name = 'due_date') THEN
    ALTER TABLE invoice_log ADD COLUMN due_date DATE;
  END IF;
  -- AR lifecycle status
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_log' AND column_name = 'ar_status') THEN
    ALTER TABLE invoice_log ADD COLUMN ar_status TEXT DEFAULT 'unpaid'
      CHECK (ar_status IN ('unpaid','partial','paid','disputed','on_hold','attorney','void'));
  END IF;
  -- Which dunning stage we are currently on (0 = invoice sent, 1-5 = dunning stages)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_log' AND column_name = 'current_stage') THEN
    ALTER TABLE invoice_log ADD COLUMN current_stage INTEGER DEFAULT 0;
  END IF;
  -- Date when the next dunning action should fire
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_log' AND column_name = 'next_action_date') THEN
    ALTER TABLE invoice_log ADD COLUMN next_action_date DATE;
  END IF;
  -- Payment tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_log' AND column_name = 'amount_paid') THEN
    ALTER TABLE invoice_log ADD COLUMN amount_paid NUMERIC(12,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_log' AND column_name = 'balance_due') THEN
    ALTER TABLE invoice_log ADD COLUMN balance_due NUMERIC(12,2);
  END IF;
  -- Billing hold: warn Sharon before sending new reports
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_log' AND column_name = 'billing_hold') THEN
    ALTER TABLE invoice_log ADD COLUMN billing_hold BOOLEAN DEFAULT false;
  END IF;
  -- Promise-to-pay: snooze dunning until this date
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_log' AND column_name = 'promise_to_pay_date') THEN
    ALTER TABLE invoice_log ADD COLUMN promise_to_pay_date DATE;
  END IF;
  -- Attorney referral timestamp
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_log' AND column_name = 'attorney_referred_at') THEN
    ALTER TABLE invoice_log ADD COLUMN attorney_referred_at TIMESTAMPTZ;
  END IF;
  -- Dispute tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_log' AND column_name = 'dispute_reason') THEN
    ALTER TABLE invoice_log ADD COLUMN dispute_reason TEXT;
  END IF;
  -- Link to report_periods that rolled into this invoice
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_log' AND column_name = 'linked_report_period_ids') THEN
    ALTER TABLE invoice_log ADD COLUMN linked_report_period_ids BIGINT[] DEFAULT '{}';
  END IF;
  -- QB invoice number (for display, already stored in some rows as qb_invoice_id)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_log' AND column_name = 'qb_invoice_number') THEN
    ALTER TABLE invoice_log ADD COLUMN qb_invoice_number TEXT;
  END IF;
END $$;

-- Index for AR automation queries
CREATE INDEX IF NOT EXISTS idx_invoice_log_ar_status ON invoice_log(ar_status, next_action_date);
CREATE INDEX IF NOT EXISTS idx_invoice_log_billing_hold ON invoice_log(billing_hold) WHERE billing_hold = true;

-- ─────────────────────────────────────────────────────────────────
-- 2. AR Collection Emails — every dunning email sent
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ar_collection_emails (
  id BIGSERIAL PRIMARY KEY,
  invoice_log_id BIGINT REFERENCES invoice_log(id) ON DELETE CASCADE,
  qb_invoice_id TEXT NOT NULL,
  qb_customer_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  stage INTEGER NOT NULL,                        -- 1–5
  stage_label TEXT NOT NULL,                     -- "First Notice", "Grace Expired", etc.
  sent_at TIMESTAMPTZ DEFAULT now(),
  sent_by TEXT NOT NULL DEFAULT 'system',
  recipient_email TEXT NOT NULL,
  cc_emails TEXT[] DEFAULT '{}',
  -- Graph API tracking
  message_id TEXT,                               -- Graph API message ID
  delivered_at TIMESTAMPTZ,                      -- populated by receipt processing
  read_at TIMESTAMPTZ,                           -- populated by receipt processing
  bounced_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  outcome TEXT DEFAULT 'sent'
    CHECK (outcome IN ('sent','delivered','read','bounced','replied','failed')),
  -- QB payment link included
  qb_payment_link TEXT,
  amount_due NUMERIC(12,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ar_collection_emails_invoice ON ar_collection_emails(invoice_log_id);
CREATE INDEX IF NOT EXISTS idx_ar_collection_emails_message ON ar_collection_emails(message_id) WHERE message_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────
-- 3. AR Payments — QB-synced and manually logged payments
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ar_payments (
  id BIGSERIAL PRIMARY KEY,
  invoice_log_id BIGINT REFERENCES invoice_log(id) ON DELETE CASCADE,
  qb_invoice_id TEXT NOT NULL,
  qb_customer_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  payment_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  method TEXT DEFAULT 'other'
    CHECK (method IN ('check','wire','ach','credit_card','qb_payments','cash','other')),
  reference_number TEXT,                        -- check number, wire ref, etc.
  notes TEXT,
  source TEXT DEFAULT 'manual'
    CHECK (source IN ('qb_synced','manual')),
  qb_payment_id TEXT,                           -- QB payment record ID (if synced)
  logged_by TEXT,
  logged_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ar_payments_invoice ON ar_payments(invoice_log_id);
CREATE INDEX IF NOT EXISTS idx_ar_payments_customer ON ar_payments(qb_customer_id);

-- ─────────────────────────────────────────────────────────────────
-- 4. AR Activity Log — calls, notes, disputes, promises, escalations
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ar_activity_log (
  id BIGSERIAL PRIMARY KEY,
  invoice_log_id BIGINT REFERENCES invoice_log(id) ON DELETE CASCADE,
  qb_invoice_id TEXT NOT NULL,
  qb_customer_id TEXT NOT NULL,
  activity_type TEXT NOT NULL
    CHECK (activity_type IN ('note','call','email','payment','dispute','promise','hold','escalation','attorney')),
  description TEXT NOT NULL,
  performed_by TEXT NOT NULL,
  performed_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb       -- stage, amount, dates, etc.
);

CREATE INDEX IF NOT EXISTS idx_ar_activity_invoice ON ar_activity_log(invoice_log_id);
CREATE INDEX IF NOT EXISTS idx_ar_activity_customer ON ar_activity_log(qb_customer_id);
CREATE INDEX IF NOT EXISTS idx_ar_activity_type ON ar_activity_log(activity_type, performed_at DESC);

-- ─────────────────────────────────────────────────────────────────
-- 5. AR Sequence Config — configurable dunning schedule
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ar_sequence_config (
  stage INTEGER PRIMARY KEY,
  label TEXT NOT NULL,
  days_from_due INTEGER NOT NULL,    -- days after due_date to fire
  auto_fire BOOLEAN DEFAULT true,    -- false = requires manual approval
  email_subject TEXT NOT NULL,
  email_tone TEXT NOT NULL           -- friendly|firm|urgent|final|internal
    CHECK (email_tone IN ('friendly','firm','urgent','final','internal')),
  creates_billing_hold BOOLEAN DEFAULT false,
  internal_alert BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default sequence (idempotent)
INSERT INTO ar_sequence_config (stage, label, days_from_due, auto_fire, email_subject, email_tone, creates_billing_hold, internal_alert)
VALUES
  (1, 'First Notice',         7,  true,  'Payment Reminder — Invoice #{invoice_number}',                                      'friendly', false, false),
  (2, 'Grace Period Expired', 15, true,  'Grace Period Expired — Project On Hold — Invoice #{invoice_number}',                'firm',     true,  true),
  (3, 'Second Notice',        30, true,  'Second Notice — Account Past Due — Invoice #{invoice_number}',                      'urgent',   false, false),
  (4, 'Final Notice',         45, true,  'Final Notice Before Collections — Invoice #{invoice_number}',                       'final',    false, false),
  (5, 'Attorney Referral',    60, false, 'INTERNAL: Attorney Referral — {customer_name} — Invoice #{invoice_number}',         'internal', false, true)
ON CONFLICT (stage) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────
-- 6. RLS Policies
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE ar_collection_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_sequence_config ENABLE ROW LEVEL SECURITY;

-- Anon can read all AR tables (frontend uses anon key)
CREATE POLICY "Anon read ar_collection_emails" ON ar_collection_emails FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read ar_payments"          ON ar_payments          FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read ar_activity_log"      ON ar_activity_log      FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read ar_sequence_config"   ON ar_sequence_config   FOR SELECT TO anon USING (true);

-- Anon can insert payments and activity (manual logging from frontend)
CREATE POLICY "Anon insert ar_payments"        ON ar_payments      FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon insert ar_activity_log"    ON ar_activity_log  FOR INSERT TO anon WITH CHECK (true);

-- Service role full access
CREATE POLICY "Service role ar_collection_emails" ON ar_collection_emails FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role ar_payments"          ON ar_payments          FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role ar_activity_log"      ON ar_activity_log      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role ar_sequence_config"   ON ar_sequence_config   FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Also allow anon to update invoice_log ar fields (billing hold acknowledgment)
DROP POLICY IF EXISTS "Anon update invoice_log ar fields" ON invoice_log;
CREATE POLICY "Anon update invoice_log ar fields" ON invoice_log
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE ar_collection_emails IS 'Every dunning email sent per invoice — tracks delivery and read receipts';
COMMENT ON TABLE ar_payments IS 'Payment records per invoice — QB-synced or manually logged';
COMMENT ON TABLE ar_activity_log IS 'Timestamped activity trail per invoice: calls, notes, disputes, promises';
COMMENT ON TABLE ar_sequence_config IS 'Configurable dunning schedule — days offsets and auto-fire settings per stage';
