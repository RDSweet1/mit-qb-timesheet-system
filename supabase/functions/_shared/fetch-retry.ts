/**
 * Shared fetch retry helper with exponential backoff.
 * Retries only on transient errors (429, 500, 502, 503, 504, network failures).
 * Does NOT retry on client errors (400, 401, 403, 404, 409).
 */

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in ms before first retry (default: 1000) */
  initialDelayMs?: number;
  /** Label for logging (e.g., "QB API" or "Graph API") */
  label?: string;
}

/**
 * Fetch with exponential backoff retry for transient failures.
 * Delays: 1s, 2s, 4s (with default settings).
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  options: RetryOptions = {}
): Promise<Response> {
  const { maxRetries = 3, initialDelayMs = 1000, label = 'fetch' } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, init);

      // Don't retry on non-retryable status codes
      if (!RETRYABLE_STATUS_CODES.has(response.status)) {
        return response;
      }

      // If this is the last attempt, return the response as-is
      if (attempt === maxRetries) {
        console.warn(`⚠️ ${label}: All ${maxRetries} retries exhausted, returning ${response.status}`);
        return response;
      }

      const delay = initialDelayMs * Math.pow(2, attempt);
      console.warn(`⚠️ ${label}: Got ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
      await sleep(delay);
    } catch (error) {
      // Network errors (DNS failure, timeout, connection refused)
      lastError = error;

      if (attempt === maxRetries) {
        console.error(`❌ ${label}: All ${maxRetries} retries exhausted after network error:`, error.message);
        throw error;
      }

      const delay = initialDelayMs * Math.pow(2, attempt);
      console.warn(`⚠️ ${label}: Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries}):`, error.message);
      await sleep(delay);
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError || new Error(`${label}: Unexpected retry loop exit`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
