-- Function metrics table for edge function observability
CREATE TABLE IF NOT EXISTS function_metrics (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  function_name text NOT NULL,
  invocation_id uuid DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  entries_processed integer DEFAULT 0,
  error_count integer DEFAULT 0,
  api_calls integer DEFAULT 0,
  status text DEFAULT 'running' CHECK (status IN ('running', 'success', 'error')),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Index for querying recent metrics by function
CREATE INDEX IF NOT EXISTS idx_function_metrics_name_started
  ON function_metrics (function_name, started_at DESC);

-- Auto-cleanup: drop rows older than 30 days (via pg_cron or manual)
COMMENT ON TABLE function_metrics IS 'Edge function execution metrics for observability. Rows older than 30 days may be pruned.';
