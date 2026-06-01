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
cp .env.example .env.local      # then fill in the values below
npm run dev                     # http://localhost:3000
```

Minimum env to boot and sign in (Genesys can be added later):

```bash
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<a long, high-entropy password>
APP_SESSION_SECRET=<openssl rand -base64 48>
GENESYS_REGION_API_HOST=api.mypurecloud.com
```

Add `GENESYS_CLIENT_ID` / `GENESYS_CLIENT_SECRET` to enable source discovery and
sync. See [`docs/genesys-setup.md`](./docs/genesys-setup.md) and
[`.env.example`](./.env.example) for every variable.

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

The deployment is restricted to a **single administrator**. No page or API route
is reachable without signing in as the one user defined by `ADMIN_USERNAME` /
`ADMIN_PASSWORD`. Sessions are stateless, signed (HMAC-SHA-256) cookies
(`HttpOnly`, `SameSite=Strict`); mutating routes additionally require a
double-submit CSRF token and same-origin check. Vercel Deployment Protection /
SSO may be layered on top for defense-in-depth. See
[`docs/security-model.md`](./docs/security-model.md).

## Architecture

```
Browser (encrypted vault, file hashing, direct upload)
  │  metadata-only manifest (no bytes)              ▲ SSE status stream (tickets in-memory)
  ▼                                                  │
Next.js route handlers  ──►  Vercel Workflow (durable orchestration)
  │  (auth · CSRF · feature flags · redaction)         │  atomic steps, hooks
  ▼                                                     ▼
Genesys Cloud Knowledge Fabric  (server-only OAuth client-credentials)
```

- The **workflow engine** (`src/workflows/engine.ts`) is a pure, exhaustively
  unit-tested state machine that guarantees the completion-safety and
  ambiguity-handling invariants, independent of the durable runtime.
- The **durable workflow** (`src/workflows/sync-workflow.ts`) drives the engine,
  isolating every non-idempotent Genesys call in a `"use step"` that *catches*
  ambiguity so the runtime's automatic retry can never duplicate an effect.
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
already wired (`withWorkflow` in `next.config.mjs`). For direct browser uploads,
add your region's upload host to `GENESYS_UPLOAD_CONNECT_SRC` (CSP `connect-src`)
or enable the streaming proxy fallback. See
[`docs/deployment.md`](./docs/deployment.md) and
[`docs/runbooks.md`](./docs/runbooks.md).

## Known limitations (by design)

A pending upload cannot resume after a tab close/refresh unless the user
reselects the file (the browser lost the `File`); local history is browser-local;
cross-browser locking is best-effort; ambiguous external side effects may need
manual Genesys verification. See [`PRODUCT.md` §20](./PRODUCT.md) and
[`docs/runbooks.md`](./docs/runbooks.md).

> **Deployment validation note.** The durable workflow + direct-upload path is
> implemented against the documented Vercel Workflow SDK and the Genesys File
> Connector API, and the safety core is fully unit-tested, but the end-to-end
> durable run requires a Vercel deployment (or local Workflow world) plus a
> Genesys sandbox to exercise live — this is the spec's release gate
> ("E2E sandbox sync"). See [`docs/testing.md`](./docs/testing.md).
