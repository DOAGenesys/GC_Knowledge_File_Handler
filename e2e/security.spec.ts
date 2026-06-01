import { expect, test } from '@playwright/test';

/**
 * Security & access E2E. These run against the built app with NO external
 * dependencies (they assert the access gate + security headers). The full
 * sandbox-sync flow (create source, upload, complete) requires a Genesys
 * sandbox and is documented in docs/testing.md.
 *
 * Requires the dev/prod server to have ADMIN_USERNAME / ADMIN_PASSWORD /
 * APP_SESSION_SECRET set. The login test is skipped unless E2E_ADMIN_USERNAME /
 * E2E_ADMIN_PASSWORD are provided to the test runner.
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

const creds = {
  username: process.env.E2E_ADMIN_USERNAME,
  password: process.env.E2E_ADMIN_PASSWORD,
};

test.describe('authenticated flows', () => {
  test.skip(
    !creds.username || !creds.password,
    'Set E2E_ADMIN_USERNAME / E2E_ADMIN_PASSWORD to run',
  );

  test('login → create vault → reach core routes', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username').fill(creds.username!);
    await page.getByLabel('Password').fill(creds.password!);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // First run: create the local vault.
    const create = page.getByRole('button', { name: 'Create vault' });
    if (await create.isVisible().catch(() => false)) {
      await page.getByLabel('Vault passphrase').fill('e2e-vault-passphrase');
      await page.getByLabel('Confirm passphrase').fill('e2e-vault-passphrase');
      await create.click();
    }

    await expect(page.getByText('Welcome back')).toBeVisible();
    for (const path of ['/sources', '/new', '/run', '/history', '/settings', '/diagnostics']) {
      await page.goto(path);
      await expect(page.locator('.page-title, .page')).toBeVisible();
    }
  });
});
