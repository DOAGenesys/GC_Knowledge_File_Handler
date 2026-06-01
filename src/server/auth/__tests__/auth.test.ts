import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  randomToken,
  signSession,
  timingSafeEqual,
  verifySession,
  type SessionPayload,
} from '../session-core';
import { CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE } from '../cookies';

const SECRET = 'unit-test-session-secret-which-is-long-enough';

beforeAll(() => {
  process.env.ADMIN_USERNAME = 'admin';
  process.env.ADMIN_PASSWORD = 'super-secret-password';
  process.env.APP_SESSION_SECRET = SECRET;
});
afterAll(() => {
  delete process.env.ADMIN_USERNAME;
  delete process.env.ADMIN_PASSWORD;
  delete process.env.APP_SESSION_SECRET;
});

async function freshGuards() {
  const config = await import('@/server/config');
  config.__resetConfigCache();
  return import('../guards');
}

describe('session-core', () => {
  const now = 1_000_000;
  const payload: SessionPayload = { sub: 'admin', iat: now, exp: now + 3600 };

  it('signs and verifies a session token', async () => {
    const token = await signSession(payload, SECRET);
    const verified = await verifySession(token, SECRET, now + 1);
    expect(verified?.sub).toBe('admin');
  });

  it('rejects an expired token', async () => {
    const token = await signSession(payload, SECRET);
    expect(await verifySession(token, SECRET, now + 7200)).toBeNull();
  });

  it('rejects a tampered token', async () => {
    const token = await signSession(payload, SECRET);
    const tampered = token.slice(0, -2) + (token.endsWith('a') ? 'bb' : 'aa');
    expect(await verifySession(tampered, SECRET, now + 1)).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signSession(payload, SECRET);
    expect(await verifySession(token, 'other-secret', now + 1)).toBeNull();
  });

  it('timingSafeEqual is correct', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });

  it('randomToken yields distinct values', () => {
    expect(randomToken()).not.toBe(randomToken());
  });
});

describe('verifyCredentials (single admin)', () => {
  it('accepts the configured admin and rejects everything else', async () => {
    const { verifyCredentials } = await freshGuards();
    expect(verifyCredentials('admin', 'super-secret-password')).toBe(true);
    expect(verifyCredentials('admin', 'wrong')).toBe(false);
    expect(verifyCredentials('root', 'super-secret-password')).toBe(false);
    expect(verifyCredentials('', '')).toBe(false);
  });
});

describe('requireAuth / requireCsrf', () => {
  beforeEach(async () => {
    const config = await import('@/server/config');
    config.__resetConfigCache();
  });

  it('rejects requests without a session', async () => {
    const guards = await freshGuards();
    const req = new NextRequest('http://localhost/api/sources');
    await expect(guards.requireAuth(req)).rejects.toMatchObject({ code: 'APP_UNAUTHENTICATED' });
  });

  it('accepts a request carrying a valid session cookie', async () => {
    const guards = await freshGuards();
    const token = await guards.issueSessionToken('admin');
    const req = new NextRequest('http://localhost/api/sources', {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });
    const session = await guards.requireAuth(req);
    expect(session.sub).toBe('admin');
  });

  it('rejects a mutating request with a mismatched CSRF token', async () => {
    const guards = await freshGuards();
    const req = new NextRequest('http://localhost/api/sources', {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        host: 'localhost',
        cookie: `${CSRF_COOKIE}=abc123`,
        [CSRF_HEADER]: 'different',
      },
    });
    expect(() => guards.requireCsrf(req)).toThrow();
  });

  it('accepts a double-submit CSRF match from the same origin', async () => {
    const guards = await freshGuards();
    const req = new NextRequest('http://localhost/api/sources', {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        host: 'localhost',
        cookie: `${CSRF_COOKIE}=token-xyz`,
        [CSRF_HEADER]: 'token-xyz',
      },
    });
    expect(() => guards.requireCsrf(req)).not.toThrow();
  });

  it('rejects a cross-origin mutating request', async () => {
    const guards = await freshGuards();
    const req = new NextRequest('http://localhost/api/sources', {
      method: 'POST',
      headers: {
        origin: 'http://evil.example',
        host: 'localhost',
        cookie: `${CSRF_COOKIE}=token-xyz`,
        [CSRF_HEADER]: 'token-xyz',
      },
    });
    expect(() => guards.requireCsrf(req)).toThrow();
  });
});
