-- Add structured notes columns from Workforce custom fields.
-- These capture the 5 required questions technicians answer when clocking out.
-- Old notes/description columns stay for backward compatibility with historical data.

ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS activity_performed  TEXT,
  ADD COLUMN IF NOT EXISTS complications       TEXT,
  ADD COLUMN IF NOT EXISTS why_necessary       TEXT,
  ADD COLUMN IF NOT EXISTS resources_used      TEXT,
  ADD COLUMN IF NOT EXISTS client_benefit      TEXT;

-- Index for quick check: does this entry have structured notes?
CREATE INDEX IF NOT EXISTS idx_time_entries_has_structured
  ON time_entries ((activity_performed IS NOT NULL));

COMMENT ON COLUMN time_entries.activity_performed IS 'Workforce custom field 5680924: What work was performed';
COMMENT ON COLUMN time_entries.complications      IS 'Workforce custom field 5680960: Complications / difficulty encountered';
COMMENT ON COLUMN time_entries.why_necessary      IS 'Workforce custom field 5680934: Why the activity was necessary';
COMMENT ON COLUMN time_entries.resources_used     IS 'Workforce custom field 5680936: Documents or resources utilized';
COMMENT ON COLUMN time_entries.client_benefit     IS 'Workforce custom field 5680962: Benefit to the client';
