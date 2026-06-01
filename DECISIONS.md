# Product & engineering decisions (Block 0)

This records the decisions required by `TODO.md` Block 0 and the deviations made
during implementation. Decisions that affect security are flagged.

## Product constraints

| # | Decision | Choice |
|---|---|---|
| 1 | Database-free in production (not just MVP) | **Confirmed.** No server DB / object storage; enforced by ESLint import guard + scope test. |
| 2 | Vercel Workflow managed state is execution state, not an app DB | **Confirmed.** |
| 3 | File bytes never stored server-side | **Confirmed.** Direct browser→Genesys upload; optional streaming proxy never buffers to disk. |
| 4 | Browser `localStorage` is the only app-managed persisted storage | **Confirmed.** Encrypted vault + a non-secret theme key + lock metadata only. |
| 5 | Encrypted vault passphrase UX | **Confirmed.** Create/unlock/change/export/import; key in memory only; locks on refresh. |
| 6 | Production app access model | **Single-admin login, always enforced** (see security note below). |
| 7 | Genesys auth model | **Server-side OAuth Client Credentials.** |
| 8 | Source creation allowed in production | **Yes, behind `ENABLE_SOURCE_CREATION`** (default on). |
| 9 | Source discovery enabled if permitted | **Yes, `ENABLE_SOURCE_DISCOVERY`** (default on). |
| 10 | Source status/history reads | **Yes, `ENABLE_SOURCE_HISTORY`** (default on). |
| 11 | Org-wide sync diagnostics off by default | **Confirmed**, `ENABLE_ORG_SYNC_DIAGNOSTICS` default **off**. |
| 12 | Full sync | **Off by default** (`ENABLE_FULL_SYNC`), typed/confirmed when enabled. |
| 13 | `PUT /sources/{id}` (update) | **Off by default** (`ENABLE_SOURCE_UPDATE`). |
| 14 | `DELETE /sources/{id}` (delete) | **Off by default** (`ENABLE_SOURCE_DELETE`), typed confirmation. |
| 15 | Max file-size warning threshold | `MAX_FILE_WARN_MB` (default 50). Non-blocking warning. |
| 16 | Proxy upload fallback | **Off by default** (`ENABLE_PROXY_UPLOAD`); direct upload preferred. |
| 17 | Cross-browser concurrent syncs | Best-effort only; documented limitation (no shared server lock). |
| 18 | Workbench V2 article endpoints out of scope | **Confirmed**; CI guardrail enforces it. |

## Security-impacting decision: access model

> **The deployment is restricted to a single administrator and authentication is
> always enforced on every page and API route** (user requirement, 2026-06-01).

- Implemented with `ADMIN_USERNAME` + `ADMIN_PASSWORD` + `APP_SESSION_SECRET`.
- Session = stateless signed (HMAC-SHA-256) cookie, `HttpOnly` + `SameSite=Strict`.
- Mutating routes additionally require a double-submit CSRF token + same-origin check.
- `middleware.ts` denies all non-public routes; public allowlist is only
  `/login`, `/api/auth/login`, `/api/auth/logout`, `/api/health` (plus Next and
  Workflow-SDK internals).
- Vercel Deployment Protection / SSO MAY be layered on top; the app's own login
  is never bypassed. This satisfies PRODUCT.md §9.2 ("app-level single-admin
  protection with a server-issued HTTP-only cookie") and the explicit ask.

## Frontend design decisions

- The Claude Design prototype is the authoritative visual/interaction baseline,
  **ported to typed Next.js/React components** (not embedded as static HTML).
- Its CSS design system was adopted verbatim as `src/app/globals.css` (oklch
  tokens, light/dark); fonts are **self-hosted via `next/font`** (no CDN, so the
  strict CSP needs no font exception) — an intentional deviation from the
  prototype's Google Fonts `<link>`.
- All prototype mock data and scenario togglers were removed; every screen is
  wired to real backend / vault / workflow state.
- The Settings "endpoint features" toggles are **read-only reflections of
  server env flags** (least privilege is configured by deployment, not toggled
  client-side) — intentional deviation from the prototype's local toggles.

## Engineering deviations

- **MD5 + SHA-256** are self-contained, vector-tested implementations
  (streaming/incremental) rather than npm dependencies — reduces supply-chain
  risk in a security-sensitive app. MD5 is labeled upload-integrity only.
- **Styling** uses the prototype's CSS token system, not Tailwind (spec allowed
  "shared CSS variables").
- A non-secret `gkfsm:v1:theme` localStorage key was added (beyond the four in
  §10.1) so the theme is readable before vault unlock and at the login screen.
  It contains no app data or secrets.
- The workflow's safety logic is factored into a **pure engine** (`engine.ts`)
  so the completion-safety/ambiguity invariants are unit-tested without the
  durable runtime.

## Outstanding (require a live environment, per the spec's release gate)

- End-to-end durable run + direct upload of every supported extension against a
  **Genesys sandbox** + **Vercel Workflow** deployment (PRODUCT.md §19, TODO
  Block 21 E2E). The code is implemented against the documented SDK/API; the
  safety core is fully tested in-process. See `docs/testing.md`.
