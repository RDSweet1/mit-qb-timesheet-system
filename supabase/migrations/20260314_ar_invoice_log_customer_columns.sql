-- Add qb_customer_id and customer_name to invoice_log
-- These were missing from the original table definition.
-- All AR edge functions reference these columns; the functions
-- also insert them via create-invoices (silently discarded before this migration).

ALTER TABLE invoice_log ADD COLUMN IF NOT EXISTS qb_customer_id TEXT;
ALTER TABLE invoice_log ADD COLUMN IF NOT EXISTS customer_name TEXT;

-- Backfill from customers table for any existing rows
UPDATE invoice_log il
SET
  qb_customer_id = c.qb_customer_id,
  customer_name  = c.display_name
FROM customers c
WHERE il.customer_id = c.id
  AND (il.qb_customer_id IS NULL OR il.customer_name IS NULL);
