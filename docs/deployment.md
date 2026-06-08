# Deployment & Operations (Vercel)

How to deploy the **Genesys Knowledge Fabric File Sync Manager** to Vercel and operate it
safely. The app is database-free: all persisted app state lives in the browser's
`localStorage` (an encrypted vault); the server holds only the Genesys OAuth client
credential and signs short-lived session/callback tokens. Durable sync orchestration runs
on the Vercel Workflow SDK.

> Audience: the platform engineer who owns the Vercel project. See `docs/genesys-setup.md`
> for the OAuth client and region host, and `PRODUCT.md` for the full spec.

---

## 1. Prerequisites

- A Vercel project linked to this repository.
- Node `>=20.11.0` (`package.json` → `engines`). Use a matching Node version in the Vercel
  Project Settings → **Node.js Version**.
- A Genesys Cloud OAuth client of grant type **Client Credentials** with least-privilege
  Knowledge permissions for the features you enable (`docs/genesys-setup.md`).
- The Vercel Workflow SDK is already wired up — `next.config.mjs` wraps the config in
  `withWorkflow(...)`, which enables the durable `"use workflow"` / `"use step"` directives
  used by `src/workflows/`. No extra build flag is required.

---

## 2. Environment variables

Set these in **Vercel → Project → Settings → Environment Variables**. Reference values come
from `.env.example`. Add each variable to the environments you ship: **Production** and
**Preview** (and Development if you run `vercel dev`). Secret values are read only
server-side and are never returned to the browser, logged, or written to `localStorage`.

### Required

| Variable | Purpose | Notes |
| --- | --- | --- |
| `GENESYS_CLIENT_ID` | Genesys OAuth Client Credentials client id | Secret. |
| `GENESYS_CLIENT_SECRET` | Genesys OAuth client secret | Secret; server memory only. |
| `GENESYS_REGION_API_HOST` | Region API host **without scheme** | e.g. `api.mypurecloud.com`, `api.mypurecloud.ie`, `api.usw2.pure.cloud`. Validated/normalized in `src/server/config.ts`. |
| `ADMIN_USERNAME` | The single allowed login username | App enforces single-admin auth on every page and API route. |
| `ADMIN_PASSWORD` | The admin password | Secret. Use high entropy: `openssl rand -base64 24`. |
| `APP_SESSION_SECRET` | Signs the session cookie, CSRF token, and workflow upload-callback tokens | Secret, 32+ chars: `openssl rand -base64 48`. Without it the login route fails closed and nothing is reachable. |

> The app **boots** even when Genesys is unconfigured (sync actions disable; Diagnostics
> shows secret-free guidance). It does **not** boot usable without the three auth vars —
> auth fails closed. `getReadiness()` reports exactly which of the six required vars are
> `missing`.

### Optional (sensible defaults applied if unset)

| Variable | Default | Purpose |
| --- | --- | --- |
| `SESSION_TTL_MINUTES` | `720` | Idle minutes before re-login is required. |
| `MAX_FILE_WARN_MB` | `50` | Warn (do not block) when a single file exceeds this many MB. |
| `MAX_SELECTED_FILES` | `500` | Hard cap on files selected per sync round. |
| `PROXY_UPLOAD_MAX_BYTES` | `26214400` (25 MiB) | Max bytes the streaming proxy relays per file. Only used when `ENABLE_PROXY_UPLOAD=true`. Keep aligned with your Vercel plan's request limits. |
| `WORKFLOW_UPLOAD_WAIT_SECONDS` | `900` | Seconds the workflow waits for a browser upload result before pausing as `NeedsUserAction` (never a false completion). |
| `GENESYS_UPLOAD_CONNECT_SRC` | empty | Space-separated HTTPS origins added to the CSP `connect-src` allowlist for direct browser→Genesys upload. See §4. |

### Feature flags

Resolved server-side (`src/lib/feature-flags.ts`, parsed in `src/server/config.ts`) and
exposed to the browser as a non-secret payload via `GET /api/features`. The UI hides
disabled features **and** the server independently re-checks the flag on every optional
route. Defaults below are the production posture (read-only + creation ON; support-only and
destructive OFF). Accepted truthy values: `1`, `true`, `yes`, `on`.

| Flag | Default | Capability |
| --- | --- | --- |
| `ENABLE_SOURCE_DISCOVERY` | `true` | List/import remote Knowledge sources (read-only). |
| `ENABLE_SOURCE_CREATION` | `true` | Create FileUpload sources. |
| `ENABLE_SOURCE_HISTORY` | `true` | Read per-source synchronization history (read-only). |
| `ENABLE_ORG_SYNC_DIAGNOSTICS` | `false` | Support-only org-wide sync view (read-only). |
| `ENABLE_FULL_SYNC` | `false` | Allow `Full` replacement synchronizations. |
| `ENABLE_PROXY_UPLOAD` | `false` | Same-origin streaming upload fallback when direct upload is CORS-blocked. |
| `ENABLE_SOURCE_UPDATE` | `false` | Edit FileUpload-safe source fields (destructive). |
| `ENABLE_SOURCE_DELETE` | `false` | Permanently delete a source (destructive, unrecoverable). |

> Enable a flag only when the OAuth client actually has the matching Genesys permission.
> Keep destructive flags OFF unless deployment policy requires them.

### Public (non-secret) build metadata

These are bundled into the client. Prefix `NEXT_PUBLIC_` means **build-time** — set them
before the build, not at runtime.

| Variable | Example | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_VERSION` | `1.2.0` | Shown in UI. |
| `NEXT_PUBLIC_ENVIRONMENT_LABEL` | `production` | One of `local` \| `preview` \| `production`; drives the environment banner. Set `production` in the Production environment and `preview` in Preview. |

---

## 3. Build, runtime & request handling

- **Build command:** `next build` (`npm run build`). The build fails on type or lint errors
  — `next.config.mjs` sets `typescript.ignoreBuildErrors: false` and
  `eslint.ignoreDuringBuilds: false`. Never ship a build that skipped these checks.
- **Route runtime:** every API route under `src/app/api/**/route.ts` declares
  `export const runtime = 'nodejs'`. They run on the Node.js runtime (not Edge) because they
  read secrets and use `server-only` modules. Do not change these to `edge`.
- **Middleware:** `src/middleware.ts` runs on the Edge runtime and applies the per-request
  nonce-based CSP plus the single-admin access gate. It is intentionally dependency-light.
- **Static security headers** (HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`, COOP/CORP) are declared in `next.config.mjs`
  → `headers()` and apply to every response. The dynamic CSP lives in middleware because it
  embeds a per-response script nonce.

### `.well-known/workflow` must not be intercepted

The Workflow SDK's internal durable-execution endpoints live under
`/.well-known/workflow/`. The middleware `matcher` already **excludes** these paths (along
with `_next/static`, `_next/image`, and `favicon.ico`):

```
matcher: ['/((?!_next/static|_next/image|favicon.ico|.well-known/workflow/).*)']
```

Do not add any rewrite, redirect, or proxy rule (in `vercel.json` or elsewhere) that blocks
or rewrites `/.well-known/workflow/*`, or durable sync execution will break.

---

## 4. Direct upload vs. proxy fallback (CSP)

File bytes reach Genesys one of two ways. Pick **one** before going live:

1. **Direct browser → Genesys upload (preferred).** The browser PUTs to a Genesys-issued
   pre-signed URL. That origin must be allowed by the CSP `connect-src` directive, which is
   built per-request in `src/middleware.ts` from `GENESYS_UPLOAD_CONNECT_SRC`. Set it to a
   space-separated list of HTTPS origins for your region's upload host(s), e.g.:

   ```
   GENESYS_UPLOAD_CONNECT_SRC=https://*.s3.amazonaws.com https://*.pure.cloud
   ```

   Only entries matching `https://` are accepted; everything else is ignored. (COEP is
   intentionally omitted from the static headers so these cross-origin uploads are not
   blocked.)

2. **Same-origin proxy fallback.** Leave `GENESYS_UPLOAD_CONNECT_SRC` empty and set
   `ENABLE_PROXY_UPLOAD=true`. Bytes stream through `POST /api/sync/proxy-upload`, capped at
   `PROXY_UPLOAD_MAX_BYTES` per file. This avoids CSP/CORS tuning but is bounded by your
   Vercel plan's request duration and body-size limits — keep `PROXY_UPLOAD_MAX_BYTES`
   aligned with the plan.

> If you set neither, direct uploads are blocked by CSP and the proxy is disabled — uploads
> will fail. Choose one.

---

## 5. Access protection (defense in depth)

The app's own single-admin login is **always enforced** by `src/middleware.ts`: every page
and API route requires a valid session cookie except the public set —
`/login`, `/api/auth/login`, `/api/auth/logout`, and the unauthenticated liveness probe
`/api/health`.

Because the server holds a Genesys client credential, the deployment must never be usable by
anonymous visitors. You **may** optionally layer Vercel **Deployment Protection** /
Vercel Authentication / SSO at the project level on top of the app login (recommended for
Preview deployments in particular). The app login is required regardless; Deployment
Protection is additive.

---

## 6. Logging & redaction

Redaction is automatic. All log output and any support bundle passes through
`src/server/redact.ts` before emission, so bearer tokens, client secrets, pre-signed upload
URLs, signed headers, cookies, passwords, CSRF/callback/session tokens, and URL query
strings are replaced with `[REDACTED]`. No additional configuration is required to keep
secrets out of Vercel logs. Do not add `console.log` of raw request/response objects that
bypass the logger.

---

## 7. npm scripts

| Script | Command | Use |
| --- | --- | --- |
| `dev` | `next dev` | Local dev server. |
| `build` | `next build` | Production build (Vercel runs this). |
| `start` | `next start` | Run the production build locally. |
| `lint` | `next lint` | Lint. |
| `lint:strict` | `eslint . --max-warnings=0` | Lint, zero warnings allowed. |
| `format` | `prettier --write .` | Apply formatting. |
| `format:check` | `prettier --check .` | Verify formatting. |
| `typecheck` | `tsc --noEmit` | Type-check only. |
| `test` | `vitest run` | Unit/integration tests. |
| `test:e2e` | `playwright test` | End-to-end tests. |
| `security:scope` | `vitest run src/server/genesys/__tests__/endpoint-scope.test.ts` | Assert no client targets a Genesys path outside the `GENESYS_ENDPOINTS` allowlist. |
| `security:audit` | `npm audit --omit=dev --audit-level=high` | Dependency audit. |
| `check` | `format:check && lint:strict && typecheck && test` | **CI gate** (see below). |
| `analyze` | `ANALYZE=true next build` | Bundle analysis. |

---

## 8. CI gate

Run the full gate before every deploy. It chains formatting, strict lint, type-check, and
tests:

```bash
npm run check
```

`npm run check` must pass before merging/promoting. Because `next.config.mjs` also enforces
`ignoreBuildErrors: false` and `ignoreDuringBuilds: false`, the Vercel build is a second
backstop — but run `npm run check` in CI so failures surface before the build. Consider also
running `npm run security:scope` and `npm run security:audit` in CI to guard the endpoint
allowlist and dependency posture.

---

## 9. Deploy checklist

1. Set all six **required** env vars in Production (and Preview), plus any optional/feature
   flags you intend to enable.
2. Choose the upload path: set `GENESYS_UPLOAD_CONNECT_SRC` **or** enable
   `ENABLE_PROXY_UPLOAD` (§4).
3. Set `NEXT_PUBLIC_ENVIRONMENT_LABEL` per environment (`production` / `preview`) and
   `NEXT_PUBLIC_APP_VERSION`.
4. (Optional) Enable Vercel Deployment Protection / SSO.
5. Confirm `npm run check` is green in CI.
6. Deploy. After deploy, hit `GET /api/health` (public) for liveness, sign in, and open
   **Diagnostics** — it reports readiness (`genesysConfigured`, `authConfigured`, any
   `missing` vars, region host validity, resolved feature flags, limits, and whether direct
   upload `connect-src` is configured) without exposing secrets.
7. Verify `/.well-known/workflow/*` is reachable (not blocked by any custom rule) so durable
   sync runs work.
