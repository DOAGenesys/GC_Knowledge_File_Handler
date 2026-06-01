import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/server/auth/cookies';
import { verifySession } from '@/server/auth/session-core';

/**
 * Edge middleware: enforces (1) a strict, nonce-based Content-Security-Policy on
 * every document/API response and (2) the single-admin access gate — NO page or
 * API route is reachable without a valid session, except the login route, the
 * auth endpoints, and the unauthenticated liveness probe.
 *
 * Kept dependency-light and `server-only`-free so it runs in the edge runtime;
 * reads the few values it needs directly from the environment.
 */

const PUBLIC_PATHS = new Set<string>([
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/health',
]);

function buildCsp(nonce: string, isProd: boolean): string {
  const connectExtra = (process.env.GENESYS_UPLOAD_CONNECT_SRC ?? '')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => /^https:\/\//i.test(s));

  const scriptSrc = [`'self'`, `'nonce-${nonce}'`, `'strict-dynamic'`];
  if (!isProd) scriptSrc.push(`'unsafe-eval'`); // React Fast Refresh in dev only.

  const directives: Record<string, string[]> = {
    'default-src': [`'self'`],
    'script-src': scriptSrc,
    'style-src': [`'self'`, `'unsafe-inline'`],
    'img-src': [`'self'`, 'data:', 'blob:'],
    'font-src': [`'self'`],
    'connect-src': [`'self'`, ...connectExtra],
    'worker-src': [`'self'`, 'blob:'],
    'object-src': [`'none'`],
    'base-uri': [`'self'`],
    'form-action': [`'self'`],
    'frame-ancestors': [`'none'`],
  };
  let csp = Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(' ')}`)
    .join('; ');
  if (isProd) csp += '; upgrade-insecure-requests';
  return csp;
}

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // Auth complete-authentication callbacks etc. live under /api/auth/* public set above.
  return false;
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const isProd = process.env.NODE_ENV === 'production';
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  const csp = buildCsp(nonce, isProd);
  const { pathname, search } = req.nextUrl;

  // Forward the nonce to the app via a request header so the root layout can
  // apply it to inline scripts.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const applyResponseHeaders = (res: NextResponse): NextResponse => {
    res.headers.set('content-security-policy', csp);
    return res;
  };

  // Public routes: pass through with CSP applied.
  if (isPublic(pathname)) {
    return applyResponseHeaders(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  // Everything else requires a valid session.
  const secret = process.env.APP_SESSION_SECRET;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = secret ? await verifySession(token, secret) : null;

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return applyResponseHeaders(
        NextResponse.json(
          {
            error: {
              code: 'APP_UNAUTHENTICATED',
              message: 'Authentication required.',
              nextAction: 'Sign in to continue.',
            },
          },
          { status: 401 },
        ),
      );
    }
    const loginUrl = new URL('/login', req.nextUrl);
    loginUrl.searchParams.set('next', pathname + search);
    return applyResponseHeaders(NextResponse.redirect(loginUrl));
  }

  return applyResponseHeaders(NextResponse.next({ request: { headers: requestHeaders } }));
}

export const config = {
  // Run on everything EXCEPT Next static assets and the Workflow SDK's internal
  // durable-execution paths (which must never be intercepted).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.well-known/workflow/).*)'],
};
