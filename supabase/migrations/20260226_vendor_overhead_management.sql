-- Vendor-based overhead management: categories, vendor mappings, and transaction-level tracking
-- This replaces account-level P&L sync with transaction-level vendor-based overhead management

-- 1. Predefined + custom overhead categories
CREATE TABLE IF NOT EXISTS overhead_categories (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  is_default BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default categories
INSERT INTO overhead_categories (name, is_default, display_order) VALUES
  ('IT', true, 1),
  ('Telecom', true, 2),
  ('Auto', true, 3),
  ('Insurance', true, 4),
  ('Medical', true, 5),
  ('Marketing', true, 6),
  ('Legal', true, 7),
  ('Professional', true, 8),
  ('Office', true, 9),
  ('Equipment', true, 10),
  ('Travel', true, 11),
  ('Meals', true, 12),
  ('Education', true, 13),
  ('Training', true, 14),
  ('Security', true, 15),
  ('Maintenance', true, 16),
  ('Taxes', true, 17),
  ('Software', true, 18),
  ('Reimbursement', true, 19),
  ('Accounting', true, 20)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE overhead_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_categories" ON overhead_categories FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_categories" ON overhead_categories FOR INSERT TO anon WITH CHECK (true);

-- 2. Persistent vendor → category mappings
CREATE TABLE IF NOT EXISTS overhead_vendor_mappings (
  id SERIAL PRIMARY KEY,
  vendor_name TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  is_overhead BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE overhead_vendor_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_vendor_mappings" ON overhead_vendor_mappings FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_vendor_mappings" ON overhead_vendor_mappings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_vendor_mappings" ON overhead_vendor_mappings FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_vendor_mappings" ON overhead_vendor_mappings FOR DELETE TO anon USING (true);

-- 3. Individual QB expense transactions
CREATE TABLE IF NOT EXISTS overhead_transactions (
  id SERIAL PRIMARY KEY,
  txn_date DATE NOT NULL,
  txn_type TEXT,
  txn_num TEXT,
  vendor_name TEXT,
  memo TEXT,
  qb_account_name TEXT,
  qb_account_id TEXT,
  split_account TEXT,
  amount NUMERIC(12,2) NOT NULL,
  category TEXT,
  category_source TEXT DEFAULT 'auto', -- 'auto', 'vendor', 'override'
  is_overhead BOOLEAN DEFAULT true,
  sync_period_start DATE,
  sync_period_end DATE,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(txn_date, txn_type, txn_num, vendor_name, qb_account_name, amount)
);

CREATE INDEX IF NOT EXISTS idx_overhead_txn_vendor ON overhead_transactions (vendor_name);
CREATE INDEX IF NOT EXISTS idx_overhead_txn_category ON overhead_transactions (category);
CREATE INDEX IF NOT EXISTS idx_overhead_txn_date ON overhead_transactions (txn_date);

ALTER TABLE overhead_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_transactions" ON overhead_transactions FOR SELECT TO anon USING (true);
CREATE POLICY "anon_update_transactions" ON overhead_transactions FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- 4. Extend overhead_line_items for transaction-sourced rows
ALTER TABLE overhead_line_items
  ADD COLUMN IF NOT EXISTS txn_count INTEGER,
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end DATE;
