/**
 * Shared configuration helpers for edge functions.
 * Centralizes portal URLs and other settings that were previously hardcoded.
 */

const DEFAULT_FRONTEND_URL = 'https://rdsweet1.github.io/mit-qb-frontend';

/**
 * Get the frontend base URL from env var or fallback to default.
 */
export function getFrontendBaseUrl(): string {
  return Deno.env.get('FRONTEND_BASE_URL') || DEFAULT_FRONTEND_URL;
}

/**
 * Get a specific portal page URL.
 */
export function getPortalUrl(page: 'review' | 'clarify' | 'unbilled'): string {
  const base = getFrontendBaseUrl();
  const paths: Record<string, string> = {
    review: '/review',
    clarify: '/clarify',
    unbilled: '/analytics/unbilled-time',
  };
  return `${base}${paths[page]}`;
}

/**
 * Load email recipients from the report_recipients table.
 * Falls back to hardcoded list if DB query fails.
 */
export async function getInternalRecipients(
  supabase: any,
  reportType: string = 'all'
): Promise<string[]> {
  const { data } = await supabase
    .from('report_recipients')
    .select('email')
    .eq('is_active', true)
    .in('report_type', [reportType, 'all']);

  if (data && data.length > 0) {
    return data.map((r: any) => r.email);
  }

  // Fallback
  return [
    'skisner@mitigationconsulting.com',
    'david@mitigationconsulting.com',
  ];
}
