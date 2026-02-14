-- Add non-payroll overhead column to profitability snapshots
ALTER TABLE profitability_snapshots
  ADD COLUMN IF NOT EXISTS non_payroll_overhead NUMERIC(10,2) DEFAULT 0;
