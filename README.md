# Genesys Knowledge Fabric File Sync Manager

A **database-free**, security-first web app for managing Genesys Cloud Knowledge
Fabric **`FileUpload`** sources and their file-synchronization rounds. It
discovers/validates/creates sources, validates and fingerprints files in the
browser, and runs a **durable workflow** that uploads each file directly to a
Genesys pre-signed URL and marks the synchronization `Completed` **only when
every file has definitely uploaded**.

Built from [`PRODUCT.md`](./PRODUCT.md) (spec) and [`TODO.md`](./TODO.md)
(checklist), with the UI ported from an approved Claude Design prototype
(see [`docs/design-intake.md`](./docs/design-intake.md)).

- **Stack:** Next.js 15 (App Router) · React 19 · TypeScript (strict) · Vercel
  Workflow SDK · WebCrypto · zod. No Tailwind — the design system is a
  hand-authored CSS token system (`src/app/globals.css`).
- **No app database.** Local state lives in an encrypted `localStorage` vault;
  durable run state lives in Vercel Workflow; everything else is Genesys.

---

## Quick start (local)

```bash
npm install
cp .env.example .env.local      # then fill in APP_SESSION_SECRET
npm run dev                     # http://localhost:3000
```

### Minimum env to boot

Only one server secret is required:

```bash
APP_SESSION_SECRET=<openssl rand -base64 48>
```

Open `http://localhost:3000/login`, enter your **Genesys Cloud region** (e.g.
`mypurecloud.de`) and **OAuth Client ID**, then click **Sign in with Genesys**.
Users authenticate with their own Genesys Cloud credentials via Authorization
Code + PKCE.

### Optional server defaults

These are not required. If set, they only affect readiness/diagnostics when no
user is signed in. The login page values always take precedence for a session.

```bash
GENESYS_CLIENT_ID=<your-pkce-oauth-client-id>
GENESYS_REGION=mypurecloud.de    # region domain only — not api.mypurecloud.de
```

See [`.env.example`](./.env.example) for feature flags, upload limits, and all
other optional variables.

### Genesys OAuth client setup

Create an OAuth client in Genesys Cloud Admin with:

| Setting | Value |
|---|---|
| Grant type | **Code Authorization (PKCE)** |
| Redirect URI | `https://<your-app-host>/api/auth/callback` |
| Scopes | Least-privilege Knowledge permissions for the features you enable |

For local development, add `http://localhost:3000/api/auth/callback` as an
authorized redirect URI on the same client.

**Not needed anymore:** `GENESYS_CLIENT_SECRET`, `ADMIN_USERNAME`, or
`ADMIN_PASSWORD`. The app no longer uses Client Credentials or a shared
admin login.

---

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev / production build / serve |
| `npm run typecheck` | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) |
| `npm run lint:strict` | ESLint with `--max-warnings=0` (incl. db-free import guard) |
| `npm run test` | Vitest unit + integration suite |
| `npm run test:e2e` | Playwright E2E (see `docs/testing.md`) |
| `npm run security:scope` | Endpoint-scope guardrail test (Block 6) |
| `npm run check` | format check + lint + typecheck + test (CI gate) |

## Access model

Every page and API route requires a signed-in user. Authentication uses
**Genesys Cloud Authorization Code + PKCE**:

1. User enters region + Client ID on `/login`.
2. App redirects to Genesys Cloud login.
3. Callback exchanges the code for access/refresh tokens.
4. Tokens are stored in encrypted `HttpOnly` cookies; the app session and CSRF
   cookies gate all routes.

Mutating routes additionally require a double-submit CSRF token and same-origin
check. Vercel Deployment Protection / SSO may be layered on top for
defense-in-depth. See [`docs/security-model.md`](./docs/security-model.md).

## Architecture

```
Browser (encrypted vault, file hashing, direct upload)
  │  metadata-only manifest (no bytes)              ▲ SSE status stream (tickets in-memory)
  ▼                                                  │
Next.js route handlers  ──►  Vercel Workflow (durable orchestration)
  │  (auth · CSRF · feature flags · redaction)         │  atomic steps, hooks
  ▼                                                     ▼
Genesys Cloud Knowledge Fabric  (per-user OAuth PKCE access tokens)
```

- The **workflow engine** (`src/workflows/engine.ts`) is a pure, exhaustively
  unit-tested state machine that guarantees the completion-safety and
  ambiguity-handling invariants, independent of the durable runtime.
- The **durable workflow** (`src/workflows/sync-workflow.ts`) drives the engine,
  isolating every non-idempotent Genesys call in a `"use step"` that *catches*
  ambiguity so the runtime's automatic retry can never duplicate an effect.
  Encrypted user auth context is passed into the workflow so background steps
  can call Genesys with the signed-in user's token.
- The browser **run controller** (`src/components/run-controller.ts`) consumes
  the workflow's SSE stream, uploads each file via the in-memory pre-signed
  ticket (with progress), and reports results — never fabricating success.

Deep dives: [`docs/architecture.md`](./docs/architecture.md),
[`docs/storage-model.md`](./docs/storage-model.md),
[`docs/endpoint-scope.md`](./docs/endpoint-scope.md),
[`docs/frontend-wiring.md`](./docs/frontend-wiring.md).

## Security properties (verified)

- No app database / object storage (enforced by an ESLint import guard +
  architecture test). Only the encrypted vault, Vercel Workflow state, and
  Genesys hold data.
- No secrets / tokens / pre-signed URLs / signed headers / file bytes are ever
  persisted (localStorage, logs, workflow payloads, or support bundles).
  All logs pass through redaction.
- Strict nonce-based Content-Security-Policy + full security-header set
  (HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`,
  `Permissions-Policy`, COOP/CORP).
- Completion is impossible unless every file upload succeeded; ambiguous
  external outcomes are surfaced as `*Unknown` / `NeedsUserAction`, never as
  success, and non-idempotent calls are never blind-retried.
- Only the documented File-Connector endpoints are reachable; legacy Workbench /
  guest / settings / connector endpoints are blocked by a CI guardrail.

## Deployment

Deploy to Vercel; set env vars in Project Settings; the Vercel Workflow SDK is
already wired (`withWorkflow` in `next.config.mjs`).

### Required Vercel env vars

| Variable | Notes |
|---|---|
| `APP_SESSION_SECRET` | 32+ char random string (`openssl rand -base64 48`) |

### Optional Vercel env vars

| Variable | Notes |
|---|---|
| `GENESYS_CLIENT_ID` | Server default only; users can override on login |
| `GENESYS_REGION` | Region domain, e.g. `mypurecloud.de` (not `api.*`) |
| `ENABLE_*` flags | Feature toggles — see `.env.example` |
| `GENESYS_UPLOAD_CONNECT_SRC` | CSP allowlist for direct browser uploads |

### Remove if still present

These belonged to the old Client Credentials + admin-login model and are unused:

- `GENESYS_CLIENT_SECRET`
- `GENESYS_REGION_API_HOST` (replaced by `GENESYS_REGION`)
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

Register `https://<your-vercel-domain>/api/auth/callback` on your Genesys PKCE
OAuth client before going live.

For direct browser uploads, add your region's upload host to
`GENESYS_UPLOAD_CONNECT_SRC` (CSP `connect-src`) or enable the streaming proxy
fallback. See [`docs/deployment.md`](./docs/deployment.md) and
[`docs/runbooks.md`](./docs/runbooks.md).

## Known limitations (by design)

A pending upload cannot resume after a tab close/refresh unless the user
reselects the file (the browser lost the `File`); local history is browser-local;
cross-browser locking is best-effort; ambiguous external side effects may need
manual Genesys verification. Per-file delete/update in Genesys is not available
for FileUpload sources — use **Reset source** (delete and recreate empty) when
you need to clear synced content. See [`PRODUCT.md` §20](./PRODUCT.md) and
[`docs/runbooks.md`](./docs/runbooks.md).

> **Deployment validation note.** The durable workflow + direct-upload path is
> implemented against the documented Vercel Workflow SDK and the Genesys File
> Connector API, and the safety core is fully unit-tested, but the end-to-end
> durable run requires a Vercel deployment (or local Workflow world) plus a
> Genesys sandbox to exercise live — this is the spec's release gate
> ("E2E sandbox sync"). See [`docs/testing.md`](./docs/testing.md).
