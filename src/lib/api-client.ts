'use client';

/**
 * Browser API client. Wraps fetch with:
 *  - same-origin credentials (the session cookie),
 *  - the double-submit CSRF header on mutating requests (read from the
 *    non-HttpOnly CSRF cookie),
 *  - typed error surfacing (server error envelope → ApiError).
 *
 * It NEVER stores responses; upload tickets received via the status stream are
 * held in component memory only.
 */
import { CSRF_COOKIE, CSRF_HEADER } from '@/server/auth/cookies';
import type { ErrorCode } from './errors';

export class ApiError extends Error {
  readonly code: ErrorCode | string;
  readonly status: number;
  readonly nextAction?: string;
  constructor(status: number, code: string, message: string, nextAction?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.nextAction = nextAction;
  }
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };

  const mutating = method !== 'GET';
  if (mutating) {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) headers[CSRF_HEADER] = csrf;
  }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(path, {
    method,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
    signal: options.signal,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    let code = 'UNKNOWN_ERROR';
    let message = `Request failed (${res.status})`;
    let nextAction: string | undefined;
    try {
      const data = (await res.json()) as {
        error?: { code: string; message: string; nextAction?: string };
      };
      if (data.error) {
        code = data.error.code;
        message = data.error.message;
        nextAction = data.error.nextAction;
      }
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, code, message, nextAction);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: 'GET', signal }),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: 'POST', body, signal }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body }),
};
