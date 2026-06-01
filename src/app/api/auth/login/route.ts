import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AppError } from '@/lib/errors';
import { loginBodySchema } from '@/lib/schemas';
import { getServerConfig } from '@/server/config';
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  csrfCookieOptions,
  sessionCookieOptions,
} from '@/server/auth/cookies';
import { issueCsrfToken, issueSessionToken, verifyCredentials } from '@/server/auth/guards';
import {
  checkLoginAllowed,
  clearLoginFailures,
  recordLoginFailure,
} from '@/server/auth/rate-limit';
import { jsonError, readJsonBody, route } from '@/server/http/route-helpers';
import { logger } from '@/server/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clientKey(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}

export const POST = route(async (req: NextRequest) => {
  const cfg = getServerConfig();
  if (!cfg.auth.configured) {
    // Fail closed: without admin credentials configured, login is impossible.
    return jsonError(new AppError('APP_UNAUTHENTICATED', { detail: 'admin auth not configured' }));
  }

  const key = clientKey(req);
  const gate = checkLoginAllowed(key);
  if (!gate.allowed) {
    return NextResponse.json(
      {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many attempts.',
          nextAction: 'Wait and retry.',
        },
      },
      { status: 429, headers: { 'retry-after': String(gate.retryAfterSec) } },
    );
  }

  const { username, password } = await readJsonBody(req, loginBodySchema, { maxBytes: 4096 });
  if (!verifyCredentials(username, password)) {
    recordLoginFailure(key);
    logger.warn('auth.login.failed', { key });
    // Generic message — never reveal whether the username or password was wrong.
    return jsonError(new AppError('APP_UNAUTHENTICATED', { detail: 'invalid credentials' }));
  }

  clearLoginFailures(key);
  const token = await issueSessionToken(username);
  const csrf = issueCsrfToken();
  const secure = req.nextUrl.protocol === 'https:' || cfg.environmentLabel === 'production';
  const maxAge = cfg.auth.sessionTtlMinutes * 60;

  const res = NextResponse.json({ ok: true, username });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(maxAge, secure));
  res.cookies.set(CSRF_COOKIE, csrf, csrfCookieOptions(maxAge, secure));
  logger.info('auth.login.ok', {});
  return res;
});
