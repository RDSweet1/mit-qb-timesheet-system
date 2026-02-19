-- Cash Position tables: QB Payments, Deposits, and Invoice Balances
-- Used by the Cash Position tab on the Profitability page

-- 1. QB Payments (ReceivePayment transactions)
CREATE TABLE IF NOT EXISTS qb_payments (
  id BIGSERIAL PRIMARY KEY,
  qb_payment_id TEXT UNIQUE NOT NULL,
  txn_date DATE NOT NULL,
  qb_customer_id TEXT,
  customer_name TEXT,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT,
  payment_ref_num TEXT,
  deposit_to_account TEXT,
  unapplied_amount NUMERIC(12,2) DEFAULT 0,
  linked_invoices JSONB DEFAULT '[]'::jsonb,
  sync_token TEXT,
  synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qb_payments_txn_date ON qb_payments(txn_date);
CREATE INDEX IF NOT EXISTS idx_qb_payments_customer ON qb_payments(qb_customer_id);

-- 2. QB Deposits
CREATE TABLE IF NOT EXISTS qb_deposits (
  id BIGSERIAL PRIMARY KEY,
  qb_deposit_id TEXT UNIQUE NOT NULL,
  txn_date DATE NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  deposit_to_account TEXT,
  line_items JSONB DEFAULT '[]'::jsonb,
  memo TEXT,
  synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qb_deposits_txn_date ON qb_deposits(txn_date);

-- 3. QB Invoice Balances (current payment status of invoices)
CREATE TABLE IF NOT EXISTS qb_invoice_balances (
  id BIGSERIAL PRIMARY KEY,
  qb_invoice_id TEXT UNIQUE NOT NULL,
  invoice_number TEXT,
  qb_customer_id TEXT,
  customer_name TEXT,
  txn_date DATE,
  due_date DATE,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'Open',
  synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qb_invoice_balances_customer ON qb_invoice_balances(qb_customer_id);
CREATE INDEX IF NOT EXISTS idx_qb_invoice_balances_status ON qb_invoice_balances(status);
CREATE INDEX IF NOT EXISTS idx_qb_invoice_balances_due_date ON qb_invoice_balances(due_date);

-- RLS: anon can SELECT, service_role has full access
ALTER TABLE qb_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE qb_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE qb_invoice_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_qb_payments" ON qb_payments
  FOR SELECT TO anon USING (true);

CREATE POLICY "service_role_all_qb_payments" ON qb_payments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "anon_select_qb_deposits" ON qb_deposits
  FOR SELECT TO anon USING (true);

CREATE POLICY "service_role_all_qb_deposits" ON qb_deposits
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "anon_select_qb_invoice_balances" ON qb_invoice_balances
  FOR SELECT TO anon USING (true);

CREATE POLICY "service_role_all_qb_invoice_balances" ON qb_invoice_balances
  FOR ALL TO service_role USING (true) WITH CHECK (true);
