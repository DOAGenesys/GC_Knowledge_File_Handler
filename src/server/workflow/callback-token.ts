import 'server-only';

import { getServerConfig } from '../config';
import { signToken, verifyToken } from '../auth/session-core';

/**
 * Signed callback tokens bind a browser upload-result callback to exactly one
 * (run, file, attempt). The token is issued alongside the upload ticket and
 * verified in the callback route, so a callback cannot be replayed for a
 * different file/attempt even by the authenticated admin (TODO Block 13).
 */
interface CallbackClaims {
  t: 'cb';
  k: string; // localRunKey (hook token base)
  f: string; // localFileKey
  a: string; // attemptId
  exp: number;
}

export async function signCallbackToken(
  localRunKey: string,
  localFileKey: string,
  attemptId: string,
  ttlSeconds = 3600,
): Promise<string> {
  const secret = getServerConfig().auth.sessionSecret;
  if (!secret) throw new Error('callback token signing requires APP_SESSION_SECRET');
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const claims: CallbackClaims = { t: 'cb', k: localRunKey, f: localFileKey, a: attemptId, exp };
  return signToken(claims as unknown as Record<string, unknown>, secret);
}

export async function verifyCallbackToken(
  token: string,
  expect: { localRunKey: string; localFileKey: string; attemptId: string },
): Promise<boolean> {
  const secret = getServerConfig().auth.sessionSecret;
  if (!secret) return false;
  const claims = await verifyToken<CallbackClaims>(token, secret);
  if (!claims || claims.t !== 'cb') return false;
  return (
    claims.k === expect.localRunKey &&
    claims.f === expect.localFileKey &&
    claims.a === expect.attemptId
  );
}
