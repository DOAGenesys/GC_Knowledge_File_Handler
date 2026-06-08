# Architecture

System architecture of the **Genesys Knowledge Fabric File Sync Manager** — a
database-free Next.js App Router app that drives the Genesys Cloud Knowledge
Fabric File Connector flow through a durable Vercel Workflow. This document
describes the components, the metadata-only data flow, the pure-engine /
durable-workflow split, the SSE status stream + hook callback mechanism,
direct-vs-proxy upload, and how the workflow stays deterministic and
replay-safe.

See also: `PRODUCT.md` §8 (architecture), §14–§15 (workflow safety),
`TODO.md` Block 7 (workflow foundation), Block 13 (callbacks/hooks).

---

## 1. Components

| Component | Where | Responsibility |
|---|---|---|
| **Browser UI** | `src/app/(app)/**`, `src/components/**` | Vault unlock, source/file selection, validation, hashing, direct upload of file bytes, SSE consumption, resume/recovery. Holds the in-memory `File` objects; never sends bytes to the app server. |
| **Encrypted vault** | `src/lib/vault/**` (`gkfsm:v1:*` `localStorage` keys) | WebCrypto AES-GCM (PBKDF2-SHA-256, key in memory only) over **non-secret** metadata: source registry, run summaries, file manifests (no bytes), preferences. Never stores tokens, upload URLs, signed headers, or file content. |
| **Next.js route handlers** | `src/app/api/**` | Authenticated server boundary. Start/cancel workflow, stream status, receive upload-result callbacks, proxy reads to Genesys, optional upload proxy. Holds Genesys credentials server-side only. |
| **Edge middleware** | `src/middleware.ts` | Per-request nonce-based CSP + single-admin session gate on every page/route except `/login`, `/api/auth/login`, `/api/auth/logout`, `/api/health`. |
| **Vercel Workflow** | `src/workflows/**` | Durable orchestration of source resolve → sync start → per-file ticket → wait → complete/cancel. Survives restarts and replays deterministically. |
| **Pure engine** | `src/workflows/engine.ts` | Runtime-free state machine that owns the "complete only when all uploaded" invariant. Exhaustively unit-testable. |
| **Genesys Cloud** | external | Source persistence, synchronization lifecycle, pre-signed upload URL issuance, ingestion, status/history. Only the endpoints in `src/lib/constants.ts` `GENESYS_ENDPOINTS` are called. |

### In-scope Genesys endpoints

The **only** Knowledge paths the app may call (`GENESYS_ENDPOINTS`; an
endpoint-scope guardrail test enforces this allowlist):

| Method | Path | Used by |
|---|---|---|
| `GET` | `/api/v2/knowledge/sources` | discovery (`ENABLE_SOURCE_DISCOVERY`) |
| `POST` | `/api/v2/knowledge/sources` | create (`ENABLE_SOURCE_CREATION`) |
| `GET`/`PUT`/`DELETE` | `/api/v2/knowledge/sources/{sourceId}` | validate; update/delete (`ENABLE_SOURCE_UPDATE`/`ENABLE_SOURCE_DELETE`) |
| `GET` | `/api/v2/knowledge/sources/{sourceId}/synchronizations` | history (`ENABLE_SOURCE_HISTORY`) |
| `GET`/`PATCH` | `/api/v2/knowledge/sources/{sourceId}/synchronizations/{synchronizationId}` | status refresh / complete-or-cancel |
| `POST` | `.../synchronizations/{synchronizationId}/uploads` | request one pre-signed upload URL per file attempt |
| `GET` | `/api/v2/knowledge/sources/synchronizations` | org-wide diagnostics (`ENABLE_ORG_SYNC_DIAGNOSTICS`) |

---

## 2. High-level data flow

The browser sends a **metadata-only manifest** (file names, sizes, MIME types,
MD5/SHA-256 hashes — never bytes). The workflow creates/reuses the source,
starts the sync, and issues one upload ticket per file. The browser uploads the
bytes **directly** to the Genesys pre-signed URL, then reports each result back.
The workflow patches the synchronization `Completed` **only** when every file is
`Uploaded`.

```text
 ┌──────────────────────────── BROWSER (origin) ────────────────────────────┐
 │  Encrypted vault (localStorage, AES-GCM)   In-memory File objects + hashes │
 │  src/lib/vault/**                          src/components/run-controller.ts │
 └──────────┬──────────────────────────────────────────────▲────────────────┘
            │ (1) POST manifest (metadata only, no bytes)    │ (8) SSE: tickets,
            │     /api/sync/start                            │     counts, final
            ▼                                                │
 ┌────────────────────── NEXT.JS ROUTE HANDLERS (server) ───┴────────────────┐
 │  /api/sync/start  /api/sync/status (SSE)  /api/sync/upload-callback        │
 │  /api/sync/cancel  /api/sync/proxy-upload  /api/sources/**  /api/diag/**   │
 │  Auth + CSRF + feature gate. Genesys credentials live ONLY here.          │
 └──────────┬───────────────────────────────────▲───────────────────────────┘
            │ start(syncWorkflow,[input])        │ resumeHook(cancel | result)
            ▼                                    │
 ┌────────────────────── VERCEL WORKFLOW (durable) ─────────┴────────────────┐
 │  syncWorkflow ("use workflow")  ──drives──►  engine.ts (pure state machine) │
 │  steps ("use step"): resolveSource, startSync, issueTicket(+stream),       │
 │                      patch(Completed|Cancelled), refreshStatus             │
 └──────────┬───────────────────────────────────▲───────────────────────────┘
            │ (2..6) server-side OAuth + Genesys API calls (per step)         │
            ▼                                    │
 ┌────────────────────────── GENESYS CLOUD KNOWLEDGE FABRIC ─────────────────┐
 │  create/reuse source → start sync → issue pre-signed upload URL → ingest   │
 └──────────────────────────────▲────────────────────────────────────────────┘
                                │ (7) browser PUTs file bytes DIRECTLY to the
                                │     pre-signed URL (server never sees bytes)
                                └──────────── BROWSER
```

Numbered steps map to the request lifecycle in §7.

---

## 3. Pure engine vs durable workflow

The orchestration is split so the safety-critical logic has zero runtime
coupling.

- **`src/workflows/engine.ts` — pure engine.** A synchronous state machine over
  `EngineState` (per-file `FileLifecycle`, bounded concurrency window, per-file
  attempt budget). No I/O, no clock, no randomness. It centralizes the decision
  in `evaluate()`:
  - all files `uploaded`/`skipped` → `Completed`;
  - cancel signalled → `Cancelled` (always wins);
  - no progressable work left but not all uploaded → `NeedsUserAction`
    (**never** `Completed`).

  It classifies upload results in `applyUploadResult()`: `Uploaded` → done;
  `Failed` → re-queue until `maxAttempts` then `failed_recoverable`;
  `CorsUnknown` → `result_unknown` (never assumed success).

- **`src/workflows/sync-workflow.ts` — durable workflow.** The
  `"use workflow"` function `syncWorkflow` is pure orchestration: it drives the
  engine and performs no fetch, no Node APIs, no `Date.now()`, no RNG. Every
  external effect lives in a `"use step"` function (`resolveSourceStep`,
  `startSyncStep`, `issueTicketStep`, `patchStep`, `refreshStatusStep`,
  `writeStreamStep`, `validateInputStep`). Constants `CONCURRENCY = 2`,
  `MAX_ATTEMPTS = 3`.

This boundary lets the engine be exhaustively unit-tested
(`src/workflows/__tests__/engine.test.ts`) independently of the durable runtime,
and keeps the replay-determinism rules confined to a single small file.

---

## 4. SSE status stream + hook callback

Two channels connect the durable workflow to the browser; neither persists
secrets.

**Outbound — SSE status stream (workflow → browser).** Steps write
`WorkflowStreamMessage`s to the run's writable
(`getWritable()` in `writeStreamStep` / `issueTicketStep`). The browser
subscribes via `GET /api/sync/status?runId=…` (`src/app/api/sync/status/route.ts`),
which authenticates, opens `run.getReadable({ startIndex })`, and re-frames each
chunk as `text/event-stream`. Message kinds (`src/workflows/contract.ts`):
`state`, `source`, `sync`, `ticket`, `counts`, `fileState`, `final`.

The `ticket` message carries the **pre-signed URL + signed headers +
`callbackToken`**. These are secret and travel only in-memory over the
authenticated HTTPS SSE channel — they are never written to `localStorage` or
logged. The browser controller (`src/components/run-controller.ts`) keeps them in
a `useRef`.

**Inbound — hook (browser → workflow).** The workflow opens a durable hook
(`createHook({ token: syncHookToken(localRunKey) })`) and `for await`s
`WorkflowHookMessage`s. Two routes resume it:

- `POST /api/sync/upload-callback` → `{ type: 'uploadResult', localFileKey, attemptId, status }`
- `POST /api/sync/cancel` → `{ type: 'cancel' }`

both via `resumeHook(syncHookToken(localRunKey), …)`. The callback body never
contains URLs, headers, or bytes — only the result status plus a signed
`callbackToken` that binds the callback to exactly one `(run, file, attempt)`
(`src/server/workflow/callback-token.ts`). The engine independently ignores
stale/duplicate/unknown-file results (`applyUploadResult` no-ops unless the file
is currently `ticketed`, and `syncWorkflow` checks `attemptOf[key] === attemptId`).

---

## 5. Direct upload vs proxy upload

| | Direct (preferred) | Proxy fallback |
|---|---|---|
| Path | Browser `PUT`s the `File` straight to the Genesys pre-signed URL | Browser `PUT`s to `/api/sync/proxy-upload`, which streams the body upstream |
| Bytes through app server | No | Yes (streamed, never buffered to disk/storage) |
| When | Default | Only when CORS blocks the direct `PUT` |
| Gating | Pre-signed host must be in `connect-src` via `GENESYS_UPLOAD_CONNECT_SRC` (CSP, set in `src/middleware.ts`) | `ENABLE_PROXY_UPLOAD=true` **and** a non-empty `GENESYS_UPLOAD_CONNECT_SRC` allowlist |
| Limits | — | `PROXY_UPLOAD_MAX_BYTES`; HTTPS-only SSRF allowlist check; 120s upstream timeout |

Direct upload is implemented in `run-controller.ts` (`uploadViaXhr`, with upload
progress and abort). A network/CORS error resolves to `CorsUnknown` — the
controller never assumes success. The proxy route
(`src/app/api/sync/proxy-upload/route.ts`) enforces auth + CSRF + feature flag,
validates the upstream host against the allowlist (`hostAllowed`, HTTPS only),
caps the declared `content-length`, and streams `req.body` with `duplex: 'half'`.
If `GENESYS_UPLOAD_CONNECT_SRC` is empty the direct path is forced unusable and
the proxy is required.

---

## 6. Determinism and replay safety

A durable workflow may be re-executed from the start on every step boundary; its
function body must therefore be a pure function of its inputs and recorded step
results. The codebase enforces this:

1. **No clock reads or randomness in the workflow body.** `syncWorkflow`
   contains no `Date.now()` and no RNG. The only identifiers it needs —
   per-file **attempt IDs** — are generated *inside* `issueTicketStep`
   (`uuid()` from `src/lib/ids.ts`) and returned as recorded step output, so a
   replay reuses the same attempt ID rather than minting a new one. Likewise the
   `callbackToken` is signed inside the step.

2. **Non-idempotent calls are caught inside steps.** Steps that perform
   non-idempotent Genesys calls (`createSource`, `startSynchronization`,
   `requestUploadUrl`, `patchSynchronization`) **return a discriminated result**
   instead of throwing on ambiguity. The runtime's automatic step retry only
   re-runs steps that *throw*; by converting "we don't know if it happened" into
   a returned `{ ok: false, ambiguous }` / `SOURCE_CREATE_UNKNOWN` /
   `SYNC_START_UNKNOWN` / `UPLOAD_TICKET_UNKNOWN` /
   `COMPLETION_UNKNOWN` / `CANCELLATION_UNKNOWN` value, an ambiguous side effect
   can never be silently duplicated. The workflow then routes the run to
   `NeedsUserAction` and surfaces the code for manual verification rather than
   blindly retrying (error codes in `src/lib/errors.ts`).

3. **Idempotent reads can retry freely.** `refreshStatusStep` (and other `GET`s)
   are safe to auto-retry with bounded backoff; the retry classifier lives in
   `src/server/genesys/retry.ts`.

4. **Completion gate is single-sourced.** Only `engine.evaluate()` decides
   `Completed`, and only when `allSucceeded()` holds. A `CorsUnknown` result, a
   failed file, a needs-reselect file, or an upload-wait timeout
   (`WORKFLOW_UPLOAD_WAIT_SECONDS`) all force `NeedsUserAction`, never a false
   completion.

5. **Cancel is cooperative, not a kill.** `/api/sync/cancel` signals the hook;
   the workflow stops issuing tickets and itself patches the round `Cancelled`,
   leaving the Genesys synchronization in a defined state.

---

## 7. Request lifecycle (happy path)

1. **Start.** Browser computes file hashes and validation, then
   `POST /api/sync/start` with the metadata-only manifest (`StartSyncInput`). The
   route runs `requireAuth` + `requireCsrf` + `requireGenesys`, enforces feature
   gates (`ENABLE_SOURCE_CREATION` for create mode, `ENABLE_FULL_SYNC` +
   `fullSyncConfirmed` for `Full`) and `MAX_SELECTED_FILES`, calls
   `start(syncWorkflow, [input])`, and returns `202` with `{ workflowRunId, localRunKey }`.
2. **Subscribe.** Browser opens `GET /api/sync/status?runId=…` (SSE) and begins
   consuming `WorkflowStreamMessage`s.
3. **Resolve source (step).** `resolveSourceStep` creates a `FileUpload` source
   (`createSource`) or validates an existing one (`getSource`, rejecting
   non-`FileUpload` types). Emits a `source` message. Ambiguity →
   `SourceCreateUnknown` → `NeedsUserAction`.
4. **Start sync (step).** `startSyncStep` calls `startSynchronization(sourceId, syncType)`
   and emits a `sync` message with the `synchronizationId`. Ambiguity →
   `SyncStartUnknown`.
5. **Issue tickets (steps, bounded by `CONCURRENCY`).** For each file selected by
   `selectTicketsToIssue`, `issueTicketStep` calls `requestUploadUrl`, signs a
   `callbackToken`, and streams a `ticket` message (URL + headers + token,
   in-memory only). `attemptId` is generated inside the step.
6. **Direct upload (browser).** `run-controller.ts` PUTs the in-memory `File`
   straight to the pre-signed URL with progress (or via `/api/sync/proxy-upload`
   if CORS blocks it). If the browser no longer holds the `File`, it marks the
   file `NeedsReselect` and retains the ticket in memory.
7. **Result callback (browser → workflow).** Browser `POST`s the outcome to
   `/api/sync/upload-callback` with the signed `callbackToken`; the route
   verifies token + auth + CSRF and `resumeHook`s the workflow.
8. **Record + refill (workflow).** The hook loop applies the result via
   `applyEvent`, emits `fileState` + `counts`, re-evaluates, and refills the
   ticket window (`fill()`) for remaining queued files. Loop repeats from 5.
9. **Complete (step).** When `evaluate()` returns `Completed`, `patchStep`
   sends `PATCH … { status: 'Completed' }`, then `refreshStatusStep` reads the
   authoritative remote status. A completion ambiguity is reported as
   `COMPLETION_UNKNOWN` (summary outcome downgraded to `NeedsUserAction`).
10. **Finalize.** Workflow emits a `final` message and returns
    `SyncWorkflowSummary`. The browser maps the outcome to a UI status and
    persists a **redacted, byte-free** run summary into the encrypted vault.

Cancellation (`/api/sync/cancel`) or an upload-wait timeout short-circuits to
steps that patch `Cancelled` or leave the round open as `NeedsUserAction`, never
`Completed`.
