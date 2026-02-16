-- Add per-customer acceptance gate override for auto-invoicing
-- When skip_acceptance_gate = true, auto-send-invoices will not require
-- all report_periods to be 'accepted' before creating the invoice.
-- Intended as a temporary flag during new customer onboarding.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS skip_acceptance_gate BOOLEAN DEFAULT false;

-- Allow anon role to update customer invoice override flags from the frontend
CREATE POLICY "Anon can update customer invoice overrides" ON customers
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- Allow anon to read customers (needed for the override management UI)
-- Check if policy already exists before creating
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'customers' AND policyname = 'Anon can read customers'
  ) THEN
    CREATE POLICY "Anon can read customers" ON customers
      FOR SELECT TO anon
      USING (true);
  END IF;
END $$;
