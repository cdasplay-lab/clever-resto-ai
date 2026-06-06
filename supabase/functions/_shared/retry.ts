// Shared retry helper for transient HTTP failures (5xx, 429, network).
// Used for Telegram API + Lovable AI Gateway.

export type FetchInput = Parameters<typeof fetch>[0];
export type FetchInit = Parameters<typeof fetch>[1];

export interface RetryOptions {
  attempts?: number;        // total attempts (default 3)
  baseDelayMs?: number;     // initial backoff (default 500)
  label?: string;           // for logs
  respectRetryAfter?: boolean; // honor Retry-After header on 429 (default true)
}

const DEFAULT_DELAYS = [500, 2000, 5000];

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * fetch() with exponential backoff. Retries on:
 *  - network errors (TypeError)
 *  - HTTP 5xx
 *  - HTTP 429 (rate-limited) — honors Retry-After if present
 * Does NOT retry on 4xx (other than 429) — those are caller errors.
 */
export async function retryFetch(
  input: FetchInput,
  init?: FetchInit,
  opts: RetryOptions = {},
): Promise<Response> {
  const attempts = opts.attempts ?? 3;
  const label = opts.label ?? "fetch";
  let lastErr: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(input, init);
      if (res.ok) return res;

      // 4xx (non-429): don't retry, caller decides.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        return res;
      }

      // Retryable. If last attempt, return as-is so caller can read body.
      if (i === attempts - 1) return res;

      let delay = DEFAULT_DELAYS[Math.min(i, DEFAULT_DELAYS.length - 1)];
      if (res.status === 429 && opts.respectRetryAfter !== false) {
        const ra = res.headers.get("Retry-After");
        if (ra) {
          const n = parseInt(ra, 10);
          if (Number.isFinite(n) && n > 0) delay = Math.min(n * 1000, 10_000);
        }
      }
      console.warn(`[retry:${label}] status=${res.status}, retrying in ${delay}ms (attempt ${i + 1}/${attempts})`);
      await sleep(delay);
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1) throw err;
      const delay = DEFAULT_DELAYS[Math.min(i, DEFAULT_DELAYS.length - 1)];
      console.warn(`[retry:${label}] error=${(err as Error)?.message}, retrying in ${delay}ms (attempt ${i + 1}/${attempts})`);
      await sleep(delay);
    }
  }
  throw lastErr ?? new Error(`retryFetch:${label}:exhausted`);
}
