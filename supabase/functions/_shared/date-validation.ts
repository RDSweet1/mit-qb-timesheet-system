/**
 * Shared date parameter validation for edge functions.
 * Validates ISO format (YYYY-MM-DD), range constraints, and ordering.
 */

interface DateRangeResult {
  valid: boolean;
  error?: string;
  startDate: string;
  endDate: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate and normalize a date range from request parameters.
 * Returns validated dates or defaults if inputs are empty.
 */
export function validateDateRange(
  startDate?: string | null,
  endDate?: string | null,
  options: { maxRangeDays?: number; allowEmpty?: boolean } = {}
): DateRangeResult {
  const { maxRangeDays = 365, allowEmpty = true } = options;

  // Default to last 7 days if empty and allowed
  if (!startDate && !endDate && allowEmpty) {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return {
      valid: true,
      startDate: toISODate(weekAgo),
      endDate: toISODate(now),
    };
  }

  if (!startDate || !endDate) {
    return { valid: false, error: 'Both startDate and endDate are required', startDate: '', endDate: '' };
  }

  // Format validation
  if (!ISO_DATE_RE.test(startDate)) {
    return { valid: false, error: `Invalid startDate format: "${startDate}". Expected YYYY-MM-DD`, startDate, endDate };
  }
  if (!ISO_DATE_RE.test(endDate)) {
    return { valid: false, error: `Invalid endDate format: "${endDate}". Expected YYYY-MM-DD`, startDate, endDate };
  }

  // Parse and validate actual dates
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');

  if (isNaN(start.getTime())) {
    return { valid: false, error: `Invalid startDate: "${startDate}"`, startDate, endDate };
  }
  if (isNaN(end.getTime())) {
    return { valid: false, error: `Invalid endDate: "${endDate}"`, startDate, endDate };
  }

  // Order validation
  if (start > end) {
    return { valid: false, error: `startDate (${startDate}) must be before endDate (${endDate})`, startDate, endDate };
  }

  // Range validation
  const rangeDays = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  if (rangeDays > maxRangeDays) {
    return { valid: false, error: `Date range (${rangeDays} days) exceeds maximum of ${maxRangeDays} days`, startDate, endDate };
  }

  return { valid: true, startDate, endDate };
}

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0];
}
