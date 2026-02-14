-- Documentation migration: core tables that were created outside migration files.
-- Uses CREATE TABLE IF NOT EXISTS so this is safe to run on an existing database.

-- time_entries: Primary table for all QB time data synced from Workforce/QB Online.
-- Base columns from initial qb-time-sync, plus additions from migrations 20260131-20260216.
CREATE TABLE IF NOT EXISTS time_entries (
  id BIGSERIAL PRIMARY KEY,
  qb_time_id TEXT UNIQUE,
  employee_name TEXT,
  qb_customer_id TEXT,
  txn_date DATE,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  hours NUMERIC(6,2) DEFAULT 0,
  minutes INTEGER DEFAULT 0,
  service_item_name TEXT,
  cost_code TEXT,
  qb_item_id TEXT,
  description TEXT,
  notes TEXT,
  billable_status TEXT DEFAULT 'Billable',
  is_locked BOOLEAN DEFAULT true,
  unlocked_by TEXT,
  unlocked_at TIMESTAMPTZ,
  -- From 20260131_approval_workflow
  approval_status TEXT DEFAULT 'pending',
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  -- From 20260203_time_entry_editing
  updated_at TIMESTAMPTZ,
  updated_by TEXT,
  manually_edited BOOLEAN DEFAULT false,
  edit_count INTEGER DEFAULT 0,
  -- From 20260204_add_email_tracking
  sent_at TIMESTAMPTZ,
  sent_to TEXT,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  read_receipt_declined BOOLEAN DEFAULT false,
  -- From 20260213_post_send_edit
  change_reason TEXT,
  post_send_edit BOOLEAN DEFAULT false,
  amended_at TIMESTAMPTZ,
  -- From 20260216_internal_clarification
  has_active_clarification BOOLEAN NOT NULL DEFAULT false,
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  synced_at TIMESTAMPTZ DEFAULT now()
);

-- customers: QB Online customer reference data synced by qb-online-sync.
CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  qb_customer_id TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT,
  is_active BOOLEAN DEFAULT true,
  is_internal BOOLEAN DEFAULT false,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- service_items: QB Online service items synced by sync-service-items.
CREATE TABLE IF NOT EXISTS service_items (
  id BIGSERIAL PRIMARY KEY,
  qb_item_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  unit_price NUMERIC(10,2),
  is_active BOOLEAN DEFAULT true,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
