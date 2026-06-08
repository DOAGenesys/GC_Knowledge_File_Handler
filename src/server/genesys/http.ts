import 'server-only';

import { logger } from '../logger';
import { redactUrl } from '../redact';
import { getAccessToken, type GenesysAuthContext } from './oauth';
import {
  backoffMs,
  classifyResponseStatus,
  classifyThrownError,
  parseRetryAfter,
  type Idempotency,
} from './retry';

/** Discriminated result of a Genesys request after retries are applied. */
export type GenesysResult<T> =
  | { kind: 'ok'; status: number; data: T }
  | { kind: 'error'; status: number; retryableExhausted: boolean; body?: unknown }
  | { kind: 'unknown' };

export interface GenesysRequestOptions<T> {
  path: string;
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  idempotency: Idempotency;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** Validate/normalize the parsed JSON body. */
  parse: (json: unknown) => T;
  timeoutMs?: number;
  maxAttempts?: number;
  authContext?: GenesysAuthContext;
  onAuthContextUpdated?: (context: GenesysAuthContext) => void;
}

function buildUrl(
  regionHost: string,
  path: string,
  query?: GenesysRequestOptions<unknown>['query'],
): string {
  const url = new URL(`https://${regionHost}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Perform a Genesys API request with the configured retry/idempotency policy.
 * Read-only GETs retry transient failures; non-idempotent calls never retry an
 * ambiguous outcome (returned as `{ kind: 'unknown' }`).
 */
export async function genesysRequest<T>(opts: GenesysRequestOptions<T>): Promise<GenesysResult<T>> {
  const maxAttempts = opts.maxAttempts ?? (opts.idempotency === 'idempotent' ? 4 : 1);
  const timeoutMs = opts.timeoutMs ?? 20_000;
  let authContext = opts.authContext;
  const cookieBackedAuth = !opts.authContext;

  let refreshedAuth = false;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const auth = await getAccessToken(authContext);
    authContext = auth.authContext;
    if (auth.refreshed) opts.onAuthContextUpdated?.(auth.authContext);
    const url = buildUrl(auth.regionHost, opts.path, opts.query);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        method: opts.method,
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
          Accept: 'application/json',
          ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
        cache: 'no-store',
      });
    } catch (err) {
      clearTimeout(timer);
      const cls = classifyThrownError(err, opts.idempotency);
      logger.warn('genesys.request.thrown', {
        method: opts.method,
        url: redactUrl(url),
        attempt,
        outcome: cls.outcome,
        name: (err as Error)?.name,
      });
      if (cls.outcome === 'Unknown') return { kind: 'unknown' };
      if (cls.retryable && attempt < maxAttempts - 1) {
        await sleep(backoffMs(attempt));
        continue;
      }
      return { kind: 'error', status: 0, retryableExhausted: true };
    }
    clearTimeout(timer);

    // 401: token may have just expired. Refresh once and retry regardless of
    // idempotency — an unauthorized request was not processed. This re-auth is
    // ORTHOGONAL to the transient-failure retry budget, so it must not consume
    // an attempt slot; otherwise a non-idempotent write (maxAttempts=1) would
    // never be re-issued and a benign 401 would surface as a retryable
    // *_FAILED (risking a duplicate side effect). Guarded by `refreshedAuth`
    // so it can only happen once.
    if (res.status === 401 && !refreshedAuth) {
      refreshedAuth = true;
      const refreshed = await getAccessToken(cookieBackedAuth ? undefined : authContext, {
        forceRefresh: true,
      });
      authContext = refreshed.authContext;
      opts.onAuthContextUpdated?.(refreshed.authContext);
      attempt -= 1;
      continue;
    }

    const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
    const cls = classifyResponseStatus(res.status, opts.idempotency, retryAfterMs);

    if (cls.outcome === 'Success') {
      const text = await res.text();
      const json = text ? safeJson(text) : undefined;
      return { kind: 'ok', status: res.status, data: opts.parse(json) };
    }

    if (cls.outcome === 'Unknown') {
      logger.warn('genesys.request.ambiguous', {
        method: opts.method,
        url: redactUrl(url),
        status: res.status,
      });
      return { kind: 'unknown' };
    }

    if (cls.outcome === 'RetryableFailure' && cls.retryable && attempt < maxAttempts - 1) {
      await sleep(backoffMs(attempt, { retryAfterMs: cls.retryAfterMs }));
      continue;
    }

    const body = await res.text().catch(() => '');
    logger.warn('genesys.request.error', {
      method: opts.method,
      url: redactUrl(url),
      status: res.status,
      outcome: cls.outcome,
    });
    return {
      kind: 'error',
      status: res.status,
      retryableExhausted: cls.outcome === 'RetryableFailure',
      body: body ? safeJson(body) : undefined,
    };
  }

  return { kind: 'error', status: 0, retryableExhausted: true };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
