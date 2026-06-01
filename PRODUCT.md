# PRODUCT.md

# Genesys Knowledge Fabric File Sync Manager

**Version:** 1.1  
**Date:** 2026-06-01  
**Target stack:** Vercel, Next.js App Router, React, TypeScript, Vercel Workflows, browser `localStorage` only for app-managed persisted state  
**Primary goal:** A secure, focused, production-ready web app for managing file-based Genesys Cloud Knowledge Fabric source synchronizations without an app database.  
**Research update:** This version reviews the full Knowledge API endpoint inventory supplied from Genesys Cloud API Explorer and narrows implementation to the smallest endpoint set that materially improves Knowledge Fabric `FileUpload` source management.

---

## 1. Product summary

Genesys Knowledge Fabric File Sync Manager is a database-free web application that helps an administrator manage Genesys Cloud Knowledge Fabric `FileUpload` sources and their file synchronization rounds.

The app lets an administrator:

1. Discover existing Genesys Knowledge sources.
2. Create a new `FileUpload` Knowledge source when permitted.
3. Validate or reuse an existing source.
4. Select supported files in the browser.
5. Validate and fingerprint selected files before upload.
6. Start a Genesys synchronization round.
7. Request one upload URL per file attempt.
8. Upload each file through the browser.
9. Complete the synchronization only after every intended file upload has definitely succeeded.
10. Review source activity and specific synchronization status for recovery and auditability.

The app deliberately does **not** become a general Knowledge Workbench editor, article manager, bot runtime tester, search analytics console, or third-party connector administrator. The optimal product balance is: **a complete File Connector source-management tool, plus read-only discovery/status/history, without adopting the broad legacy Knowledge API surface.**

---

## 2. Research-driven scope decision

### 2.1 Bottom line

We do need a few additional endpoints beyond the original four-step upload flow, but not many.

The best additions are read-only and directly reduce operational risk:

- `GET /api/v2/knowledge/sources`
- `GET /api/v2/knowledge/sources/{sourceId}`
- `GET /api/v2/knowledge/sources/{sourceId}/synchronizations`
- `GET /api/v2/knowledge/sources/{sourceId}/synchronizations/{synchronizationId}`

A fifth endpoint can be added in Diagnostics only:

- `GET /api/v2/knowledge/sources/synchronizations`

Two lifecycle endpoints are useful but should remain feature-flagged:

- `PUT /api/v2/knowledge/sources/{sourceId}`
- `DELETE /api/v2/knowledge/sources/{sourceId}`

Everything else in the Knowledge endpoint inventory is either legacy Knowledge Workbench V2/article management, runtime guest-session/search behavior, organization settings, import/export/parse jobs, or future third-party fabric connector administration. Adding those now would overcomplicate the app and expand permissions unnecessarily.

### 2.2 Why these additions are worth it

The original app was safe but too dependent on locally persisted source IDs and manual verification. The new read-only endpoints improve the product without changing its core security model:

- Source discovery removes the need to paste source IDs manually.
- Source validation catches inaccessible, deleted, or wrong-type sources before a file upload begins.
- Source synchronization history helps users understand what happened in Genesys after local browser state is lost.
- Specific synchronization lookup gives safer recovery from ambiguous workflow states such as sync-start timeout, completion timeout, or cancellation timeout.
- Diagnostics-wide synchronization listing helps support staff, but should not become the default user workflow.

### 2.3 Why most Knowledge endpoints stay out

The full Knowledge API surface includes many endpoints that are valid Genesys APIs but do not belong in this product:

- Knowledge Workbench V2 knowledge base documents, categories, labels, versions, variations, feedback, import/export, parse, and synchronize jobs.
- Guest-session document search and feedback events.
- Salesforce and ServiceNow knowledge-base source endpoints, which are article-based Workbench connector flows, not FileUpload Fabric source synchronization.
- Search and preview APIs, which are useful runtime/search capabilities but not required to manage source ingestion.
- Connection and integration option endpoints, which may matter for SharePoint or other fabric connectors later but introduce provider-specific OAuth and connection lifecycle complexity.
- Knowledge settings endpoints, which expand the permission surface without helping file-source sync.

### 2.4 Endpoint adoption summary

| Decision | Endpoints | Product impact |
|---|---:|---|
| Keep core File Connector flow | 4 | Already the backbone of the product. |
| Add now as low-risk read-only support | 4 | Source discovery, source validation, source-level sync history, specific sync verification. |
| Add cautiously in Diagnostics | 1 | Organization-wide sync history for support users only. |
| Feature-flag destructive/edit actions | 2 | Source update/delete only if enabled by deployment policy. |
| Defer fabric connection/provider administration | 7 | Relevant later for SharePoint/fabric connector management, not needed for FileUpload. |
| Defer runtime search verification | 2 | Useful later for smoke tests, but not source management. |
| Exclude legacy Workbench/runtime/admin surface | 100 | Avoids Knowledge Workbench V2, guest sessions, document authoring, import/export, analytics, settings, and broad content management. |


---

## 3. Official platform facts this product relies on

### 3.1 Knowledge Fabric vs Knowledge Workbench boundary

Genesys Cloud distinguishes between Knowledge Workbench V2 article-based connectors and Knowledge Fabric connectors. Workbench V2 article-based connectors include Salesforce, ServiceNow, and universal article connectors. Knowledge Fabric connectors are for document-based and web-based sources used for AI-powered search and answer generation, including SharePoint folders, Genesys PS fabric connectors, and the File Connector API.

This product stays on the Knowledge Fabric/File Connector side of that boundary. It does not manage Workbench V2 articles, document variations, knowledge base labels, article feedback, import/export jobs, or article-based Salesforce/ServiceNow knowledge base connectors.

### 3.2 File Connector flow

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

The app must implement this ordering exactly and must never call completion before every required file upload has succeeded.

### 3.3 Knowledge Fabric source management behavior

Genesys Cloud’s Knowledge Fabric source UI exposes the operational concepts this app should mirror carefully:

- Source list with name, source type, status, and last sync.
- Refresh source list.
- Sync contents of a source.
- View source activity history.
- Edit source sync settings where supported.
- Delete source with confirmation.
- Manage fabric connections separately from sources.

The app should implement the equivalent FileUpload source pieces first. Connection management is not part of v1.1 because FileUpload sources do not require external provider authorization.

### 3.4 Public documentation caveat about “v3” naming

Genesys release notes and community discussion refer to new API endpoints for uploading knowledge files to Knowledge Fabric, while the public File Connector FAQ currently documents the operational endpoints under `/api/v2/knowledge/sources...`. This product must use only officially documented endpoint paths available in the API Explorer or public Genesys documentation, and must not invent undocumented `/api/v3` paths.

---

## 4. Endpoints in product scope

### 4.1 Core synchronization endpoints

#### Create knowledge source

`POST /api/v2/knowledge/sources`

Used once per source, then the returned source `id` is reused for future sync rounds.

Expected source input fields:

- `name` — required string.
- `type` — `FileUpload` for this product.
- `triggerType` — `Manual` for this product.
- `connectionId` — not used for `FileUpload` unless Genesys later requires it.
- `scheduleSettings` — out of scope for manual FileUpload sources.
- `filters` — out of scope unless Genesys later requires it for `FileUpload`.

#### Start synchronization round

`POST /api/v2/knowledge/sources/{sourceId}/synchronizations`

Used once at the start of each sync round.

Input:

- `type`: `Incremental` or `Full`.

Product default:

- `Incremental`.

Safety rule:

- `Full` sync requires explicit confirmation explaining that full-replacement/deletion semantics must be verified in the customer’s Genesys environment before relying on it. The app must not make undocumented promises about missing-file treatment.

#### Request upload URL

`POST /api/v2/knowledge/sources/{sourceId}/synchronizations/{synchronizationId}/uploads`

Used once per upload attempt per file.

Input fields include:

- `fileName` — required.
- `contentMd5` — optional but recommended for integrity when available; base64 encoded, not hexadecimal.
- `contentType` — recommended.
- `contentLength` — recommended.
- `metadata` — optional.
- `originUri` — optional if accepted for traceability.
- `tags` — optional list of tag objects.

File name constraints that must be enforced before requesting upload URLs:

- Must not start with a dot.
- Must not end with a forward slash.
- Must not contain whitespace.
- Must not contain any of these Genesys-disallowed characters: backslash (`\`), left brace (`{`), caret (`^`), right brace (`}`), percent (`%`), backtick, right bracket (`]`), double quote (`"`), greater-than (`>`), left bracket (`[`), tilde (`~`), less-than (`<`), hash (`#`), and vertical bar (`|`).

Additional defensive validation:

- No path traversal segments such as `..`.
- No path separators.
- Unicode normalization to NFC.
- Length limits with clear validation messages.
- Duplicate upload-name detection within a sync plan.
- Reserved platform names rejected or transformed before upload.
- Suspicious control characters rejected.

#### Complete or cancel synchronization

`PATCH /api/v2/knowledge/sources/{sourceId}/synchronizations/{synchronizationId}`

Input:

- `status`: `Completed` or `Cancelled`.

Rules:

- Send `Completed` only if every selected file is definitely uploaded successfully.
- Send `Cancelled` when the sync cannot safely complete, the user cancels before completion, or the workflow reaches a fatal or ambiguous state that cannot be resolved safely.

### 4.2 Read-only endpoints added in v1.1

#### List sources

`GET /api/v2/knowledge/sources`

Use cases:

- Discover FileUpload Knowledge sources created outside this app.
- Rehydrate the local source registry after vault loss.
- Avoid manual source ID entry.
- Detect likely duplicates before source creation.

Rules:

- Filter or clearly label source types so users do not accidentally operate on unsupported source types.
- Do not import every source into the local vault automatically; require user selection.
- Do not show destructive actions by default.

#### Get source

`GET /api/v2/knowledge/sources/{sourceId}`

Use cases:

- Validate an existing source ID before syncing.
- Confirm the source is accessible and compatible.
- Display last known source metadata and status.
- Detect deleted/inaccessible sources before file upload.

Rules:

- A source that is not `FileUpload` must be read-only or blocked for sync unless explicitly supported later.
- Validation failure must not delete the local record automatically.

#### Get source synchronizations

`GET /api/v2/knowledge/sources/{sourceId}/synchronizations`

Use cases:

- Show source activity history.
- Cross-check local run history against Genesys state.
- Help recover from browser storage loss.
- Help diagnose ambiguous workflow outcomes.

Rules:

- Persist only non-secret summary metadata in the encrypted vault.
- Treat Genesys state as authoritative for remote sync status, but do not infer file-byte upload recoverability from status alone.

#### Get specific source synchronization

`GET /api/v2/knowledge/sources/{sourceId}/synchronizations/{synchronizationId}`

Use cases:

- Verify a run after a lost response from sync start, completion, or cancellation.
- Refresh Active Run status.
- Produce support bundles with authoritative status.

Rules:

- If status is ambiguous or unavailable, keep the app run in a safe `NeedsUserAction` or `Unknown` state.
- Do not use this endpoint to justify completion unless every local file upload is also known to have succeeded.

### 4.3 Diagnostics-only endpoint

#### Get all source synchronizations

`GET /api/v2/knowledge/sources/synchronizations`

Use cases:

- Support-only organization-wide activity view.
- Troubleshooting when the user lost local vault history and cannot identify the exact source.

Rules:

- Hide behind Diagnostics.
- Require the same app access control as mutating routes.
- Respect least privilege; deployments may disable this endpoint if the OAuth client should only access known sources.
- Do not make this the primary History screen because local encrypted history should remain source-scoped and user-friendly.

### 4.4 Feature-flagged lifecycle endpoints

These endpoints are not required for a good first production release, but they can make the product a more complete source-management tool when enabled deliberately.

#### Update source

`PUT /api/v2/knowledge/sources/{sourceId}`

Default: disabled.

Allowed only for fields confirmed safe for `FileUpload` sources, such as source display name or supported sync settings. The app must never send unknown provider-specific fields or connection data.

#### Delete source

`DELETE /api/v2/knowledge/sources/{sourceId}`

Default: disabled.

Rules:

- Danger-zone only.
- Typed confirmation required.
- Explain that deleting a Knowledge Fabric source may be unrecoverable.
- Block delete while a sync is active or ambiguous.
- Archive local record only after remote deletion is confirmed.
- If deletion outcome is unknown, mark `SourceDeleteUnknown` and require manual verification.

---

## 5. Product principles

### 5.1 Safety over false automation

The app must not claim it can recover files that exist only in a closed browser tab. If a file upload has not completed and the browser loses access to the selected `File` object, the user must reselect the file.

### 5.2 No app database

The app must not add PostgreSQL, Redis, Vercel KV, Vercel Blob, S3, IndexedDB, Prisma, Supabase, Firebase, or any other persistent app-owned storage layer.

Allowed persistence:

- Browser `localStorage`, through the encrypted local vault.
- Vercel Workflow managed event/run state necessary for durable execution.
- Genesys Cloud state created through official APIs.

Disallowed persistence:

- Any server-side database.
- Any object/blob storage for files.
- Any plaintext secrets in browser storage.
- Any file content stored in browser `localStorage`.

### 5.3 Secure local persistence means “minimize and encrypt,” not “store secrets”

`localStorage` is not a secure secret store. It is accessible to JavaScript running in the origin, so a successful XSS attack can read it.

Never persist:

- Genesys client secrets.
- Genesys access tokens.
- Genesys refresh tokens.
- Pre-signed upload URLs.
- Upload URL signed headers.
- File bytes.
- File previews or extracted text.

Encrypt all non-secret app metadata with WebCrypto AES-GCM. Keep the vault decryption key only in memory. Treat encryption as defense-in-depth, not permission to store secrets.

### 5.4 Least privilege and endpoint minimization

The app must request only the Genesys permissions required for enabled features:

- Read/list sources if source discovery is enabled.
- Create FileUpload sources if source creation is enabled.
- Start synchronizations for allowed sources.
- Request upload URLs.
- Patch synchronization status.
- Read synchronization status/history if status and recovery features are enabled.
- Update/delete sources only when feature flags are enabled and explicitly approved.

### 5.5 User-friendly recovery

Every error state must give the user a clear next action:

- Retry now.
- Reselect file.
- Refresh source status.
- View Genesys synchronization status.
- Cancel this sync round.
- Start a new sync round.
- Copy technical details for support.
- Export encrypted local state before clearing browser data.

### 5.6 Atomic workflow steps

Every Vercel workflow step must represent one durable, restartable, auditable unit of work. Steps must avoid mixing unrelated effects. Non-idempotent external calls require explicit retry classification to avoid duplicate sources, duplicate sync rounds, or unsafe completion.

---

## 6. Target users and personas

### 6.1 Knowledge administrator

The primary user manages Genesys Knowledge Fabric file content and needs a safe way to upload supported files into a Genesys Knowledge source.

Needs:

- Simple setup.
- Source discovery and validation.
- Clear validation before upload.
- Reliable sync progress.
- Read-only source activity history.
- Error messages that explain Genesys API failures.
- Ability to reuse sources across future syncs.
- Ability to recover from refreshes, network interruptions, and browser crashes.

### 6.2 Platform engineer

The platform engineer deploys the app on Vercel and configures environment variables, access protection, security headers, feature flags, and Genesys OAuth credentials.

Needs:

- No database to provision.
- Secure deployment defaults.
- Minimal secret surface area.
- Feature flags for risky lifecycle operations.
- Observability of workflow runs.
- Clear operational runbooks.

### 6.3 Auditor or security reviewer

The reviewer validates that the application does not leak data, does not persist secrets, and has a controlled sync lifecycle.

Needs:

- Documented data flows.
- Endpoint scope decision log.
- Explicit storage inventory.
- Clear threat model.
- Redacted logs.
- Security acceptance criteria.

---

## 7. Primary user journeys

### 7.1 First-time setup with source discovery

1. User opens the app behind deployment protection or app-level access control.
2. User unlocks or creates the local encrypted vault.
3. App confirms Genesys connection health without exposing secrets.
4. App lists accessible Knowledge sources.
5. User filters to compatible `FileUpload` sources.
6. User imports an existing source reference or chooses to create a new source.
7. Imported source metadata is stored in the encrypted local vault.
8. UI displays the source as ready for sync.

Failure handling:

- If source listing fails because of permissions, the app still allows manual source ID entry if enabled.
- If a source type is unsupported, the UI must label it as unsupported and prevent sync.

### 7.2 First-time setup with a new FileUpload source

1. User enters a source name.
2. App validates source name.
3. User creates a `FileUpload` Knowledge source.
4. Vercel workflow calls `POST /api/v2/knowledge/sources`.
5. The returned `sourceId` is stored in encrypted local vault metadata.
6. UI validates the source with `GET /api/v2/knowledge/sources/{sourceId}` when available.
7. UI displays the new source as ready for sync.

Failure handling:

- If create-source fails before Genesys receives it, the user can retry.
- If create-source times out after Genesys may have created the source, the app marks `SourceCreateUnknown` and offers source discovery to locate a likely created source before retrying.
- The app must not blindly retry ambiguous source creation.

### 7.3 Setup with a known existing source ID

1. User chooses “Use existing source ID.”
2. User pastes `sourceId` and a local display name.
3. App validates local ID shape.
4. Server validates the source through `GET /api/v2/knowledge/sources/{sourceId}`.
5. App stores non-secret source metadata in the encrypted local vault.

Failure handling:

- Invalid or inaccessible source ID is shown before any files are uploaded.
- The user can edit, remove, or archive the local source reference.

### 7.4 Incremental file sync

1. User selects a compatible source.
2. User selects one or more files.
3. Browser validates supported extensions and Genesys filename constraints.
4. Browser computes content length, content type, MD5 base64 for Genesys, and SHA-256 for local fingerprinting.
5. UI shows a preflight table with warnings, duplicate names, unsupported files, and safe upload names.
6. User fixes or accepts safe rename suggestions.
7. User starts sync.
8. Vercel workflow starts a Genesys synchronization round.
9. For each valid file, workflow requests an upload URL.
10. Browser uploads file bytes directly to the returned upload URL, or uses a streaming proxy fallback if direct browser upload is blocked by CORS.
11. Browser notifies the workflow of each file result.
12. Workflow waits for all files to report success.
13. Workflow sends `PATCH ... { status: "Completed" }`.
14. UI refreshes specific synchronization status.
15. UI stores a non-secret run summary in the encrypted vault.

### 7.5 Full sync

Full sync is disabled by default unless the deployment explicitly enables it.

When enabled:

1. User chooses `Full` sync.
2. UI explains that full-replacement or deletion semantics must be verified in the customer’s Genesys environment.
3. User provides typed confirmation.
4. Workflow proceeds with the same safety rules as incremental sync.

### 7.6 Resume after tab close or refresh

1. User returns to the app.
2. User unlocks the local vault.
3. App loads saved sync manifest and workflow run ID.
4. App reconnects to workflow status.
5. App refreshes Genesys source and specific synchronization status when available.
6. Pending files whose bytes are unavailable are marked `NeedsReselect`.
7. User reselects original files.
8. App matches reselected files by SHA-256 where possible, or by name/size/lastModified with warning.
9. Pending upload tickets are refreshed if safe.
10. Sync continues or the user cancels.

Hard limit:

- Without server-side file storage, the app cannot resume a pending file upload unless the user reselects the file or the browser still holds a usable `File` object.

### 7.7 Cancel sync

1. User clicks cancel while a sync is not completed.
2. App confirms that cancellation may leave already-uploaded files in an incomplete Genesys sync round.
3. Workflow stops issuing new upload URLs.
4. In-flight browser uploads are aborted when possible.
5. Workflow sends `PATCH ... { status: "Cancelled" }` if a synchronization round exists and completion is not acknowledged.
6. App refreshes specific synchronization status.
7. UI marks run as cancelled or cancellation-unknown.

### 7.8 Review source activity

1. User opens a source detail view.
2. App calls `GET /api/v2/knowledge/sources/{sourceId}/synchronizations`.
3. UI displays recent sync rounds, statuses, and timestamps.
4. User can open a specific sync round for details.
5. App stores only selected non-secret summaries locally.

### 7.9 Optional source edit or delete

Only available if enabled by deployment feature flags.

Edit:

- App allows only confirmed FileUpload-safe fields.
- App validates source after update.

Delete:

- App requires typed confirmation.
- App blocks deletion during active or ambiguous sync.
- App archives local source only after confirmed remote deletion.

---

## 8. System architecture

### 8.1 Components

#### Browser UI

Responsibilities:

- Vault creation/unlock.
- Source discovery UI.
- Source selection and local registry.
- File picker and drag-and-drop.
- File validation.
- Hashing/fingerprinting.
- Uploading file bytes to Genesys-provided upload URLs.
- Reconnect/resume flows.
- User-facing progress and errors.

#### Next.js server API routes

Responsibilities:

- Authenticate all mutating and sensitive routes.
- Start workflows.
- Proxy source list/status/history requests without exposing tokens.
- Expose workflow status streams or polling endpoints.
- Receive upload-result callbacks from the browser.
- Optionally provide a streaming upload proxy fallback.
- Keep all Genesys credentials server-side.
- Enforce same-origin, access control, input validation, and redacted logging.

#### Vercel Workflow

Responsibilities:

- Durable orchestration of source creation, sync round start, upload URL requests, waits, completion, cancellation, retries, and final summaries.
- Atomic step execution.
- Durable wait for external upload result events.
- Read-only synchronization status refresh where useful for recovery.
- Redacted observability.
- No file-byte storage.

#### Genesys Cloud

Responsibilities:

- Knowledge source persistence.
- Synchronization lifecycle.
- Upload URL issuance.
- Ingestion after completed synchronization.
- Source and synchronization status/history.

#### Encrypted localStorage vault

Responsibilities:

- Persist non-secret source registry metadata.
- Persist resumable manifests and workflow run references.
- Persist source IDs and display names.
- Persist sync summaries and user preferences.

The local vault is not a security boundary against active XSS; the app must prevent XSS and avoid storing secrets.

### 8.2 High-level data flow

```text
Browser UI
  | selects source, selects files, computes hashes, validates names
  | starts sync with metadata only, no file bytes
  v
Next.js API route
  | starts Vercel workflow
  v
Vercel Workflow
  | server-side Genesys OAuth/API calls
  | create/reuse source
  | start synchronization
  | request upload URL for a file
  | emits upload ticket / waits for upload result hook
  v
Browser UI
  | uploads file bytes directly to Genesys upload URL
  | sends upload result to Next.js callback
  v
Vercel Workflow
  | records file success/failure
  | repeats for remaining files
  | patches synchronization Completed only after all files succeed
  | refreshes synchronization status for final summary when safe
  v
Genesys Cloud Knowledge Fabric
```

### 8.3 Direct upload vs proxy upload

Preferred path:

- Browser uploads directly to the Genesys-provided pre-signed URL.
- The app server never handles file bytes.
- This is the most scalable and privacy-preserving path.

Fallback path:

- If the pre-signed upload URL cannot be called from the browser because of CORS or required headers, the app offers a server streaming proxy.
- The proxy streams request body to the upload URL without buffering whole files into memory or storage.
- The proxy enforces strict size and duration limits aligned with the Vercel plan.
- The proxy is a fallback, not a replacement for direct upload.
- If a file is too large for safe proxying, the app stops and explains that direct upload or server-side storage would be required.

---

## 9. Authentication and authorization design

### 9.1 Recommended Genesys authentication model

Use Genesys OAuth Client Credentials configured as Vercel environment variables:

- `GENESYS_CLIENT_ID`
- `GENESYS_CLIENT_SECRET`
- `GENESYS_REGION_API_HOST`

Rules:

- Client secret exists only in Vercel environment variables.
- Access token exists only in server memory or workflow runtime memory when unavoidable.
- Token values are never returned to the browser.
- Token values are redacted in logs and error messages.

### 9.2 App access control

Because the app holds a Genesys client credential server-side, the deployed app must not be publicly usable by anonymous visitors.

Accepted production options:

1. Vercel Deployment Protection / Vercel Authentication / SSO at the project level.
2. Enterprise identity provider in front of the app.
3. App-level single-admin protection using a strong secret stored only in Vercel environment variables, with a server-issued HTTP-only, SameSite cookie.

Not acceptable:

- Storing an admin password in localStorage.
- Relying only on a hidden URL.
- Exposing workflow start, source mutation, upload callback, or proxy routes without authentication.

### 9.3 Feature flags and permissions

Required feature flags:

- `ENABLE_SOURCE_CREATION`
- `ENABLE_SOURCE_DISCOVERY`
- `ENABLE_SOURCE_HISTORY`
- `ENABLE_ORG_SYNC_DIAGNOSTICS`
- `ENABLE_SOURCE_UPDATE`
- `ENABLE_SOURCE_DELETE`
- `ENABLE_FULL_SYNC`
- `ENABLE_PROXY_UPLOAD`

Default production posture:

- Source discovery: enabled if OAuth permissions allow it.
- Source history: enabled if OAuth permissions allow it.
- Organization-wide sync diagnostics: disabled unless support explicitly needs it.
- Source update: disabled.
- Source delete: disabled.
- Full sync: disabled or admin-only.
- Proxy upload: disabled until direct upload behavior is validated.

---

## 10. Local persistence model

### 10.1 Storage keys

All app-managed `localStorage` keys must be namespaced and versioned:

- `gkfsm:v1:vault` — encrypted metadata envelope.
- `gkfsm:v1:vault-meta` — non-sensitive vault metadata such as schema version, KDF parameters, and salt.
- `gkfsm:v1:lock` — short-lived local coordination lock, no secrets.
- `gkfsm:v1:crash-recovery` — minimal encrypted pointer to last active run, if needed.

No other keys should be written.

### 10.2 Encrypted vault envelope

```json
{
  "version": 1,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "kdf": {
    "name": "PBKDF2-SHA-256",
    "iterations": 300000,
    "salt": "base64"
  },
  "cipher": {
    "name": "AES-GCM",
    "iv": "base64",
    "ciphertext": "base64",
    "authTagImplicit": true
  },
  "schemaVersion": 2
}
```

Rules:

- Use WebCrypto primitives.
- Use a unique IV per encryption.
- Derive the key from a user-provided local vault passphrase.
- Keep the derived key only in memory.
- Validate vault integrity on unlock.
- Provide export/import for the encrypted vault blob.
- Provide clear local data action with confirmation.

### 10.3 What may be persisted

Allowed in encrypted localStorage:

- Source display name.
- Genesys `sourceId`.
- Source type and compatible/unsupported flag.
- Last known source status summary.
- Last known source sync summary.
- Workflow `runId`.
- Synchronization `id` after created.
- File metadata: original name, sanitized upload name, extension, size, lastModified, MIME type, hash values.
- File status: pending, uploaded, failed, cancelled, skipped.
- User preferences: theme, last selected region display, validation preferences.
- Non-secret run summaries and error codes.

### 10.4 What must never be persisted

Never persist:

- Genesys client secret.
- Genesys access token.
- Genesys refresh token.
- Admin password.
- Pre-signed upload URLs.
- Upload URL signed headers.
- Raw file bytes.
- File text previews.
- Full unredacted API errors that may contain tokens, signatures, or internal details.

---

## 11. Data model

### 11.1 App configuration

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

### 11.2 Source record

Fields:

- `localSourceKey`
- `sourceId`
- `displayName`
- `sourceType`
- `remoteName`
- `remoteStatus`
- `isCompatibleFileUploadSource`
- `createdByApp`
- `dateAddedToVault`
- `lastValidatedAt`
- `lastRemoteSyncAt`
- `lastUsedAt`
- `lastSyncRunId`
- `archived`
- `notes`

### 11.3 Sync run record

Fields:

- `localRunKey`
- `workflowRunId`
- `sourceId`
- `synchronizationId`
- `syncType`
- `status`
- `createdAt`
- `updatedAt`
- `completedAt`
- `cancelledAt`
- `lastRemoteStatus`
- `lastRemoteStatusCheckedAt`
- `fileCount`
- `uploadedCount`
- `failedCount`
- `skippedCount`
- `needsUserActionCount`
- `errorSummary`
- `files`

### 11.4 File record

Fields:

- `localFileKey`
- `originalName`
- `uploadFileName`
- `extension`
- `contentType`
- `contentLength`
- `lastModified`
- `sha256Base64`
- `contentMd5Base64`
- `originUri`
- `tags`
- `metadata`
- `validationStatus`
- `uploadStatus`
- `attempts`
- `lastErrorCode`
- `lastErrorMessageRedacted`

### 11.5 Upload attempt record

Fields:

- `attemptNumber`
- `attemptId`
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

## 12. UI and UX requirements

### 12.1 Main navigation

Required sections:

1. Dashboard
2. Sources
3. New Sync
4. Active Run
5. History
6. Settings
7. Diagnostics

### 12.2 Dashboard

Shows:

- Genesys connection status.
- App access status.
- Local vault status.
- Enabled feature flags.
- Active sync run card.
- Last completed run summary.
- Quick action: “Start sync.”
- Warning if deployment is not access-protected.

### 12.3 Sources screen

Capabilities:

- Refresh/list remote Knowledge sources.
- Filter to compatible `FileUpload` sources.
- Import existing source into local vault.
- Create new FileUpload source if enabled.
- Add known existing source ID manually.
- Validate source ID.
- Show remote source status and last sync summary when available.
- Rename local display name.
- Archive local source reference.
- Show source ID with copy button.
- Optional danger-zone source update/delete if enabled.
- Warn when source exists only locally and cannot be rediscovered if vault is lost.

### 12.4 New Sync screen

Capabilities:

- Choose source.
- Validate source before sync.
- Choose `Incremental` or enabled/confirmed `Full` sync.
- Drag and drop or file picker.
- Show supported file types.
- Validate file names instantly.
- Offer safe rename suggestions.
- Show duplicate detection.
- Show hash progress.
- Allow optional metadata/tags.
- Show final preflight summary.
- Disable “Start sync” until all blocking validation errors are resolved.

### 12.5 Active Run screen

Shows:

- Workflow status.
- Genesys synchronization ID.
- Last remote synchronization status check.
- Per-file status table.
- Current atomic workflow step.
- Upload progress if browser is uploading.
- Retry controls.
- Refresh remote sync status button.
- Cancel control.
- Reconnect/resume prompt.
- Copy support bundle button with redaction.

### 12.6 History screen

Shows:

- Encrypted local run history.
- Optional remote source synchronization history.
- Date.
- Source.
- Sync type.
- File counts.
- Final local status.
- Last remote status.
- Error summary.
- Workflow run ID.

Because there is no database and only localStorage persistence, local history is browser-local and may be lost if local data is cleared. Remote synchronization history is fetched from Genesys when available.

### 12.7 Settings screen

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
- Show enabled/disabled endpoint features.

### 12.8 Diagnostics screen

Capabilities:

- Run environment checks.
- Verify workflow start endpoint is protected.
- Verify Genesys region API host is configured.
- Verify OAuth token acquisition works without exposing token.
- Verify source list/get/history permissions.
- Optionally show organization-wide source synchronization status.
- Verify localStorage availability.
- Verify WebCrypto availability.
- Verify browser can compute MD5/SHA-256 for a small test blob.
- Verify direct upload CORS using a short-lived test ticket only if safe.
- Export redacted diagnostics bundle.

---

## 13. Validation requirements

### 13.1 File type validation

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

Validation must use file name extension because browser MIME types are often missing or unreliable. MIME type should still be captured and sent as `contentType` when known.

### 13.2 File name validation

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

### 13.3 Safe rename behavior

When a file name is invalid but can be safely transformed, the app should offer a suggestion instead of simply failing.

Example transformations:

- Replace whitespace with `_`.
- Remove or replace disallowed characters.
- Normalize Unicode to NFC.
- Collapse repeated separators.
- Preserve extension.
- Append stable suffix for duplicates.

The user must review original name vs upload name before sync starts.

### 13.4 Hashing and integrity

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

## 14. Workflow design

### 14.1 Main workflow: `knowledgeFileSyncWorkflow`

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
- Last remote synchronization status when available.
- Redacted error summary.

### 14.2 Atomic workflow steps

1. Validate workflow input.
2. Acquire Genesys access token.
3. Create or resolve source.
4. Validate source status/type when supported.
5. Start synchronization round.
6. Create upload ticket for one file.
7. Wait for browser upload result.
8. Record file result.
9. Decide next file, retry, pause, cancel, or fail.
10. Complete synchronization.
11. Refresh synchronization status if safe.
12. Cancel synchronization when necessary.
13. Emit final summary.

### 14.3 Run states

- `DraftLocal`
- `PreflightValidating`
- `ReadyToStart`
- `WorkflowStarting`
- `SourceCreating`
- `SourceValidating`
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
- `RemoteStatusRefreshing`
- `CompletingSynchronization`
- `Completed`
- `Cancelling`
- `Cancelled`
- `SourceCreateUnknown`
- `SyncStartUnknown`
- `UploadTicketUnknown`
- `UploadResultUnknown`
- `CompletionUnknown`
- `CancellationUnknown`
- `SourceDeleteUnknown`
- `FailedFatal`

### 14.4 File states

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

## 15. Retry and idempotency strategy

### 15.1 Retry automatically

- Network failure before request is sent.
- DNS/connectivity failure where no server response exists.
- HTTP 408.
- HTTP 429 with backoff and `Retry-After`.
- HTTP 500, 502, 503, 504 when safe for the specific operation.
- Read-only source/status/history calls when bounded and safe.

### 15.2 Do not automatically retry without classification

- `POST /knowledge/sources` if Genesys may have created a source but the response was lost.
- `POST /synchronizations` if Genesys may have started a sync but the response was lost.
- `POST /uploads` if the URL may have been issued and the file may later upload.
- Browser upload where CORS hides the response status.
- `PATCH Completed` if the request may have succeeded but response was lost.
- `DELETE /knowledge/sources/{sourceId}` if enabled and the response was lost.

### 15.3 Never retry automatically

- 400 validation errors.
- 401/403 authorization/configuration errors.
- 404 source or synchronization not found except as a user-facing validation result.
- User cancellation.
- Unsupported file type.
- Blocking file-name validation error.
- Destructive source delete.

### 15.4 Idempotency keys

If Genesys supports idempotency keys in the future, the app should use them. Until then, the app must not assume external idempotency.

Local identifiers:

- `localRunKey`
- `localFileKey`
- `attemptId`

These help internal tracking but do not make Genesys API calls idempotent by themselves.

---

## 16. Error handling and user messages

### 16.1 Error categories

- App access/authentication.
- Genesys authentication/configuration.
- Genesys permission.
- Source validation.
- Source incompatible type.
- Source create unknown.
- Sync start unknown.
- Upload ticket failure.
- Browser upload failure.
- Upload URL expired.
- File missing/reselect required.
- Completion unknown.
- Cancellation unknown.
- Optional source update/delete failure.
- Local vault error.
- Workflow runtime error.
- Network/offline.

### 16.2 Support bundle redaction

Support bundles may include:

- App version.
- Environment label.
- Feature flags.
- Redacted source IDs if configured.
- Synchronization ID.
- Workflow run ID.
- File metadata without content.
- Validation errors.
- Redacted HTTP statuses and error codes.
- Last remote status summaries.

Support bundles must not include:

- Tokens.
- Client secrets.
- Upload URLs.
- Signed headers.
- Raw file bytes.
- File previews.
- Unredacted provider errors.

---

## 17. Security requirements

### 17.1 Access control

Protect every server route that can:

- Start workflows.
- Read remote sources/status/history.
- Create/update/delete sources.
- Start/cancel/complete synchronizations.
- Request upload tickets.
- Receive upload callbacks.
- Proxy uploads.
- Export diagnostics.

### 17.2 CSRF and request integrity

- Add CSRF protection for cookie-authenticated routes.
- Validate `Origin` and `Referer` for mutating browser requests where reliable.
- Require JSON content type for JSON routes.
- Reject unexpected methods.
- Reject oversized request bodies.
- Reject unknown fields unless explicitly allowed.
- Validate callback token, run ID, file ID, and attempt ID.

### 17.3 XSS hardening

- Escape all file names, source names, metadata values, and remote API messages in UI.
- Ban `dangerouslySetInnerHTML` unless specifically reviewed.
- Do not render uploaded HTML file contents directly.
- Add XSS fixture tests using malicious file names and remote source names.
- Enforce a strict Content Security Policy.

### 17.4 Source delete/update safety

If enabled:

- Require typed confirmation for delete.
- Require explicit permissions and feature flags.
- Block while sync is active or ambiguous.
- Do not auto-retry destructive unknown outcomes.
- Show remote source details before destructive action.

---

## 18. Testing strategy

### 18.1 Unit tests

Cover:

- File extension validation.
- Filename validation and safe rename suggestions.
- MD5 base64 vectors.
- SHA-256 vectors.
- Vault encryption/decryption.
- Vault migration.
- Endpoint DTO validation.
- Error classification.
- State machine transitions.
- Endpoint scope guardrails.

### 18.2 Integration tests

Cover mocked Genesys responses for:

- Source list.
- Source get.
- Source create.
- Source update/delete if enabled.
- Source sync history.
- Specific synchronization get.
- Sync start.
- Upload ticket.
- Completion patch.
- Cancellation patch.
- 400/401/403/404/408/429/5xx/timeouts.

### 18.3 End-to-end tests

Cover:

- Discover and import existing source.
- Create source and sync small files in sandbox.
- Reuse source for a second sync.
- Invalid files blocked before workflow start.
- Refresh during hashing.
- Refresh during waiting for upload.
- Tab close after ticket issuance, then resume and reselect file.
- User cancellation.
- Remote sync status refresh.
- Full sync confirmation if enabled.
- Source delete danger-zone flow if enabled.
- localStorage unavailable mode.

### 18.4 Security tests

Cover:

- Unauthenticated API access.
- CSRF attempts.
- Upload callback tampering.
- Source update/delete route protection.
- XSS file names.
- XSS remote source names.
- Redaction of tokens and URLs.
- Dependency vulnerability scan.
- CSP verification.

---

## 19. Release criteria

The app is production-ready only when all criteria are met:

- No app database or object storage dependency exists.
- No file bytes are persisted in localStorage, workflow payloads, logs, or server storage.
- No tokens, secrets, or upload URLs are persisted in localStorage.
- All localStorage app data is encrypted or explicitly non-sensitive lock metadata.
- All Genesys calls follow the documented File Connector sequence.
- Source discovery/status/history endpoints are read-only and protected.
- Completion is impossible unless every file upload succeeded.
- Cancellation is available before completion.
- Ambiguous outcomes are surfaced honestly.
- Read-only synchronization lookup is used to improve recovery where possible, not to hide uncertainty.
- Source creation ambiguity does not cause blind duplicate creation.
- Source update/delete are disabled by default or fully tested with explicit sign-off.
- Workflow steps are atomic and tested individually.
- Direct upload path works in a Genesys sandbox or documented proxy fallback is enabled.
- Access control protects all mutating and sensitive read routes.
- Security headers and CSP are enforced.
- WCAG 2.2 AA checks pass for core flows.
- E2E sandbox sync passes with every supported extension type using safe sample files.
- Runbook and support bundle are complete.

---

## 20. Known limitations by design

1. Pending file uploads cannot resume after tab close unless the user reselects the file or the browser still has access to the file handle.
2. Cross-browser source-level locking cannot be perfect without shared server-side state.
3. Local history is browser-local and can be lost if localStorage is cleared.
4. Remote synchronization history can help audit and recovery, but it does not restore browser-local file bytes.
5. Encrypted localStorage does not protect secrets from active XSS, so secrets must not be stored there.
6. Ambiguous external side effects may still require manual Genesys verification.
7. Proxy upload fallback is limited by Vercel request duration, body streaming, and plan limits.
8. Connection/provider management for SharePoint and other fabric connectors is intentionally deferred.
9. Runtime Knowledge Search and preview are intentionally deferred unless a post-sync smoke-test feature is explicitly scoped later.

---

## 21. Future enhancements

Optional, not required for initial production release:

- SharePoint/fabric connection inventory read-only panel using `GET /api/v2/knowledge/connections`.
- Fabric connection creation/reauthorization flows if the app expands beyond FileUpload and accepts provider OAuth complexity.
- Optional post-sync Knowledge Search smoke test.
- Optional source update/delete feature enablement after sandbox validation.
- File System Access API integration to improve reselect/resume in supported browsers.
- Batch metadata templates.
- CSV-driven tag assignment.
- Organization-level policy presets.
- Signed support bundle export.
- Multi-language UI.
- Optional desktop companion for very large files if browser/Vercel proxy limits become a blocker.

---

## 22. Full Knowledge endpoint decision matrix

The following inventory covers all Knowledge endpoints supplied from the API Explorer export in the request. The decision column is intentionally conservative.

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

---

## 23. Source references

Research performed on 2026-06-01 using the supplied API Explorer endpoint inventory and these public Genesys references:

- Genesys Cloud API Explorer: https://developer.genesys.cloud/devapps/api-explorer
- Genesys Cloud Resource Center, “How to sync knowledge sources using File Connector APIs?”: https://help.genesys.cloud/faqs/how-to-sync-knowledge-sources-using-file-connector-apis/
- Genesys Cloud Resource Center, “What types of knowledge connectors are available and when should they be used?”: https://help.genesys.cloud/faqs/what-types-of-knowledge-connectors-are-available-and-when-should-they-be-used/
- Genesys Cloud Resource Center, “View and manage the knowledge fabric sources”: https://help.genesys.cloud/articles/view-and-manage-the-knowledge-fabric-sources/
- Genesys Cloud Resource Center, “Knowledge fabric overview”: https://help.genesys.cloud/articles/knowledge-fabric-overview/
- Genesys Cloud release notes, March 2, 2026: https://help.genesys.cloud/release-notes/genesys-cloud/march-2-2026/
- Genesys Cloud Developer Community discussion, “API Endpoints for Uploading Knowledge Files”: https://community.genesys.com/discussion/api-endpoints-for-uploading-knowledge-files-share-your-use-cases
