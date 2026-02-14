-- Documentation migration: invoice workflow tables from 20260217_invoice_preview_workflow.
-- Uses CREATE TABLE IF NOT EXISTS so this is safe to run on an existing database.
-- These tables ALREADY EXIST from the original migration — this is for documentation only.

-- invoice_staging: Temporary staging for invoice preview/comparison workflow.
CREATE TABLE IF NOT EXISTS invoice_staging (
  id BIGSERIAL PRIMARY KEY,
  batch_id UUID NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  qb_customer_id TEXT,
  customer_name TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  -- Our calculated values
  our_total_hours NUMERIC(10,2) DEFAULT 0,
  our_total_amount NUMERIC(12,2) DEFAULT 0,
  our_line_items JSONB DEFAULT '[]'::jsonb,
  our_time_entry_ids TEXT[] DEFAULT '{}',
  -- Existing QB invoice info (null if none found)
  qb_existing_invoice_id TEXT,
  qb_existing_invoice_number TEXT,
  qb_existing_sync_token TEXT,
  qb_existing_total NUMERIC(12,2),
  qb_existing_line_items JSONB,
  -- Comparison
  comparison_status TEXT NOT NULL DEFAULT 'new'
    CHECK (comparison_status IN ('new', 'exists_match', 'exists_different', 'already_logged')),
  differences JSONB,
  -- User action and execution result
  action TEXT NOT NULL DEFAULT 'pending'
    CHECK (action IN ('pending', 'create_new', 'update_existing', 'skip')),
  result_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (result_status IN ('pending', 'success', 'failed', 'skipped')),
  result_qb_invoice_id TEXT,
  result_error TEXT,
  executed_at TIMESTAMPTZ,
  -- Metadata
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- invoice_log: Audit trail for invoice creation/update operations.
CREATE TABLE IF NOT EXISTS invoice_log (
  id BIGSERIAL PRIMARY KEY,
  qb_invoice_id TEXT,
  qb_customer_id TEXT,
  customer_name TEXT,
  period_start DATE,
  period_end DATE,
  total_amount NUMERIC(12,2),
  line_count INTEGER,
  status TEXT DEFAULT 'created',
  error TEXT,
  staging_id BIGINT REFERENCES invoice_staging(id),
  action_type TEXT DEFAULT 'create_new'
    CHECK (action_type IN ('create_new', 'update_existing')),
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
