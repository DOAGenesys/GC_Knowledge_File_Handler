import 'server-only';

import type { NextRequest } from 'next/server';
import { AppError, type ErrorCode } from '@/lib/errors';
import type { FeatureKey } from '@/lib/feature-flags';
import { bytesToHex } from '@/lib/md5';
import { sha256Bytes } from '@/lib/sha256';
import { getServerConfig } from '../config';
import { CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE } from './cookies';
import {
  randomToken,
  signSession,
  timingSafeEqual,
  verifySession,
  type SessionPayload,
} from './session-core';

/** Fixed-length (64-hex) SHA-256 digest of a string, for length-leak-free compares. */
function digest(value: string): string {
  return bytesToHex(sha256Bytes(new TextEncoder().encode(value)));
}

/**
 * Route-handler authentication / CSRF / feature guards (TODO Block 3). Every
 * mutating and sensitive route calls these. The single-admin model means there
 * is exactly one valid identity, defined by ADMIN_USERNAME / ADMIN_PASSWORD.
 */

/** Verify login credentials against the configured single admin, timing-safe. */
export function verifyCredentials(username: string, password: string): boolean {
  const cfg = getServerConfig();
  if (!cfg.auth.configured || !cfg.auth.adminUsername || !cfg.auth.adminPassword) return false;
  // Compare fixed-length (64-hex) SHA-256 digests with constant-time equality so
  // neither the comparison time nor an early length-mismatch return can leak the
  // length of the configured username/password (the buffers are always 64 chars).
  const userOk = timingSafeEqual(digest(username), digest(cfg.auth.adminUsername));
  const passOk = timingSafeEqual(digest(password), digest(cfg.auth.adminPassword));
  return userOk && passOk;
}

/** Mint a signed session token for the admin. */
export async function issueSessionToken(username: string): Promise<string> {
  const cfg = getServerConfig();
  if (!cfg.auth.sessionSecret)
    throw new AppError('APP_UNAUTHENTICATED', { detail: 'no session secret' });
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: username,
    iat: now,
    exp: now + cfg.auth.sessionTtlMinutes * 60,
  };
  return signSession(payload, cfg.auth.sessionSecret);
}

/** A fresh CSRF token to pair with a new session. */
export function issueCsrfToken(): string {
  return randomToken(32);
}

/** Read & verify the session from a request, or null. */
export async function getSession(req: NextRequest): Promise<SessionPayload | null> {
  const cfg = getServerConfig();
  if (!cfg.auth.sessionSecret) return null;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  return verifySession(token, cfg.auth.sessionSecret);
}

/** Require a valid session; throws APP_UNAUTHENTICATED otherwise. */
export async function requireAuth(req: NextRequest): Promise<SessionPayload> {
  const session = await getSession(req);
  if (!session) throw new AppError('APP_UNAUTHENTICATED');
  return session;
}

/**
 * CSRF protection for mutating, cookie-authenticated routes: validate the
 * Origin header against the request host AND a double-submit token (the
 * `x-csrf-token` header must equal the non-HttpOnly CSRF cookie).
 */
export function requireCsrf(req: NextRequest): void {
  const origin = req.headers.get('origin');
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new AppError('APP_CSRF_REJECTED', { detail: 'unparseable origin' });
    }
    const host = req.headers.get('host');
    if (host && originHost !== host) {
      throw new AppError('APP_CSRF_REJECTED', { detail: 'origin/host mismatch' });
    }
  }
  const headerToken = req.headers.get(CSRF_HEADER);
  const cookieToken = req.cookies.get(CSRF_COOKIE)?.value;
  if (!headerToken || !cookieToken || !timingSafeEqual(headerToken, cookieToken)) {
    throw new AppError('APP_CSRF_REJECTED', { detail: 'csrf token mismatch' });
  }
}

/** Require an optional feature to be enabled; throws otherwise. */
export function requireFeature(key: FeatureKey): void {
  const cfg = getServerConfig();
  if (!cfg.features[key]) {
    throw new AppError('APP_FORBIDDEN_FEATURE_DISABLED', { detail: `${key} disabled` });
  }
}

/** Ensure Genesys is configured before a route that needs it; else fail closed. */
export function requireGenesys(): void {
  if (!getServerConfig().genesys.configured) throw new AppError('GENESYS_NOT_CONFIGURED');
}

/** Map an unknown thrown value to an AppError for a JSON error response. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const code: ErrorCode = 'UNKNOWN_ERROR';
  return new AppError(code, { cause: err });
}
