import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Default test environment is `node` so that the platform Web Crypto API
 * (globalThis.crypto.subtle) is fully available for vault and hashing tests.
 * React component tests opt into jsdom per-file with:
 *   // @vitest-environment jsdom
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The `server-only`/`client-only` marker packages throw when resolved
      // without their bundler condition; stub them out for Node unit tests.
      'server-only': fileURLToPath(new URL('./src/test/empty-module.ts', import.meta.url)),
      'client-only': fileURLToPath(new URL('./src/test/empty-module.ts', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'e2e', 'design-intake'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/**/__tests__/**', 'src/**/*.d.ts'],
    },
  },
});
