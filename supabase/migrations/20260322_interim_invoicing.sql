-- Add invoice_type column to invoice_log and invoice_staging
-- Supports 'standard' (full calendar month) and 'interim' (partial date range)

ALTER TABLE invoice_log ADD COLUMN IF NOT EXISTS invoice_type TEXT DEFAULT 'standard'
  CHECK (invoice_type IN ('standard', 'interim'));

ALTER TABLE invoice_staging ADD COLUMN IF NOT EXISTS invoice_type TEXT DEFAULT 'standard'
  CHECK (invoice_type IN ('standard', 'interim'));
