-- Profitability Analysis: employee cost rates, report recipients, profitability snapshots
-- Adds overhead_category to service_items, is_internal to customers

-- ================================================
-- 1. Employee Cost Rates
-- ================================================
CREATE TABLE IF NOT EXISTS employee_cost_rates (
    id SERIAL PRIMARY KEY,
    employee_name TEXT UNIQUE NOT NULL,
    qb_employee_id TEXT,
    base_hourly_rate DECIMAL(10,2) DEFAULT 0,
    burden_multiplier DECIMAL(4,2) DEFAULT 1.35,
    fully_loaded_rate DECIMAL(10,2) GENERATED ALWAYS AS (base_hourly_rate * burden_multiplier) STORED,
    role TEXT DEFAULT 'technician' CHECK (role IN ('technician', 'admin', 'owner')),
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed known employees (rates TBD — placeholder $0)
INSERT INTO employee_cost_rates (employee_name, qb_employee_id, base_hourly_rate, role)
VALUES
    ('Annalee Sweet', NULL, 0, 'technician'),
    ('Fred Ferraiuolo', NULL, 0, 'technician')
ON CONFLICT (employee_name) DO NOTHING;

-- ================================================
-- 2. Report Recipients
-- ================================================
CREATE TABLE IF NOT EXISTS report_recipients (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    display_name TEXT,
    report_type TEXT NOT NULL CHECK (report_type IN ('profitability', 'reconciliation', 'all')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default recipients
INSERT INTO report_recipients (email, display_name, report_type)
VALUES
    ('david@mitigationconsulting.com', 'David Sweet', 'all'),
    ('skisner@mitigationconsulting.com', 'Sharon Kisner', 'all')
ON CONFLICT DO NOTHING;

-- ================================================
-- 3. Profitability Snapshots
-- ================================================
CREATE TABLE IF NOT EXISTS profitability_snapshots (
    id SERIAL PRIMARY KEY,
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    total_hours DECIMAL DEFAULT 0,
    billable_hours DECIMAL DEFAULT 0,
    overhead_hours DECIMAL DEFAULT 0,
    billable_revenue DECIMAL DEFAULT 0,
    labor_cost DECIMAL DEFAULT 0,
    overhead_cost DECIMAL DEFAULT 0,
    gross_margin DECIMAL DEFAULT 0,
    margin_percent DECIMAL DEFAULT 0,
    utilization_percent DECIMAL DEFAULT 0,
    breakdown_by_category JSONB DEFAULT '{}',
    breakdown_by_employee JSONB DEFAULT '{}',
    unbilled_entry_count INTEGER DEFAULT 0,
    unbilled_hours DECIMAL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (week_start, week_end)
);

-- ================================================
-- 4. Add overhead_category to service_items
-- ================================================
ALTER TABLE service_items ADD COLUMN IF NOT EXISTS overhead_category TEXT;

-- Categorize known MIT/admin service items
-- admin
UPDATE service_items SET overhead_category = 'admin'
WHERE qb_item_id IN ('104', '171', '64', '17', '131', '46')
  AND overhead_category IS NULL;

-- training
UPDATE service_items SET overhead_category = 'training'
WHERE qb_item_id IN ('112', '113', '190')
  AND overhead_category IS NULL;

-- events
UPDATE service_items SET overhead_category = 'events'
WHERE qb_item_id IN ('110')
  AND overhead_category IS NULL;

-- ================================================
-- 5. Add is_internal to customers
-- ================================================
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT false;

UPDATE customers SET is_internal = true
WHERE display_name = 'Mitigation Information Technologies'
  AND is_internal = false;

-- ================================================
-- 6. RLS Policies
-- ================================================

-- employee_cost_rates: anon can SELECT + UPDATE
ALTER TABLE employee_cost_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_employee_cost_rates" ON employee_cost_rates
    FOR SELECT TO anon USING (true);

CREATE POLICY "anon_update_employee_cost_rates" ON employee_cost_rates
    FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_insert_employee_cost_rates" ON employee_cost_rates
    FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_delete_employee_cost_rates" ON employee_cost_rates
    FOR DELETE TO anon USING (true);

CREATE POLICY "service_role_all_employee_cost_rates" ON employee_cost_rates
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- report_recipients: anon can SELECT + INSERT + UPDATE + DELETE
ALTER TABLE report_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_report_recipients" ON report_recipients
    FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_report_recipients" ON report_recipients
    FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_report_recipients" ON report_recipients
    FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_delete_report_recipients" ON report_recipients
    FOR DELETE TO anon USING (true);

CREATE POLICY "service_role_all_report_recipients" ON report_recipients
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- profitability_snapshots: anon can SELECT only
ALTER TABLE profitability_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_profitability_snapshots" ON profitability_snapshots
    FOR SELECT TO anon USING (true);

CREATE POLICY "service_role_all_profitability_snapshots" ON profitability_snapshots
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ================================================
-- 7. pg_cron: Weekly Profitability Report — Sunday 8 PM EST = Monday 1 AM UTC
-- ================================================
SELECT cron.schedule(
    'weekly-profitability-report',
    '0 1 * * 1',  -- 1:00 AM UTC Monday = 8:00 PM EST Sunday
    $$
    SELECT net.http_post(
        url := 'https://migcpasmtbdojqphqyzc.supabase.co/functions/v1/weekly-profitability-report',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
        ),
        body := '{}'::jsonb
    );
    $$
);
