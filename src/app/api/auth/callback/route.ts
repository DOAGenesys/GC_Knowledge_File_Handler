import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  authErrorRedirect,
  clearGenesysAuthCookies,
  completeAuthorizationCodeLogin,
  successRedirect,
} from '@/server/genesys/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errorCodeFromCallback(req: NextRequest): string | null {
  const error = req.nextUrl.searchParams.get('error');
  if (!error) return null;
  return error === 'access_denied' ? 'access_denied' : 'sign_in_failed';
}

export async function GET(req: NextRequest): Promise<Response> {
  const callbackError = errorCodeFromCallback(req);
  if (callbackError) {
    return NextResponse.redirect(authErrorRedirect(req, callbackError), 302);
  }

  const res = NextResponse.redirect(new URL('/', req.nextUrl), 302);
  try {
    const next = await completeAuthorizationCodeLogin(req, res);
    res.headers.set('location', successRedirect(req, next).toString());
    return res;
  } catch {
    const secure = req.nextUrl.protocol === 'https:';
    clearGenesysAuthCookies(res, secure);
    res.headers.set('location', authErrorRedirect(req, 'sign_in_failed').toString());
    return res;
  }
}
