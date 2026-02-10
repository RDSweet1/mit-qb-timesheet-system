-- Invoice Preview Workflow: staging table for preview-approve-execute pattern
-- This replaces the one-click-to-QB flow with a safe multi-step workflow

-- invoice_staging: stores preview results for each customer per batch
CREATE TABLE IF NOT EXISTS invoice_staging (
  id BIGSERIAL PRIMARY KEY,
  batch_id UUID NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  qb_customer_id TEXT,
  customer_name TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Our calculated values
  our_total_hours DECIMAL(10,2) DEFAULT 0,
  our_total_amount DECIMAL(12,2) DEFAULT 0,
  our_line_items JSONB DEFAULT '[]'::jsonb,
  our_time_entry_ids TEXT[] DEFAULT '{}',

  -- Existing QB invoice info (null if none found)
  qb_existing_invoice_id TEXT,
  qb_existing_invoice_number TEXT,
  qb_existing_sync_token TEXT,
  qb_existing_total DECIMAL(12,2),
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

-- Indexes for common queries
CREATE INDEX idx_invoice_staging_batch ON invoice_staging(batch_id);
CREATE INDEX idx_invoice_staging_customer ON invoice_staging(customer_id);
CREATE INDEX idx_invoice_staging_period ON invoice_staging(period_start, period_end);

-- Add staging_id and action_type to invoice_log
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_log' AND column_name = 'staging_id') THEN
    ALTER TABLE invoice_log ADD COLUMN staging_id BIGINT REFERENCES invoice_staging(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_log' AND column_name = 'action_type') THEN
    ALTER TABLE invoice_log ADD COLUMN action_type TEXT DEFAULT 'create_new'
      CHECK (action_type IN ('create_new', 'update_existing'));
  END IF;
END $$;

-- RLS: Enable on invoice_staging
ALTER TABLE invoice_staging ENABLE ROW LEVEL SECURITY;

-- Anon can read staging data (frontend needs to display previews)
CREATE POLICY "Anon users can read invoice_staging" ON invoice_staging
  FOR SELECT TO anon USING (true);

-- Anon can update action column (frontend sets create/skip/update)
CREATE POLICY "Anon users can update invoice_staging action" ON invoice_staging
  FOR UPDATE TO anon USING (true)
  WITH CHECK (true);
