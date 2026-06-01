/**
 * Cookie names and attribute builders. Pure (no env, no server-only) so they
 * are usable from both middleware and route handlers.
 */
export const SESSION_COOKIE = 'gkfsm_session';
export const CSRF_COOKIE = 'gkfsm_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export interface CookieOptions {
  httpOnly: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  secure: boolean;
  path: string;
  maxAge: number;
}

/** Session cookie: HttpOnly + SameSite=Strict so it is never sent cross-site. */
export function sessionCookieOptions(maxAgeSeconds: number, secure: boolean): CookieOptions {
  return { httpOnly: true, sameSite: 'strict', secure, path: '/', maxAge: maxAgeSeconds };
}

/**
 * CSRF cookie: readable by JS (NOT HttpOnly) for the double-submit pattern.
 * Same-origin policy prevents an attacker reading it; SameSite=Strict prevents
 * it riding along on cross-site requests.
 */
export function csrfCookieOptions(maxAgeSeconds: number, secure: boolean): CookieOptions {
  return { httpOnly: false, sameSite: 'strict', secure, path: '/', maxAge: maxAgeSeconds };
}

/** Expired cookie used to clear a value on logout. */
export function clearedCookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, sameSite: 'strict', secure, path: '/', maxAge: 0 };
}
