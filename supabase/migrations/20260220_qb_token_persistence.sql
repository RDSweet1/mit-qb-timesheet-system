-- Store QB OAuth tokens so auto-refresh can persist new tokens
-- This fixes the bug where refresh tokens get consumed but new ones aren't saved

CREATE TABLE IF NOT EXISTS qb_tokens (
  id TEXT PRIMARY KEY DEFAULT 'production',
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  realm_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Only service_role should access this table (contains secrets)
ALTER TABLE qb_tokens ENABLE ROW LEVEL SECURITY;

-- No RLS policies for anon — only service_role (which bypasses RLS) can access
