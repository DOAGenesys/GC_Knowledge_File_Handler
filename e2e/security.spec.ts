import { expect, test } from '@playwright/test';

/**
 * Security & access E2E. These run against the built app with NO external
 * dependencies. Authenticated Genesys PKCE flows require a real tenant and are
 * covered manually/deployment-side, not by a skipped local placeholder.
 */

test('unauthenticated visit to a protected page redirects to /login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login(\?|$)/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('unauthenticated API call returns 401', async ({ request }) => {
  const res = await request.get('/api/features');
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body.error.code).toBe('APP_UNAUTHENTICATED');
});

test('the liveness probe is public', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
});

test('responses carry the strict security headers + nonce CSP', async ({ request }) => {
  const res = await request.get('/login');
  const csp = res.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toMatch(/script-src [^;]*'nonce-/);
  expect(res.headers()['x-frame-options']).toBe('DENY');
  expect(res.headers()['x-content-type-options']).toBe('nosniff');
  expect(res.headers()['strict-transport-security']).toContain('max-age=');
});
