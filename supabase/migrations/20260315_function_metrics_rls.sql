-- Enable RLS on function_metrics and add policies
-- Edge functions use service_role key which bypasses RLS,
-- but explicit policies ensure the table works correctly if RLS is enabled.

ALTER TABLE function_metrics ENABLE ROW LEVEL SECURITY;

-- service_role: full access (edge functions write metrics)
CREATE POLICY "service_role_all_function_metrics" ON function_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- anon: read-only (frontend dashboard can display metrics)
CREATE POLICY "anon_read_function_metrics" ON function_metrics
  FOR SELECT TO anon USING (true);

-- anon: insert (edge functions that use anon key for metrics)
CREATE POLICY "anon_insert_function_metrics" ON function_metrics
  FOR INSERT TO anon WITH CHECK (true);
