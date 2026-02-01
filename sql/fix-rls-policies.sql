-- Fix RLS Policies to Allow Anon Read Access
-- The frontend uses anon key, so we need to allow it to read data

-- Allow anon users to read service_items
CREATE POLICY IF NOT EXISTS "Anon users can read service_items" ON service_items
  FOR SELECT TO anon USING (true);

-- Allow anon users to read customers
CREATE POLICY IF NOT EXISTS "Anon users can read customers" ON customers
  FOR SELECT TO anon USING (true);

-- Allow anon users to read time_entries
CREATE POLICY IF NOT EXISTS "Anon users can read time_entries" ON time_entries
  FOR SELECT TO anon USING (true);

-- Allow anon users to read invoice_log
CREATE POLICY IF NOT EXISTS "Anon users can read invoice_log" ON invoice_log
  FOR SELECT TO anon USING (true);

-- Note: For production, you may want to restrict this further with proper authentication
