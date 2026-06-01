# PRODUCT.md

# Genesys Knowledge File Sync Manager

**Version:** 1.0  
**Date:** 2026-06-01  
**Target stack:** Vercel, Next.js App Router, React, TypeScript, Vercel Workflows, browser `localStorage` only for app-managed persisted state  
**Primary goal:** A secure, user-friendly, production-ready web app for managing file-based Genesys Cloud Knowledge source synchronizations without an app database.

---

## 1. Product summary

Genesys Knowledge File Sync Manager is a database-free web application that helps an administrator create or reuse a Genesys Cloud Knowledge `FileUpload` source, select supported knowledge files in the browser, validate and fingerprint them, start a Genesys synchronization round, request one upload URL per file, upload each file, and mark the synchronization as completed only after all files have uploaded successfully.

The app is intentionally designed around the limitations and security realities of a browser-only persistence model:

- Browser-persisted app state lives only in `localStorage`.
- File bytes are never stored in `localStorage`.
- Genesys client secrets, access tokens, refresh tokens, and pre-signed upload URLs are never stored in `localStorage`.
- Long-running orchestration is handled by Vercel Workflows, while file bytes remain browser-held until uploaded.
- Vercel workflow state is used only for durable execution and resumability, not as an app-owned product database.
- The browser assists the workflow with actual file-byte uploads because a server workflow cannot retrieve browser-local files after the tab closes unless those files have been uploaded to some server-side storage, which is explicitly out of scope.

The product must be safe by default, explicit about destructive or ambiguous actions, recoverable from common failures, and honest about edge cases that cannot be solved without introducing persistent server-side storage.

---

## 2. Official platform facts this product relies on

### 2.1 Genesys Cloud File Connector flow

Genesys Cloud documents a four-phase File Connector synchronization process for Knowledge sources:

1. Create a knowledge source once.
2. Start a sync round once per synchronization.
3. Request an upload URL once per file.
4. Mark the synchronization as completed only after all uploads are done.

Supported File Connector file types are:

- `.txt`
- `.md`
- `.doc`
- `.docx`
- `.csv`
- `.xls`
- `.xlsx`
- `.html`
- `.pdf`

The app must implement this exact ordering and must not call completion before every required file upload has succeeded.

### 2.2 Genesys Cloud endpoints in scope

#### Create knowledge source

`POST /api/v2/knowledge/sources`

Used once per source, then the returned source `id` is reused for future sync rounds.

Expected source input fields include:

- `name` — required string.
- `type` — `FileUpload` for this product.
- `connectionId` — not used for `FileUpload` unless future Genesys behavior requires it.
- `triggerType` — defaults to `Manual`; this product uses `Manual`.
- `scheduleSettings` — out of scope for manual file upload sources.
- `filters` — out of scope for manual file upload sources unless Genesys later requires it.

#### Start synchronization round

`POST /api/v2/knowledge/sources/{sourceId}/synchronizations`

Used once at the start of each sync round.

Input:

- `type`: `Incremental` or `Full`.

Product default:

- `Incremental`, because Genesys indicates `FileUpload` supports both `Full` and `Incremental`, with `Incremental` as default.

Safety rule:

- `Full` sync requires an explicit confirmation explaining that full-replacement or deletion semantics must be verified in the customer’s Genesys environment before relying on it. The app must not make undocumented promises about how missing files are treated.

#### Request upload URL

`POST /api/v2/knowledge/sources/{sourceId}/synchronizations/{synchronizationId}/uploads`

Used once per upload attempt per file.

Input fields include:

- `fileName` — required.
- `contentMd5` — optional but recommended for integrity when available, base64 encoded, not hexadecimal.
- `contentType` — recommended.
- `contentLength` — recommended.
- `metadata` — optional.
- `originUri` — optional if Genesys accepts it for traceability.
- `tags` — optional list of tag objects.

File name constraints from Genesys that must be enforced before requesting upload URLs:

- Must not start with a dot.
- Must not end with a forward slash.
- Must not contain whitespace.
- Must not contain any of these disallowed characters: `\ { ^ } % \` ] " > [ ~ < # |`

The product should also add stricter defensive validation:

- No path traversal segments such as `..`.
- No path separators, even if browser file names normally exclude full paths.
- Unicode normalization to NFC.
- Length limits with clear validation messages.
- Duplicate-name detection within a sync plan.
- Reserved platform names and suspicious control characters rejected or transformed before upload.

#### Mark synchronization completed or cancelled

`PATCH /api/v2/knowledge/sources/{sourceId}/synchronizations/{synchronizationId}`

Input:

- `status`: `Completed` or `Cancelled`.

Product rule:

- Send `Completed` only if every selected file is definitely uploaded successfully.
- Send `Cancelled` when the sync cannot safely complete, the user cancels before completion, or the workflow reaches a fatal or ambiguous state that cannot be resolved safely.

---

## 3. Product principles

### 3.1 Safety over false automation

The app must not claim it can recover files that exist only in a closed browser tab. If a file upload has not completed and the browser loses access to the selected `File` object, the user must reselect the file.

### 3.2 No app database

The app must not add PostgreSQL, Redis, Vercel KV, Vercel Blob, S3, IndexedDB, Prisma, Supabase, Firebase, or any other persistent app-owned storage layer. The only app-managed persistence is encrypted `localStorage` in the browser.

Allowed persistence:

- Browser `localStorage`, through the encrypted local vault described below.
- Vercel Workflow managed event/run state necessary for durable execution.
- Genesys Cloud state created through official APIs.

Disallowed persistence:

- Any server-side database.
- Any object/blob storage for files.
- Any plaintext secrets in browser storage.
- Any file content stored in browser `localStorage`.

### 3.3 Secure local persistence means “minimize and encrypt,” not “store secrets”

`localStorage` is not a secure secret store. It is accessible to JavaScript running in the origin, so a successful XSS attack can read it. Therefore:

- Never persist Genesys client secrets.
- Never persist Genesys access tokens or refresh tokens.
- Never persist pre-signed upload URLs.
- Never persist file bytes.
- Encrypt all non-secret local app metadata with WebCrypto AES-GCM.
- Keep the vault decryption key only in memory.
- Require re-unlock after refresh unless the user explicitly enables a lower-security convenience mode.
- Treat encryption as defense-in-depth, not as permission to store secrets.

### 3.4 User-friendly recovery

Every error state must give the user a clear next action:

- Retry now.
- Reselect file.
- Cancel this sync round.
- Start a new sync round.
- Copy technical details for support.
- Export encrypted local state before clearing browser data.

### 3.5 Atomic workflow steps

Every Vercel workflow step must represent one durable, restartable, auditable unit of work. Steps must avoid mixing unrelated effects. For non-idempotent external calls, retries must be carefully classified to avoid duplicate sources, duplicate sync rounds, or completion of an unsafe partial sync.

---

## 4. Target users and personas

### 4.1 Knowledge administrator

The primary user manages Genesys Knowledge content and needs a safe way to upload supported files into a Genesys Knowledge source.

Needs:

- Simple setup.
- Clear validation before upload.
- Reliable sync progress.
- Error messages that explain Genesys API failures.
- Ability to reuse a source across future syncs.
- Ability to recover from refreshes, network interruptions, and browser crashes.

### 4.2 Platform engineer

The platform engineer deploys the app on Vercel and configures environment variables, access protection, security headers, and Genesys OAuth credentials.

Needs:

- No database to provision.
- Secure deployment defaults.
- Minimal secret surface area.
- Observability of workflow runs.
- Clear operational runbooks.

### 4.3 Auditor or security reviewer

The reviewer validates that the application does not leak data, does not persist secrets, and has a controlled sync lifecycle.

Needs:

- Documented data flows.
- Explicit storage inventory.
- Clear threat model.
- Redacted logs.
- Security acceptance criteria.

---

## 5. Primary user journeys

### 5.1 First-time setup with a new knowledge source

1. User opens the app behind deployment protection or app-level access control.
2. User unlocks or creates the local encrypted vault.
3. App confirms Genesys connection health without exposing secrets.
4. User enters a source name.
5. App validates the source name.
6. User creates a `FileUpload` knowledge source.
7. Vercel workflow calls `POST /api/v2/knowledge/sources`.
8. The returned `sourceId` is stored in encrypted localStorage metadata.
9. UI displays the new source as ready for sync.

Failure handling:

- If the create-source request fails before Genesys receives it, the user can retry.
- If the create-source request times out after Genesys may have created the source, the app marks the outcome as `Unknown` and must not blindly retry without warning. Because only create/list details were provided for this product, the safe recovery is manual verification in Genesys or entering an existing source ID.

### 5.2 Setup with an existing knowledge source

1. User chooses “Use existing source.”
2. User pastes a known `sourceId` and a friendly display name.
3. App validates local shape of the ID and stores it in the encrypted local vault.
4. App performs a lightweight server-side validation if a safe Genesys API is available. If no validation endpoint is implemented, the first sync start will validate it.

Failure handling:

- Invalid or inaccessible `sourceId` appears before any files are uploaded.
- The user can edit, remove, or archive the local source reference.

### 5.3 Incremental file sync

1. User selects a source.
2. User selects one or more files.
3. Browser validates supported extensions and Genesys filename constraints.
4. Browser computes content length, content type, MD5 base64 for Genesys, and SHA-256 for local fingerprinting.
5. UI shows a preflight table with warnings, duplicate names, unsupported files, and sanitized upload names.
6. User fixes or accepts safe rename suggestions.
7. User starts sync.
8. Vercel workflow starts a Genesys synchronization round.
9. For each valid file, workflow requests an upload URL.
10. Browser uploads file bytes directly to the returned upload URL with required headers, or uses a streaming proxy fallback if direct browser upload is blocked by CORS.
11. Browser notifies the workflow of each file result through a workflow hook/webhook callback.
12. Workflow waits for all files to report success.
13. Workflow sends `PATCH ... { status: "Completed" }`.
14. UI shows completed summary and stores the non-secret run summary in the encrypted vault.

### 5.4 Resume after tab close or refresh

1. User returns to the app.
2. User unlocks the local vault.
3. App loads saved sync manifest and workflow `runId`.
4. App reconnects to workflow status and displays current state.
5. For pending files whose bytes were not uploaded, the app asks the user to reselect the original files.
6. App matches reselected files by fingerprint where possible, or by name/size/lastModified as a weaker fallback.
7. Pending upload tickets are refreshed if expired or invalid.
8. Sync continues or the user cancels the sync round.

Hard limit:

- Without server-side file storage, the app cannot resume a pending file upload unless the user reselects the file or the browser still holds a usable `File` object.

### 5.5 Cancel sync

1. User clicks cancel while a sync is not completed.
2. App confirms that cancellation may leave already-uploaded files in an incomplete Genesys sync round.
3. Workflow stops issuing new upload URLs.
4. In-flight browser uploads are aborted when possible.
5. Workflow sends `PATCH ... { status: "Cancelled" }` if a synchronization round exists and has not already completed.
6. UI marks run as cancelled and shows which files, if any, were uploaded before cancellation.

### 5.6 Recover from partial failure

1. A file upload fails, a URL expires, or Genesys returns a recoverable error.
2. App classifies the failure.
3. For safe transient failures, it retries using bounded exponential backoff.
4. For upload URL expiration or ambiguous upload success, it asks for user action or safely creates a new upload attempt inside the same sync only if the previous attempt is known not to have completed.
5. If safe continuation is impossible, workflow cancels the sync rather than marking it completed.

---

## 6. System architecture

### 6.1 Components

#### Browser UI

Responsibilities:

- Source selection and local source registry.
- File picker and drag-and-drop.
- File validation.
- Hashing/fingerprinting.
- Encrypted local vault.
- Uploading file bytes to Genesys-provided upload URLs.
- Reconnect/resume flows.
- User-facing progress and errors.

#### Next.js server API routes

Responsibilities:

- Start workflows.
- Expose workflow status streams or polling endpoints.
- Receive upload-result callbacks from the browser and resume workflow hooks.
- Optionally provide a streaming upload proxy fallback when direct upload to the Genesys-provided URL is blocked.
- Keep all Genesys credentials server-side.
- Enforce same-origin, access control, input validation, and redacted logging.

#### Vercel Workflow

Responsibilities:

- Durable orchestration of source creation, sync round start, upload URL requests, wait states, completion, cancellation, retries, and final summaries.
- Atomic step execution.
- Durable wait for external upload result events.
- Redacted observability.
- No file-byte storage.

#### Genesys Cloud

Responsibilities:

- Knowledge source persistence.
- Synchronization lifecycle.
- Upload URL issuance.
- Actual ingestion after completed synchronization.

#### Encrypted localStorage vault

Responsibilities:

- Persist non-secret, user-facing app metadata.
- Persist resumable manifests and workflow run references.
- Persist source IDs and display names.
- Persist user preferences.

The local vault is not a security boundary against active XSS; the app must prevent XSS and avoid storing secrets.

### 6.2 High-level data flow

```text
Browser UI
  | selects files, computes hashes, validates names
  | starts sync with metadata only, no file bytes
  v
Next.js API route
  | starts Vercel workflow
  v
Vercel Workflow
  | server-side Genesys OAuth / API calls
  | create/reuse source
  | start synchronization
  | request upload URL for a file
  | emits upload ticket / waits for upload result hook
  v
Browser UI
  | uploads file bytes directly to Genesys upload URL
  | sends upload result to Next.js hook endpoint
  v
Vercel Workflow
  | records file success/failure in workflow state
  | repeats for remaining files
  | patches synchronization Completed only after all files succeed
  v
Genesys Cloud Knowledge
```

### 6.3 Direct upload vs proxy upload

Preferred path:

- Browser uploads directly to the Genesys-provided pre-signed URL.
- The app never handles file bytes on the server.
- This is the most scalable and most privacy-preserving path.

Fallback path:

- If the pre-signed upload URL cannot be called from the browser because of CORS or required headers, the app offers a server streaming proxy.
- The proxy must stream request body to the upload URL without buffering whole files into memory or storage.
- The proxy must enforce strict size and duration limits aligned with the Vercel plan.
- The proxy is a fallback, not a replacement for direct upload.
- If a file is too large for safe proxying, the app must stop and explain that direct upload or server-side storage would be required.

---

## 7. Authentication and authorization design

### 7.1 Recommended Genesys authentication model

Use Genesys OAuth Client Credentials configured as Vercel environment variables:

- `GENESYS_CLIENT_ID`
- `GENESYS_CLIENT_SECRET`
- `GENESYS_REGION_API_HOST`

Rationale:

- Vercel workflows are server-side and long-running.
- Server-side workflows need to call Genesys APIs without exposing secrets to the browser.
- Client credentials avoid storing user access tokens in localStorage.
- Token acquisition can happen inside atomic workflow steps and tokens can remain short-lived.

Rules:

- Client secret exists only in Vercel environment variables.
- Access token exists only in server memory or encrypted workflow state if unavoidable.
- Token values are never returned to the browser.
- Token values are redacted in logs and error messages.

### 7.2 Alternative PKCE model

PKCE can be considered for a purely user-delegated browser flow, but it is not the recommended default for this product because durable server workflows need reliable server-side Genesys API access, and browser localStorage must not persist access or refresh tokens.

If PKCE is implemented later:

- Use Authorization Code with PKCE, not implicit grant.
- Store tokens only in memory or secure HTTP-only same-site cookies if a server session mechanism is introduced.
- Do not store tokens in localStorage.
- Confirm Genesys token refresh behavior and browser CORS support before relying on long-running workflows.

### 7.3 App access control

Because the app may hold a Genesys client credential server-side, the deployed app must not be publicly usable by anonymous visitors.

Accepted production options:

1. Vercel Deployment Protection / Vercel Authentication / SSO at the project level.
2. Enterprise identity provider in front of the app.
3. App-level single-admin protection using a strong secret stored only in Vercel environment variables, with a server-issued HTTP-only, SameSite cookie.

Not acceptable:

- Storing an admin password in localStorage.
- Relying only on a hidden URL.
- Exposing server workflow start endpoints without authentication.

### 7.4 Genesys least privilege

The Genesys OAuth client should be granted only permissions required to:

- Create `FileUpload` knowledge sources if source creation is enabled.
- Start synchronizations for allowed sources.
- Request upload URLs.
- Patch synchronization status.

If the organization wants to prevent accidental source creation, deploy the app in “existing source only” mode and do not grant create-source permission.

---

## 8. Local persistence model

### 8.1 Storage keys

All app-managed `localStorage` keys must be namespaced and versioned:

- `gkfsm:v1:vault` — encrypted metadata envelope.
- `gkfsm:v1:vault-meta` — non-sensitive vault metadata such as schema version, KDF parameters, and salt.
- `gkfsm:v1:lock` — short-lived local coordination lock, no secrets.
- `gkfsm:v1:crash-recovery` — minimal encrypted pointer to last active run, if needed.

No other keys should be written.

### 8.2 Encrypted vault envelope

Persisted local vault envelope:

```text
{
  version,
  createdAt,
  updatedAt,
  kdf: {
    name: "PBKDF2-SHA-256",
    iterations,
    salt
  },
  cipher: {
    name: "AES-GCM",
    iv,
    ciphertext,
    authTagImplicit: true
  },
  schemaVersion
}
```

Notes:

- Use WebCrypto primitives.
- Use a unique IV per encryption.
- Derive the key from a user-provided local vault passphrase.
- Keep the derived key only in memory.
- Validate vault integrity on unlock.
- Provide export/import for the encrypted vault blob.
- Provide clear local data action with confirmation.

### 8.3 What may be persisted

Allowed in encrypted localStorage:

- Source display name.
- Genesys `sourceId`.
- Last known source status summary.
- Workflow `runId`.
- Synchronization `id` after created.
- File metadata: original name, sanitized upload name, extension, size, lastModified, MIME type, hash values.
- File status: pending, uploaded, failed, cancelled, skipped.
- User preferences: theme, last selected region display, validation preferences.
- Non-secret run summaries and error codes.

### 8.4 What must never be persisted

Never persist:

- Genesys client secret.
- Genesys access token.
- Genesys refresh token.
- Admin password.
- Pre-signed upload URLs.
- Upload URL headers if they contain credentials or signatures.
- Raw file bytes.
- File text previews.
- Full unredacted API errors that may contain tokens, signatures, or internal details.

### 8.5 Storage failure handling

The app must handle:

- `localStorage` unavailable.
- Quota exceeded.
- Corrupt vault ciphertext.
- Wrong passphrase.
- Schema migration failure.
- Browser private mode eviction.
- User clearing site data.

Fallback behavior:

- Continue in ephemeral mode only if the user accepts that resume will be unavailable.
- Offer encrypted vault export before destructive migrations.
- Never block cancellation of a server-side sync solely because localStorage is unavailable.

---

## 9. Data model

This is a product-level model, not implementation code.

### 9.1 App configuration

Fields:

- `schemaVersion`
- `installId`
- `createdAt`
- `updatedAt`
- `accessMode`
- `features`
- `sourceRegistry`
- `syncRuns`
- `preferences`

### 9.2 Source record

Fields:

- `localSourceKey` — local UUID.
- `sourceId` — Genesys source ID.
- `displayName` — user-facing name.
- `sourceType` — always `FileUpload` for this product.
- `createdByApp` — boolean.
- `dateAddedToVault`.
- `lastUsedAt`.
- `lastSyncRunId`.
- `archived` — local only.
- `notes` — local only.

### 9.3 Sync run record

Fields:

- `localRunKey`
- `workflowRunId`
- `sourceId`
- `synchronizationId`
- `syncType` — `Incremental` or `Full`.
- `status`
- `createdAt`
- `updatedAt`
- `completedAt`
- `cancelledAt`
- `fileCount`
- `uploadedCount`
- `failedCount`
- `skippedCount`
- `needsUserActionCount`
- `errorSummary`
- `files`

### 9.4 File record

Fields:

- `localFileKey`
- `originalName`
- `uploadFileName`
- `extension`
- `contentType`
- `contentLength`
- `lastModified`
- `sha256Base64` — local fingerprint.
- `contentMd5Base64` — Genesys upload integrity field if computed.
- `originUri` — optional, if user configured.
- `tags` — optional.
- `metadata` — optional JSON object constrained by size.
- `validationStatus`
- `uploadStatus`
- `attempts`
- `lastErrorCode`
- `lastErrorMessageRedacted`

### 9.5 Upload attempt record

Fields:

- `attemptNumber`
- `createdAt`
- `uploadTicketIssuedAt`
- `uploadStartedAt`
- `uploadCompletedAt`
- `status`
- `failureClass`
- `httpStatus`
- `retryAfter`

Must not persist:

- Upload URL.
- Upload URL signed headers.
- Any authorization header.

---

## 10. UI and UX requirements

### 10.1 Global UX principles

The app must feel like a guided admin tool, not a raw API console.

Each screen should show:

- Current step.
- What is safe to do next.
- What is irreversible or ambiguous.
- Whether the app is online and connected.
- Whether the local vault is locked, unlocked, unavailable, or corrupt.
- Whether a sync is active.

### 10.2 Main navigation

Required sections:

1. Dashboard
2. Sources
3. New Sync
4. Active Run
5. History
6. Settings
7. Diagnostics

### 10.3 Dashboard

Shows:

- Genesys connection status.
- App access status.
- Local vault status.
- Active sync run card.
- Last completed run summary.
- Quick action: “Start sync.”
- Warning if deployment is not access-protected.

### 10.4 Sources screen

Capabilities:

- Create new FileUpload source.
- Add existing source ID.
- Rename local display name.
- Archive local source reference.
- Show source ID with copy button.
- Show last sync summary.
- Warn when source exists only locally and cannot be rediscovered if vault is lost.

### 10.5 New Sync screen

Capabilities:

- Choose source.
- Choose `Incremental` or `Full` sync.
- Drag and drop or file picker.
- Show supported file types.
- Validate file names instantly.
- Offer safe rename suggestions.
- Show duplicate detection.
- Show hash progress.
- Allow optional metadata/tags.
- Show final preflight summary.
- Disable “Start sync” until all blocking validation errors are resolved.

### 10.6 Active Run screen

Shows:

- Workflow status.
- Genesys synchronization ID.
- Per-file status table.
- Current atomic workflow step.
- Upload progress if browser is uploading.
- Retry controls.
- Cancel control.
- Reconnect/resume prompt.
- Copy support bundle button with redaction.

### 10.7 History screen

Shows encrypted local summaries only:

- Date.
- Source.
- Sync type.
- File counts.
- Final status.
- Error summary.
- Workflow run ID.

Because there is no database and only localStorage persistence, history is browser-local and may be lost if local data is cleared.

### 10.8 Settings screen

Capabilities:

- Vault lock/unlock/change passphrase.
- Export encrypted vault.
- Import encrypted vault.
- Clear local data.
- Configure safe filename behavior.
- Configure file size warning threshold.
- Configure default sync type.
- Toggle direct-upload/proxy-upload preference if enabled.
- Show environment readiness checks without revealing secrets.

### 10.9 Diagnostics screen

Capabilities:

- Run environment checks.
- Verify workflow start endpoint is protected.
- Verify Genesys region API host is configured.
- Verify OAuth token acquisition works without exposing token.
- Verify localStorage availability.
- Verify WebCrypto availability.
- Verify browser can compute MD5/SHA-256 for a small test blob.
- Verify direct upload CORS using a short-lived test ticket only if safe.
- Export redacted diagnostics bundle.

---

## 11. Validation requirements

### 11.1 File type validation

Allow only these extensions, case-insensitive:

- `.txt`
- `.md`
- `.doc`
- `.docx`
- `.csv`
- `.xls`
- `.xlsx`
- `.html`
- `.pdf`

Validation must use the file name extension because browser MIME types are often missing or unreliable. MIME type should still be captured and sent as `contentType` when known.

### 11.2 File name validation

Blocking errors:

- Empty name.
- Starts with `.`.
- Ends with `/`.
- Contains whitespace.
- Contains Genesys-disallowed characters.
- Contains path separators.
- Contains control characters.
- Contains `..` path traversal segment.
- Unsupported extension.
- Duplicate upload name after normalization.

Warnings:

- Very long name.
- Mixed Unicode scripts that may be spoofing.
- Extension/MIME mismatch.
- Zero-byte file.
- Very large file relative to configured warning threshold.
- File modified timestamp is missing.

### 11.3 Safe rename behavior

When a file name is invalid but can be safely transformed, the app should offer a suggestion instead of simply failing.

Example transformations:

- Replace whitespace with `_`.
- Remove disallowed characters.
- Normalize Unicode to NFC.
- Collapse repeated separators.
- Preserve extension.
- Append stable suffix for duplicates.

The user must be able to review original name vs upload name before sync starts.

### 11.4 Hashing and integrity

Required:

- Compute content length from the browser `File` object.
- Compute SHA-256 for local fingerprinting.
- Compute MD5 base64 for Genesys `contentMd5` when feasible.

Important distinction:

- MD5 is used only because the Genesys upload API accepts `contentMd5` for upload integrity. It must not be described as a secure hash.
- SHA-256 is used for local deduplication and reselect matching.

Large-file handling:

- Use streaming or chunked hashing where possible.
- Show progress and allow cancellation.
- Avoid reading all files into memory at once.
- Process files with bounded concurrency.

---

## 12. Workflow design

### 12.1 Main workflow: `knowledgeFileSyncWorkflow`

Inputs:

- Source reference or create-source request.
- Sync type.
- File manifest only, no file bytes.
- Local run key.
- User-confirmed safe upload names.
- Optional tags/metadata.

Outputs:

- Workflow run summary.
- Source ID.
- Synchronization ID.
- Per-file final statuses.
- Final Genesys patch status.
- Redacted error summary.

### 12.2 Atomic workflow steps

#### Step 1: Validate workflow input

Atomic effect:

- Pure validation only.

Must verify:

- Source mode is valid.
- Sync type is allowed.
- File manifest is non-empty.
- File names are already valid.
- No file bytes are present.
- Metadata sizes are within limits.
- Required environment variables exist.

#### Step 2: Acquire Genesys access token

Atomic effect:

- Obtain short-lived server-side token.

Rules:

- Do not return token to client.
- Do not persist token in localStorage.
- Redact token in logs.
- Handle 401/403 as configuration errors.

#### Step 3: Create or resolve source

Atomic effect:

- Either reuse provided `sourceId` or create a new source once.

Rules:

- If creating a source, do not automatically retry ambiguous network failures unless the request is known not to have reached Genesys.
- If response includes source ID, store it in workflow state and return it to the client for encrypted local vault storage.
- If outcome is unknown, stop and require user action.

#### Step 4: Start synchronization round

Atomic effect:

- Call `POST /sources/{sourceId}/synchronizations` exactly once for the run.

Rules:

- If response includes synchronization ID, persist it in workflow state.
- If outcome is ambiguous, stop and require user action or safe cancellation if an ID is known.
- Do not start a second sync round for the same run unless explicitly starting over.

#### Step 5: Create upload ticket for one file

Atomic effect:

- Request one upload URL for one file attempt.

Rules:

- Input includes file metadata only.
- Output to browser includes URL and required headers only transiently.
- Do not persist URL in localStorage.
- Redact URL from workflow logs if it contains signatures.
- If request fails before ticket issuance, retry if safe.
- If ticket issuance outcome is unknown, classify carefully.

#### Step 6: Wait for browser upload result

Atomic effect:

- Suspend workflow until browser reports upload success/failure or timeout/cancel occurs.

Rules:

- Use Workflow hook/webhook semantics.
- The hook token must be unguessable and scoped to one run and one file attempt.
- The callback endpoint must validate run ID, file ID, attempt ID, CSRF/session if applicable, and expected status shape.
- Timeout must lead to `NeedsUserAction`, not automatic completion.

#### Step 7: Record file result

Atomic effect:

- Update workflow state for one file attempt based on callback.

Rules:

- Success requires browser upload completed without HTTP error.
- Failure stores class, status, and redacted message.
- Ambiguous browser errors require explicit user action or safe retry.

#### Step 8: Decide next file or retry

Atomic effect:

- Determine if workflow should continue, retry same file, pause for user action, cancel, or fail.

Rules:

- Bounded retries.
- Honor `Retry-After` for 429 when available.
- Avoid retry storms.
- Do not create unbounded duplicate upload tickets.

#### Step 9: Complete synchronization

Atomic effect:

- Call `PATCH ... { status: "Completed" }`.

Precondition:

- Every selected file has confirmed uploaded success.

Rules:

- Completion patch may be retried on clearly transient failures.
- If patch outcome is unknown, mark run `CompletionUnknown` and show manual verification instructions rather than starting another sync automatically.

#### Step 10: Cancel synchronization

Atomic effect:

- Call `PATCH ... { status: "Cancelled" }` if sync ID exists and run is not completed.

Rules:

- Cancellation should be attempted for any fatal pre-completion failure after sync round creation.
- If cancellation fails, surface `CancelUnknown`.
- Do not call cancellation after completion has been acknowledged.

#### Step 11: Emit final summary

Atomic effect:

- Produce redacted run summary.

Rules:

- No secrets.
- No upload URLs.
- Include final state, counts, and next action.

### 12.3 Workflow state machine

Run states:

- `DraftLocal`
- `PreflightValidating`
- `ReadyToStart`
- `WorkflowStarting`
- `SourceCreating`
- `SourceReady`
- `SynchronizationStarting`
- `SynchronizationReady`
- `UploadTicketCreating`
- `AwaitingBrowserUpload`
- `BrowserUploading`
- `FileUploaded`
- `FileFailedRecoverable`
- `FileFailedFatal`
- `NeedsUserAction`
- `CompletingSynchronization`
- `Completed`
- `Cancelling`
- `Cancelled`
- `CompletionUnknown`
- `CancellationUnknown`
- `FailedFatal`

File states:

- `Selected`
- `Invalid`
- `Validated`
- `Hashing`
- `Ready`
- `TicketRequested`
- `TicketIssued`
- `Uploading`
- `Uploaded`
- `UploadFailedRecoverable`
- `UploadFailedFatal`
- `NeedsReselect`
- `Skipped`
- `Cancelled`

---

## 13. Retry and idempotency strategy

### 13.1 Retry classes

Retry automatically:

- Network failure before request is sent.
- DNS/connectivity failure where no server response exists.
- HTTP 408.
- HTTP 429 with backoff and `Retry-After`.
- HTTP 500, 502, 503, 504 when safe for the specific operation.

Do not automatically retry without classification:

- `POST /knowledge/sources` if Genesys may have created a source but the response was lost.
- `POST /synchronizations` if Genesys may have started a sync but the response was lost.
- `POST /uploads` if the URL may have been issued and the file may later upload.
- Browser upload where CORS hides the response status.
- `PATCH Completed` if the request may have succeeded but response was lost.

Never retry automatically:

- 400 validation errors.
- 401/403 authorization/configuration errors.
- 404 source or synchronization not found.
- User cancellation.
- Unsupported file type.
- Blocking file-name validation error.

### 13.2 Idempotency keys

If Genesys supports idempotency keys in the future, the app should use them. In the current product spec, the provided endpoint details do not mention idempotency keys, so the app must not assume they exist.

Local idempotency identifiers should still be generated for logs and internal tracking:

- `localRunKey`
- `localFileKey`
- `attemptId`

These do not make Genesys API calls idempotent by themselves.

### 13.3 Ambiguous outcomes

Ambiguous outcomes must produce explicit states, not hidden retries.

Examples:

- `SourceCreateUnknown`
- `SyncStartUnknown`
- `UploadTicketUnknown`
- `UploadResultUnknown`
- `CompletionUnknown`
- `CancellationUnknown`

UI action:

- Explain what might have happened.
- Prevent unsafe completion.
- Offer manual verification guidance.
- Offer start-over only when safe.

---

## 14. Concurrency model

### 14.1 Same-browser concurrency

Use a local lock to prevent multiple active syncs for the same source in the same browser profile.

Mechanisms:

- Web Locks API when available.
- BroadcastChannel for multi-tab coordination.
- `localStorage` lease fallback with owner ID and expiry.

Behavior:

- If another tab is active, show a “sync already active” banner.
- Allow user to take over only if the lock is stale.
- Never complete a sync from two tabs at the same time.

### 14.2 Cross-browser and cross-user concurrency

Without a shared app database or server lock, the app cannot perfectly prevent two different browsers from starting syncs for the same source at the same time.

Mitigations:

- Deployment access control limits users.
- UI warns that one sync per source should run at a time.
- Workflow detects Genesys errors that indicate conflict and surfaces them.
- Optional future enhancement: use a Genesys-side source/synchronization status endpoint if available and officially supported.

### 14.3 Workflow concurrency

Each sync run has a single workflow coordinator. File upload tickets may be issued sequentially by default for safety. Parallelism can be introduced later with strict limits.

Default:

- Sequential upload ticket creation.
- Browser upload concurrency configurable, default 2.
- Completion only after every file is successful.

---

## 15. Error handling and user messages

### 15.1 Error categories

- `UserInputError` — invalid file, invalid source ID, invalid metadata.
- `AuthConfigError` — bad Genesys credentials or missing Vercel env vars.
- `PermissionError` — Genesys client lacks required permissions.
- `NetworkTransientError` — temporary connectivity problem.
- `RateLimitedError` — Genesys or Vercel rate limiting.
- `GenesysValidationError` — Genesys rejected request body.
- `UploadUrlError` — failed to obtain or use upload URL.
- `BrowserUploadError` — browser failed to upload bytes.
- `WorkflowRuntimeError` — workflow infrastructure issue.
- `LocalVaultError` — localStorage/vault problem.
- `AmbiguousOutcomeError` — external side effect may have occurred but was not confirmed.

### 15.2 Error message requirements

Every user-facing error must include:

- Plain-language summary.
- Affected file or source if applicable.
- Whether retry is safe.
- Recommended next action.
- Technical details section with redacted request ID, status code, and workflow run ID.

Never include:

- Access tokens.
- Client secrets.
- Upload URLs.
- Signed headers.
- Full stack traces in production UI.

---

## 16. Security requirements

### 16.1 Browser security

Required:

- Strict Content Security Policy.
- No inline scripts unless nonce-based and unavoidable.
- Trusted Types where supported.
- Escape all file names and metadata in the UI.
- Never render uploaded HTML file content directly in the app DOM.
- If HTML preview is ever added, use sandboxed iframe with no scripts and no same-origin access.
- No third-party analytics by default.
- Dependency review before any hashing or UI library is added.

### 16.2 Server security

Required:

- All mutating API routes require authentication.
- CSRF protection when cookie-based auth is used.
- Strict input schemas for every route.
- Request body size limits.
- Method allowlists.
- Same-origin CORS for app routes.
- Redacted structured logs.
- No secret values in workflow step outputs visible to users.
- Security headers: HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame restrictions.

### 16.3 Upload URL security

Required:

- Treat upload URLs as bearer secrets.
- Show only “upload URL issued,” never the full URL.
- Do not store upload URLs in localStorage.
- Do not include upload URLs in error reports.
- Use upload URL promptly.
- If upload URL expires, request a new attempt only when safe.

### 16.4 Dependency security

Required:

- Pin dependencies with lockfile.
- Automated vulnerability scanning.
- Avoid dependencies for trivial utilities.
- Use maintained MD5 implementation only for Content-MD5 compatibility.
- Verify bundle does not include server secrets.

### 16.5 Privacy

The app should minimize exposure of potentially sensitive knowledge file names and metadata.

Rules:

- Store file names only inside encrypted vault.
- Redact file names from server logs by default or store hashed/truncated versions.
- Provide a “private diagnostics” mode that excludes file names.
- Avoid server-side file content processing unless proxy fallback is explicitly used.

---

## 17. Reliability requirements

### 17.1 Workflow durability

The sync orchestration must survive:

- Browser refresh.
- Browser tab close.
- Function restart.
- Temporary Genesys outage.
- Temporary Vercel workflow interruption.
- Network disconnect while waiting for user/browser upload result.

The actual file-byte upload cannot survive loss of browser file access without user reselecting the file.

### 17.2 Completion safety

The app must prefer cancellation or `NeedsUserAction` over unsafe completion.

Never mark synchronization completed when:

- Any file upload is still pending.
- Any file upload failed.
- Any file upload result is ambiguous.
- The user cancelled.
- The workflow cannot determine final file statuses.

### 17.3 Observability

Required observability:

- Workflow run ID visible in UI.
- Step timeline visible in diagnostics.
- Per-file status events.
- Redacted error details.
- Start/end timestamps.
- Counts: selected, valid, skipped, uploaded, failed, cancelled.

### 17.4 Support bundle

The support bundle must include:

- App version.
- Browser version.
- Deployment environment label.
- Workflow run ID.
- Source ID, optionally redacted.
- Synchronization ID, optionally redacted.
- File count and statuses.
- Redacted error codes.
- No tokens, upload URLs, file bytes, or signed headers.

---

## 18. Edge case catalogue

### 18.1 Local storage and vault

| Scenario | Required behavior |
|---|---|
| localStorage unavailable | Offer ephemeral mode with clear warning; no history/resume guarantees. |
| localStorage quota exceeded | Stop persisting new summaries; offer export/clear; do not lose active cancellation ability. |
| Vault corrupt | Offer restore from export or reset; do not attempt unsafe partial parsing. |
| Wrong passphrase | Do not reveal details; allow retry; rate-limit unlock attempts client-side. |
| Browser clears storage | Allow manual source ID re-entry; history is gone. |
| Vault schema old | Migrate after encrypted backup; rollback if migration fails. |

### 18.2 Source management

| Scenario | Required behavior |
|---|---|
| User creates duplicate source name | Warn before creation; allow only if user confirms. |
| Create-source times out | Mark outcome unknown; avoid blind retry; offer manual verification. |
| Existing source ID invalid | Fail before upload if detected; otherwise fail at sync start with clear message. |
| App lacks create permission | Disable create flow; allow existing-source mode if sync permissions exist. |
| Local source removed | Remove only local reference; do not imply deletion in Genesys. |

### 18.3 File selection

| Scenario | Required behavior |
|---|---|
| Unsupported extension | Block and explain supported types. |
| Uppercase extension | Allow after case-insensitive validation. |
| Filename starts with dot | Block or suggest safe rename. |
| Filename contains spaces | Block or suggest replacing with `_`. |
| Filename contains Genesys-forbidden char | Block or suggest removal/replacement. |
| Duplicate upload names | Block until renamed uniquely. |
| Zero-byte file | Warn and require confirmation or block based on configuration. |
| Very large file | Warn; proceed only if direct upload path is available and configured limits allow. |
| File changes after hashing | Detect by size/lastModified where possible; rehash before upload. |
| File removed from disk | Ask user to reselect. |
| Directory dropped | Recursively collect files only if browser supports it; otherwise explain unsupported. |

### 18.4 Uploading

| Scenario | Required behavior |
|---|---|
| Upload URL request fails 429 | Back off using `Retry-After` if present. |
| Upload URL expires | Request a fresh ticket only if previous upload definitely did not succeed. |
| Direct upload CORS failure | Offer proxy fallback if file size/time limits allow. |
| Browser goes offline | Pause uploads; workflow waits; UI resumes when online. |
| User closes tab mid-upload | Upload may abort; workflow waits for result until timeout; user must resume/reselect. |
| PUT returns success but callback fails | Retry callback; workflow should not issue duplicate upload ticket. |
| Callback says success for wrong file | Reject callback; keep workflow waiting or fail attempt. |
| Upload response ambiguous | Do not complete; ask user to retry or cancel. |

### 18.5 Synchronization finalization

| Scenario | Required behavior |
|---|---|
| All files uploaded | Patch `Completed`. |
| Some files failed | Do not patch `Completed`; retry or cancel. |
| Completion patch 500 | Retry with backoff if safe. |
| Completion patch times out | Mark `CompletionUnknown`; instruct manual verification. |
| User cancels before sync ID exists | Stop locally; no Genesys cancel needed. |
| User cancels after sync ID exists | Patch `Cancelled` if not completed. |
| Cancel patch fails | Mark `CancellationUnknown`; provide support details. |

### 18.6 Security

| Scenario | Required behavior |
|---|---|
| XSS payload in file name | Render escaped text only; no HTML interpretation. |
| HTML file selected | Treat as data file; do not preview unsandboxed. |
| User tries to paste token in metadata | Warn that secrets should not be added; redact metadata in logs. |
| Upload URL appears in exception | Redact before logging or displaying. |
| App endpoint called cross-site | Reject due auth + CSRF + same-origin policy. |
| Unauthenticated user opens app | Block before any source or sync action. |

### 18.7 Workflow and deployment

| Scenario | Required behavior |
|---|---|
| Workflow runtime retries step | Step must be safe for retry or explicitly marked fatal on ambiguous side effect. |
| New deployment during active run | Existing run should finish under its workflow version where Vercel supports version pinning; UI should show app version mismatch if reconnecting from newer UI. |
| Vercel env var missing | Diagnostics fail clearly; sync disabled. |
| Vercel plan limit hit | Show resource-limit error; do not mark completed. |
| Server region far from Genesys region | Warn in diagnostics; recommend Vercel region near Genesys org. |

---

## 19. API route surface

The exact route names can change, but the product must expose these capabilities.

### 19.1 Auth/status routes

- Check app session/access.
- Check deployment readiness.
- Check Genesys connectivity without returning secrets.

### 19.2 Source routes

- Start create-source workflow or step.
- Validate existing source if supported.
- Return source creation result to the browser for encrypted vault storage.

### 19.3 Sync routes

- Start sync workflow with manifest only.
- Get sync workflow status.
- Reconnect to workflow stream if available.
- Cancel sync workflow.

### 19.4 Upload callback routes

- Receive browser upload success/failure.
- Validate callback identity and attempt ID.
- Resume workflow hook.

### 19.5 Proxy upload route, optional

- Streams browser file bytes to Genesys upload URL when direct upload is impossible.
- Must not write to disk or object storage.
- Must enforce strict auth, limits, and URL allowlist.

---

## 20. Non-functional requirements

### 20.1 Accessibility

- WCAG 2.2 AA target.
- Keyboard operability for all flows.
- Screen-reader announcements for progress and errors.
- Clear focus management after validation errors.
- No color-only status indicators.
- Progress bars with textual percentages.

### 20.2 Performance

- Initial app shell should load quickly on modern browsers.
- File hashing uses web workers for large files.
- UI remains responsive while hashing/uploading.
- Bounded upload concurrency.
- No large file content in React state.
- No file content in workflow payloads.

### 20.3 Browser support

Target modern evergreen browsers:

- Chrome/Edge latest two major versions.
- Firefox latest two major versions.
- Safari latest two major versions.

Degrade gracefully when:

- Web Locks API unavailable.
- File System Access API unavailable.
- BroadcastChannel unavailable.
- Persistent storage quota is limited.

WebCrypto is required for encrypted local vault. If WebCrypto is unavailable, production mode must not run.

### 20.4 Internationalization readiness

- User-facing strings centralized.
- Dates and numbers localized.
- Error codes stable independent of language.
- File validation rules not locale-dependent.

---

## 21. Deployment requirements

### 21.1 Vercel project settings

Required environment variables:

- `GENESYS_CLIENT_ID`
- `GENESYS_CLIENT_SECRET`
- `GENESYS_REGION_API_HOST`
- `APP_ACCESS_MODE`
- App access secret or SSO config if deployment protection is not used.
- `NEXT_PUBLIC_APP_VERSION` or build-time version.

Recommended settings:

- Vercel Deployment Protection enabled for production.
- Function region close to the Genesys Cloud org region.
- Workflow observability enabled.
- Preview deployments protected or connected to non-production Genesys org only.

### 21.2 Environments

#### Local development

- Uses local workflow backend where possible.
- Uses non-production Genesys OAuth client.
- Never uses production source IDs by default.

#### Preview

- Protected.
- Uses test Genesys org or explicit sandbox source.
- Clear environment banner.

#### Production

- Protected.
- Uses production Genesys OAuth client with least privilege.
- Strict CSP and security headers.
- No debug stack traces in UI.

---

## 22. Testing strategy

### 22.1 Unit tests

Cover:

- Filename validation.
- Safe rename suggestions.
- Extension validation.
- Hashing output format, especially MD5 base64 vs hex.
- Local vault encryption/decryption.
- Vault migration.
- Retry classification.
- Error redaction.
- State machine transitions.

### 22.2 Integration tests

Cover:

- Genesys API client with mocked responses.
- Workflow happy path.
- Workflow recoverable failure path.
- Workflow cancellation path.
- Upload callback validation.
- Direct upload simulation.
- Proxy upload fallback simulation.

### 22.3 End-to-end tests

Cover:

- Create source and sync small files in sandbox.
- Reuse source for a second sync.
- Invalid files blocked before workflow start.
- Refresh during hashing.
- Refresh during waiting for upload.
- Tab close after ticket issuance, then resume and reselect file.
- User cancellation.
- Full sync confirmation.
- localStorage unavailable mode.

### 22.4 Security tests

Cover:

- XSS file names.
- HTML metadata injection.
- CSRF attempts.
- Unauthenticated API access.
- Upload callback tampering.
- Redaction of tokens and URLs.
- Dependency vulnerability scan.
- CSP verification.

### 22.5 Chaos and reliability tests

Cover:

- Genesys 429.
- Genesys 500.
- Network timeout after source create.
- Network timeout after sync start.
- Upload URL expiration.
- Completion patch timeout.
- Vercel workflow retry of each atomic step.
- Browser offline/online transitions.

---

## 23. Release criteria

The app is production-ready only when all criteria are met:

- No app database or object storage dependency exists.
- No file bytes are persisted in localStorage, workflow payloads, logs, or server storage.
- No tokens, secrets, or upload URLs are persisted in localStorage.
- All localStorage app data is encrypted or explicitly non-sensitive lock metadata.
- All Genesys calls follow the documented sequence.
- Completion is impossible unless every file upload succeeded.
- Cancellation is available before completion.
- Ambiguous outcomes are surfaced honestly.
- Source creation ambiguity does not cause blind duplicate creation.
- Workflow steps are atomic and tested individually.
- Direct upload path works in a Genesys sandbox or documented proxy fallback is enabled.
- Access control protects all mutating routes.
- Security headers and CSP are enforced.
- WCAG 2.2 AA checks pass for core flows.
- E2E sandbox sync passes with every supported extension type, using safe sample files.
- Runbook and support bundle are complete.

---

## 24. Known limitations by design

These are not bugs; they are consequences of the database-free, localStorage-only persistence requirement.

1. Pending file uploads cannot resume after tab close unless the user reselects the file or the browser still has access to the file handle.
2. Cross-browser source-level locking cannot be perfect without shared server-side state.
3. Local history is browser-local and can be lost if localStorage is cleared.
4. Encrypted localStorage does not protect secrets from active XSS, so secrets must not be stored there.
5. Ambiguous external side effects may require manual Genesys verification if the API response is lost and no safe status endpoint is implemented.
6. Proxy upload fallback is limited by Vercel request duration, body streaming, and plan limits.

---

## 25. Future enhancements

Optional, not required for initial production release:

- Official Genesys source listing/status validation if endpoints are confirmed and authorized.
- Better cross-user locking if an approved shared state service becomes allowed.
- File System Access API integration to improve reselect/resume in supported browsers.
- Batch metadata templates.
- CSV-driven tag assignment.
- Organization-level policy presets.
- Signed support bundle export.
- Multi-language UI.
- Dry-run mode that validates names and permissions without uploading.
- Optional desktop companion for very large files if browser/Vercel proxy limits become a blocker.

---

## 26. Source references

The product design was based on these official/current references and the API details provided in the request:

- Genesys Cloud Resource Center, “How to sync knowledge sources using File Connector APIs?”  
  https://help.genesys.cloud/faqs/how-to-sync-knowledge-sources-using-file-connector-apis/
- Genesys Cloud Developer Center, Knowledge APIs entry point  
  https://developer.genesys.cloud/useragentman/knowledge/knowledge-apis
- Genesys Cloud Developer Center, Platform API overview and OAuth authorization entry points  
  https://developer.genesys.cloud/platform/api/  
  https://developer.genesys.cloud/authorization/platform-auth/use-pkce  
  https://developer.genesys.cloud/authorization/platform-auth/use-client-credentials
- Vercel Workflows documentation  
  https://vercel.com/docs/workflows
- Vercel blog, “A new programming model for durable execution”  
  https://vercel.com/blog/a-new-programming-model-for-durable-execution
- Workflow SDK documentation  
  https://workflow-sdk.dev/
