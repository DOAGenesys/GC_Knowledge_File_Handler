import 'server-only';

import { getServerConfig } from '../config';
import { signToken, verifyToken } from '../auth/session-core';

interface ProxyUploadClaims {
  t: 'pu';
  u: string;
  h: Record<string, string>;
  exp: number;
}

/**
 * Short-lived token authorizing the same-origin upload proxy to relay bytes to
 * one Genesys-issued pre-signed URL. This avoids a broad proxy allowlist while
 * keeping the bearer URL/headers out of durable workflow state.
 */
export async function signProxyUploadToken(
  url: string,
  headers: Record<string, string>,
  ttlSeconds = 3600,
): Promise<string> {
  const secret = getServerConfig().auth.sessionSecret;
  if (!secret) throw new Error('proxy upload token signing requires APP_SESSION_SECRET');
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return signToken({ t: 'pu', u: url, h: headers, exp }, secret);
}

export async function verifyProxyUploadToken(
  token: string | null | undefined,
): Promise<{ url: string; headers: Record<string, string> } | null> {
  const secret = getServerConfig().auth.sessionSecret;
  if (!secret) return null;
  const claims = await verifyToken<ProxyUploadClaims>(token, secret);
  if (!claims || claims.t !== 'pu' || typeof claims.u !== 'string') return null;
  if (!claims.u.startsWith('https://')) return null;
  if (!claims.h || typeof claims.h !== 'object' || Array.isArray(claims.h)) return null;
  return { url: claims.u, headers: claims.h };
}
