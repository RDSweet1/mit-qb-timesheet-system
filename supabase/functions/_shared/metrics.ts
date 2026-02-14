/**
 * Shared metrics helper for edge function observability.
 * Records execution time, entry counts, errors, and API call counts.
 *
 * Usage:
 *   const metrics = await startMetrics('my-function', supabase);
 *   metrics.addEntries(10);
 *   metrics.addApiCall();
 *   metrics.addError();
 *   await metrics.end('success');   // or 'error'
 */

interface MetricsHandle {
  /** Record N entries processed */
  addEntries: (count: number) => void;
  /** Increment API call counter */
  addApiCall: (count?: number) => void;
  /** Increment error counter */
  addError: (count?: number) => void;
  /** Attach arbitrary metadata */
  setMeta: (key: string, value: unknown) => void;
  /** Finalize and write to DB */
  end: (status: 'success' | 'error') => Promise<void>;
  /** The invocation ID (uuid) */
  invocationId: string;
}

export async function startMetrics(
  functionName: string,
  supabase: any
): Promise<MetricsHandle> {
  const startedAt = new Date();
  let entries = 0;
  let apiCalls = 0;
  let errors = 0;
  const meta: Record<string, unknown> = {};

  // Insert initial row
  const { data } = await supabase
    .from('function_metrics')
    .insert({
      function_name: functionName,
      started_at: startedAt.toISOString(),
      status: 'running',
    })
    .select('id, invocation_id')
    .single();

  const rowId = data?.id;
  const invocationId = data?.invocation_id || 'unknown';

  return {
    invocationId,
    addEntries(count: number) { entries += count; },
    addApiCall(count = 1) { apiCalls += count; },
    addError(count = 1) { errors += count; },
    setMeta(key: string, value: unknown) { meta[key] = value; },
    async end(status: 'success' | 'error') {
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();

      if (rowId) {
        await supabase
          .from('function_metrics')
          .update({
            completed_at: completedAt.toISOString(),
            duration_ms: durationMs,
            entries_processed: entries,
            error_count: errors,
            api_calls: apiCalls,
            status,
            metadata: meta,
          })
          .eq('id', rowId);
      }
    },
  };
}
