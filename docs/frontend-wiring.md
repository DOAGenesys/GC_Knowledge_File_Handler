# Frontend wiring

How each screen of the Genesys Knowledge Fabric File Sync Manager is powered: which
backend route, workflow state, and encrypted-vault state drives it.

Three data sources back the UI:

| Source | What it provides | Where it lives |
|---|---|---|
| **Encrypted vault** | Local source registry, run summaries, preferences. Decrypted in memory only. | `src/lib/vault/**`, exposed via `useApp()` in `src/components/app-context.tsx` |
| **Server routes** (`/api/**`) | Authenticated identity, non-secret feature/readiness flags, server-side Genesys proxy reads/writes, workflow start/status/cancel/callback. | `src/app/api/**` |
| **Workflow run state** | Durable orchestration; emits SSE messages (`ticket`, `sync`, `state`, `final`) consumed by the run controller. | `src/workflows/**`, `src/components/run-controller.ts` |

The vault is the source of truth for *local* data (sources, runs, prefs); Genesys is
authoritative for *remote* sync status. **No screen uses mock/seeded data** — every list
is either read from the in-memory vault snapshot or fetched live from a server route, and
empty arrays render explicit empty states rather than placeholders.

Shared client plumbing:

- `useApp()` (`src/components/app-context.tsx`) — exposes `sources`, `syncRuns`, `prefs`,
  `features`, `readiness`, `activeRun`, `vaultState`, and vault mutators (`updateVault`,
  `setPrefs`, `lockVault`, `exportVault`, `importVault`, `changePassphrase`,
  `clearLocalData`). `features`/`readiness` are hydrated once from `GET /api/features`;
  identity from `GET /api/auth/session`.
- `api` (`src/lib/api-client.ts`) — thin JSON client (`get`/`post`/`put`/`del`); throws
  `ApiError` carrying a server error `code` (e.g. `SOURCE_NOT_FOUND`,
  `SOURCE_INCOMPATIBLE_TYPE`, `SOURCE_CREATE_UNKNOWN`).
- `useRunController()` (`src/components/run-controller.ts`) — subscribes to the SSE status
  stream, performs direct browser→Genesys uploads, and posts results to the
  upload-callback route.

Server flags / `requireFeature(...)` are re-checked on every optional route, so disabling
a feature in env both hides its UI and blocks its route (the Settings toggles are
read-only mirrors — see below).

---

## Dashboard — `src/app/(app)/page.tsx`

Route group landing page (`/`). Read-only summary; no fetches of its own beyond the
bootstrap payload already in context.

| UI element | Powered by |
|---|---|
| Genesys connection tile | `readiness.genesysConfigured` / `readiness.regionHostValid` from `GET /api/features` |
| Local vault / App access / App database tiles | Static posture copy + `vaultState` (vault) |
| "Genesys is not configured" callout | `!readiness.genesysConfigured` |
| Active sync run card (`ActiveRunMini`) | `activeRun` (in-memory run state); progress = uploaded/total of `activeRun.files` |
| At-a-glance counts (Sources, Runs, Files uploaded, Need attention) | Vault: `sources` (non-archived), `syncRuns` |
| Default sync type / Upload path | Vault: `prefs.defaultSyncType`, `prefs.uploadMode` |
| Enabled features badges | `features` map + `FEATURE_META` (`src/lib/feature-flags.ts`) |
| Recent runs table (top 4) | Vault: `syncRuns` |

State handling:
- **Empty** — no `activeRun` → "No sync running" panel; empty `syncRuns` → "No runs yet" row.
- **Attention** — runs in `NeedsUserAction`/`CompletionUnknown`/`CancellationUnknown` raise a warning callout linking to History.
- **Unknown/disabled** — if `readiness` is `null` (features fetch failed), `connected` falls back to `false` and tiles show "Not configured".

---

## Sources — `src/app/(app)/sources/page.tsx`

Two tabs: **Your registry** (vault) and **Discover remote** (live). The "Discover remote"
tab only appears when `features.ENABLE_SOURCE_DISCOVERY` is true.

| Action | Route / state |
|---|---|
| Registry list | Vault `sources` (filtered by archived toggle) |
| Refresh / validate a source | `GET /api/sources/{id}` → `updateVault` writes `lastValidatedAt`, `remoteStatus`, `isCompatibleFileUploadSource`, `remoteName`, clears `localOnly` |
| Rename (local) | `updateVault` only — no remote call |
| Archive / restore (local) | `updateVault` toggles `archived` — no remote call |
| Discover remote (tab) | `GET /api/sources` (`requireFeature('ENABLE_SOURCE_DISCOVERY')`); rows carry `isCompatibleFileUploadSource` |
| Import a discovered source | builds `SourceRecord`, `updateVault` prepends to `sourceRegistry` (dedup by `sourceId`) |
| Create source | `POST /api/sources { name }` (`ENABLE_SOURCE_CREATION`) → validated record saved via `updateVault` |
| Add by ID | `GET /api/sources/{id}` to validate UUID, then `updateVault` |
| Source detail drawer → activity | `GET /api/sources/{id}/synchronizations` (`ENABLE_SOURCE_HISTORY`) |
| Activity row → specific sync | `GET /api/sources/{id}/synchronizations/{syncId}` (authoritative status) |
| Danger zone → update name | `PUT /api/sources/{id} { name }` (`ENABLE_SOURCE_UPDATE`) → `updateVault` |
| Danger zone → delete | `DELETE /api/sources/{id} { sourceId, confirmName }` (`ENABLE_SOURCE_DELETE`), typed confirmation |

Server: `GET`/`POST /api/sources` and `/api/sources/[sourceId]` proxy Genesys via
`src/server/genesys/client.ts` and annotate each source with
`isCompatibleFileUploadSource` (`type === 'FileUpload'`).

State handling:
- **Loading** — discovery shows a spinner ("Listing accessible sources…"); detail activity shows "Reading activity…".
- **Empty** — registry "No sources in your registry"; discovery "No accessible sources" (compat-filter aware); activity "No synchronizations yet".
- **Error** — discovery/activity show a `danger` callout with the `ApiError.message`; toast raised.
- **Disabled** — discovery tab hidden without `ENABLE_SOURCE_DISCOVERY`; activity replaced with an info callout pointing to `ENABLE_SOURCE_HISTORY`; danger zone hidden unless update/delete flags set.
- **Incompatible / not found** — Add-by-ID maps `SOURCE_INCOMPATIBLE_TYPE` → "Incompatible source type", `SOURCE_NOT_FOUND` → "Source not accessible"; record is **not** created.
- **Delete blocked** — delete is blocked while `activeRun` for that `sourceId` is `Running`/`Cancelling`/`NeedsUserAction`; local record removed only after the remote `DELETE` succeeds.
- **Local-only** — `localOnly` records render a warning (can't be rediscovered if vault is lost).

---

## New Sync — `src/app/(app)/new/page.tsx`

Browser-side validation + fingerprinting, then a metadata-only workflow start. **File
bytes never reach the server.**

| Step | Powered by |
|---|---|
| Source picker | Vault `sources` filtered to non-archived, `isCompatibleFileUploadSource !== false` |
| Validate destination | `GET /api/sources/{id}` → `updateVault` updates `lastValidatedAt` / compatibility |
| Sync type (Incremental / Full) | `prefs.defaultSyncType`; **Full** option only when `features.ENABLE_FULL_SYNC` |
| File extension + name validation | `validateFile` / `sanitizeUploadName` / `getExtension` / `mimeFromExtension` (`src/lib/validation.ts`); allowed extensions from `SUPPORTED_EXTENSIONS` (`src/lib/constants.ts`) |
| Fingerprinting | `hashBlob` + `mapWithConcurrency` (`src/lib/hashing.ts`) → SHA-256 (local) + MD5 base64 (`contentMd5`) |
| Preflight table | Derived `computed[]` (per-file blocking/warnings, dup detection vs siblings, rename suggestion) |
| Start sync | `POST /api/sync/start` with metadata-only `files` manifest → returns `{ workflowRunId }`; sets in-memory `activeRun`, navigates to `/run` |

Server: `POST /api/sync/start` (`src/app/api/sync/start/route.ts`) requires auth + CSRF +
`requireGenesys()`, re-enforces `ENABLE_SOURCE_CREATION` / `ENABLE_FULL_SYNC` /
`MAX_SELECTED_FILES`, and calls `start(syncWorkflow, [input])`.

State handling:
- **Empty / disabled** — no compatible sources → full-page "No compatible sources yet" callout linking to `/sources`; Full disabled → info callout citing `ENABLE_FULL_SYNC` and only the Incremental segment is offered.
- **Hashing** — per-row progress bar; the sticky start bar shows a "Fingerprinting…" indicator and **Start sync is disabled while any file is still hashing**.
- **Blocking** — `Start sync` disabled while `blockingCount > 0` or no source selected; "Fix all names" applies `v.suggestion` sanitization.
- **Full confirm** — a `Full` selection routes through a typed `ConfirmModal` before `launch()`.
- **Error** — start failure surfaces `ApiError.message` as a toast and re-enables the button.

---

## Active Run — `src/app/(app)/run/page.tsx` + `src/components/run-controller.ts`

Live view of the durable workflow. Driven by the in-memory `activeRun` plus the SSE
stream the run controller consumes.

| UI element | Powered by |
|---|---|
| Header status, source, sync/run IDs | `activeRun` fields (`status`, `sourceName`, `workflowRunId`, `synchronizationId`) |
| Workflow steps rail | `WF_STEPS` mapped through `stepState(key, run)` against `activeRun.status` / `currentStep` / `synchronizationId` |
| Per-file table + progress | `activeRun.files` (`status`, `progress`, `attempts`, `errorCode`) |
| SSE subscription | `GET /api/sync/status?runId=...` (`text/event-stream`) — frames: `ticket` (per-file upload URL+headers, in memory only), `sync` (sets `synchronizationId`), `state` (`currentStep`), `final` (`Completed`/`Cancelled`/`FailedFatal`/else `NeedsUserAction`) |
| Direct upload | controller PUTs the in-memory `File` to the pre-signed URL via XHR (progress); CORS/network error → `UploadResultUnknown` (never assumed success) |
| Upload result report | `POST /api/sync/upload-callback { localRunKey, localFileKey, attemptId, callbackToken, status }` → `resumeHook` |
| Refresh remote status | `GET /api/sources/{id}/synchronizations/{syncId}` (`ENABLE_SOURCE_HISTORY`) → updates `lastRemoteStatus` |
| Cancel | `POST /api/sync/cancel { localRunKey }` → `resumeHook(..., { type: 'cancel' })`; sets status `Cancelling` |
| Reselect file | `matchReselectedFile` (SHA-256, else name+size+lastModified) then `resumePending(key)` re-runs the retained in-memory ticket |
| Support bundle | client-side redacted JSON (honors `prefs.redactNames`); no tokens/URLs/bytes |
| Persist summary | on terminal/paused status, controller writes a redacted `SyncRunRecord` to the vault via `updateVault` (once) |

Server: status route (`src/app/api/sync/status/route.ts`) auths then streams
`getRun(runId).getReadable()`; callback route verifies a signed `callbackToken` bound to
`(run, file, attempt)`; cancel route signals the workflow (graceful — the workflow patches
`Cancelled` itself).

State handling:
- **Empty** — no `activeRun` → "No active sync run" empty state linking to `/new`.
- **NeedsUserAction** — warning callout; rows with `NeedsReselect` expose a Reselect action; uploads that lost their `File` (post-refresh) keep the ticket in memory and never fabricate success.
- **Completed / Cancelled** — accent/info callouts; per-file `Uploaded` rows show 100%.
- **Disabled** — "Refresh remote status" only rendered when `synchronizationId` exists and `ENABLE_SOURCE_HISTORY` is on.
- **Unknown** — CORS-hidden upload outcome → `UploadResultUnknown`; ambiguous `final` outcome → `NeedsUserAction`.

---

## History — `src/app/(app)/history/page.tsx`

Local vault history cross-checked against authoritative remote activity.

| Tab / element | Powered by |
|---|---|
| Local vault history table | Vault `syncRuns`, filtered All / Completed / Attention |
| Run detail drawer | Selected `SyncRunRecord` (counts, IDs, last remote status) |
| Remote activity tab | `GET /api/sources/{id}/synchronizations` iterated over compatible, non-archived, validated `sources`; rows sorted by `dateCreated` (`ENABLE_SOURCE_HISTORY`) |

State handling:
- **Empty** — local "No runs to show"; remote "No remote activity" (validate/import sources first).
- **Loading / error** — remote tab shows a spinner, then a `danger` callout + toast on `ApiError`; aborts in-flight fetches on unmount/dep change via `AbortController`.
- **Disabled** — the remote tab toggle only appears when `ENABLE_SOURCE_HISTORY` is set.
- Attention statuses (`NeedsUserAction`/`CompletionUnknown`/`CancellationUnknown`) drive the detail callout and a "Resume & reselect" action routing to `/run`.
- Privacy note: remote history is authoritative for status but **cannot** restore browser-local file bytes.

---

## Settings — `src/app/(app)/settings/page.tsx`

Preferences + vault controls + read-only endpoint/readiness mirrors.

| Section | Powered by |
|---|---|
| Local vault (lock / change passphrase / export / import / clear) | Vault actions on `useApp()`: `lockVault`, `changePassphrase`, `exportVault`, `importVault`, `clearLocalData`; gated by `vaultState` |
| Endpoint features list | `features` + `FEATURE_META` — **read-only**; toggles are inert (`onChange={() => undefined}`) and labelled "Configured by deployment env" |
| Sync defaults (default type, upload path, auto-rename, size warn) | `prefs.*` via `setPrefs` (`updateVault`) |
| Appearance & privacy (theme, private diagnostics) | `theme`/`setTheme` (also `STORAGE_KEYS.theme`) + `prefs.redactNames` |
| Environment readiness | `readiness` from `GET /api/features` — env-var presence (`readiness.missing`), `regionHostValid`, `environmentLabel`, `appVersion`; **never shows secret values** |

State handling:
- **Disabled vault actions** — lock/change/export disabled unless `vaultState === 'unlocked'`; in `ephemeral` mode a callout explains storage is unavailable. Import is allowed while locked (it replaces the vault).
- **Empty/unknown readiness** — `readiness === null` → warning callout "Environment readiness is unavailable".
- Feature toggles cannot grant access — the server re-checks each flag per request.

---

## Diagnostics — `src/app/(app)/diagnostics/page.tsx`

Combines server-side checks, browser self-checks, and the support-only org-wide view.

| Element | Powered by |
|---|---|
| Server checks (Security / Connectivity / Knowledge API) | `GET /api/diagnostics` → `{ checks, readiness }` (`src/server/diagnostics.ts`) |
| Browser checks | `runBrowserChecks()` — localStorage probe, WebCrypto `crypto.subtle`, `hashBlob` SHA-256/MD5 on a test blob (`src/lib/hashing.ts`) |
| Summary ring / counts | Aggregated over non-skipped checks |
| Direct-upload CORS review callout | `readiness.directUploadConnectSrcConfigured` (from `GENESYS_UPLOAD_CONNECT_SRC`) |
| Org-wide sync activity | `GET /api/diagnostics/org-synchronizations` (`ENABLE_ORG_SYNC_DIAGNOSTICS`) |
| Export redacted bundle | client-side JSON of `readiness` + check statuses only (no secrets) |

State handling:
- **Loading** — runs on mount; shows "Running diagnostics…" until `loaded`.
- **Error** — if `GET /api/diagnostics` fails, a synthetic `server-unreachable` Fail check is inserted and real browser results are kept; toast raised.
- **Disabled** — without `ENABLE_ORG_SYNC_DIAGNOSTICS` the org panel renders a locked info callout citing the flag; with the flag, it stays idle until "Load" is pressed.
- **Empty** — org view shows "No organization-wide synchronization activity found" on an empty result.
- **Skip** — checks reported `skip` (feature disabled) render dimmed and are excluded from the readiness percentage.

---

### Cross-cutting notes

- Every remote read/write goes through a `/api/**` route that holds the Genesys token
  server-side; the browser never sees tokens, secrets, pre-signed URLs (beyond the
  in-memory upload ticket), or signed headers.
- The only in-scope Genesys endpoints are those in `GENESYS_ENDPOINTS`
  (`src/lib/constants.ts`); the UI never targets any other Knowledge path.
- All lists derive from the live vault snapshot or a server fetch — there is **no mock
  data, fixture seeding, or hard-coded sample run anywhere in the screens**; empty data
  yields explicit empty/disabled states.
