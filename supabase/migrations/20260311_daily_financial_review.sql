-- Daily Financial Review — tables for expense/revenue review workflow
-- Phase 1: Purchase + Bill sync with review status, category assignment, completion tracking

-- 1. Central table for all reviewed transactions
CREATE TABLE IF NOT EXISTS daily_review_transactions (
  id BIGSERIAL PRIMARY KEY,
  qb_entity_type TEXT NOT NULL,            -- 'Purchase', 'Bill', 'Payment', 'Deposit'
  qb_entity_id TEXT NOT NULL,              -- QB Id (for write-back)
  qb_sync_token TEXT,                      -- optimistic concurrency for write-back
  txn_class TEXT NOT NULL,                 -- 'expense' or 'revenue'
  txn_date DATE NOT NULL,
  total_amount NUMERIC(12,2),
  vendor_name TEXT,                        -- for expenses (EntityRef.name)
  customer_name TEXT,                      -- for revenue (CustomerRef.name)
  qb_customer_id TEXT,                     -- CustomerRef.value
  memo TEXT,                               -- PrivateNote
  payment_type TEXT,                       -- Cash/Check/CreditCard
  qb_account_name TEXT,                    -- AmEx, Chase Checking, etc.
  qb_account_id TEXT,
  line_items JSONB DEFAULT '[]'::jsonb,    -- full QB Line[] array
  review_status TEXT DEFAULT 'pending',    -- pending, reviewed, auto_approved, flagged
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  category TEXT,                           -- from overhead_categories
  category_source TEXT DEFAULT 'auto',     -- auto, vendor, manual, recurring
  is_overhead BOOLEAN DEFAULT true,
  recurring_rule_id INTEGER,              -- FK to recurring rules (Phase 3)
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(qb_entity_type, qb_entity_id)
);

CREATE INDEX idx_drt_review_status ON daily_review_transactions(review_status);
CREATE INDEX idx_drt_txn_date ON daily_review_transactions(txn_date);
CREATE INDEX idx_drt_txn_class ON daily_review_transactions(txn_class);
CREATE INDEX idx_drt_vendor_name ON daily_review_transactions(vendor_name);
CREATE INDEX idx_drt_category ON daily_review_transactions(category);

ALTER TABLE daily_review_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_drt" ON daily_review_transactions FOR SELECT TO anon USING (true);
CREATE POLICY "anon_update_drt" ON daily_review_transactions FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_drt" ON daily_review_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Audit log for review actions
CREATE TABLE IF NOT EXISTS daily_review_audit_log (
  id BIGSERIAL PRIMARY KEY,
  transaction_id BIGINT REFERENCES daily_review_transactions(id) ON DELETE CASCADE,
  action TEXT NOT NULL,                    -- reviewed, category_changed, memo_updated, qb_write_back, etc.
  user_email TEXT,
  changes JSONB,                           -- { field: { old, new } }
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dral_transaction_id ON daily_review_audit_log(transaction_id);

ALTER TABLE daily_review_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_dral" ON daily_review_audit_log FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_dral" ON daily_review_audit_log FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "service_role_all_dral" ON daily_review_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Per-day completion tracking
CREATE TABLE IF NOT EXISTS daily_review_completion (
  id SERIAL PRIMARY KEY,
  review_date DATE UNIQUE NOT NULL,
  completed BOOLEAN DEFAULT false,
  completed_by TEXT,
  completed_at TIMESTAMPTZ,
  pending_count INTEGER DEFAULT 0,
  total_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE daily_review_completion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_drc" ON daily_review_completion FOR SELECT TO anon USING (true);
CREATE POLICY "anon_update_drc" ON daily_review_completion FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_insert_drc" ON daily_review_completion FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "service_role_all_drc" ON daily_review_completion FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_daily_review_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_daily_review_updated_at
  BEFORE UPDATE ON daily_review_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_daily_review_updated_at();
