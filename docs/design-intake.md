# External Frontend Design Intake

This document records the intake of the external Claude Design prototype for the
**Genesys Knowledge Fabric File Sync Manager**, and the design-to-product
alignment between that prototype and the shipped typed Next.js / React
application. It satisfies the intake/alignment tasks in `TODO.md` Block 17 and
the external-design-import safety items in Block 3.

## 1. Artifact record

| Field | Value |
|---|---|
| Source URL | `https://api.anthropic.com/v1/design/h/q7IfZ83wTo-JorYIRs1BAw?open_file=index.html` |
| Fetched | 2026-06-01 |
| Artifact sha256 | `0f528a8f085e0acdbb34161b310210a7842abbab2991f668aba1f88308bf36a5` (gzip blob, 89.9 KB) |
| Format | gzipped tar of an HTML/CSS/JS Claude Design (claude.ai/design) prototype |
| Extracted under | `design-intake/genesys-knowledge-file-sync-manager/` |
| Disposition | reviewed only — **not shipped** to production |

> Reproducible fetch: the artifact was retrieved from the Source URL above on the
> Fetched date and decompressed (`gzip -d` → `tar -x`) into `design-intake/`. The
> committed copy under `design-intake/` is the authoritative reviewed reference;
> treat it as untrusted input, not production code. The URL may require Anthropic
> credentials / expire; the committed copy + hash above are the durable record.

### Extracted contents

```
design-intake/genesys-knowledge-file-sync-manager/
  README.md                         # Claude Design handoff instructions
  chats/chat1.md                    # design conversation transcript
  project/
    index.html                      # prototype entry (CDN React + in-browser Babel)
    styles.css                      # prototype CSS design system
    js/
      app.jsx                       # global store (Context), routing, sidebar, topbar
      data.jsx                      # constants, validation, mock data + sample files
      icons.jsx, ui.jsx             # icon set + shared UI primitives
      screen_vault.jsx              # vault lock/unlock screen
      screen_dashboard.jsx
      screen_sources.jsx
      screen_newsync.jsx
      screen_activerun.jsx
      screen_history.jsx
      screen_settings.jsx
      screen_diagnostics.jsx
    uploads/PRODUCT.md              # the product spec, carried alongside the design
```

The prototype is a single-page app: `index.html` mounts `<Root />` and loads all
JSX via `<script type="text/babel">` compiled in the browser by
`@babel/standalone`. React, ReactDOM, and Babel are pulled from `unpkg.com`, and
the **Hanken Grotesk** / **IBM Plex Mono** fonts are pulled from
`fonts.googleapis.com` / `fonts.gstatic.com`. None of those external loads ship
in production (see §3).

## 2. What was ported, and how

The prototype was treated as a **pixel-and-interaction baseline**, not as code to
serve. Per the handoff README, the visual output was recreated in the technology
that fits the target codebase rather than copying the prototype's internal
structure.

- **Ported to typed Next.js / React components — not served as static HTML.**
  Each prototype screen became a route under `src/app/`. No `index.html`,
  iframe, or `dangerouslySetInnerHTML` rendering of the prototype is used. The
  in-browser Babel pipeline and CDN React are gone; the app compiles ahead of
  time with strict TypeScript.
- **CSS design system adopted as `src/app/globals.css`.** The prototype's
  `styles.css` tokens (CSS custom properties, `data-theme` light/dark theming,
  component classes such as `card`, `nav-item`, `statuschip`, `toast`) were
  carried over into the app's single global stylesheet.
- **Fonts self-hosted via `next/font`, no CDN, CSP-clean.** `src/app/layout.tsx`
  loads `Hanken_Grotesk` and `IBM_Plex_Mono` through `next/font/google`, exposing
  them as the `--font-hanken` / `--font-plex` CSS variables on `<body>`. Fonts
  are served from the app origin, so the strict CSP needs only
  `font-src 'self'` — the prototype's `fonts.googleapis.com` / `fonts.gstatic.com`
  links are intentionally not reproduced.
- **All prototype mock data / global state replaced with real backend, vault, and
  workflow state.** The prototype's `data.jsx` seed helpers
  (`seedSources`, `seedRemoteSources`, `seedHistory`, `genSyncActivity`,
  `makeSampleFiles`, and the `sha256b64`/`md5b64`/`genSourceId` fakers) and the
  `app.jsx` in-memory `AppProvider` store are not shipped. The real UI is backed
  by:
  - the **encrypted localStorage vault** (`src/lib/vault/**`) for the local
    source registry, run summaries, and preferences;
  - **server API routes** under `src/app/api/**` that proxy the in-scope Genesys
    Knowledge endpoints (`src/lib/constants.ts` → `GENESYS_ENDPOINTS`) without
    exposing tokens;
  - the **Vercel Workflow** (`src/workflows/**`) for active-run state, with real
    browser `File` objects and real MD5 (base64) / SHA-256 hashing
    (`src/lib/md5.ts`, `src/lib/sha256.ts`, `src/lib/hashing.ts`).
- **Prototype-only scenario togglers dropped.** The prototype let a reviewer flip
  app state by hand — `setVault('locked' | 'corrupt')`, `connection` /
  `accessProtected` constants, and `setFeature(...)` mutating `FEATURE_DEFAULTS`
  client-side. In production these are real and not user-flippable: vault state
  comes from the encrypted vault and the single-admin session, connection health
  comes from `GET /api/health` and `GET /api/diagnostics`, and feature flags are
  **read-only, env-driven** (`src/lib/feature-flags.ts`, surfaced via
  `GET /api/features`). The theme toggle is the only stateful control kept, and
  it persists only the non-secret `gkfsm:v1:theme` key.

## 3. CSP and security posture of the import

The shipped app runs under a strict, nonce-based Content-Security-Policy built in
`src/middleware.ts`. The import was made CSP-clean rather than relaxing the CSP:

| Prototype dependency | Production handling |
|---|---|
| CDN React / ReactDOM / Babel (`unpkg.com`) | Removed; app is precompiled. `script-src 'self' 'nonce-…' 'strict-dynamic'`. |
| Google Fonts CDN | Removed; self-hosted via `next/font`. `font-src 'self'`. |
| In-browser `type="text/babel"` scripts | Removed; no inline/eval script execution in production. |
| Prototype mock auth / fake outbound calls | Removed; real single-admin auth + server-side Genesys calls only. |

The one inline script that ships is the theme bootstrap in
`src/app/layout.tsx`, which runs under the per-request CSP **nonce** issued by
the middleware (`x-nonce` header). It reads only the non-secret
`gkfsm:v1:theme` key to set `data-theme` before first paint; it touches no app
data, secrets, or user input.

## 4. Design-to-product alignment

Each prototype screen maps to a real App Router route and the backend / vault /
workflow state that powers it. Prototype routing was a `route` string in the
`app.jsx` store; production routing uses real routes. All app routes sit behind
the single-admin gate enforced by `src/middleware.ts` (only `/login` and the
auth/health endpoints are public).

| Prototype screen | Prototype source | Real route | Backing state / endpoints |
|---|---|---|---|
| Vault lock / unlock | `js/screen_vault.jsx` (`VaultLock`) | `src/app/(app)/layout.tsx` `VaultGate` (gates every `(app)` route) | Encrypted localStorage vault (`src/lib/vault/**`), WebCrypto AES-GCM key held in memory only |
| Dashboard | `js/screen_dashboard.jsx` | `src/app/(app)/page.tsx` | `GET /api/health` (Genesys conn.), single-admin session, vault status, `GET /api/features`, workflow status (`GET /api/sync/status`), last-run summaries from the vault |
| Sources | `js/screen_sources.jsx` | `src/app/(app)/sources/page.tsx` | Local registry in the vault + `GET /api/sources` (→ `GET /knowledge/sources`), `GET /api/sources/[sourceId]`, create via `POST`, optional flag-gated update/delete |
| New Sync | `js/screen_newsync.jsx` | `src/app/(app)/new/page.tsx` | Real `File` objects, `src/lib/validation.ts` (extension + Genesys filename rules), `src/lib/hashing.ts` (MD5 b64 + SHA-256), manifest persisted to vault, `POST /api/sync/start` |
| Active Run | `js/screen_activerun.jsx` | `src/app/(app)/run/page.tsx` | Vercel Workflow state (`src/workflows/**`) via `GET /api/sync/status`; per-file upload tickets, `POST /api/sync/upload-callback`, `POST /api/sync/cancel`, optional `POST /api/sync/proxy-upload` |
| History | `js/screen_history.jsx` | `src/app/(app)/history/page.tsx` | Encrypted local run summaries from the vault, cross-checked against `GET /api/sources/[sourceId]/synchronizations` and `…/[synchronizationId]` |
| Settings | `js/screen_settings.jsx` | `src/app/(app)/settings/page.tsx` | Vault controls (lock/passphrase/export/import/clear), preferences in the vault, read-only feature flags + readiness from `GET /api/features` |
| Diagnostics | `js/screen_diagnostics.jsx` | `src/app/(app)/diagnostics/page.tsx` | `GET /api/diagnostics` (env / auth / Genesys permission / workflow checks), optional `GET /api/diagnostics/org-synchronizations` (flag-gated), client-side WebCrypto / localStorage / hashing checks |
| (login — added) | — (prototype had no login) | `src/app/login/page.tsx` | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`; HTTP-only signed session cookie |

The prototype's persistent sidebar, topbar, and toasts map to the shared shell
components mounted by `src/app/(app)/layout.tsx` (`AppShell`, `Toasts`,
`AppProvider`).

## 5. Intentional deviations from the prototype

These are deliberate departures, required by security, the single-admin access
model, and Knowledge Fabric scope. Each is allowed under Block 17's
"intentional design deviations" provision.

- **Single-admin login added.** The prototype had no authentication and started
  directly at the Dashboard. Production adds a dedicated `/login` page and a
  server-enforced single-administrator gate (`ADMIN_USERNAME`, `ADMIN_PASSWORD`,
  `APP_SESSION_SECRET`, `SESSION_TTL_MINUTES`) applied in `src/middleware.ts` to
  every page and API route except the login/auth/health endpoints. No screen is
  reachable anonymously.
- **Settings feature toggles are read-only and env-driven.** The prototype's
  Settings let a reviewer flip `ENABLE_*` flags live via `setFeature`. In
  production the toggles are display-only: the effective flags come from server
  environment variables (`ENABLE_SOURCE_DISCOVERY`, `ENABLE_SOURCE_HISTORY`,
  `ENABLE_SOURCE_CREATION`, `ENABLE_ORG_SYNC_DIAGNOSTICS`, `ENABLE_FULL_SYNC`,
  `ENABLE_PROXY_UPLOAD`, `ENABLE_SOURCE_UPDATE`, `ENABLE_SOURCE_DELETE`) and are
  enforced server-side; the UI shows enabled/disabled state but cannot change it.
- **Theme bootstrap is an inline script under the CSP nonce.** To avoid a
  light/dark flash on first paint, `src/app/layout.tsx` ships one small inline
  `<script>` carrying the per-request nonce from `src/middleware.ts`. It is the
  only inline script in the app, reads only `gkfsm:v1:theme`, and writes no app
  data — it exists solely to set `data-theme` before hydration without weakening
  the strict CSP.
