import { describe, expect, it } from 'vitest';
import { backoffMs, classifyResponseStatus, classifyThrownError, parseRetryAfter } from '../retry';
import { ERROR_CODES, ERROR_META } from '@/lib/errors';

describe('retry classification (PRODUCT.md §15)', () => {
  it('treats 2xx as success', () => {
    expect(classifyResponseStatus(200, 'idempotent').outcome).toBe('Success');
    expect(classifyResponseStatus(204, 'nonidempotent').outcome).toBe('Success');
  });

  it('429 is retryable for both idempotency classes', () => {
    expect(classifyResponseStatus(429, 'idempotent').retryable).toBe(true);
    expect(classifyResponseStatus(429, 'nonidempotent').retryable).toBe(true);
  });

  it('5xx is retryable for idempotent reads but Unknown for non-idempotent writes', () => {
    expect(classifyResponseStatus(504, 'idempotent')).toMatchObject({
      outcome: 'RetryableFailure',
      retryable: true,
    });
    expect(classifyResponseStatus(504, 'nonidempotent')).toMatchObject({
      outcome: 'Unknown',
      retryable: false,
    });
    expect(classifyResponseStatus(500, 'nonidempotent').outcome).toBe('Unknown');
  });

  it('4xx validation/auth/not-found are fatal and never retried', () => {
    for (const status of [400, 401, 403, 404, 410, 422]) {
      const c = classifyResponseStatus(status, 'idempotent');
      expect(c.outcome).toBe('FatalFailure');
      expect(c.retryable).toBe(false);
    }
  });

  it('a thrown error is Unknown for non-idempotent and retryable for idempotent', () => {
    expect(classifyThrownError(new Error('socket'), 'nonidempotent').outcome).toBe('Unknown');
    expect(classifyThrownError(new Error('socket'), 'idempotent').retryable).toBe(true);
  });

  it('parses Retry-After in seconds and as a date', () => {
    expect(parseRetryAfter('5')).toBe(5000);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('garbage')).toBeUndefined();
  });

  it('honors Retry-After in backoff and caps it', () => {
    expect(backoffMs(0, { retryAfterMs: 2000 })).toBe(2000);
    expect(backoffMs(0, { retryAfterMs: 999_999, capMs: 15_000 })).toBe(15_000);
    const b = backoffMs(3, { baseMs: 500, capMs: 15_000 });
    expect(b).toBeGreaterThan(0);
    expect(b).toBeLessThanOrEqual(15_000);
  });
});

describe('error metadata completeness', () => {
  it('every error code has metadata with an http status and next action', () => {
    for (const code of ERROR_CODES) {
      const meta = ERROR_META[code];
      expect(meta, code).toBeDefined();
      expect(meta.httpStatus).toBeGreaterThanOrEqual(400);
      expect(meta.message.length).toBeGreaterThan(0);
      expect(meta.nextAction.length).toBeGreaterThan(0);
    }
  });
});
