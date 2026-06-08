# Testing

How the Genesys Knowledge Fabric File Sync Manager is tested, what each suite
covers, and how to run it locally and in CI.

The strategy has three layers:

| Layer | Tool | Command | Needs a running app? | Needs Genesys? |
|---|---|---|---|---|
| Unit / integration | Vitest | `npm run test` | No | No (network mocked) |
| Endpoint-scope guardrail | Vitest | `npm run security:scope` | No | No |
| End-to-end (UI / nav / security) | Playwright | `npm run test:e2e` | Yes (built + started) | No |

The guiding principle is the same as the product itself: prove the **safety
invariants** (never complete a sync unless every file definitely uploaded, never
persist a secret, never blindly retry a non-idempotent call, never call an
out-of-scope endpoint) with fast, deterministic tests, and reserve the slow,
externally-dependent Genesys validation as a deployment-side/manual gate.

---

## 1. Unit and integration tests (Vitest)

```bash
npm run test            # one-shot run (vitest run)
npm run test:watch      # watch mode
npm run test:unit       # only src/ (vitest run --dir src)
npm run test:coverage   # v8 coverage report (text + html)
```

Configuration: `vitest.config.ts`. The default environment is **`node`** so the
platform Web Crypto API (`globalThis.crypto.subtle`) is fully available for vault
and hashing tests; React component tests opt into `jsdom` per file with a
`// @vitest-environment jsdom` pragma (see `src/lib/vault/__tests__/vault.test.ts`).
`vitest.setup.ts` guarantees a complete `SubtleCrypto` is reachable even under
jsdom. The `server-only` / `client-only` marker packages are stubbed to an empty
module so server modules can be imported into Node unit tests. Tests are
discovered as `src/**/*.{test,spec}.{ts,tsx}`; `e2e/` and `design-intake/` are
excluded.

### What is covered

| Area | Test file | Coverage |
|---|---|---|
| MD5 | `src/lib/__tests__/hash.test.ts` | RFC 1321 vectors via `md5Hex`; **base64** output for Genesys `contentMd5` (not hex); incremental `update()` equals one-shot across chunk boundaries; 56/64-byte padding boundary. |
| SHA-256 | `src/lib/__tests__/hash.test.ts` | FIPS 180-4 vectors; equality with the native `crypto.subtle.digest('SHA-256')` on random data; chunked-update equivalence. |
| File validation + safe rename | `src/lib/__tests__/validation.test.ts` | Extension allowlist (case-insensitive, double extensions); every Genesys filename blocking rule (`DOT`, `SLASH`, `WS`, the 14 disallowed chars `CHARS`, `SEP`, `TRAVERSAL`, `CTRL`, `DUP`); warnings (`ZERO`, `BIG`, `MIME`, `NOMIME`, `NOMOD`, homograph `SPOOF`); `sanitizeUploadName` whitespace→`_`, char stripping, separator collapse, reserved-name transform; suggestions offered only for renameable+supported files; `mimeFromExtension` fallback. |
| Vault encrypt / decrypt / tamper / migration | `src/lib/vault/__tests__/vault.test.ts` (jsdom) | Encrypted envelope is ciphertext (no plaintext keys in `localStorage`); AES-GCM round-trip through lock/unlock; wrong passphrase → `WrongPassphraseError`; tampered ciphertext fails closed; structurally corrupt envelope → `CorruptVaultError`; encrypted export/import; change-passphrase re-encrypt; unique IV per write; v1→v2 migration and refusal to downgrade an unknown future schema (`UnknownSchemaError`). |
| Genesys client + retry/idempotency | `src/server/genesys/__tests__/client.test.ts` | `fetch` fully mocked (`vi.stubGlobal`). Source list normalization; 404→`SOURCE_NOT_FOUND`, 403→`GENESYS_PERMISSION_DENIED`; create source sends `FileUpload`/`Manual` body; ambiguous create (504 **and** thrown network error) → `SOURCE_CREATE_UNKNOWN` with **exactly one** API attempt (no blind retry); start sync; upload-URL ticket; `PATCH Completed` 504 → `COMPLETION_UNKNOWN`; idempotent `GET` retries on 429 then succeeds; one-time token refresh on 401; missing region host → `GENESYS_NOT_CONFIGURED`. |
| Retry classifier | `src/server/genesys/__tests__/retry.test.ts` | `classifyResponseStatus` / `classifyThrownError` by idempotency class: 2xx success; 429 retryable for both classes; 5xx retryable for idempotent reads but `Unknown` for non-idempotent writes; 4xx (400/401/403/404/410/422) fatal and never retried; `parseRetryAfter` (seconds + date + garbage); `backoffMs` honors and caps `Retry-After`. Also asserts every `ERROR_CODES` entry has metadata (http status, message, next action). |
| Endpoint-scope guardrail | `src/server/genesys/__tests__/endpoint-scope.test.ts` | Scans every non-test `src/**/*.ts(x)` and **fails** if any references a forbidden Knowledge family (`/knowledge/knowledgebases`, `/knowledge/guest`, `/knowledge/settings`, `/knowledge/documentuploads`, `/knowledge/connections`, `/knowledge/integrations`, `/knowledge/search`, Salesforce/ServiceNow KB sources); asserts every `GENESYS_ENDPOINTS` builder targets only `/api/v2/knowledge/sources…`. |
| Auth: session / CSRF | `src/server/auth/__tests__/auth.test.ts` | Session sign/verify; rejects expired, tampered, and wrong-secret tokens; `timingSafeEqual`; `requireAuth` rejects no-session and accepts a valid session cookie; `requireCsrf` double-submit match, rejects mismatch and cross-origin mutating requests. |
| Workflow engine safety invariants | `src/workflows/__tests__/engine.test.ts` | Drives the runtime-free engine (`src/workflows/engine.ts`): completes **only** when every file uploaded; **never** completes on an unknown result (CORS) → `NeedsUserAction`; bounded retry then pause after the attempt budget; recovery when a retry succeeds; cancel always wins; concurrency window issues at most `concurrency` tickets; timeout → `needs_reselect` + pause, re-queue after reselect; ignores duplicate/stale and unknown-file callbacks. |
| Redaction | `src/server/__tests__/redact.test.ts` | Strips query strings from pre-signed URLs; masks bearer tokens and token-bearing JSON fields in free text; deep-redacts sensitive keys (`authorization`, `cookie`, `url`, `headers`, `access_token`, `password`, `callbackToken`, nested `client_secret`) while keeping safe fields; `redactErrorMessage` never throws. |

These suites are pure and deterministic — no real network, no real Genesys, no
running server — so they are the fast inner loop and the bulk of CI signal.

---

## 2. End-to-end tests (Playwright)

```bash
npm run test:e2e        # playwright test
```

Configuration: `playwright.config.ts` (`testDir: ./e2e`, Chromium project). E2E
requires a **running app**. By default Playwright builds and starts the app for
you (`npm run build && npm run start` on `http://localhost:3000`); set
`E2E_BASE_URL` to point at an already-running deployment instead (the bundled
`webServer` is then skipped). In CI: `forbidOnly`, 2 retries, single worker,
`github` reporter, trace on first retry.

The E2E suite currently covers unauthenticated route/API gating, the public
liveness probe, and security headers. Authenticated Genesys PKCE and full sync
flows require a real tenant, registered redirect URI, and deployment-specific
OAuth client; keep those as deployment validation rather than skipped local
tests.

### Live-only caveats

Some behaviour cannot be fully exercised locally because it depends on the Vercel
Workflow runtime and direct browser→Genesys upload:

- The **durable workflow** (`src/workflows/sync-workflow.ts`) — durable replay,
  `"use step"` retries, the upload-result hook, and stream messages — needs a
  Vercel/Workflow ("world") deployment to run end-to-end. Locally, the
  **engine** safety logic (`engine.ts`) is fully unit-tested in isolation
  because the workflow is pure orchestration over that runtime-free engine.
- **Direct upload** to a Genesys pre-signed URL depends on the upload host being
  allowed by CSP `connect-src` (`GENESYS_UPLOAD_CONNECT_SRC`). Validating real
  CORS/headers behaviour requires a deployment with a live sandbox ticket; when
  direct upload is blocked, the signed same-origin proxy (`PROXY_UPLOAD_MAX_BYTES`)
  is the fallback path.

---

## 3. CI gate

The local pre-merge gate aggregates formatting, lint, types, and the full unit
suite:

```bash
npm run check
```

which runs, in order (from `package.json`):

```
format:check  →  lint:strict  →  typecheck  →  test
```

i.e. `prettier --check .`, `eslint . --max-warnings=0`, `tsc --noEmit`, and
`vitest run`. Any failure fails the gate.

### Security scope check

The endpoint-scope guardrail can be run on its own as a dedicated security
check:

```bash
npm run security:scope   # vitest run src/server/genesys/__tests__/endpoint-scope.test.ts
```

It runs as part of `npm run test` too, but the standalone target exists so CI can
surface scope regressions explicitly — preventing accidental expansion into the
out-of-scope legacy Workbench / guest / settings / connector endpoint families.

A complementary dependency check is available via:

```bash
npm run security:audit   # npm audit --omit=dev --audit-level=high
```

---

## 4. Adding tests

- Unit/integration tests live next to the code under `__tests__/` and are named
  `*.test.ts` / `*.test.tsx`. Keep them deterministic: mock `fetch` (see
  `client.test.ts`), never call real Genesys.
- React component tests must declare `// @vitest-environment jsdom` at the top of
  the file.
- A new in-scope Genesys endpoint must be added to `GENESYS_ENDPOINTS` in
  `src/lib/constants.ts` (under `/api/v2/knowledge/sources…`) or the scope
  guardrail will fail; adding any out-of-scope family is intentionally blocked.
- E2E specs go under `e2e/`. Gate any spec that needs a real org behind
  `E2E_GENESYS_SANDBOX` so the default E2E run stays dependency-free.
