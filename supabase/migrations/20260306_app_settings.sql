-- App Settings table — generic key/value store for application-wide configuration
-- Initial use: gentle_review_language toggle for customer-facing email tone

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT 'false',
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by TEXT
);

COMMENT ON TABLE app_settings IS 'Application-wide settings (key/value). Used by edge functions and frontend.';
COMMENT ON COLUMN app_settings.key IS 'Setting identifier, e.g. gentle_review_language';
COMMENT ON COLUMN app_settings.value IS 'Setting value as text (parse as needed)';

-- RLS: anon can read and update (frontend uses anon key)
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_app_settings" ON app_settings
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_update_app_settings" ON app_settings
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Seed the initial setting
INSERT INTO app_settings (key, value) VALUES ('gentle_review_language', 'false')
  ON CONFLICT (key) DO NOTHING;
