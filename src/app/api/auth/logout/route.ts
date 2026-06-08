import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  CSRF_COOKIE,
  GENESYS_AUTH_COOKIE,
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  clearedCookieOptions,
} from '@/server/auth/cookies';
import { route } from '@/server/http/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Logout clears the session + CSRF cookies. Safe to call unauthenticated (it
// only removes cookies); it does not require CSRF because it grants no access.
export const POST = route(async (req: NextRequest) => {
  const secure = req.nextUrl.protocol === 'https:';
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', clearedCookieOptions(secure));
  res.cookies.set(CSRF_COOKIE, '', clearedCookieOptions(secure));
  res.cookies.set(GENESYS_AUTH_COOKIE, '', clearedCookieOptions(secure));
  res.cookies.set(OAUTH_STATE_COOKIE, '', clearedCookieOptions(secure));
  return res;
});
