-- Allow frontend (anon role) to read profitability snapshots
CREATE POLICY "anon_read_profitability_snapshots"
  ON profitability_snapshots FOR SELECT TO anon USING (true);
