/**
 * Schedule Gate — controls whether an edge function should run
 * based on schedule_config table settings.
 *
 * Each function checks this gate at startup. Manual invocations
 * (with { manual: true } in the request body) bypass the gate.
 */

interface GateResult {
  run: boolean;
  reason?: string;
  complete: (status: 'success' | 'error') => Promise<void>;
}

const DAY_MAP: Record<string, number[]> = {
  sunday: [0],
  monday: [1],
  tuesday: [2],
  wednesday: [3],
  thursday: [4],
  friday: [5],
  saturday: [6],
  weekdays: [1, 2, 3, 4, 5],
  daily: [0, 1, 2, 3, 4, 5, 6],
};

/**
 * Check if the function should run based on its schedule_config row.
 * Returns { run: true/false, reason, complete() }.
 */
export async function shouldRun(
  functionName: string,
  supabaseClient: any
): Promise<GateResult> {
  const noop = async () => {};

  const { data: config, error } = await supabaseClient
    .from('schedule_config')
    .select('*')
    .eq('function_name', functionName)
    .single();

  if (error || !config) {
    // No config row = always run (backwards compatible)
    console.log(`schedule-gate: no config for "${functionName}", allowing run`);
    return { run: true, complete: noop };
  }

  // Check if paused
  if (config.is_paused) {
    await supabaseClient
      .from('schedule_config')
      .update({
        last_run_at: new Date().toISOString(),
        last_run_status: 'skipped_paused',
      })
      .eq('function_name', functionName);

    console.log(`schedule-gate: "${functionName}" is paused`);
    return { run: false, reason: 'paused', complete: noop };
  }

  // Check if current time matches schedule
  const tz = config.timezone || 'America/New_York';
  const now = new Date();
  const localTime = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  const currentDay = localTime.getDay();
  const currentHour = localTime.getHours();
  const currentMinute = localTime.getMinutes();

  // Check day
  const allowedDays = DAY_MAP[config.schedule_day?.toLowerCase()] || DAY_MAP['daily'];
  if (!allowedDays.includes(currentDay)) {
    console.log(`schedule-gate: "${functionName}" not scheduled for day ${currentDay}`);
    return { run: false, reason: 'not_scheduled', complete: noop };
  }

  // Check time (±15 min window)
  const [schedHour, schedMinute] = (config.schedule_time || '09:00')
    .split(':')
    .map(Number);
  const schedMinutes = schedHour * 60 + schedMinute;
  const currentMinutes = currentHour * 60 + currentMinute;
  const diff = Math.abs(currentMinutes - schedMinutes);

  if (diff > 15) {
    console.log(`schedule-gate: "${functionName}" outside time window (current=${currentHour}:${currentMinute}, scheduled=${schedHour}:${schedMinute})`);
    return { run: false, reason: 'not_scheduled', complete: noop };
  }

  console.log(`schedule-gate: "${functionName}" cleared to run`);

  // Return gate with complete() callback
  const complete = async (status: 'success' | 'error') => {
    await supabaseClient
      .from('schedule_config')
      .update({
        last_run_at: new Date().toISOString(),
        last_run_status: status,
      })
      .eq('function_name', functionName);
  };

  return { run: true, complete };
}
