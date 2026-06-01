import 'server-only';

import type { OutcomeClass } from '@/lib/errors';

/**
 * HTTP retry / idempotency classification (PRODUCT.md §15, Block 5).
 *
 * `idempotent` operations (the read-only GETs) may be retried on transient
 * failures. Non-idempotent operations (create source, start sync, request
 * upload URL, patch completion/cancellation, delete) are NEVER auto-retried
 * when the outcome is ambiguous — a lost response is classified `Unknown` so
 * the workflow can surface it honestly instead of risking a duplicate effect.
 */
export type Idempotency = 'idempotent' | 'nonidempotent';

export interface Classification {
  outcome: OutcomeClass;
  retryable: boolean;
  /** Suggested delay before retry, when retryable. */
  retryAfterMs?: number;
}

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/** Parse a Retry-After header (delta-seconds or HTTP-date) into milliseconds. */
export function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return undefined;
}

/** Classify a received HTTP response by status code. */
export function classifyResponseStatus(
  status: number,
  idempotency: Idempotency,
  retryAfterMs?: number,
): Classification {
  if (status >= 200 && status < 300) return { outcome: 'Success', retryable: false };

  if (status === 429) return { outcome: 'RetryableFailure', retryable: true, retryAfterMs };

  if (RETRYABLE_STATUSES.has(status)) {
    // 408/5xx: safe to retry only for idempotent ops; otherwise the side effect
    // may or may not have applied — treat as Unknown.
    return idempotency === 'idempotent'
      ? { outcome: 'RetryableFailure', retryable: true, retryAfterMs }
      : { outcome: 'Unknown', retryable: false };
  }

  // 400 (validation), 401/403 (auth/permission), 404 (not found), 410 (gone),
  // and any other 4xx are fatal — never auto-retried.
  return { outcome: 'FatalFailure', retryable: false };
}

/** Classify a thrown fetch error (timeout/abort or network failure). */
export function classifyThrownError(error: unknown, idempotency: Idempotency): Classification {
  const isAbort = error instanceof DOMException && error.name === 'AbortError';
  if (idempotency === 'idempotent') {
    // No confirmed side effect for a read; safe to retry.
    return { outcome: 'RetryableFailure', retryable: true };
  }
  // Non-idempotent: a timeout or dropped connection might have applied the
  // effect. Be conservative and surface as Unknown rather than blind-retry.
  return { outcome: 'Unknown', retryable: false, ...(isAbort ? {} : {}) };
}

/** Exponential backoff with full jitter, honoring an explicit Retry-After. */
export function backoffMs(
  attempt: number,
  options: { baseMs?: number; capMs?: number; retryAfterMs?: number } = {},
): number {
  const { baseMs = 500, capMs = 15_000, retryAfterMs } = options;
  if (retryAfterMs != null) return Math.min(capMs, retryAfterMs);
  const exp = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt));
  // Full jitter in [0, exp]. Deterministic randomness is not required here.
  return Math.floor(exp * (0.5 + Math.random() * 0.5));
}
