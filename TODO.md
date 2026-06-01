# TODO.md

# Implementation checklist for Genesys Knowledge Fabric File Sync Manager

**Version:** 1.2  
**Date:** 2026-06-01  
**Tracking legend:**  
`[ ]` Not started  
`[x]` Done  
`[!]` Blocked or requires product/security decision  
`[~]` Optional or feature-flagged

This checklist is intentionally production-oriented. A release is not complete until every required item is checked or explicitly waived with a documented reason.

---

## Progress summary

| Block | Status |
|---|---:|
| Block 0 — Product decisions and constraints | 0 / 25 |
| Block 1 — Project foundation | 0 / 33 |
| Block 2 — Environment and configuration | 0 / 28 |
| Block 3 — Security baseline | 0 / 60 |
| Block 4 — Encrypted localStorage vault | 0 / 49 |
| Block 5 — Genesys API client | 0 / 102 |
| Block 6 — Endpoint scope guardrails | 0 / 12 |
| Block 7 — Vercel Workflow foundation | 0 / 78 |
| Block 8 — Source management | 0 / 57 |
| Block 9 — File intake and validation | 0 / 57 |
| Block 10 — Hashing and fingerprinting | 0 / 29 |
| Block 11 — Sync preflight UX | 0 / 24 |
| Block 12 — Upload ticket and browser upload execution | 0 / 34 |
| Block 13 — Workflow upload callback and hooks | 0 / 25 |
| Block 14 — Completion and cancellation | 0 / 23 |
| Block 15 — Resume and recovery flows | 0 / 29 |
| Block 16 — Multi-tab and concurrency handling | 0 / 12 |
| Block 17 — External frontend design intake and backend wiring | 0 / 59 |
| Block 18 — UI/UX implementation | 0 / 60 |
| Block 19 — Accessibility and usability | 0 / 21 |
| Block 20 — Error handling and support bundles | 0 / 32 |
| Block 21 — Testing | 0 / 79 |
| Block 22 — Deployment and operations | 0 / 30 |
| Block 23 — Documentation and release | 0 / 28 |
| **Total required/optional checklist items** | **0 / 986** |

---

## Block 0 — Product decisions and constraints

### Required decisions

- [ ] Confirm the app must remain database-free for production, not only MVP.
- [ ] Confirm Vercel Workflow managed state is acceptable as execution state and not considered an app database.
- [ ] Confirm file bytes must never be stored in server-side storage.
- [ ] Confirm browser `localStorage` is the only app-managed persisted app storage.
- [ ] Confirm encrypted localStorage vault passphrase UX is acceptable.
- [ ] Confirm production app access model: Vercel Deployment Protection, SSO, or app-level admin auth.
- [ ] Confirm Genesys authentication model: recommended server-side OAuth Client Credentials.
- [ ] Confirm whether source creation is allowed in production or only existing sources may be used.
- [ ] Confirm source discovery is enabled if OAuth permissions allow `GET /api/v2/knowledge/sources`.
- [ ] Confirm source status/history reads are enabled if OAuth permissions allow source synchronization lookups.
- [ ] Confirm organization-wide synchronization diagnostics are disabled by default.
- [ ] Confirm whether `Full` sync is enabled, hidden, or admin-only.
- [ ] Confirm whether `PUT /api/v2/knowledge/sources/{sourceId}` is disabled, admin-only, or unsupported.
- [ ] Confirm whether `DELETE /api/v2/knowledge/sources/{sourceId}` is disabled, admin-only, or unsupported.
- [ ] Confirm maximum file size warning threshold for the organization.
- [ ] Confirm whether proxy upload fallback is enabled or direct upload is required.
- [ ] Confirm support policy for cross-browser concurrent syncs.
- [ ] Confirm that Workbench V2 article-management endpoints remain out of scope.

### External frontend design decisions

- [ ] Confirm the external Anthropic design artifact is the authoritative visual/interaction baseline for the frontend.
- [ ] Confirm the design must be ported into Next.js/React components, not embedded as a static `index.html` or iframe.
- [ ] Confirm intentional design deviations are allowed when required by security, accessibility, backend wiring, or Knowledge Fabric scope constraints.
- [ ] Confirm whether the fetched design artifact is committed to the repository after review or fetched reproducibly during implementation.

### Acceptance criteria

- [ ] Decisions are recorded in repository documentation.
- [ ] Any decision that weakens security has explicit sign-off.
- [ ] Product UI copy reflects confirmed constraints and enabled feature flags.

---

## Block 1 — Project foundation

### Repository setup

- [ ] Create a new Next.js App Router project with TypeScript.
- [ ] Enable strict TypeScript settings.
- [ ] Use a package manager with committed lockfile.
- [ ] Add formatting configuration.
- [ ] Add linting configuration.
- [ ] Add import sorting.
- [ ] Add typecheck script.
- [ ] Add unit test script.
- [ ] Add integration test script.
- [ ] Add e2e test script.
- [ ] Add security check script.
- [ ] Add CI workflow for lint, typecheck, tests, and build.
- [ ] Add dependency review in CI.
- [ ] Add secret scanning in CI.
- [ ] Add bundle analysis script.

### App structure

- [ ] Define app route groups for dashboard, sources, sync, active run, history, settings, diagnostics.
- [ ] Define server-only module boundary for Genesys client and secrets.
- [ ] Define workflow module boundary.
- [ ] Define client-only module boundary for local vault and file handling.
- [ ] Prevent server-only modules from being imported into client bundles.
- [ ] Prevent client-only file APIs from being imported into server modules.
- [ ] Add shared schema package or folder for validated DTOs.
- [ ] Add centralized error codes.
- [ ] Add centralized user-facing copy.
- [ ] Add application version injection.
- [ ] Add environment label banner support.

### Database-free guardrails

- [ ] Add dependency guard preventing Prisma, database clients, Redis clients, Vercel KV, Vercel Blob, Firebase, Supabase, S3 SDK, and IndexedDB persistence unless explicitly waived.
- [ ] Add architecture test that searches for forbidden storage imports.
- [ ] Add CI check confirming no server-side persistence adapters are configured.
- [ ] Add documentation explaining allowed vs disallowed persistence.

### Acceptance criteria

- [ ] Fresh clone can install, lint, typecheck, test, and build.
- [ ] Client/server boundaries are enforced.
- [ ] No database or object-storage dependency exists.

---

## Block 2 — Environment and configuration

### Environment variables

- [ ] Define `GENESYS_CLIENT_ID`.
- [ ] Define `GENESYS_CLIENT_SECRET`.
- [ ] Define `GENESYS_REGION_API_HOST`.
- [ ] Define `APP_ACCESS_MODE`.
- [ ] Define app-level auth secret variables if not using Vercel Deployment Protection.
- [ ] Define `NEXT_PUBLIC_APP_VERSION` or equivalent build version.
- [ ] Define `NEXT_PUBLIC_ENVIRONMENT_LABEL` for local/preview/production display.
- [ ] Define optional `ENABLE_SOURCE_CREATION`.
- [ ] Define optional `ENABLE_SOURCE_DISCOVERY`.
- [ ] Define optional `ENABLE_SOURCE_HISTORY`.
- [ ] Define optional `ENABLE_ORG_SYNC_DIAGNOSTICS`.
- [ ] Define optional `ENABLE_SOURCE_UPDATE`.
- [ ] Define optional `ENABLE_SOURCE_DELETE`.
- [ ] Define optional `ENABLE_FULL_SYNC`.
- [ ] Define optional `ENABLE_PROXY_UPLOAD`.
- [ ] Define optional max file bytes warning threshold.
- [ ] Define optional max selected file count.
- [ ] Define optional proxy upload size cap.
- [ ] Define optional workflow timeout durations.

### Validation

- [ ] Validate environment variables at startup/build where appropriate.
- [ ] Redact environment values in diagnostics.
- [ ] Fail closed if required production secrets are missing.
- [ ] Show user-friendly diagnostics for missing Genesys configuration.
- [ ] Ensure preview and production cannot accidentally share local development secrets.
- [ ] Show enabled/disabled feature flags in Diagnostics without exposing secrets.

### Acceptance criteria

- [ ] Missing env vars disable sync actions and show actionable diagnostics.
- [ ] Disabled feature flags hide associated UI and block associated API routes.
- [ ] No secret value is printed in server logs or browser output.

---

## Block 3 — Security baseline

### Access control

- [ ] Select and implement production access model.
- [ ] Protect every mutating API route.
- [ ] Protect workflow start routes.
- [ ] Protect source list/status/history routes.
- [ ] Protect source update/delete routes if enabled.
- [ ] Protect upload callback routes.
- [ ] Protect proxy upload route if enabled.
- [ ] Add unauthenticated access tests for every protected route.
- [ ] Add session expiration behavior.
- [ ] Add logout or access-clear behavior where applicable.

### CSRF and request integrity

- [ ] Add CSRF protection for cookie-authenticated routes.
- [ ] Validate `Origin` and `Referer` for mutating browser requests where reliable.
- [ ] Require JSON content type for JSON routes.
- [ ] Reject unexpected methods.
- [ ] Reject oversized request bodies.
- [ ] Reject unknown fields unless explicitly allowed.
- [ ] Validate workflow upload callback token, run ID, file ID, and attempt ID.
- [ ] Validate feature flag server-side for every optional route.

### Security headers

- [ ] Add strict Content Security Policy.
- [ ] Add HSTS for production.
- [ ] Add `X-Content-Type-Options: nosniff`.
- [ ] Add strict `Referrer-Policy`.
- [ ] Add `Permissions-Policy` limiting unused browser APIs.
- [ ] Add clickjacking protection.
- [ ] Add cross-origin resource policies where compatible.
- [ ] Verify headers in e2e tests.

### XSS hardening

- [ ] Escape all file names in UI.
- [ ] Escape source names from local vault and remote Genesys responses.
- [ ] Escape metadata values in UI.
- [ ] Escape remote error messages before display.
- [ ] Ban `dangerouslySetInnerHTML` unless specifically reviewed.
- [ ] Add lint rule for unsafe HTML injection.
- [ ] Do not render HTML file contents directly.
- [ ] Add XSS fixture tests using malicious file names and malicious remote source names.
- [ ] Add CSP violation reporting strategy if available.

### Secrets handling

- [ ] Keep Genesys client secret server-side only.
- [ ] Do not expose access tokens to browser.
- [ ] Do not persist access tokens in localStorage.
- [ ] Do not persist upload URLs in localStorage.
- [ ] Redact tokens from logs.
- [ ] Redact upload URLs from logs.
- [ ] Redact signed headers from logs.
- [ ] Add tests that support bundles contain no secrets.

### Source mutation safety

- [ ] Disable source update/delete by default.
- [ ] Require explicit feature flags for source update/delete.
- [ ] Require typed confirmation for source delete.
- [ ] Block source delete while a source has an active or ambiguous sync.
- [ ] Do not auto-retry ambiguous source delete.
- [ ] Add tests for disabled, unauthorized, and ambiguous source mutation paths.

### External design import safety

- [ ] Treat fetched `index.html`, README, scripts, CSS, and assets as untrusted input until reviewed.
- [ ] Do not copy external prototype scripts into production without source review.
- [ ] Do not use `dangerouslySetInnerHTML` to render the fetched prototype.
- [ ] Remove any analytics, tracking, mock authentication, or outbound calls included only for the prototype.
- [ ] Verify any external fonts, icons, or image assets are licensed and allowed by CSP.
- [ ] Ensure the design import does not introduce inline scripts that weaken CSP.
- [ ] Ensure no API keys, tokens, or credentials are stored in design config files.
- [ ] Add a production build check that no unreviewed prototype-only scripts or mock-data bootstrap files are shipped.

### Acceptance criteria

- [ ] Security tests prove unauthenticated users cannot start workflows, read sources, mutate sources, or send upload callbacks.
- [ ] XSS test fixtures cannot execute script.
- [ ] No secret appears in browser bundles, logs, support bundles, or localStorage.

---

## Block 4 — Encrypted localStorage vault

### Vault creation and unlock

- [ ] Design vault envelope schema.
- [ ] Implement vault versioning.
- [ ] Generate per-vault random salt.
- [ ] Derive AES-GCM key with WebCrypto PBKDF2-SHA-256.
- [ ] Use high iteration count calibrated for acceptable UX.
- [ ] Generate unique IV for every encryption.
- [ ] Store only ciphertext and non-sensitive KDF metadata.
- [ ] Keep derived key only in memory.
- [ ] Lock vault on refresh by default.
- [ ] Add manual lock button.
- [ ] Add change passphrase flow.

### Vault data model

- [ ] Persist source registry.
- [ ] Persist source compatibility/status summary.
- [ ] Persist sync summaries.
- [ ] Persist active run pointer.
- [ ] Persist file manifests without file bytes.
- [ ] Persist remote synchronization summary metadata.
- [ ] Persist user preferences.
- [ ] Persist schema version.
- [ ] Do not persist tokens.
- [ ] Do not persist upload URLs.
- [ ] Do not persist raw file content or previews.

### Vault resilience

- [ ] Detect unavailable localStorage.
- [ ] Detect quota exceeded.
- [ ] Detect corrupt vault envelope.
- [ ] Detect wrong passphrase.
- [ ] Add encrypted export.
- [ ] Add encrypted import.
- [ ] Add clear local data flow with confirmation.
- [ ] Add migration framework.
- [ ] Backup before migration.
- [ ] Roll back failed migration.

### Vault UX

- [ ] Create vault onboarding screen.
- [ ] Create unlock screen.
- [ ] Add forgotten passphrase explanation.
- [ ] Add vault locked banner.
- [ ] Add ephemeral mode warning if storage unavailable.
- [ ] Add export reminder before destructive local actions.

### Tests

- [ ] Unit test encryption/decryption round trip.
- [ ] Unit test wrong passphrase failure.
- [ ] Unit test tampered ciphertext failure.
- [ ] Unit test migration success.
- [ ] Unit test migration rollback.
- [ ] Unit test quota exceeded handling.
- [ ] E2E test refresh locks vault.
- [ ] E2E test import/export works.

### Acceptance criteria

- [ ] All app-managed localStorage data is encrypted except explicit non-secret lock metadata.
- [ ] Vault never stores disallowed secret/material fields.
- [ ] App remains usable in ephemeral mode with clear limitations.

---

## Block 5 — Genesys API client

### Endpoint adoption list

| Method | Endpoint | Decision | Implementation note |
|---|---|---|---|
| `GET` | `/api/v2/knowledge/sources` | **Add now** | Discover/import existing Knowledge Fabric sources; reduce manual sourceId entry and help recover after local vault loss. |
| `POST` | `/api/v2/knowledge/sources` | **Keep** | Required File Connector step: create a FileUpload knowledge source. |
| `GET` | `/api/v2/knowledge/sources/synchronizations` | **Add cautiously** | Useful organization-wide activity view for troubleshooting, but hide behind diagnostics/permission checks to avoid noisy scope. |
| `DELETE` | `/api/v2/knowledge/sources/{sourceId}` | **Feature-flag** | Useful for complete source lifecycle management, but destructive and unrecoverable; default off with typed confirmation. |
| `GET` | `/api/v2/knowledge/sources/{sourceId}` | **Add now** | Validate existing source IDs, show source status/type, and detect deleted or inaccessible sources before uploading. |
| `PUT` | `/api/v2/knowledge/sources/{sourceId}` | **Feature-flag** | Potentially useful for safe source rename/settings edits, but only after response schemas and FileUpload-safe fields are validated. |
| `GET` | `/api/v2/knowledge/sources/{sourceId}/synchronizations` | **Add now** | Show source sync history and recover from ambiguous workflow outcomes. |
| `POST` | `/api/v2/knowledge/sources/{sourceId}/synchronizations` | **Keep** | Required File Connector step: start a manual synchronization round. |
| `GET` | `/api/v2/knowledge/sources/{sourceId}/synchronizations/{synchronizationId}` | **Add now** | Verify a specific sync round after refresh, timeout, completion ambiguity, or cancellation ambiguity. |
| `PATCH` | `/api/v2/knowledge/sources/{sourceId}/synchronizations/{synchronizationId}` | **Keep** | Required File Connector step: mark synchronization Completed or Cancelled. |
| `POST` | `/api/v2/knowledge/sources/{sourceId}/synchronizations/{synchronizationId}/uploads` | **Keep** | Required File Connector step: create one pre-signed upload URL per file attempt. |

### Client foundation

- [ ] Create server-only Genesys API client module.
- [ ] Validate `GENESYS_REGION_API_HOST` format.
- [ ] Implement OAuth token acquisition using server-side credentials.
- [ ] Cache token only in safe server memory when appropriate.
- [ ] Refresh token before expiry where applicable.
- [ ] Never return token to browser.
- [ ] Add request timeout support.
- [ ] Add abort support.
- [ ] Add structured redacted error type.
- [ ] Add response schema validation.
- [ ] Add pagination support for list endpoints if Genesys response is paginated.

### Read-only source discovery endpoints

- [ ] Implement `GET /api/v2/knowledge/sources`.
- [ ] Validate and normalize query parameters supported by Genesys.
- [ ] Parse source `id`, `name`, `type`, `status`, and last-sync summary when present.
- [ ] Filter or label non-FileUpload sources as unsupported for sync.
- [ ] Add duplicate detection by source name/type.
- [ ] Classify 401/403 as permission/config errors.
- [ ] Classify 429/5xx as retryable read failures.
- [ ] Add tests for success, pagination, empty result, mixed source types, 401, 403, 429, 500, timeout.

- [ ] Implement `GET /api/v2/knowledge/sources/{sourceId}`.
- [ ] Validate source ID input.
- [ ] Parse source `id`, `name`, `type`, `status`, and relevant fields.
- [ ] Detect unsupported source type.
- [ ] Detect deleted/inaccessible source.
- [ ] Add tests for success, unsupported type, 401, 403, 404, 429, 500, timeout.

### Read-only synchronization history endpoints

- [ ] Implement `GET /api/v2/knowledge/sources/{sourceId}/synchronizations`.
- [ ] Validate source ID input.
- [ ] Parse synchronization IDs, statuses, timestamps, and sync type where present.
- [ ] Support pagination if returned by Genesys.
- [ ] Redact payload before logging.
- [ ] Add tests for success, empty history, permission error, not found, rate limit, timeout.

- [ ] Implement `GET /api/v2/knowledge/sources/{sourceId}/synchronizations/{synchronizationId}`.
- [ ] Validate source ID and synchronization ID input.
- [ ] Parse specific synchronization status.
- [ ] Use endpoint for recovery after ambiguous sync start/completion/cancellation.
- [ ] Add tests for success, completed, cancelled, failed/unknown status, 401, 403, 404, 429, 500, timeout.

- [~] Implement diagnostics-only `GET /api/v2/knowledge/sources/synchronizations`.
- [~] Hide behind `ENABLE_ORG_SYNC_DIAGNOSTICS`.
- [~] Add access-control and least-privilege warning.
- [~] Add tests for disabled flag, unauthorized access, success, pagination, 429, timeout.

### Create source endpoint

- [ ] Implement request body builder for `POST /api/v2/knowledge/sources`.
- [ ] Use `type: FileUpload`.
- [ ] Use `triggerType: Manual`.
- [ ] Validate required source name.
- [ ] Validate optional fields are not sent unless needed.
- [ ] Parse returned source `id`.
- [ ] Validate new source through `GET /sources/{sourceId}` when available.
- [ ] Classify errors.
- [ ] Classify ambiguous timeout separately.
- [ ] Add tests for success, validation error, 401, 403, 429, 500, timeout.

### Start synchronization endpoint

- [ ] Implement `POST /api/v2/knowledge/sources/{sourceId}/synchronizations`.
- [ ] Validate source ID input.
- [ ] Validate sync type `Incremental` or `Full`.
- [ ] Default to `Incremental`.
- [ ] Require explicit confirmation token for `Full` when enabled.
- [ ] Parse returned synchronization `id`.
- [ ] Classify ambiguous timeout separately.
- [ ] Use specific sync lookup for recovery if ID is known.
- [ ] Add tests for success, invalid source, permission error, rate limit, timeout.

### Request upload URL endpoint

- [ ] Implement `POST /api/v2/knowledge/sources/{sourceId}/synchronizations/{synchronizationId}/uploads`.
- [ ] Send validated `fileName`.
- [ ] Send `contentMd5` when available in base64.
- [ ] Send `contentType` when available.
- [ ] Send `contentLength` when available.
- [ ] Send optional metadata only after validation.
- [ ] Send optional origin URI only after validation.
- [ ] Send optional tags only after validation.
- [ ] Parse returned `url`.
- [ ] Parse returned `headers`.
- [ ] Redact URL and headers in logs.
- [ ] Add tests for success, validation error, expired sync, rate limit, timeout.

### Patch synchronization endpoint

- [ ] Implement `PATCH /api/v2/knowledge/sources/{sourceId}/synchronizations/{synchronizationId}`.
- [ ] Allow only `Completed` or `Cancelled`.
- [ ] Require all files uploaded before `Completed` call.
- [ ] Parse returned synchronization status.
- [ ] Classify completion timeout as ambiguous.
- [ ] Refresh specific synchronization status after patch when safe.
- [ ] Add tests for success, invalid status, not found, rate limit, timeout.

### Optional source update/delete endpoints

- [~] Implement `PUT /api/v2/knowledge/sources/{sourceId}` only if `ENABLE_SOURCE_UPDATE` is enabled.
- [~] Restrict update payload to explicitly allowed FileUpload-safe fields.
- [~] Reject unknown update fields.
- [~] Validate source after update.
- [~] Add tests for disabled flag, unauthorized, unsafe field rejection, success, timeout ambiguity.

- [~] Implement `DELETE /api/v2/knowledge/sources/{sourceId}` only if `ENABLE_SOURCE_DELETE` is enabled.
- [~] Require typed confirmation.
- [~] Block delete while source has active/ambiguous sync.
- [~] Do not auto-retry ambiguous delete.
- [~] Mark local record archived only after confirmed remote delete.
- [~] Add tests for disabled flag, unauthorized, active-sync block, success, unknown outcome.

### Retry classification

- [ ] Create reusable HTTP retry classifier.
- [ ] Treat read-only `GET` calls as safely retryable with bounded backoff.
- [ ] Treat 400 as non-retryable.
- [ ] Treat 401/403 as non-retryable config/permission errors.
- [ ] Treat 404 as source/sync not found unless the caller explicitly handles validation.
- [ ] Treat 408/429/5xx as retryable only for safe operations.
- [ ] Treat non-idempotent ambiguous timeouts as `UnknownOutcome`.
- [ ] Honor `Retry-After`.

### Acceptance criteria

- [ ] All Genesys API calls are server-only.
- [ ] All responses are schema-validated.
- [ ] All logs redact secrets, tokens, upload URLs, and signed headers.
- [ ] Ambiguous external side effects are never hidden as ordinary retries.
- [ ] Source discovery and history improve recovery without expanding into Workbench management.

---

## Block 6 — Endpoint scope guardrails

### Excluded or deferred endpoint families

| Endpoint family | Decision | Guardrail |
|---|---|---|
| `/api/v2/knowledge/knowledgebases/**` | Exclude | Prevent Knowledge Workbench V2 article/category/document/label/import/export/parse/sync work from entering v1.1. |
| `/api/v2/knowledge/guest/**` | Exclude | Runtime guest sessions and feedback are not source management. |
| `/api/v2/knowledge/documentuploads` | Exclude | Legacy/import upload path, not File Connector source sync. |
| `/api/v2/knowledge/settings/**` | Exclude | Organization-level settings are unnecessary for this app. |
| `/api/v2/knowledge/search` and `/api/v2/knowledge/search/preview` | Defer | Optional future smoke test only, not core source management. |
| `/api/v2/knowledge/connections/**` | Defer | Future fabric connector work only; no FileUpload dependency. |
| `/api/v2/knowledge/integrations/{integrationId}/options` | Defer | Future provider-specific connector setup only. |


### Guardrail tasks

- [ ] Add `docs/endpoint-scope.md` containing the endpoint decision matrix.
- [ ] Add test that fails if code imports or defines clients for excluded Workbench endpoint families.
- [ ] Add lint/architecture check for `/knowledge/knowledgebases` client usage unless explicitly waived.
- [ ] Add lint/architecture check for `/knowledge/guest` client usage unless explicitly waived.
- [ ] Add lint/architecture check for `/knowledge/settings` client usage unless explicitly waived.
- [ ] Add lint/architecture check for `/knowledge/documentuploads` client usage unless explicitly waived.
- [ ] Add lint/architecture check for Salesforce/ServiceNow knowledge base source endpoints.
- [ ] Document that `/knowledge/connections` and `/knowledge/integrations/*/options` are future connector-admin scope only.
- [ ] Document that `/knowledge/search` and `/knowledge/search/preview` are future smoke-test scope only.
- [ ] Require product review before adding any endpoint not listed in the selected endpoint table.

### Acceptance criteria

- [ ] CI prevents accidental expansion into legacy Workbench endpoints.
- [ ] Endpoint scope changes require an explicit product/security decision.

---

## Block 7 — Vercel Workflow foundation

### Workflow setup

- [ ] Add Vercel Workflow SDK dependency.
- [ ] Configure Vercel Workflows for Next.js project.
- [ ] Create workflow entry module.
- [ ] Create workflow start API route.
- [ ] Create workflow status API route or streaming transport.
- [ ] Create workflow cancellation API route.
- [ ] Create workflow hook/webhook callback route for upload results.
- [ ] Add local development workflow instructions.
- [ ] Add production workflow deployment instructions.

### Atomicity rules

- [ ] Document atomic step boundaries in code comments or architecture docs.
- [ ] Ensure every external API call is isolated in its own step.
- [ ] Ensure every browser wait/hook is isolated in its own step.
- [ ] Ensure source status reads are isolated from source mutations.
- [ ] Ensure final completion patch is isolated in its own step.
- [ ] Ensure cancellation patch is isolated in its own step.
- [ ] Ensure pure validation does not perform I/O.
- [ ] Ensure steps do not access browser-only APIs.
- [ ] Ensure workflow input never contains file bytes.
- [ ] Ensure upload URLs are not persisted to localStorage.

### Workflow input validation

- [ ] Validate source mode.
- [ ] Validate source ID or create-source request.
- [ ] Validate sync type.
- [ ] Validate full-sync confirmation when applicable.
- [ ] Validate file manifest non-empty.
- [ ] Validate file count within configured limit.
- [ ] Validate every upload filename.
- [ ] Validate metadata sizes.
- [ ] Validate tags.
- [ ] Reject file-byte-like payload fields.
- [ ] Reject unexpected fields.

### Workflow state machine

- [ ] Define run states.
- [ ] Define file states.
- [ ] Define allowed transitions.
- [ ] Add `SourceValidating` state.
- [ ] Add `RemoteStatusRefreshing` state.
- [ ] Add `SourceCreateUnknown` state.
- [ ] Add `SourceDeleteUnknown` state if delete enabled.
- [ ] Implement transition guard tests.
- [ ] Implement final states.
- [ ] Implement unknown/ambiguous states.
- [ ] Implement user-action-needed states.
- [ ] Ensure UI maps every state to clear copy.

### Main sync workflow steps

- [ ] Step: validate workflow input.
- [ ] Step: acquire Genesys access token.
- [ ] Step: create or resolve source.
- [ ] Step: validate source status/type when available.
- [ ] Step: start synchronization.
- [ ] Step: create upload ticket for file.
- [ ] Step: emit upload ticket to browser.
- [ ] Step: wait for browser upload result.
- [ ] Step: record file result.
- [ ] Step: classify retry or failure.
- [ ] Step: complete synchronization.
- [ ] Step: refresh remote synchronization status when safe.
- [ ] Step: cancel synchronization.
- [ ] Step: emit final summary.

### Retry and pause behavior

- [ ] Use bounded retry attempts for safe transient errors.
- [ ] Use exponential backoff with jitter.
- [ ] Honor `Retry-After`.
- [ ] Do not auto-retry ambiguous non-idempotent effects.
- [ ] Pause for user action on missing file reselect.
- [ ] Pause for user action on ambiguous upload result.
- [ ] Timeout upload waits with `NeedsUserAction`, not completion.
- [ ] Support explicit user cancel while waiting.

### Workflow observability

- [ ] Emit redacted step names.
- [ ] Emit run ID to UI.
- [ ] Emit source ID with optional redaction.
- [ ] Emit synchronization ID with optional redaction.
- [ ] Emit file status counts.
- [ ] Emit last remote sync status summary.
- [ ] Do not emit upload URL in visible logs.
- [ ] Do not emit tokens in visible logs.
- [ ] Add workflow support bundle export data.

### Acceptance criteria

- [ ] Workflow happy path completes a sandbox sync.
- [ ] Workflow can pause waiting for browser upload and resume from callback.
- [ ] Workflow can refresh remote synchronization status.
- [ ] Workflow can be cancelled before completion.
- [ ] Workflow never completes if any file is failed, pending, or ambiguous.

---

## Block 8 — Source management

### Sources UI

- [ ] Create Sources screen.
- [ ] Build remote sources list.
- [ ] Add Refresh sources action.
- [ ] Filter or label compatible `FileUpload` sources.
- [ ] Label unsupported source types as read-only/unsupported.
- [ ] Build “Create new source” form if enabled.
- [ ] Build “Use existing source ID” form.
- [ ] Build source detail drawer.
- [ ] Show source ID with copy button.
- [ ] Show remote source status.
- [ ] Show last remote sync summary when available.
- [ ] Add local rename display name.
- [ ] Add archive local source reference.
- [ ] Add optional source update action if enabled.
- [ ] Add optional source delete danger-zone action if enabled.
- [ ] Add warning that local archive does not delete Genesys source.

### Source discovery flow

- [ ] Load remote sources through server route.
- [ ] Show loading, empty, permission error, and retry states.
- [ ] Let user import one source into local vault.
- [ ] Prevent auto-import of all remote sources.
- [ ] Store only non-secret source summary.
- [ ] Revalidate imported source before sync.

### Create source flow

- [ ] Validate source name required.
- [ ] Trim and normalize source name.
- [ ] Warn on duplicate local source display name.
- [ ] Warn on likely duplicate remote source name when discovery is enabled.
- [ ] Start workflow/step to create source.
- [ ] Display loading state.
- [ ] Store returned source ID in encrypted vault.
- [ ] Validate newly created source with `GET /sources/{sourceId}` when available.
- [ ] Handle create-source permission error.
- [ ] Handle ambiguous timeout with source discovery/manual verification copy.
- [ ] Prevent blind duplicate retries after unknown outcome.

### Existing source flow

- [ ] Validate source ID non-empty.
- [ ] Validate display name non-empty.
- [ ] Validate source remotely with `GET /sources/{sourceId}`.
- [ ] Block sync for unsupported source type.
- [ ] Store source ID encrypted locally.
- [ ] Show warning if validation is deferred because permissions are missing.

### Source activity flow

- [ ] Fetch `GET /sources/{sourceId}/synchronizations`.
- [ ] Show recent sync rounds.
- [ ] Show status, sync type, timestamps, and IDs when available.
- [ ] Allow opening a specific synchronization.
- [ ] Fetch `GET /sources/{sourceId}/synchronizations/{synchronizationId}`.
- [ ] Surface remote status in Active Run and History.
- [ ] Do not persist sensitive raw payloads.

### Optional source update/delete

- [~] Build source update form only if enabled.
- [~] Restrict editable fields to confirmed-safe FileUpload fields.
- [~] Build source delete danger-zone only if enabled.
- [~] Require typed confirmation for delete.
- [~] Block delete while sync active or ambiguous.
- [~] Mark delete unknown if response is ambiguous.

### Acceptance criteria

- [ ] User can discover, import, create, validate, and reuse a FileUpload source.
- [ ] User can recover source references after local vault loss using remote source discovery.
- [ ] User can view source synchronization history.
- [ ] Duplicate/ambiguous source creation is not hidden.
- [ ] Unsupported source types cannot be used for file sync.

---

## Block 9 — File intake and validation

### File picker and drag/drop

- [ ] Add file picker accepting supported extensions.
- [ ] Add drag-and-drop zone.
- [ ] Prevent accidental directory upload unless explicitly supported.
- [ ] If directory upload supported, recursively enumerate files safely.
- [ ] Show selected file count.
- [ ] Allow removing files before sync.
- [ ] Allow clearing selection.

### Extension validation

- [ ] Allow `.txt`.
- [ ] Allow `.md`.
- [ ] Allow `.doc`.
- [ ] Allow `.docx`.
- [ ] Allow `.csv`.
- [ ] Allow `.xls`.
- [ ] Allow `.xlsx`.
- [ ] Allow `.html`.
- [ ] Allow `.pdf`.
- [ ] Treat extensions case-insensitively.
- [ ] Block unsupported extension.
- [ ] Add tests for double extensions.

### Genesys filename validation

- [ ] Block names starting with dot.
- [ ] Block names ending with forward slash.
- [ ] Block whitespace.
- [ ] Block backslash.
- [ ] Block `{`.
- [ ] Block `^`.
- [ ] Block `}`.
- [ ] Block `%`.
- [ ] Block backtick.
- [ ] Block `]`.
- [ ] Block double quote.
- [ ] Block `>`.
- [ ] Block `[`.
- [ ] Block `~`.
- [ ] Block `<`.
- [ ] Block `#`.
- [ ] Block `|`.
- [ ] Block path separators.
- [ ] Block control characters.
- [ ] Block `..` path traversal segments.
- [ ] Normalize Unicode to NFC.

### Additional safety validation

- [ ] Detect duplicate upload names after normalization.
- [ ] Detect reserved/suspicious platform names.
- [ ] Detect zero-byte file and warn or block by policy.
- [ ] Detect very large file and warn by configured threshold.
- [ ] Detect MIME/extension mismatch and warn.
- [ ] Detect missing MIME type and continue with safe fallback.
- [ ] Detect too many selected files and enforce configured limit.

### Rename suggestions

- [ ] Replace whitespace with `_` in suggestions.
- [ ] Remove or replace forbidden characters in suggestions.
- [ ] Preserve file extension.
- [ ] Collapse repeated separators.
- [ ] Add stable suffix for duplicates.
- [ ] Show original vs upload name.
- [ ] Require user review before sync when renames are applied.

### Acceptance criteria

- [ ] Invalid files cannot start a sync.
- [ ] User gets clear repair suggestions.
- [ ] Validation covers every Genesys filename restriction.

---

## Block 10 — Hashing and fingerprinting

### Hash implementation

- [ ] Select maintained MD5 implementation for browser use.
- [ ] Confirm MD5 output is base64, not hex, for Genesys `contentMd5`.
- [ ] Use WebCrypto SHA-256 for local fingerprinting.
- [ ] Implement chunked hashing for large files.
- [ ] Use web workers for hashing where beneficial.
- [ ] Bound hashing concurrency.
- [ ] Add cancellation for hashing.
- [ ] Add progress reporting.
- [ ] Avoid loading all selected files fully into memory.

### Metadata generation

- [ ] Capture content length from `File.size`.
- [ ] Capture browser MIME type.
- [ ] Map MIME fallback by extension when browser type is empty.
- [ ] Capture lastModified.
- [ ] Capture original file name.
- [ ] Capture upload file name.
- [ ] Capture SHA-256 fingerprint.
- [ ] Capture MD5 base64 if computed.

### Reselect matching

- [ ] Match reselected file by SHA-256 when available.
- [ ] Fall back to name + size + lastModified with warning.
- [ ] Detect mismatch and block accidental wrong upload.
- [ ] Allow user to replace a pending file intentionally.

### Tests

- [ ] Test MD5 base64 against known vectors.
- [ ] Test SHA-256 against known vectors.
- [ ] Test large file chunking.
- [ ] Test cancellation.
- [ ] Test reselect exact match.
- [ ] Test reselect mismatch.

### Acceptance criteria

- [ ] Hashing is correct, cancellable, and memory-safe.
- [ ] MD5 is clearly labeled as upload integrity only, not security.

---

## Block 11 — Sync preflight UX

### Preflight summary

- [ ] Show selected source.
- [ ] Show remote source validation status.
- [ ] Show sync type.
- [ ] Show file count.
- [ ] Show total bytes.
- [ ] Show validation results.
- [ ] Show rename plan.
- [ ] Show metadata/tags summary.
- [ ] Show warnings and blockers separately.
- [ ] Disable start button for blockers.

### Full sync safety

- [ ] Hide or disable `Full` sync by default if product decision says so.
- [ ] Add explicit confirmation for `Full` sync.
- [ ] Explain that actual full-sync semantics must be verified in Genesys.
- [ ] Require typed confirmation if enabled.

### Start sync

- [ ] Ensure vault is unlocked before start.
- [ ] Ensure user is authenticated before start.
- [ ] Ensure selected source is validated or user acknowledges validation is unavailable.
- [ ] Ensure no same-browser lock conflict.
- [ ] Persist encrypted local manifest before workflow start.
- [ ] Start workflow with manifest only.
- [ ] Store workflow run ID encrypted locally.
- [ ] Navigate to Active Run screen.

### Acceptance criteria

- [ ] User cannot accidentally start unsafe or invalid sync.
- [ ] Preflight clearly explains exactly what will be uploaded.

---

## Block 12 — Upload ticket and browser upload execution

### Upload ticket handling

- [ ] Receive ticket from workflow/status stream.
- [ ] Keep upload URL only in memory.
- [ ] Keep signed headers only in memory.
- [ ] Associate ticket with one file and one attempt.
- [ ] Redact ticket in UI and logs.
- [ ] Detect expired or stale ticket.

### Direct browser upload

- [ ] Upload file to provided URL with required method and headers.
- [ ] Include required content headers exactly as instructed by Genesys upload response.
- [ ] Report upload progress.
- [ ] Support abort.
- [ ] Classify success statuses.
- [ ] Classify failure statuses.
- [ ] Handle CORS errors distinctly.
- [ ] Retry only when safe.
- [ ] Notify workflow callback on success.
- [ ] Notify workflow callback on failure when possible.

### Proxy fallback

- [ ] Decide whether proxy fallback is enabled.
- [ ] Add allowlist so proxy can only call Genesys-issued upload hosts.
- [ ] Stream file body without storing.
- [ ] Enforce max file size for proxy.
- [ ] Enforce max duration for proxy.
- [ ] Enforce auth and CSRF.
- [ ] Redact URL and headers.
- [ ] Return clear error if proxy limits are exceeded.
- [ ] Add tests proving no disk/object storage write occurs.

### Upload concurrency

- [ ] Default browser upload concurrency to 2 or safer organization value.
- [ ] Allow pause/resume queue.
- [ ] Prevent duplicate upload of same attempt.
- [ ] Prevent completion while uploads are in progress.
- [ ] Handle offline transition.
- [ ] Resume when online.

### Acceptance criteria

- [ ] Direct upload works in sandbox or proxy fallback is proven.
- [ ] Upload URLs never hit localStorage.
- [ ] Workflow receives reliable per-file result callbacks.

---

## Block 13 — Workflow upload callback and hooks

### Callback contract

- [ ] Define callback payload schema.
- [ ] Include workflow run ID.
- [ ] Include local file key.
- [ ] Include attempt ID.
- [ ] Include status.
- [ ] Include HTTP status if available.
- [ ] Include redacted error code if failure.
- [ ] Exclude upload URL.
- [ ] Exclude signed headers.
- [ ] Exclude file bytes.

### Validation

- [ ] Authenticate callback route.
- [ ] Validate CSRF/session if browser-authenticated.
- [ ] Validate hook token or workflow callback token.
- [ ] Validate attempt is expected and pending.
- [ ] Reject duplicate stale callbacks.
- [ ] Reject callbacks for wrong file/run.
- [ ] Reject impossible state transitions.

### Workflow resume

- [ ] Resume waiting workflow on success callback.
- [ ] Resume waiting workflow on failure callback.
- [ ] Leave workflow waiting if callback rejected.
- [ ] Implement timeout if callback never arrives.
- [ ] Surface timeout as `NeedsUserAction`.

### Acceptance criteria

- [ ] Tampered callback cannot mark a file uploaded.
- [ ] Duplicate callback does not corrupt workflow state.
- [ ] Missing callback does not lead to false completion.

---

## Block 14 — Completion and cancellation

### Completion

- [ ] Implement precondition: all files uploaded.
- [ ] Block completion if any file pending.
- [ ] Block completion if any file failed.
- [ ] Block completion if any file ambiguous.
- [ ] Call Genesys patch with `Completed`.
- [ ] Retry completion patch only on safe transient failures.
- [ ] Mark `CompletionUnknown` on ambiguous timeout.
- [ ] Refresh specific synchronization status when safe.
- [ ] Store completed summary in encrypted vault.
- [ ] Show completed UI.

### Cancellation

- [ ] Add cancel button in Active Run.
- [ ] Confirm cancellation.
- [ ] Abort in-flight browser uploads where possible.
- [ ] Notify workflow of cancellation.
- [ ] Stop issuing new upload tickets.
- [ ] Patch Genesys with `Cancelled` if sync ID exists and run is not completed.
- [ ] Mark `CancellationUnknown` on ambiguous timeout.
- [ ] Refresh specific synchronization status when safe.
- [ ] Store cancelled summary in encrypted vault.
- [ ] Show cancelled UI.

### Acceptance criteria

- [ ] Completion is impossible unless all file uploads succeeded.
- [ ] Cancellation path works before ticket issuance, during upload wait, and after partial uploads.
- [ ] Remote status lookup improves clarity without hiding ambiguity.

---

## Block 15 — Resume and recovery flows

### Browser refresh recovery

- [ ] Persist encrypted active run pointer.
- [ ] On app load, detect active run.
- [ ] Unlock vault before reading run details.
- [ ] Reconnect to workflow status.
- [ ] Restore file manifest.
- [ ] Refresh remote source/synchronization status when available.
- [ ] Mark files with missing browser `File` object as `NeedsReselect`.
- [ ] Prompt user to reselect pending files.
- [ ] Match reselected files by hash or metadata.

### Tab close recovery

- [ ] Workflow waits for upload result until configured timeout.
- [ ] On return, UI shows pending/needs action.
- [ ] User can reselect files.
- [ ] User can retry upload ticket if safe.
- [ ] User can cancel sync.
- [ ] User can view remote synchronization status.

### Offline recovery

- [ ] Detect offline state.
- [ ] Pause new uploads.
- [ ] Keep workflow in waiting state.
- [ ] Resume when online.
- [ ] Show clear offline banner.

### Ambiguous outcome recovery

- [ ] Display ambiguous state with explanation.
- [ ] Attempt read-only remote status lookup when safe.
- [ ] Prevent unsafe completion.
- [ ] Provide manual verification instructions.
- [ ] Allow cancellation where safe.
- [ ] Allow start-new-sync only after user acknowledges risk.

### Acceptance criteria

- [ ] Refresh during each major stage has a tested recovery path.
- [ ] User is never told a file can be resumed without reselecting when the browser lost it.
- [ ] Source/sync status endpoints are used for recovery but not as a substitute for local upload proof.

---

## Block 16 — Multi-tab and concurrency handling

### Same-browser lock

- [ ] Implement Web Locks API usage when available.
- [ ] Implement BroadcastChannel updates.
- [ ] Implement localStorage lease fallback.
- [ ] Include owner ID and expiry.
- [ ] Show active-tab warning.
- [ ] Allow stale lock takeover with confirmation.

### Cross-browser/cross-user limits

- [ ] Document that perfect cross-browser locking requires shared server-side state.
- [ ] Warn user when remote source has recent active/unknown synchronization status.
- [ ] Surface Genesys conflict errors clearly.
- [ ] Avoid source delete/update when active remote sync exists if detectable.

### Acceptance criteria

- [ ] Two same-browser tabs cannot both complete the same sync.
- [ ] Cross-browser limitations are visible and honest.

---

## Block 17 — External frontend design intake and backend wiring

### Design artifact retrieval

- [ ] Fetch the external design artifact from `https://api.anthropic.com/v1/design/h/q7IfZ83wTo-JorYIRs1BAw?open_file=index.html`.
- [ ] Save the fetched `index.html` under a reviewed design intake path such as `docs/design/external/index.html` or `design/external/index.html`.
- [ ] Fetch and read the design README referenced by the artifact or included alongside it.
- [ ] Record artifact fetch date, source URL, content hash, and any access limitations.
- [ ] Commit a reviewed local copy of the design artifact or document a reproducible fetch command.
- [ ] If the design URL requires credentials or expires, document the access process without hardcoding secrets.

### Design review and product-scope mapping

- [ ] Inventory every page, modal, drawer, component, layout region, navigation item, and interaction in `index.html`.
- [ ] Map design screens to product sections: Dashboard, Sources, New Sync, Active Run, History, Settings, and Diagnostics.
- [ ] Identify design elements that are prototype-only, marketing-only, or mock-only and should not ship.
- [ ] Identify any design element that implies legacy Knowledge Workbench scope and remove or rename it.
- [ ] Identify every design element that must be backed by real source-management, workflow, vault, or upload state.
- [ ] Identify missing required product states: locked vault, disabled feature flags, permission failures, unknown outcomes, missing file reselect, cancellation unknown, and direct-upload CORS failure.
- [ ] Create a design-to-product alignment table in repository documentation.

### Technical conversion

- [ ] Convert `index.html` into Next.js App Router React components instead of serving static HTML.
- [ ] Replace global prototype script state with typed React state, server components, client components, or hooks as appropriate.
- [ ] Replace all mock data with typed DTOs from backend routes, workflow status, or encrypted local vault state.
- [ ] Convert visual tokens into the app styling system, such as Tailwind theme tokens or shared CSS variables.
- [ ] Preserve the responsive layout and interaction intent of the external design where compatible with the product.
- [ ] Replace prototype-only animations with accessible, reduced-motion-aware animations.
- [ ] Replace placeholder navigation with actual App Router routes.
- [ ] Replace prototype forms with controlled forms and schema validation.
- [ ] Replace prototype file upload UI with real browser `File` object handling.
- [ ] Remove all unused prototype code, assets, mock stores, and fake event handlers.
- [ ] Ensure external fonts, icons, and images have approved licensing or are replaced with approved local alternatives.

### Backend wiring by screen

- [ ] Wire Dashboard Genesys connectivity card to the server-side health/check endpoint.
- [ ] Wire Dashboard vault card to encrypted local vault lock/unlock/status state.
- [ ] Wire Dashboard active run card to the workflow status endpoint.
- [ ] Wire Dashboard source discovery summary to the server route backed by `GET /api/v2/knowledge/sources` when enabled.
- [ ] Wire Sources list to source discovery with pagination, loading, empty, error, and unsupported-source states.
- [ ] Wire source detail drawer to the server route backed by `GET /api/v2/knowledge/sources/{sourceId}`.
- [ ] Wire source activity/history tab to `GET /api/v2/knowledge/sources/{sourceId}/synchronizations`.
- [ ] Wire individual synchronization detail view to `GET /api/v2/knowledge/sources/{sourceId}/synchronizations/{synchronizationId}`.
- [ ] Wire optional organization diagnostics to `GET /api/v2/knowledge/sources/synchronizations` only behind `ENABLE_ORG_SYNC_DIAGNOSTICS`.
- [ ] Wire source create form to the app route/workflow backed by `POST /api/v2/knowledge/sources`.
- [ ] Wire optional source update action to the app route backed by `PUT /api/v2/knowledge/sources/{sourceId}` only behind `ENABLE_SOURCE_UPDATE`.
- [ ] Wire optional source delete action to the app route backed by `DELETE /api/v2/knowledge/sources/{sourceId}` only behind `ENABLE_SOURCE_DELETE` and danger-zone confirmation.
- [ ] Wire New Sync source selector to the merged local vault registry and remote source discovery results.
- [ ] Wire New Sync validation table to real extension, filename, duplicate, MIME warning, and hash validation.
- [ ] Wire New Sync start action to the workflow start API with manifest metadata only and no file bytes.
- [ ] Wire Active Run timeline to the real workflow state machine.
- [ ] Wire Active Run upload ticket handling to the in-memory upload queue.
- [ ] Wire Active Run per-file progress to direct upload and proxy upload implementation.
- [ ] Wire Active Run retry, reselect, and cancel controls to real workflow endpoints.
- [ ] Wire History screen to encrypted local vault summaries and remote source history when available.
- [ ] Wire Settings screen to vault controls, feature flags, preferences, export/import, and local data clearing.
- [ ] Wire Diagnostics screen to environment, auth, Genesys permission, workflow, WebCrypto, and localStorage checks.

### State, data, and error alignment

- [ ] Define loading, empty, error, disabled, success, and unknown states for every designed screen.
- [ ] Add skeletons, spinners, and progress indicators only where real backend or browser work is pending.
- [ ] Display disabled feature flags as intentionally unavailable, not as broken actions.
- [ ] Map every backend error code to a designed user-facing message and next action.
- [ ] Show `NeedsReselect` when the browser no longer holds required file bytes.
- [ ] Show `UnknownOutcome`, `CompletionUnknown`, and `CancellationUnknown` without pretending the run succeeded.
- [ ] Ensure the UI never displays upload URLs, tokens, secrets, signed headers, or unredacted stack traces.
- [ ] Ensure no mock success state can appear without backend or browser confirmation.

### Implementation acceptance criteria

- [ ] Design implementation passes lint, typecheck, tests, and production build.
- [ ] Every visible primary action is either wired to real logic or explicitly disabled with an explanation.
- [ ] No shipped production UI uses sample/mock data for source, sync, vault, upload, or workflow flows.
- [ ] The implemented UI remains focused on Knowledge Fabric `FileUpload` sources and does not expose legacy Workbench management.
- [ ] Product owner reviews the implemented UI against the external design and approves intentional deviations.

---

## Block 18 — UI/UX implementation

### Dashboard

- [ ] Build dashboard layout.
- [ ] Add Genesys connectivity card.
- [ ] Add vault status card.
- [ ] Add feature flag card.
- [ ] Add active run card.
- [ ] Add last run summary.
- [ ] Add source discovery status.
- [ ] Add quick actions.

### Sources

- [ ] Build sources list.
- [ ] Build source refresh action.
- [ ] Build source import action.
- [ ] Build source create form.
- [ ] Build existing source form.
- [ ] Build source detail drawer.
- [ ] Build source activity tab.
- [ ] Add archive local source action.
- [ ] Add optional update source action.
- [ ] Add optional delete source action.
- [ ] Add copy source ID action.

### New Sync

- [ ] Build source selector.
- [ ] Build source validation status component.
- [ ] Build sync type selector.
- [ ] Build file dropzone.
- [ ] Build validation table.
- [ ] Build rename review UI.
- [ ] Build metadata/tags editor.
- [ ] Build preflight summary.
- [ ] Build start button with disabled reasons.

### Active Run

- [ ] Build run timeline.
- [ ] Build remote synchronization status panel.
- [ ] Build per-file status table.
- [ ] Build upload progress bars.
- [ ] Build retry controls.
- [ ] Build reselect controls.
- [ ] Build cancel control.
- [ ] Build final summary.
- [ ] Build support bundle action.

### History

- [ ] Build local run history list.
- [ ] Build remote source activity view.
- [ ] Build run detail view.
- [ ] Add filters by source/status.
- [ ] Add clear local history action.
- [ ] Explain local vs remote history.

### Settings

- [ ] Build vault settings.
- [ ] Build export/import UI.
- [ ] Build clear local data UI.
- [ ] Build validation preferences.
- [ ] Build upload preferences.
- [ ] Build feature-flag display.
- [ ] Build danger zone.

### Diagnostics

- [ ] Build environment readiness panel.
- [ ] Build Genesys connectivity test.
- [ ] Build source list/get permission test.
- [ ] Build synchronization history permission test.
- [ ] Build optional organization-wide sync diagnostics.
- [ ] Build WebCrypto/localStorage test.
- [ ] Build workflow test.
- [ ] Build redacted support bundle preview.

### Acceptance criteria

- [ ] Core flows can be completed by a non-developer admin.
- [ ] Every disabled action explains why it is disabled.

---

## Block 19 — Accessibility and usability

### Accessibility

- [ ] All controls have accessible labels.
- [ ] File dropzone has keyboard alternative.
- [ ] Progress updates use polite live regions.
- [ ] Error summaries receive focus.
- [ ] Modal dialogs trap focus correctly.
- [ ] Status is not color-only.
- [ ] Tables are navigable by screen readers.
- [ ] Form fields have helpful error text.
- [ ] Contrast meets WCAG 2.2 AA.
- [ ] Reduced motion preference respected.

### Usability

- [ ] Plain-language onboarding.
- [ ] Clear distinction between local source reference and remote Genesys source.
- [ ] Clear distinction between selected, uploaded, completed, and ingested.
- [ ] Clear distinction between local history and remote synchronization history.
- [ ] Clear messages for unsupported source types.
- [ ] Clear messages for browser limitations.
- [ ] Clear recovery actions.
- [ ] Copy buttons for IDs.
- [ ] Redacted technical details expandable.

### Acceptance criteria

- [ ] Accessibility audit passes for dashboard, source discovery, source creation, new sync, active run, history, and settings.
- [ ] Usability review confirms non-developer admin can operate the app safely.

---

## Block 20 — Error handling and support bundles

### Error system

- [ ] Define stable error codes.
- [ ] Define error severity levels.
- [ ] Define retryability flag.
- [ ] Define user action recommendation.
- [ ] Define redaction rules.
- [ ] Map Genesys errors to app errors.
- [ ] Map source discovery/status errors.
- [ ] Map synchronization history errors.
- [ ] Map browser upload errors.
- [ ] Map workflow runtime errors.
- [ ] Map vault errors.

### User-facing errors

- [ ] Add concise summary.
- [ ] Add affected file/source when relevant.
- [ ] Add next action.
- [ ] Add retry button only when safe.
- [ ] Add refresh remote status button when helpful.
- [ ] Add cancel button when applicable.
- [ ] Add technical details accordion.

### Support bundle

- [ ] Include app version.
- [ ] Include environment label.
- [ ] Include enabled feature flags.
- [ ] Include workflow run ID.
- [ ] Include source ID with optional redaction.
- [ ] Include synchronization ID with optional redaction.
- [ ] Include file metadata without file content.
- [ ] Include local run state.
- [ ] Include last remote synchronization summary.
- [ ] Include redacted error details.
- [ ] Exclude tokens, secrets, upload URLs, signed headers, and file bytes.
- [ ] Add copy/download support bundle action.

### Acceptance criteria

- [ ] Every error has a user-facing next action.
- [ ] Support bundle contains enough context for support without leaking secrets.

---

## Block 21 — Testing

### Unit tests

- [ ] File extension validation.
- [ ] Filename validation.
- [ ] Safe rename suggestions.
- [ ] Duplicate upload name detection.
- [ ] MIME fallback mapping.
- [ ] MD5 base64 vectors.
- [ ] SHA-256 vectors.
- [ ] Vault encryption/decryption.
- [ ] Vault wrong passphrase.
- [ ] Vault tamper detection.
- [ ] State machine transition guards.
- [ ] Retry classifier.
- [ ] Endpoint scope guardrails.

### Integration tests with mocked Genesys

- [ ] OAuth token success/failure.
- [ ] `GET /sources` success/pagination/mixed types.
- [ ] `GET /sources/{sourceId}` success/unsupported/not found.
- [ ] `POST /sources` success/ambiguous timeout.
- [ ] `GET /sources/{sourceId}/synchronizations` success/empty/paginated.
- [ ] `GET /sources/{sourceId}/synchronizations/{synchronizationId}` success/not found.
- [ ] `POST /sources/{sourceId}/synchronizations` success/timeout.
- [ ] `POST /uploads` success/failure.
- [ ] `PATCH Completed` success/timeout.
- [ ] `PATCH Cancelled` success/timeout.
- [ ] Optional `PUT /sources/{sourceId}` disabled/enabled paths.
- [ ] Optional `DELETE /sources/{sourceId}` disabled/enabled/unknown paths.
- [ ] 400/401/403/404/408/429/5xx mappings.

### E2E tests

- [ ] Create vault.
- [ ] Unlock vault.
- [ ] Discover remote sources.
- [ ] Import compatible source.
- [ ] Reject unsupported source.
- [ ] Create source and sync small files in sandbox.
- [ ] Reuse source for second sync.
- [ ] View source activity.
- [ ] Refresh remote synchronization status.
- [ ] Invalid files blocked before workflow start.
- [ ] Refresh during hashing.
- [ ] Refresh during waiting for upload.
- [ ] Tab close after ticket issuance, then resume and reselect file.
- [ ] User cancellation.
- [ ] Full sync confirmation if enabled.
- [ ] localStorage unavailable mode.
- [ ] Source delete danger-zone if enabled.

### Frontend design wiring tests

- [ ] Component tests render every imported design-derived component with real typed fixtures.
- [ ] Component tests cover loading, empty, error, disabled, success, and unknown states.
- [ ] Contract tests prove UI DTO assumptions match backend response schemas.
- [ ] E2E test proves every primary navigation item reaches a real route.
- [ ] E2E test proves Dashboard cards are backed by real status endpoints or local vault state.
- [ ] E2E test proves Sources screen uses real source APIs and no mock source data.
- [ ] E2E test proves New Sync uses real file validation/hashing before workflow start.
- [ ] E2E test proves Active Run uses workflow status and upload callbacks, not mock timers.
- [ ] E2E test proves Settings and Diagnostics actions are wired or explicitly disabled.
- [ ] Visual regression baseline is captured after design implementation.
- [ ] Visual regression tolerances are documented so styling changes are intentional.

### Security tests

- [ ] Unauthenticated source list rejected.
- [ ] Unauthenticated workflow start rejected.
- [ ] Unauthenticated upload callback rejected.
- [ ] CSRF attempts rejected.
- [ ] Upload callback tampering rejected.
- [ ] Source update/delete disabled by default.
- [ ] Source delete confirmation required.
- [ ] XSS file names escaped.
- [ ] XSS remote source names escaped.
- [ ] Support bundle redaction.
- [ ] Browser bundle contains no server secrets.
- [ ] CSP verified.

### Chaos/reliability tests

- [ ] Genesys 429 on source list.
- [ ] Genesys 429 on upload ticket.
- [ ] Genesys 500 on sync start.
- [ ] Network timeout after source create.
- [ ] Network timeout after sync start.
- [ ] Upload URL expiration.
- [ ] Completion patch timeout.
- [ ] Remote status lookup unavailable.
- [ ] Vercel workflow retry of each atomic step.
- [ ] Browser offline/online transitions.

### Acceptance criteria

- [ ] CI runs unit/integration/security tests.
- [ ] E2E sandbox tests run before production release.
- [ ] Every supported extension type is covered by safe fixtures.

---

## Block 22 — Deployment and operations

### Vercel deployment

- [ ] Configure Vercel project.
- [ ] Configure production environment variables.
- [ ] Configure preview environment variables.
- [ ] Enable deployment protection or app access control.
- [ ] Configure workflows.
- [ ] Configure logging redaction.
- [ ] Configure alerting for workflow failures.
- [ ] Configure CSP/HSTS headers.
- [ ] Configure region/runtime choices.

### Genesys setup

- [ ] Create OAuth client.
- [ ] Assign least-privilege permissions for enabled features.
- [ ] Verify token acquisition.
- [ ] Verify source discovery permission if enabled.
- [ ] Verify source history permission if enabled.
- [ ] Verify source creation permission if enabled.
- [ ] Verify source update/delete permissions only if enabled.
- [ ] Verify sandbox FileUpload source sync.

### Operational runbooks

- [ ] Runbook: first deployment.
- [ ] Runbook: rotating Genesys client secret.
- [ ] Runbook: failed source creation unknown.
- [ ] Runbook: sync start unknown.
- [ ] Runbook: completion unknown.
- [ ] Runbook: cancellation unknown.
- [ ] Runbook: direct upload CORS failure.
- [ ] Runbook: user lost local vault.
- [ ] Runbook: remote source deleted/inaccessible.
- [ ] Runbook: optional source delete unknown.

### Acceptance criteria

- [ ] Production deployment is access-protected.
- [ ] Least-privilege Genesys OAuth role is documented.
- [ ] Operations team can troubleshoot without secret exposure.

---

## Block 23 — Documentation and release

### Documentation

- [ ] Update README.
- [ ] Add external frontend design intake notes, including fetch URL, README summary, artifact hash, and approved deviations.
- [ ] Add design-to-product alignment table mapping prototype screens/components to real app routes and backend contracts.
- [ ] Add frontend wiring guide explaining which backend route, workflow state, or local vault state powers each screen.
- [ ] Add architecture diagram.
- [ ] Add endpoint scope decision matrix.
- [ ] Add local storage/security model.
- [ ] Add Genesys setup guide.
- [ ] Add Vercel deployment guide.
- [ ] Add feature flag guide.
- [ ] Add user guide for source discovery.
- [ ] Add user guide for file sync.
- [ ] Add recovery guide.
- [ ] Add support bundle guide.
- [ ] Add known limitations.

### Release checklist

- [ ] Product decisions signed off.
- [ ] Security review complete.
- [ ] Endpoint scope guardrails passing.
- [ ] All required tests passing.
- [ ] Sandbox sync successful.
- [ ] Direct upload or proxy fallback validated.
- [ ] Accessibility review complete.
- [ ] Documentation complete.
- [ ] Runbooks complete.
- [ ] Version tagged.

### Acceptance criteria

- [ ] A new engineer can deploy and operate the app using repository docs.
- [ ] A knowledge administrator can complete core flows using user docs.
- [ ] Release notes explain v1.2 frontend design integration, source discovery/status/history additions, and excluded Workbench scope.

---

## Appendix A — Full Knowledge endpoint decision matrix

This appendix mirrors the endpoint scope in `PRODUCT.md` and should be used as the implementation guardrail.

| Method | Endpoint | API Explorer description | Decision | Phase | Rationale |
|---|---|---|---|---|---|
| `GET` | `/api/v2/knowledge/connections` | Get connections | **Defer** | future fabric connectors | Relevant to SharePoint/fabric connector administration, but FileUpload sources do not require third-party connection/OAuth management. |
| `POST` | `/api/v2/knowledge/connections` | Create new connection | **Exclude for v1.1** | future only | Connection creation/update/delete introduces external OAuth/provider lifecycle and secret risk outside FileUpload source sync. |
| `DELETE` | `/api/v2/knowledge/connections/{connectionId}` | Delete connection | **Exclude for v1.1** | future only | Connection creation/update/delete introduces external OAuth/provider lifecycle and secret risk outside FileUpload source sync. |
| `GET` | `/api/v2/knowledge/connections/{connectionId}` | Get connection | **Defer** | future fabric connectors | Relevant to SharePoint/fabric connector administration, but FileUpload sources do not require third-party connection/OAuth management. |
| `PATCH` | `/api/v2/knowledge/connections/{connectionId}` | Update connection | **Exclude for v1.1** | future only | Connection creation/update/delete introduces external OAuth/provider lifecycle and secret risk outside FileUpload source sync. |
| `GET` | `/api/v2/knowledge/connections/{connectionId}/options` | Get connection options | **Defer** | future fabric connectors | Relevant to SharePoint/fabric connector administration, but FileUpload sources do not require third-party connection/OAuth management. |
| `POST` | `/api/v2/knowledge/documentuploads` | Creates a presigned URL for uploading a knowledge import file with a set of documents | **Exclude** | legacy/import out of scope | Knowledge import-file upload is separate from Knowledge Fabric File Connector source synchronizations. |
| `POST` | `/api/v2/knowledge/guest/sessions` | Create guest session | **Exclude** | runtime out of scope | Guest sessions and document events are runtime/customer search analytics, not Knowledge Fabric source management. |
| `GET` | `/api/v2/knowledge/guest/sessions/{sessionId}/categories` | Get categories | **Exclude** | runtime out of scope | Guest sessions and document events are runtime/customer search analytics, not Knowledge Fabric source management. |
| `GET` | `/api/v2/knowledge/guest/sessions/{sessionId}/documents` | Get documents. | **Exclude** | runtime out of scope | Guest sessions and document events are runtime/customer search analytics, not Knowledge Fabric source management. |
| `POST` | `/api/v2/knowledge/guest/sessions/{sessionId}/documents/answers` | Answer documents. | **Exclude** | runtime out of scope | Guest sessions and document events are runtime/customer search analytics, not Knowledge Fabric source management. |
| `POST` | `/api/v2/knowledge/guest/sessions/{sessionId}/documents/presentations` | Indicate that documents were presented to the user. | **Exclude** | runtime out of scope | Guest sessions and document events are runtime/customer search analytics, not Knowledge Fabric source management. |
| `POST` | `/api/v2/knowledge/guest/sessions/{sessionId}/documents/search` | Search the documents in a guest session. | **Exclude** | runtime out of scope | Guest sessions and document events are runtime/customer search analytics, not Knowledge Fabric source management. |
| `POST` | `/api/v2/knowledge/guest/sessions/{sessionId}/documents/search/suggestions` | Query the knowledge documents to provide suggestions for auto completion. | **Exclude** | runtime out of scope | Guest sessions and document events are runtime/customer search analytics, not Knowledge Fabric source management. |
| `PATCH` | `/api/v2/knowledge/guest/sessions/{sessionId}/documents/search/{searchId}` | Update search result. | **Exclude** | runtime out of scope | Guest sessions and document events are runtime/customer search analytics, not Knowledge Fabric source management. |
| `GET` | `/api/v2/knowledge/guest/sessions/{sessionId}/documents/{documentId}` | Get a knowledge document by ID. | **Exclude** | runtime out of scope | Guest sessions and document events are runtime/customer search analytics, not Knowledge Fabric source management. |
| `POST` | `/api/v2/knowledge/guest/sessions/{sessionId}/documents/{documentId}/copies` | Indicate that the document was copied by the user. | **Exclude** | runtime out of scope | Guest sessions and document events are runtime/customer search analytics, not Knowledge Fabric source management. |
| `POST` | `/api/v2/knowledge/guest/sessions/{sessionId}/documents/{documentId}/feedback` | Give feedback on a document | **Exclude** | runtime out of scope | Guest sessions and document events are runtime/customer search analytics, not Knowledge Fabric source management. |
| `POST` | `/api/v2/knowledge/guest/sessions/{sessionId}/documents/{documentId}/views` | Create view event for a document. | **Exclude** | runtime out of scope | Guest sessions and document events are runtime/customer search analytics, not Knowledge Fabric source management. |
| `GET` | `/api/v2/knowledge/integrations/{integrationId}/options` | Get sync options available for a knowledge-connect integration | **Defer** | future fabric connectors | Provider sync options are useful only if the app expands beyond FileUpload into SharePoint or other fabric connector setup. |
| `GET` | `/api/v2/knowledge/knowledgebases` | Get knowledge bases | **Exclude** | legacy Workbench shell | Knowledge base CRUD is not needed for the Fabric File Connector source manager. |
| `POST` | `/api/v2/knowledge/knowledgebases` | Create new knowledge base | **Exclude** | legacy Workbench shell | Knowledge base CRUD is not needed for the Fabric File Connector source manager. |
| `DELETE` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}` | Delete knowledge base | **Exclude** | legacy Workbench shell | Knowledge base CRUD is not needed for the Fabric File Connector source manager. |
| `GET` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}` | Get knowledge base | **Exclude** | legacy Workbench shell | Knowledge base CRUD is not needed for the Fabric File Connector source manager. |
| `PATCH` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}` | Update knowledge base | **Exclude** | legacy Workbench shell | Knowledge base CRUD is not needed for the Fabric File Connector source manager. |
| `GET` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/categories` | Get categories | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `POST` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/categories` | Create new category | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `DELETE` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/categories/{categoryId}` | Delete category | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `GET` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/categories/{categoryId}` | Get category | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `PATCH` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/categories/{categoryId}` | Update category | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `POST` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/chunks/search` | Search for chunks in a knowledge base | **Exclude** | analytics/runtime out of scope | Search/unanswered/operations views may help content authors but are not required for source upload lifecycle. |
| `PATCH` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/chunks/search/{searchId}` | Register chunk search result. | **Exclude** | analytics/runtime out of scope | Search/unanswered/operations views may help content authors but are not required for source upload lifecycle. |
| `GET` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents` | Get documents. | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `POST` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents` | Create document. | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `POST` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents/answers` | Answer documents. | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `POST` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents/bulk/remove` | Bulk remove documents. | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `POST` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents/bulk/update` | Bulk update documents. | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `GET` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents/feedback` | Get a list of feedback records given on documents in a knowledge base | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `POST` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents/presentations` | Indicate that documents were presented to the user. | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `POST` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents/query` | Query for knowledge documents. | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `POST` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents/search` | Search the documents in a knowledge base. | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `POST` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents/search/suggestions` | Query the knowledge documents to provide suggestions for auto completion. | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `PATCH` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents/search/{searchId}` | Update search result. | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `POST` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents/versions/bulk/add` | Bulk add document versions. | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `DELETE` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents/{documentId}` | Delete document. | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `GET` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents/{documentId}` | Get document. | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `PATCH` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents/{documentId}` | Update document. | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `POST` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents/{documentId}/copies` | Indicate that the document was copied by the user. | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `GET` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents/{documentId}/feedback` | Get a list of feedback records given on a document | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `POST` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents/{documentId}/feedback` | Give feedback on a document | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `GET` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents/{documentId}/feedback/{feedbackId}` | Get a single feedback record given on a document | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `PATCH` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents/{documentId}/feedback/{feedbackId}` | Update feedback on a document | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `GET` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents/{documentId}/variations` | Get variations for a document. | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `POST` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents/{documentId}/variations` | Create a variation for a document. | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `DELETE` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents/{documentId}/variations/{documentVariationId}` | Delete a variation for a document. | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `GET` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents/{documentId}/variations/{documentVariationId}` | Get a variation for a document. | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `PATCH` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents/{documentId}/variations/{documentVariationId}` | Update a variation for a document. | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `GET` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents/{documentId}/versions` | Get document versions. | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `POST` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents/{documentId}/versions` | Creates or restores a document version. | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `GET` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents/{documentId}/versions/{versionId}` | Get document version. | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `GET` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents/{documentId}/versions/{versionId}/variations` | Get variations for the given document version. | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `GET` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents/{documentId}/versions/{versionId}/variations/{variationId}` | Get variation for the given document version. | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `POST` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/documents/{documentId}/views` | Create view for a document. | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `POST` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/export/jobs` | Create export job | **Exclude** | legacy Workbench job | Import/export/parse/synchronize jobs are knowledge base content operations and would overcomplicate the FileUpload source manager. |
| `DELETE` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/export/jobs/{exportJobId}` | Delete export job | **Exclude** | legacy Workbench job | Import/export/parse/synchronize jobs are knowledge base content operations and would overcomplicate the FileUpload source manager. |
| `GET` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/export/jobs/{exportJobId}` | Get export job report | **Exclude** | legacy Workbench job | Import/export/parse/synchronize jobs are knowledge base content operations and would overcomplicate the FileUpload source manager. |
| `POST` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/import/jobs` | Create import job | **Exclude** | legacy Workbench job | Import/export/parse/synchronize jobs are knowledge base content operations and would overcomplicate the FileUpload source manager. |
| `DELETE` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/import/jobs/{importJobId}` | Delete import job | **Exclude** | legacy Workbench job | Import/export/parse/synchronize jobs are knowledge base content operations and would overcomplicate the FileUpload source manager. |
| `GET` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/import/jobs/{importJobId}` | Get import job report | **Exclude** | legacy Workbench job | Import/export/parse/synchronize jobs are knowledge base content operations and would overcomplicate the FileUpload source manager. |
| `PATCH` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/import/jobs/{importJobId}` | Start import job | **Exclude** | legacy Workbench job | Import/export/parse/synchronize jobs are knowledge base content operations and would overcomplicate the FileUpload source manager. |
| `GET` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/labels` | Get labels | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `POST` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/labels` | Create new label | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `DELETE` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/labels/{labelId}` | Delete label | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `GET` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/labels/{labelId}` | Get label | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `PATCH` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/labels/{labelId}` | Update label | **Exclude** | legacy Workbench content | Knowledge base document/category/label/variation APIs manage article-style Workbench content, not Fabric file sources. |
| `GET` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/operations` | Get operations | **Exclude** | analytics/runtime out of scope | Search/unanswered/operations views may help content authors but are not required for source upload lifecycle. |
| `GET` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/operations/users/query` | Get ids of operation creator users and oauth clients | **Exclude** | analytics/runtime out of scope | Search/unanswered/operations views may help content authors but are not required for source upload lifecycle. |
| `POST` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/parse/jobs` | Create parse job | **Exclude** | legacy Workbench job | Import/export/parse/synchronize jobs are knowledge base content operations and would overcomplicate the FileUpload source manager. |
| `GET` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/parse/jobs/{parseJobId}` | Get parse job report | **Exclude** | legacy Workbench job | Import/export/parse/synchronize jobs are knowledge base content operations and would overcomplicate the FileUpload source manager. |
| `PATCH` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/parse/jobs/{parseJobId}` | Send update to the parse operation | **Exclude** | legacy Workbench job | Import/export/parse/synchronize jobs are knowledge base content operations and would overcomplicate the FileUpload source manager. |
| `POST` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/parse/jobs/{parseJobId}/import` | Import the parsed articles | **Exclude** | legacy Workbench job | Import/export/parse/synchronize jobs are knowledge base content operations and would overcomplicate the FileUpload source manager. |
| `GET` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/sources` | Get Knowledge integration sources | **Exclude** | legacy Workbench shell | Knowledge base CRUD is not needed for the Fabric File Connector source manager. |
| `POST` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/sources/salesforce` | Create Salesforce Knowledge integration source | **Exclude** | legacy Workbench connector | Salesforce/ServiceNow knowledge base source endpoints are article-based Knowledge Workbench V2 connector flows, not FileUpload Fabric sources. |
| `DELETE` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/sources/salesforce/{sourceId}` | Delete Salesforce Knowledge integration source | **Exclude** | legacy Workbench connector | Salesforce/ServiceNow knowledge base source endpoints are article-based Knowledge Workbench V2 connector flows, not FileUpload Fabric sources. |
| `GET` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/sources/salesforce/{sourceId}` | Get Salesforce Knowledge integration source | **Exclude** | legacy Workbench connector | Salesforce/ServiceNow knowledge base source endpoints are article-based Knowledge Workbench V2 connector flows, not FileUpload Fabric sources. |
| `PUT` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/sources/salesforce/{sourceId}` | Update Salesforce Knowledge integration source | **Exclude** | legacy Workbench connector | Salesforce/ServiceNow knowledge base source endpoints are article-based Knowledge Workbench V2 connector flows, not FileUpload Fabric sources. |
| `POST` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/sources/salesforce/{sourceId}/sync` | Start sync on Salesforce Knowledge integration source | **Exclude** | legacy Workbench connector | Salesforce/ServiceNow knowledge base source endpoints are article-based Knowledge Workbench V2 connector flows, not FileUpload Fabric sources. |
| `POST` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/sources/servicenow` | Create ServiceNow Knowledge integration source | **Exclude** | legacy Workbench connector | Salesforce/ServiceNow knowledge base source endpoints are article-based Knowledge Workbench V2 connector flows, not FileUpload Fabric sources. |
| `DELETE` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/sources/servicenow/{sourceId}` | Delete ServiceNow Knowledge integration source | **Exclude** | legacy Workbench connector | Salesforce/ServiceNow knowledge base source endpoints are article-based Knowledge Workbench V2 connector flows, not FileUpload Fabric sources. |
| `GET` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/sources/servicenow/{sourceId}` | Get ServiceNow Knowledge integration source | **Exclude** | legacy Workbench connector | Salesforce/ServiceNow knowledge base source endpoints are article-based Knowledge Workbench V2 connector flows, not FileUpload Fabric sources. |
| `PUT` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/sources/servicenow/{sourceId}` | Update ServiceNow Knowledge integration source | **Exclude** | legacy Workbench connector | Salesforce/ServiceNow knowledge base source endpoints are article-based Knowledge Workbench V2 connector flows, not FileUpload Fabric sources. |
| `POST` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/sources/servicenow/{sourceId}/sync` | Start synchronization on ServiceNow Knowledge integration source | **Exclude** | legacy Workbench connector | Salesforce/ServiceNow knowledge base source endpoints are article-based Knowledge Workbench V2 connector flows, not FileUpload Fabric sources. |
| `POST` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/synchronize/jobs` | Create synchronization job | **Exclude** | legacy Workbench job | Import/export/parse/synchronize jobs are knowledge base content operations and would overcomplicate the FileUpload source manager. |
| `DELETE` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/synchronize/jobs/{syncJobId}` | Delete synchronization job | **Exclude** | legacy Workbench job | Import/export/parse/synchronize jobs are knowledge base content operations and would overcomplicate the FileUpload source manager. |
| `GET` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/synchronize/jobs/{syncJobId}` | Get synchronization job report | **Exclude** | legacy Workbench job | Import/export/parse/synchronize jobs are knowledge base content operations and would overcomplicate the FileUpload source manager. |
| `PATCH` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/synchronize/jobs/{syncJobId}` | Update synchronization job | **Exclude** | legacy Workbench job | Import/export/parse/synchronize jobs are knowledge base content operations and would overcomplicate the FileUpload source manager. |
| `GET` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/unanswered/groups` | Get knowledge base unanswered groups | **Exclude** | analytics/runtime out of scope | Search/unanswered/operations views may help content authors but are not required for source upload lifecycle. |
| `GET` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/unanswered/groups/{groupId}` | Get knowledge base unanswered group for a particular groupId | **Exclude** | analytics/runtime out of scope | Search/unanswered/operations views may help content authors but are not required for source upload lifecycle. |
| `GET` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/unanswered/groups/{groupId}/phrasegroups/{phraseGroupId}` | Get knowledge base unanswered phrase group for a particular phraseGroupId | **Exclude** | analytics/runtime out of scope | Search/unanswered/operations views may help content authors but are not required for source upload lifecycle. |
| `PATCH` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/unanswered/groups/{groupId}/phrasegroups/{phraseGroupId}` | Update a Knowledge base unanswered phrase group | **Exclude** | analytics/runtime out of scope | Search/unanswered/operations views may help content authors but are not required for source upload lifecycle. |
| `POST` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/uploads/urls/jobs` | Create content upload from URL job | **Exclude** | legacy Workbench job | Import/export/parse/synchronize jobs are knowledge base content operations and would overcomplicate the FileUpload source manager. |
| `GET` | `/api/v2/knowledge/knowledgebases/{knowledgeBaseId}/uploads/urls/jobs/{jobId}` | Get content upload from URL job status | **Exclude** | legacy Workbench job | Import/export/parse/synchronize jobs are knowledge base content operations and would overcomplicate the FileUpload source manager. |
| `POST` | `/api/v2/knowledge/search` | Get Knowledge Search | **Defer** | future verification | Could support optional post-sync search smoke tests, but it is runtime/search behavior, not source synchronization management. |
| `POST` | `/api/v2/knowledge/search/preview` | Get Knowledge Search Preview | **Defer** | future verification | Could support optional post-sync search smoke tests, but it is runtime/search behavior, not source synchronization management. |
| `GET` | `/api/v2/knowledge/settings` | Get Knowledge settings. | **Exclude for v1.1** | out of scope | Organization-level Knowledge settings are not necessary for FileUpload source lifecycle and increase permission surface. |
| `POST` | `/api/v2/knowledge/settings` | Create Knowledge setting. | **Exclude for v1.1** | out of scope | Organization-level Knowledge settings are not necessary for FileUpload source lifecycle and increase permission surface. |
| `DELETE` | `/api/v2/knowledge/settings/{knowledgeSettingId}` | Delete Knowledge setting. | **Exclude for v1.1** | out of scope | Organization-level Knowledge settings are not necessary for FileUpload source lifecycle and increase permission surface. |
| `GET` | `/api/v2/knowledge/settings/{knowledgeSettingId}` | Get Knowledge setting. | **Exclude for v1.1** | out of scope | Organization-level Knowledge settings are not necessary for FileUpload source lifecycle and increase permission surface. |
| `PATCH` | `/api/v2/knowledge/settings/{knowledgeSettingId}` | Update Knowledge setting. | **Exclude for v1.1** | out of scope | Organization-level Knowledge settings are not necessary for FileUpload source lifecycle and increase permission surface. |
| `GET` | `/api/v2/knowledge/sources` | List sources | **Add now** | v1.1 read-only | Discover/import existing Knowledge Fabric sources; reduce manual sourceId entry and help recover after local vault loss. |
| `POST` | `/api/v2/knowledge/sources` | Create a new source | **Keep** | core | Required File Connector step: create a FileUpload knowledge source. |
| `GET` | `/api/v2/knowledge/sources/synchronizations` | Get synchronizations of all sources of the organization. | **Add cautiously** | diagnostics | Useful organization-wide activity view for troubleshooting, but hide behind diagnostics/permission checks to avoid noisy scope. |
| `DELETE` | `/api/v2/knowledge/sources/{sourceId}` | Delete source | **Feature-flag** | danger zone | Useful for complete source lifecycle management, but destructive and unrecoverable; default off with typed confirmation. |
| `GET` | `/api/v2/knowledge/sources/{sourceId}` | Get source | **Add now** | v1.1 read-only | Validate existing source IDs, show source status/type, and detect deleted or inaccessible sources before uploading. |
| `PUT` | `/api/v2/knowledge/sources/{sourceId}` | Update the source | **Feature-flag** | phase 2 optional | Potentially useful for safe source rename/settings edits, but only after response schemas and FileUpload-safe fields are validated. |
| `GET` | `/api/v2/knowledge/sources/{sourceId}/synchronizations` | Get synchronizations of a source. | **Add now** | v1.1 read-only | Show source sync history and recover from ambiguous workflow outcomes. |
| `POST` | `/api/v2/knowledge/sources/{sourceId}/synchronizations` | Start a manual synchronization from a source. | **Keep** | core | Required File Connector step: start a manual synchronization round. |
| `GET` | `/api/v2/knowledge/sources/{sourceId}/synchronizations/{synchronizationId}` | Get a specific synchronization of a source. | **Add now** | v1.1 read-only | Verify a specific sync round after refresh, timeout, completion ambiguity, or cancellation ambiguity. |
| `PATCH` | `/api/v2/knowledge/sources/{sourceId}/synchronizations/{synchronizationId}` | Update synchronization. | **Keep** | core | Required File Connector step: mark synchronization Completed or Cancelled. |
| `POST` | `/api/v2/knowledge/sources/{sourceId}/synchronizations/{synchronizationId}/uploads` | Create presigned URL for uploading a file in the synchronization. | **Keep** | core | Required File Connector step: create one pre-signed upload URL per file attempt. |
