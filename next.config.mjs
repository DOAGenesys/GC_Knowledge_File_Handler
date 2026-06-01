import { withWorkflow } from 'workflow/next';

/**
 * Next.js configuration.
 *
 * Security headers that are STATIC (no per-request nonce) are declared here so
 * they apply to every response, including static assets. The Content-Security-
 * Policy is set per-request in `middleware.ts` because it embeds a per-response
 * nonce for scripts (`'strict-dynamic'`). Keeping CSP in middleware also keeps
 * it next to the access-control logic that gates the app.
 *
 * `withWorkflow()` enables the durable `"use workflow"` / `"use step"`
 * directives used by the sync orchestrator in `src/workflows`.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Fail the production build on type errors / lint errors — never ship a
  // build that skipped these checks.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
  experimental: {
    // Server Actions are not used; keep the attack surface minimal.
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value:
              'accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), usb=()',
          },
          // Isolate the browsing context (defense-in-depth for Spectre-class
          // cross-origin leaks). COEP is intentionally omitted so direct
          // cross-origin uploads to Genesys pre-signed URLs are not blocked.
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default withWorkflow(nextConfig);
