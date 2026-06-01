import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests.
 *
 * These exercise the real app in a browser. The full sandbox-sync E2E flows
 * (create source, upload, complete) require a configured Genesys sandbox OAuth
 * client and are gated behind the E2E_GENESYS_SANDBOX env flag — see
 * docs/testing.md. The UI/navigation/security E2E flows run against the local
 * dev server without external dependencies.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run build && npm run start',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
