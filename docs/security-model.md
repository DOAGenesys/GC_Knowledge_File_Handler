# Security model

Threat model and controls for the **Genesys Knowledge Fabric File Sync Manager**.
This document is authoritative for *how* the app defends itself; it maps each
control to the code that implements it.

The core risk this app carries: it holds a **Genesys OAuth Client-Credentials
secret server-side** and can mutate a customer's Knowledge Fabric. Anyone who
reaches an unauthenticated route could create/delete sources or drive syncs with
the operator's Genesys permissions. Therefore *every* route is gated, and the
Genesys token never leaves the server.

---

## 1. Trust boundaries

```text
Untrusted                 | Trusted (server)                | External
--------------------------|---------------------------------|------------------
Browser JS (the admin)    | Next.js route handlers          | Genesys Cloud
  - localStorage vault     |   + edge middleware (gate+CSP)  |   - OAuth token
  - file bytes (never sent |   + Vercel Workflow runtime     |   - Knowledge API
    to our server)         |     (server-only)               | Genesys upload host
  - source/file/error text |   secrets: GENESYS_CLIENT_SECRET|   (pre-signed URL)
    rendered in UI         |   APP_SESSION_SECRET, password  |
```

Key boundary rules:

- **Server-only code** (`getServerConfig`, Genesys client, OAuth, redaction,
  logger, callback-token, diagnostics) imports `'server-only'`
  (`src/server/config.ts`, `src/server/redact.ts`, `src/server/logger.ts`,
  `src/server/genesys/oauth.ts`, `src/server/auth/guards.ts`, …). A build error
  is raised if any of these is pulled into a client bundle.
- **Edge-safe primitives** (`session-core.ts`, `cookies.ts`) are deliberately
  pure (no `server-only`, no env, no Node APIs) so the middleware can verify the
  session in the edge runtime. The signing secret is always passed in by the
  caller; there is no global secret import in those files.
- Secrets cross **out** to the browser only as readiness booleans
  (`getReadiness()` in `src/server/config.ts`) — never the values.
- File bytes never reach our server on the happy path (direct browser→Genesys
  upload). The optional proxy streams them through without buffering or storage.

---

## 2. Authentication (single admin)

Implemented in `src/server/auth/*` and `src/app/api/auth/login/route.ts`.

| Property | Value | Where |
|---|---|---|
| Identity | One fixed admin: `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `verifyCredentials()` in `guards.ts` |
| Credential compare | Constant-time on **both** username and password | `timingSafeEqual()` in `session-core.ts` |
| Session form | Stateless signed cookie (no server store) | `signSession()` / `verifySession()` |
| Signature | HMAC-SHA-256 over a base64url payload, via `crypto.subtle` | `hmac()` in `session-core.ts` |
| Signing key | `APP_SESSION_SECRET` (32+ chars) | `getServerConfig().auth.sessionSecret` |
| Cookie | `gkfsm_session`, `HttpOnly`, `SameSite=Strict`, `Path=/`, `Secure` in prod/https | `sessionCookieOptions()` in `cookies.ts` |
| Expiry | `exp` claim enforced on verify; TTL = `SESSION_TTL_MINUTES` (default 720) | `verifySession()`, `issueSessionToken()` |
| Login throttle | In-memory bucket, 10 attempts / 60 s per client IP | `rate-limit.ts` |
| Failure response | Generic `APP_UNAUTHENTICATED`; never reveals which field was wrong | `login/route.ts` |
| Fail-closed | If admin creds / session secret are unset, login is impossible | `login/route.ts`, `config.ts` |

Notes and limits:

- **The cookie is the session.** Integrity comes from the HMAC; there is no
  revocation list, so shortening `SESSION_TTL_MINUTES` is the lever for forced
  re-login. Logout (`/api/auth/logout`) clears the cookies but cannot invalidate
  a leaked, still-valid token before its `exp`.
- The login rate limit is **per serverless instance** and therefore best-effort
  against credential stuffing (acknowledged in `rate-limit.ts`). The primary
  defense is a high-entropy `ADMIN_PASSWORD`.
- `verifyCredentials` compares username and password with `&&` short-circuit;
  this can only leak whether the *username* matched, which is acceptable for one
  fixed account.
- Vercel Deployment Protection / SSO MAY be layered on top for defense-in-depth,
  but the app's own login is always enforced regardless.

---

## 3. Route gating (middleware)

`src/middleware.ts` runs on every request except Next static assets and the
Workflow SDK internals. It performs two jobs: **set CSP** and **enforce the
session** on all non-public routes.

**Public allowlist** (`PUBLIC_PATHS`, the *only* routes reachable without a
session):

| Path | Why public |
|---|---|
| `/login` | The login page itself |
| `/api/auth/login` | Establishes the session |
| `/api/auth/logout` | Only clears cookies; grants no access |
| `/api/health` | Unauthenticated liveness probe |

Implicitly excluded from the gate via the `matcher` (never intercepted):
`_next/static`, `_next/image`, `favicon.ico`, and `/.well-known/workflow/`
(durable-execution paths that must not be touched).

Everything else requires a valid session. On failure:

- `/api/*` → `401` JSON `{ error: { code: "APP_UNAUTHENTICATED", … } }`.
- Any other path → `302` redirect to `/login?next=<original>`.

CSP is applied to **both** outcomes, so even rejections carry the policy.

> Defense-in-depth: the middleware is the first gate, but each protected route
> handler **independently** calls `requireAuth(req)` (`guards.ts`). A route is
> never trusting the middleware alone.

---

## 4. CSRF / request integrity

Mutating, cookie-authenticated routes call `requireCsrf(req)` (`guards.ts`),
which applies **two** checks:

1. **Origin check** — if an `Origin` header is present, its host must equal the
   request `Host`; mismatch → `APP_CSRF_REJECTED` (403). Unparseable origin is
   also rejected.
2. **Double-submit token** — the `x-csrf-token` header must equal the
   `gkfsm_csrf` cookie, compared with `timingSafeEqual`.

The CSRF cookie is intentionally **not** `HttpOnly` (so client JS can echo it
into the header) but is `SameSite=Strict` and `Secure` in prod
(`csrfCookieOptions()`), so it neither rides cross-site requests nor is readable
cross-origin. Both cookies are minted together at login.

Additional request-integrity controls in `readJsonBody()`
(`src/server/http/route-helpers.ts`):

- Requires `Content-Type: application/json`.
- Enforces a body-size cap (`Content-Length` *and* actual text length) →
  `APP_PAYLOAD_TOO_LARGE` (413). Defaults to 1 MB; `sync/start` allows 2 MB
  (metadata-only manifest), auth and upload-callback use 4 KB.
- Strict **zod** parse: unknown fields are rejected by the schemas
  (`src/lib/schemas.ts`); on failure → `APP_BAD_REQUEST` (400) with only the
  field *paths* (no values) logged.

Logout is exempt from CSRF by design (it only deletes cookies and grants no
access).

---

## 5. Workflow upload-callback binding

The browser→server upload-result callback (`src/app/api/sync/upload-callback/route.ts`)
is the most sensitive mutating hook. It layers three controls:

1. `requireAuth` + `requireCsrf` (as above).
2. **Signed callback token** bound to a single `(localRunKey, localFileKey,
   attemptId)` — `verifyCallbackToken()` in
   `src/server/workflow/callback-token.ts`. The token is an HMAC-signed claim
   set (`t:'cb'`, run/file/attempt, `exp` default 1 h) minted alongside the
   upload ticket, signed with `APP_SESSION_SECRET`. A result therefore cannot be
   forged or replayed for a *different* file/attempt, even by the authenticated
   admin.
3. The workflow engine **independently** ignores stale, duplicate, or
   unknown-file results.

The callback body carries only status metadata — never upload URLs, signed
headers, or file bytes.

---

## 6. Authorization (feature flags re-checked server-side)

Feature flags (`src/lib/feature-flags.ts`) resolve from env in
`getServerConfig()` and are exposed to the UI via the non-secret `/api/features`
payload **only to hide UI** — they are not a security control on their own.

Every optional/destructive route **re-checks the flag server-side** with
`requireFeature(key)` (`guards.ts`) → `APP_FORBIDDEN_FEATURE_DISABLED` (403):

| Capability | Flag | Default |
|---|---|---|
| Source discovery (read) | `ENABLE_SOURCE_DISCOVERY` | on |
| Source creation | `ENABLE_SOURCE_CREATION` | on |
| Source sync history (read) | `ENABLE_SOURCE_HISTORY` | on |
| Org-wide sync diagnostics | `ENABLE_ORG_SYNC_DIAGNOSTICS` | **off** |
| Full sync | `ENABLE_FULL_SYNC` | **off** |
| Proxy upload | `ENABLE_PROXY_UPLOAD` | **off** |
| Update source (PUT) | `ENABLE_SOURCE_UPDATE` | **off** |
| Delete source (DELETE) | `ENABLE_SOURCE_DELETE` | **off** |

Example (`sync/start/route.ts`): `Full` sync requires both `ENABLE_FULL_SYNC`
*and* an explicit `fullSyncConfirmed` flag, else `APP_BAD_REQUEST`.

**Least privilege** is enforced at two layers: the in-scope Genesys endpoint
allowlist (`GENESYS_ENDPOINTS` in `src/lib/constants.ts`, 11 paths only, guarded
by a CI scope test) and the OAuth client's granted Knowledge permissions.
`requireGenesys()` fails closed (`GENESYS_NOT_CONFIGURED`, 503) when credentials
are absent.

---

## 7. Security headers

Split across two places by necessity:

**Per-request CSP** — set in `src/middleware.ts` because it embeds a per-response
script **nonce** with `'strict-dynamic'`:

```text
default-src 'self';
script-src 'self' 'nonce-<random>' 'strict-dynamic';   (+ 'unsafe-eval' in dev only)
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'self' <GENESYS_UPLOAD_CONNECT_SRC https origins>;
worker-src 'self' blob:;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests   (production only)
```

- The nonce is 16 random bytes per response, forwarded to the root layout via the
  `x-nonce` request header and applied to the single inline bootstrap script.
- `connect-src` only widens to HTTPS origins from `GENESYS_UPLOAD_CONNECT_SRC`,
  filtered to `^https://` — required for **direct** browser→Genesys uploads. Empty
  ⇒ direct upload is blocked and the proxy fallback is needed.
- `style-src 'unsafe-inline'` is the one relaxation (styling only — scripts stay
  nonce-locked, so this does not enable script injection).

**Static headers** — set in `next.config.mjs` (`async headers()`), applied to
every response including static assets:

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` (clickjacking; `frame-ancestors 'none'` in CSP backs it) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | camera/mic/geolocation/usb/payment/… all `()`; `fullscreen=(self)` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |

`poweredByHeader: false` removes `X-Powered-By`. COEP is intentionally omitted so
direct cross-origin uploads to Genesys pre-signed URLs are not blocked.

---

## 8. XSS posture

- React escapes all interpolated text by default; all untrusted strings (file
  names, remote source names, metadata, redacted remote error messages) are
  rendered as text, never as markup. UI primitives in `src/components/ui.tsx`
  document this explicitly.
- `dangerouslySetInnerHTML` is **banned** with exactly one reviewed exception:
  the theme bootstrap in `src/app/layout.tsx`. That script is a static string
  literal (`THEME_BOOTSTRAP`) containing no user input, reads only the non-secret
  `gkfsm:v1:theme` key, and runs under the CSP nonce. It carries an inline
  `eslint-disable-next-line react/no-danger` with justification.
- Uploaded HTML file contents are never rendered.
- Because the CSP locks scripts to nonce + `'strict-dynamic'` (no
  `'unsafe-inline'` for scripts), an injected `<script>` tag would not execute
  even if markup escaping were somehow bypassed — CSP is the second line of
  defense for XSS.

---

## 9. Secrets handling, logging, and redaction

What is held where (PRODUCT.md §10.3/§10.4):

- **Server only, never to browser:** `GENESYS_CLIENT_SECRET`, the Genesys access
  token (in-memory cache only, refreshed before expiry — `oauth.ts`),
  `APP_SESSION_SECRET`, `ADMIN_PASSWORD`, pre-signed upload URLs, signed upload
  headers.
- **Encrypted browser vault (`localStorage`):** only non-secret metadata
  (source IDs, display names, file metadata, run summaries), AES-GCM-encrypted
  with a key derived from a user passphrase (PBKDF2-SHA-256, 300k iters) held in
  memory only. The vault is **not** a boundary against active XSS, which is why
  XSS prevention above is load-bearing.

**Redaction** (`src/server/redact.ts`) is the catch-all: every field logged by
the structured logger passes through `redact()` first (`src/server/logger.ts`),
so even a careless caller cannot leak material. It strips sensitive keys
(`authorization`, `cookie`, `*token*`, `client_secret`, `password`, `url`,
`headers`, `x-amz-*`, `signature`, …), `Bearer` tokens, token-bearing JSON
fields, and pre-signed-URL query strings. `redactUrl()` keeps origin+path and
drops the query. API error responses to the browser are restricted to a stable
code + safe message + next action (`AppError.toClientJSON()` in
`src/lib/errors.ts`); the internal `detail` is server-log-only and pre-redacted.

The same redaction governs support/diagnostics bundles, which by construction
exclude tokens, secrets, upload URLs, signed headers, file bytes, and unredacted
provider errors.

---

## 10. SSRF (proxy upload fallback)

`src/app/api/sync/proxy-upload/route.ts` is off by default
(`ENABLE_PROXY_UPLOAD`). When enabled it streams the request body straight to the
upstream upload URL without buffering or persistence, and guards SSRF by:

- requiring `https:`, and
- requiring the target host to match the operator-configured
  `GENESYS_UPLOAD_CONNECT_SRC` allowlist (exact or `*.`-suffix match), and
- enforcing `PROXY_UPLOAD_MAX_BYTES` (413 on oversize) and a 120 s abort timeout.

Signed upstream headers are passed per-request by the browser and are never
persisted or logged unredacted.

---

## 11. OWASP-ish mapping

| OWASP Top 10 (2021) | This app's controls |
|---|---|
| A01 Broken Access Control | Middleware gate on all routes + per-handler `requireAuth`; public allowlist of 4; server-side feature-flag re-checks; least-privilege endpoint allowlist |
| A02 Cryptographic Failures | HMAC-SHA-256 signed sessions; AES-GCM vault (PBKDF2 300k); HTTPS-only cookies + HSTS; token never leaves server |
| A03 Injection / XSS | React escaping; `dangerouslySetInnerHTML` banned (one reviewed static exception); nonce CSP `'strict-dynamic'`; strict zod parsing |
| A04 Insecure Design | No app database; metadata-only manifests; non-idempotent calls classified (`OutcomeClass`); `Unknown` outcomes never auto-completed/retried |
| A05 Security Misconfiguration | Full static header set; `poweredByHeader:false`; build fails on type/lint errors; fail-closed when unconfigured |
| A07 Auth Failures | Constant-time compare; generic login errors; login throttle; session expiry |
| A08 Integrity Failures | Double-submit + origin CSRF; signed `(run,file,attempt)` callback token; signed session cookie |
| A09 Logging Failures | Structured logger with mandatory redaction; stable codes; no secret leakage to logs/bundles |
| A10 SSRF | Proxy upload host allowlist + https-only + size/time caps; off by default |

---

## 12. Runtime-verified evidence

Behaviors confirmed against the implementation in this repo:

**(a) Unauthenticated access → 401 (API) / redirect (page).**
With no `gkfsm_session` cookie, `src/middleware.ts` returns, for `/api/*`:

```http
HTTP/1.1 401 Unauthorized
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; …

{"error":{"code":"APP_UNAUTHENTICATED","message":"Authentication required.","nextAction":"Sign in to continue."}}
```

and for a page route (e.g. `/sources`):

```http
HTTP/1.1 302 Found
Location: /login?next=%2Fsources
Content-Security-Policy: default-src 'self'; …
```

**(b) Missing/invalid CSRF on a mutating route → 403.**
A `POST /api/sync/start` with a valid session cookie but no matching
`x-csrf-token` / `gkfsm_csrf` pair fails `requireCsrf` (`guards.ts`):

```http
HTTP/1.1 403 Forbidden

{"error":{"code":"APP_CSRF_REJECTED","message":"The request failed a cross-site request forgery check.","nextAction":"Reload the page and try again."}}
```

The same 403 is returned on an `Origin`/`Host` mismatch.

**(c) CSP header present on every response.**
Both authenticated and rejected responses carry a `Content-Security-Policy` with
a fresh per-response `nonce-…` and `frame-ancestors 'none'`; production
additionally appends `upgrade-insecure-requests`. The static headers from
`next.config.mjs` (`Strict-Transport-Security`, `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Permissions-Policy`, COOP/CORP) accompany
them.

---

## 13. Residual risks / operator responsibilities

- **Strong `ADMIN_PASSWORD`** is the primary brute-force defense (per-instance
  throttle is only a speed bump). Generate with `openssl rand -base64 24`.
- **Rotate `APP_SESSION_SECRET`** to invalidate all outstanding sessions and
  callback tokens (there is no server-side revocation otherwise).
- **Keep destructive flags off** (`ENABLE_SOURCE_DELETE` / `ENABLE_SOURCE_UPDATE`
  / `ENABLE_FULL_SYNC`) unless explicitly required.
- **Scope the Genesys OAuth client** to only the Knowledge permissions for the
  features you enable.
- The encrypted vault is not safe against active XSS; treat XSS hardening and the
  `dangerouslySetInnerHTML` ban as load-bearing, not cosmetic.
