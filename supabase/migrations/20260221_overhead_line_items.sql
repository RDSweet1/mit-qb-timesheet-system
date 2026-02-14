-- Configurable non-payroll overhead line items
-- Annual amounts are divided by 52 in the profitability report to get weekly overhead
-- Payroll is NOT included here — it's calculated from employee_cost_rates × time entries

CREATE TABLE IF NOT EXISTS overhead_line_items (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  vendor TEXT NOT NULL,
  annual_amount NUMERIC(10,2) NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'monthly', -- monthly, quarterly, annual, weekly
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with known overhead items from 2025 GL analysis
INSERT INTO overhead_line_items (category, vendor, annual_amount, frequency, notes) VALUES
  ('IT', 'Prometheus Consulting', 16616, 'monthly', 'GL 2025: 12 payments avg $1,385/mo'),
  ('IT', 'Dove IT', 18000, 'monthly', 'User estimate: ~$1,500/mo (new provider)'),
  ('Insurance', 'Progressive (vehicles)', 12000, 'monthly', 'User estimate: ~$1,000/mo for Dodge truck + Navigator'),
  ('Medical', 'Health Equity', 8500, 'annual', 'GL 2025: 1 annual payment'),
  ('Reimbursement', 'Sweet (electricity/vehicles)', 7546, 'quarterly', 'GL 2025: 3 payments'),
  ('Telecom', 'Verizon Wireless', 6888, 'monthly', 'GL 2025: 12 payments avg $574/mo'),
  ('Taxes', 'Property taxes', 3500, 'annual', 'User estimate: ~$3,500/yr'),
  ('Insurance', 'Frank Crum (GL insurance)', 3000, 'annual', 'User estimate: $2-4K/yr, midpoint used'),
  ('Software', 'Xactimate', 2500, 'annual', 'User estimate: $2-3K/yr'),
  ('Maintenance', 'Various (repairs)', 2451, 'annual', 'GL 2025: 9 misc payments'),
  ('Taxes', 'FL Dept of Revenue', 1619, 'annual', 'GL 2025: 3 payments'),
  ('Software', 'Software Subscriptions', 999, 'annual', 'GL 2025'),
  ('Security', 'Guardian Pro', 924, 'monthly', 'GL 2025 + $10/mo increase'),
  ('Auto', 'Sunpass tolls', 840, 'annual', 'GL 2025: 6 payments');

-- RLS: only service_role can manage overhead config
ALTER TABLE overhead_line_items ENABLE ROW LEVEL SECURITY;

-- Allow anon to read (for frontend display)
CREATE POLICY "anon_read_overhead" ON overhead_line_items FOR SELECT TO anon USING (true);
