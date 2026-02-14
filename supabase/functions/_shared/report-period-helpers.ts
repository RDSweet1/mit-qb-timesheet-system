/**
 * Shared helpers for report period and review token creation.
 * Used by send-reminder and email_time_report.
 */

import { getPortalUrl } from './config.ts';

interface ReportPeriodInput {
  customerId: number;
  qbCustomerId: string;
  customerName: string;
  weekStart: string;
  weekEnd: string;
  totalHours: number;
  entryCount: number;
  reportNumber: string;
}

interface CreateResult {
  reportPeriodId: number | null;
  reviewUrl: string | undefined;
}

/**
 * Upsert a report_period row and create a review_token, returning the review portal URL.
 */
export async function createReportPeriodAndToken(
  supabase: any,
  input: ReportPeriodInput,
  tokenExpiryDays: number = 7
): Promise<CreateResult> {
  // 1. Upsert report_period
  const { data: rpRow } = await supabase.from('report_periods').upsert({
    customer_id: input.customerId,
    qb_customer_id: input.qbCustomerId,
    customer_name: input.customerName,
    week_start: input.weekStart,
    week_end: input.weekEnd,
    status: 'sent',
    total_hours: input.totalHours,
    entry_count: input.entryCount,
    report_number: input.reportNumber,
    sent_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'qb_customer_id,week_start' }).select('id').single();

  if (!rpRow?.id) {
    return { reportPeriodId: null, reviewUrl: undefined };
  }

  // 2. Create review token
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + tokenExpiryDays);

  const { data: tokenRow } = await supabase.from('review_tokens').insert({
    report_period_id: rpRow.id,
    expires_at: expiresAt.toISOString(),
  }).select('token').single();

  const reviewUrl = tokenRow?.token
    ? `${getPortalUrl('review')}?token=${tokenRow.token}`
    : undefined;

  return { reportPeriodId: rpRow.id, reviewUrl };
}

/**
 * Generate a report number in format WR-YYYY-WW from a start date.
 */
export function generateReportNumber(startDate: string): string {
  const d = new Date(startDate + 'T00:00:00');
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil((d.getTime() - yearStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `WR-${d.getFullYear()}-${String(weekNum).padStart(2, '0')}`;
}
