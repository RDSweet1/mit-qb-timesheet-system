-- QuickBooks Timesheet Billing System
-- Database Schema for Supabase
-- Run this in Supabase SQL Editor

-- ============================================
-- TABLES
-- ============================================

-- Customers cache (synced from QuickBooks)
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  qb_customer_id TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT,
  net_terms INTEGER DEFAULT 0,  -- 0 = Due on Receipt
  is_active BOOLEAN DEFAULT true,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Service items / Cost codes (synced from QuickBooks)
-- RATES ARE STORED HERE
-- Short codes derived from item names (e.g., "Expert Witness - Deposition" → "EXPERT-DEPO")
CREATE TABLE IF NOT EXISTS service_items (
  id SERIAL PRIMARY KEY,
  qb_item_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,           -- e.g., "Expert Witness - Deposition"
  code TEXT,                    -- Derived short code e.g., "EXPERT-DEPO"
  description TEXT,
  unit_price DECIMAL(10,2) NOT NULL,  -- Rate for this cost code
  is_active BOOLEAN DEFAULT true,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Time entries cache (synced from QuickBooks)
-- Contains all fields needed for detailed invoice line items
CREATE TABLE IF NOT EXISTS time_entries (
  id SERIAL PRIMARY KEY,
  qb_time_id TEXT UNIQUE NOT NULL,
  qb_sync_token TEXT,  -- needed for updates
  
  -- Core references
  qb_customer_id TEXT NOT NULL,
  qb_employee_id TEXT NOT NULL,
  employee_name TEXT,
  
  -- Date and time (supports BOTH clock in/out AND lump sum)
  txn_date DATE NOT NULL,
  start_time TIMESTAMPTZ,       -- NULL for lump sum entries
  end_time TIMESTAMPTZ,         -- NULL for lump sum entries
  hours INTEGER NOT NULL,
  minutes INTEGER NOT NULL,
  
  -- Cost code / Service item (RATE COMES FROM HERE)
  qb_item_id TEXT,              -- FK to service_items
  cost_code TEXT,               -- Display code (e.g., "EXPERT-DEPO")
  service_item_name TEXT,       -- Full name
  
  -- Work details - SEPARATE FIELDS
  description TEXT,             -- Description of work performed
  notes TEXT,                   -- Additional notes (separate field in Workforce)
  
  -- Billing
  billable_status TEXT,         -- Billable, NotBillable, HasBeenBilled
  
  -- Sync tracking
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  
  FOREIGN KEY (qb_customer_id) REFERENCES customers(qb_customer_id),
  FOREIGN KEY (qb_item_id) REFERENCES service_items(qb_item_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_time_entries_customer_date ON time_entries(qb_customer_id, txn_date);
CREATE INDEX IF NOT EXISTS idx_time_entries_billable ON time_entries(billable_status) WHERE billable_status = 'Billable';
CREATE INDEX IF NOT EXISTS idx_time_entries_item ON time_entries(qb_item_id);

-- Invoice creation log
CREATE TABLE IF NOT EXISTS invoice_log (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  qb_invoice_id TEXT,           -- QuickBooks Invoice ID
  qb_invoice_number TEXT,       -- DocNumber in QB
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,
  total_hours DECIMAL(10,2),
  total_amount DECIMAL(10,2),
  line_item_count INTEGER,
  time_entry_ids TEXT[],        -- Array of QB TimeActivity IDs included
  status TEXT DEFAULT 'created',  -- created, sent, paid, voided
  created_by TEXT,              -- Employee email who triggered
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicate invoices for same period
  UNIQUE(customer_id, billing_period_start, billing_period_end)
);

-- Email log (weekly reminders)
CREATE TABLE IF NOT EXISTS email_log (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  email_type TEXT DEFAULT 'weekly_reminder',
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  total_hours DECIMAL(10,2),
  estimated_amount DECIMAL(10,2),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  resend_id TEXT
);

-- App users (synced from Entra ID on login)
CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entra_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  can_view BOOLEAN DEFAULT true,
  can_send_reminders BOOLEAN DEFAULT false,
  can_create_invoices BOOLEAN DEFAULT false,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_items ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read
CREATE POLICY "Authenticated users can read time_entries" ON time_entries
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read customers" ON customers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read invoice_log" ON invoice_log
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read service_items" ON service_items
  FOR SELECT TO authenticated USING (true);

-- Service role can do everything (for Edge Functions)
CREATE POLICY "Service role full access time_entries" ON time_entries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access customers" ON customers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access invoice_log" ON invoice_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access service_items" ON service_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================
-- EXTENSIONS (enable in Supabase dashboard first)
-- ============================================

-- For scheduled jobs:
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;
-- Email Sender Configuration
-- Add this after running the main schema.sql

-- Email senders table (configured email accounts)
CREATE TABLE IF NOT EXISTS email_senders (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE email_senders ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can read email_senders" ON email_senders
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access email_senders" ON email_senders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Insert configured email accounts
INSERT INTO email_senders (email, display_name, is_default, is_active) VALUES
  ('accounting@mitigationconsulting.com', 'Mitigation Consulting - Accounting', true, true),
  ('rdsweet1@gmail.com', 'David Sweet', false, true),
  ('natashagarces11@gmail.com', 'Natasha Garces', false, true),
  ('sharon@mitigationconsulting.com', 'Sharon Kisner', false, true)
ON CONFLICT (email) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  is_active = EXCLUDED.is_active;

-- Ensure only one default
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_senders_default
  ON email_senders(is_default)
  WHERE is_default = true;
