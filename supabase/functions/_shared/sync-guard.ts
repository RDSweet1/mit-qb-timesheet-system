/**
 * Sync deduplication guard.
 * Prevents duplicate qb-time-sync calls when multiple functions
 * (send-reminder, create-invoices) trigger syncs within a short window.
 *
 * Uses function_metrics table to check when the last successful sync ran.
 */

interface SyncGuardResult {
  shouldSync: boolean;
  reason: string;
  lastSyncAt?: string;
}

const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

export async function shouldSync(
  supabase: any,
  dateRange: { startDate: string; endDate: string },
  options: { cooldownMs?: number; forceFresh?: boolean } = {}
): Promise<SyncGuardResult> {
  const { cooldownMs = DEFAULT_COOLDOWN_MS, forceFresh = false } = options;

  if (forceFresh) {
    return { shouldSync: true, reason: 'forceFresh requested' };
  }

  try {
    const cutoff = new Date(Date.now() - cooldownMs).toISOString();

    // Check if a successful qb-time-sync ran recently for overlapping date range
    const { data: recentSync } = await supabase
      .from('function_metrics')
      .select('started_at, metadata')
      .eq('function_name', 'qb-time-sync')
      .eq('status', 'success')
      .gte('started_at', cutoff)
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    if (recentSync) {
      const meta = recentSync.metadata || {};
      const syncStart = meta.startDate;
      const syncEnd = meta.endDate;

      // Check if the recent sync covers our requested date range
      if (syncStart && syncEnd &&
          syncStart <= dateRange.startDate &&
          syncEnd >= dateRange.endDate) {
        return {
          shouldSync: false,
          reason: `Recent sync at ${recentSync.started_at} covers ${syncStart}–${syncEnd}`,
          lastSyncAt: recentSync.started_at,
        };
      }
    }

    return { shouldSync: true, reason: 'No recent sync found covering this date range' };
  } catch {
    // If function_metrics table doesn't exist yet, always sync
    return { shouldSync: true, reason: 'Could not check sync history' };
  }
}
