import 'server-only';

/**
 * Best-effort in-memory login throttle. On serverless this is per-instance, so
 * it is a speed bump against credential stuffing rather than a hard limit — the
 * primary defense is a strong ADMIN_PASSWORD. Pairs with constant-time
 * credential comparison.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;
const buckets = new Map<string, Bucket>();

export function checkLoginAllowed(key: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt < now) {
    buckets.set(key, { count: 0, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (existing.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSec: Math.ceil((existing.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    existing.count += 1;
  }
}

export function clearLoginFailures(key: string): void {
  buckets.delete(key);
}
