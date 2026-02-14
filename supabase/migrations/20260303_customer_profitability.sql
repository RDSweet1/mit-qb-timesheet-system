-- Per-customer per-week profitability snapshots
-- Enables drill-down views and fixes invoice margin badge queries

CREATE TABLE customer_profitability (
  id SERIAL PRIMARY KEY,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  qb_customer_id TEXT NOT NULL,
  customer_name TEXT,
  total_hours DECIMAL(10,2) DEFAULT 0,
  billable_hours DECIMAL(10,2) DEFAULT 0,
  overhead_hours DECIMAL(10,2) DEFAULT 0,
  billable_revenue DECIMAL(12,2) DEFAULT 0,
  labor_cost DECIMAL(12,2) DEFAULT 0,
  margin DECIMAL(12,2) DEFAULT 0,
  margin_percent DECIMAL(6,2) DEFAULT 0,
  entry_count INTEGER DEFAULT 0,
  unbilled_hours DECIMAL(10,2) DEFAULT 0,
  breakdown_by_employee JSONB DEFAULT '{}',
  breakdown_by_service JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (week_start, qb_customer_id)
);

CREATE INDEX idx_cp_customer ON customer_profitability (qb_customer_id);
CREATE INDEX idx_cp_week ON customer_profitability (week_start);

-- RLS: anon can read
ALTER TABLE customer_profitability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_cp" ON customer_profitability FOR SELECT TO anon USING (true);
