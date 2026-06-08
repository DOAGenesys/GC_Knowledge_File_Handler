import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getServerConfig } from '@/server/config';
import { buildAuthorizeRedirect, setOAuthStateCookie } from '@/server/genesys/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function loginError(req: NextRequest, code: string): NextResponse {
  const url = new URL('/login', req.nextUrl);
  url.searchParams.set('auth_error', code);
  return NextResponse.redirect(url, 302);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const cfg = getServerConfig();
  if (!cfg.auth.configured) {
    return loginError(req, 'app_not_configured');
  }

  const secure = req.nextUrl.protocol === 'https:' || cfg.environmentLabel === 'production';
  let redirect: Awaited<ReturnType<typeof buildAuthorizeRedirect>>;
  try {
    redirect = await buildAuthorizeRedirect(req);
  } catch {
    return loginError(req, 'sign_in_failed');
  }
  const res = NextResponse.redirect(redirect.url, 302);
  setOAuthStateCookie(res, redirect.stateCookieValue, secure);
  return res;
}
