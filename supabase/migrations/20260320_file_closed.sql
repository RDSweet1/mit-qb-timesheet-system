-- Add file_closed columns to customers table
-- When a file is closed, no reports/invoices will be sent for that customer.
-- Time entries still sync from QB (data preserved), just not reported.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS file_closed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS file_closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS file_closed_by TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_file_closed ON customers(file_closed) WHERE file_closed = true;

-- Update the anon guard trigger to allow anon to change file_closed fields
CREATE OR REPLACE FUNCTION restrict_anon_customer_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Only restrict the anon role; service_role can update anything
  IF current_setting('role', true) = 'anon'
     OR current_setting('request.jwt.claim.role', true) = 'anon'
     OR (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'anon'
  THEN
    -- Preserve all columns except skip_acceptance_gate and file_closed fields
    NEW.id := OLD.id;
    NEW.qb_customer_id := OLD.qb_customer_id;
    NEW.display_name := OLD.display_name;
    NEW.email := OLD.email;
    NEW.net_terms := OLD.net_terms;
    NEW.is_active := OLD.is_active;
    NEW.synced_at := OLD.synced_at;
    NEW.is_internal := OLD.is_internal;
    -- skip_acceptance_gate and file_closed/file_closed_at/file_closed_by are the columns anon can change
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
