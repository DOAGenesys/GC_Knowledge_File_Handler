# Operational runbooks

Operator runbooks for the **Genesys Knowledge Fabric File Sync Manager**. Each
runbook is **symptom → safe next steps**. The guiding principle is the same as
the app itself (PRODUCT.md §5.1, §15): **never treat an ambiguous outcome as
success, and never blind-retry a non-idempotent effect.** When in doubt, read
state from Genesys before mutating it.

Error codes referenced below are the stable codes from
[`src/lib/errors.ts`](../src/lib/errors.ts). Routes are under
[`src/app/api`](../src/app/api). Genesys paths come from `GENESYS_ENDPOINTS` in
[`src/lib/constants.ts`](../src/lib/constants.ts).

---

## 1. First deployment

**Symptom / goal:** Standing up the app on Vercel for the first time.

**Safe next steps:**

1. Configure environment variables (see [`.env.example`](../.env.example)). Required for boot of auth + Genesys:
   - **Genesys OAuth (Client Credentials):** `GENESYS_CLIENT_ID`, `GENESYS_CLIENT_SECRET`, `GENESYS_REGION_API_HOST` (bare host, no scheme, e.g. `api.mypurecloud.com`).
   - **App access (single admin):** `ADMIN_USERNAME`, `ADMIN_PASSWORD` (`openssl rand -base64 24`), `APP_SESSION_SECRET` (32+ chars, `openssl rand -base64 48`). Optionally `SESSION_TTL_MINUTES` (default `720`).
   - **Build metadata:** `NEXT_PUBLIC_APP_VERSION`, `NEXT_PUBLIC_ENVIRONMENT_LABEL` (`local` | `preview` | `production`).
2. Set feature flags to the intended posture. Defaults (`FEATURE_DEFAULTS`): discovery/history/creation **on**; `ENABLE_ORG_SYNC_DIAGNOSTICS`, `ENABLE_FULL_SYNC`, `ENABLE_PROXY_UPLOAD`, `ENABLE_SOURCE_UPDATE`, `ENABLE_SOURCE_DELETE` **off**. Only enable a flag once its Genesys permission is granted.
3. Optionally tune limits: `MAX_FILE_WARN_MB` (50), `MAX_SELECTED_FILES` (500), `PROXY_UPLOAD_MAX_BYTES` (26214400), `WORKFLOW_UPLOAD_WAIT_SECONDS` (900).
4. For direct browser→Genesys upload, set `GENESYS_UPLOAD_CONNECT_SRC` to the space-separated HTTPS upload host(s); leave empty only if you intend to force the proxy fallback (see runbook 8).
5. Deploy. The app **boots even if Genesys is unconfigured** — sync actions are disabled and Diagnostics shows secret-free guidance. **Auth fails closed:** if any of `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `APP_SESSION_SECRET` is missing, login is unreachable and no feature works.
6. Verify via the app:
   - Log in as the admin.
   - Open **Diagnostics** (`GET /api/diagnostics`) and confirm `genesysConfigured` and `authConfigured` are true, `regionHostValid` is true, and `missing` is empty.
   - Run an OAuth token check (must succeed without exposing the token) and a source list/get/history permission check.
7. Do **not** rely on a hidden URL or unauthenticated routes; the app enforces the single-admin login on every page and API route (layer Vercel Deployment Protection / SSO on top if desired).

---

## 2. Rotating the Genesys client secret

**Symptom / goal:** `GENESYS_CLIENT_SECRET` must be rotated (scheduled rotation or suspected exposure).

**Safe next steps:**

1. In Genesys Cloud, generate the new secret for the **same** OAuth Client Credentials client (keep `GENESYS_CLIENT_ID` stable to preserve granted permissions).
2. Update `GENESYS_CLIENT_SECRET` in Vercel Project → Settings → Environment Variables for the affected environment(s).
3. Redeploy (or restart) so the new value is read. Server config is memoized per process; a fresh deploy guarantees the new secret is picked up.
4. This does **not** invalidate admin sessions (those depend only on `APP_SESSION_SECRET`). In-flight OAuth tokens already minted remain valid until expiry; new tokens use the new secret.
5. Verify in **Diagnostics**: OAuth token acquisition succeeds. The secret is never returned to the browser or logged.
6. Revoke/delete the old secret in Genesys only after the new one is confirmed working.

---

## 3. Rotating `ADMIN_PASSWORD` / `APP_SESSION_SECRET` (invalidates sessions)

**Symptom / goal:** Rotate the admin password and/or the session-signing secret.

**Why it invalidates sessions:** sessions are **stateless HMAC-signed cookies** (no server store) signed with `APP_SESSION_SECRET` (see [`session-core.ts`](../src/server/auth/session-core.ts)). `APP_SESSION_SECRET` also signs the CSRF token and the workflow upload-callback tokens. Changing it makes every existing cookie/token fail signature verification.

**Safe next steps:**

1. Generate new values: `ADMIN_PASSWORD` = `openssl rand -base64 24`; `APP_SESSION_SECRET` = `openssl rand -base64 48`.
2. Update the variable(s) in Vercel for the target environment and redeploy.
3. **Expect immediate logout everywhere.** After rotating `APP_SESSION_SECRET`:
   - The admin must log in again.
   - **Any in-flight sync round's upload callbacks will be rejected** (their callback tokens no longer verify). Prefer to rotate when no sync is active. If a run was active, after re-login open **Active Run**, refresh remote sync status, and recover per runbooks 6/7 (verify in Genesys; reselect/retry or cancel) rather than assuming completion.
4. Rotating only `ADMIN_PASSWORD` (leaving `APP_SESSION_SECRET` unchanged) does **not** invalidate existing sessions — it only changes the next login. Rotate `APP_SESSION_SECRET` too if you need active sessions terminated.
5. Verify: old cookie is rejected (`APP_UNAUTHENTICATED`), new credentials log in successfully.

---

## 4. `SOURCE_CREATE_UNKNOWN` — source creation outcome lost

**Symptom:** Create-source (`POST /knowledge/sources`) timed out after Genesys may have created the source. Run/UI shows `SOURCE_CREATE_UNKNOWN` (severity warning, **not retryable**).

**Safe next steps:**

1. **Do not blind-retry creation** — a retry risks a duplicate source. The code marks this outcome `Unknown`, never `Success`.
2. Use **Discovery** (`GET /api/sources` → `GET /knowledge/sources`; requires `ENABLE_SOURCE_DISCOVERY`) to look for a source matching the name you just submitted.
3. If found, validate it (`GET /api/sources/{sourceId}`), confirm `type` is `FileUpload` (`isCompatibleFileUploadSource: true`), then import it into the vault instead of creating again.
4. If **not** found after discovery, it is safe to retry creation once.
5. If discovery is disabled, verify the source manually in the Genesys Knowledge Fabric UI before any retry.

---

## 5. `SYNC_START_UNKNOWN` — sync-start outcome lost

**Symptom:** Start-synchronization (`POST /knowledge/sources/{sourceId}/synchronizations`) returned ambiguously. Code `SYNC_START_UNKNOWN` (warning, **not retryable**).

**Safe next steps:**

1. **Do not blind-retry start** — a retry risks a duplicate sync round.
2. Check the **source synchronization history** (`GET /api/sources/{sourceId}/synchronizations` → requires `ENABLE_SOURCE_HISTORY`) for a recently started round.
3. If a round exists, open it (`GET …/synchronizations/{synchronizationId}`), adopt its `synchronizationId`, and continue the existing run (request upload tickets against it).
4. If no round is visible, it is safe to start one.
5. If history is disabled, verify in the Genesys Knowledge Fabric UI before retrying.

---

## 6. `COMPLETION_UNKNOWN` — completion not confirmed

**Symptom:** All files uploaded, but the completion `PATCH …/{synchronizationId} { status: "Completed" }` was not confirmed. Code `COMPLETION_UNKNOWN` (warning, **not retryable**).

**Safe next steps:**

1. **Do not start a new sync round yet** — completion may already have succeeded.
2. Refresh the specific synchronization (`GET …/synchronizations/{synchronizationId}`) from **Active Run** ("Refresh remote sync status") and read the authoritative status in Genesys.
3. If Genesys shows the round **Completed**, record the success locally; you are done.
4. If it still shows in-progress and every file is genuinely `uploaded` in the engine, retry the completion patch (idempotent in effect when targeting the same already-uploaded round).
5. **Only** start a new round after you have confirmed the prior round's terminal status in Genesys. Completion must never be inferred from upload counts alone (engine invariant: `Completed` requires every file `uploaded`/`skipped`).

---

## 7. `CANCELLATION_UNKNOWN` — cancellation not confirmed

**Symptom:** A cancel `PATCH …/{synchronizationId} { status: "Cancelled" }` returned ambiguously. Code `CANCELLATION_UNKNOWN` (warning, **not retryable**).

**Safe next steps:**

1. **Do not assume the round is cancelled.** Already-uploaded files may remain in an incomplete round.
2. Refresh the specific synchronization (`GET …/synchronizations/{synchronizationId}`) and read the status in Genesys.
3. If it shows **Cancelled**, mark the local run cancelled and move on.
4. If it shows still-open, retry the cancel patch once, or complete it deliberately if (and only if) every intended file actually uploaded.
5. Do not start a new round for the same source until the prior round reached a terminal state in Genesys.

---

## 8. Direct-upload CORS failure

**Symptom:** Browser upload fails with `BROWSER_UPLOAD_CORS` (the browser cannot read the pre-signed-URL response), or uploads are blocked by Content-Security-Policy `connect-src`. May surface as `UPLOAD_RESULT_UNKNOWN`.

**Safe next steps:**

1. Preferred fix: add the Genesys upload host(s) to `GENESYS_UPLOAD_CONNECT_SRC` (space-separated HTTPS origins, e.g. `https://*.s3.amazonaws.com https://*.pure.cloud`) so `connect-src` permits the direct browser→Genesys upload. Redeploy.
2. Fallback: set `ENABLE_PROXY_UPLOAD=true` to allow the server **streaming** proxy (`POST /api/sync/proxy-upload`). It streams bytes without buffering whole files and enforces `PROXY_UPLOAD_MAX_BYTES` (default ~25 MB). Files larger than that are rejected — use direct upload for those.
3. Verify with **Diagnostics**: `directUploadConnectSrcConfigured` is true after step 1, or the proxy flag is enabled for step 2.
4. For any file already attempted with a `CorsUnknown` result, **do not assume success** — reselect/retry it (request a fresh upload URL) or verify the upload in Genesys before completing.

---

## 9. User lost local vault

**Symptom:** Browser local data was cleared, or the vault passphrase is forgotten / the encrypted vault is corrupt. Local source registry and run history are gone (there is no server-side database; the passphrase is unrecoverable).

**Safe next steps:**

1. Re-login as the admin (auth does not depend on the vault).
2. In **Settings**, create/unlock a new encrypted vault (new passphrase). If an encrypted vault export exists, import it instead.
3. **Rediscover sources from Genesys** via Discovery (`GET /api/sources`; requires `ENABLE_SOURCE_DISCOVERY`), filter to `FileUpload` sources, and import the ones you manage back into the vault. Validate each (`GET /api/sources/{sourceId}`).
4. To recover run context, use source history (`GET /api/sources/{sourceId}/synchronizations`) and, if enabled, org-wide diagnostics (`ENABLE_ORG_SYNC_DIAGNOSTICS`).
5. **Hard limit:** pending file *bytes* cannot be recovered — any incomplete upload requires the user to reselect the original file.
6. Going forward, encourage exporting the encrypted vault before clearing browser data (Settings → Export).

---

## 10. Remote source deleted or inaccessible

**Symptom:** Validating a stored source returns `SOURCE_NOT_FOUND` (the source was deleted in Genesys or the OAuth client lost access). May also surface as `GENESYS_PERMISSION_DENIED` if it is purely a permissions gap.

**Safe next steps:**

1. Validation surfaces the error **before** any file upload begins (`GET /api/sources/{sourceId}`). The app **does not** auto-delete the local record on validation failure.
2. Distinguish the cause:
   - **Permissions** (`GENESYS_PERMISSION_DENIED`) — grant the least-privilege Knowledge read permission to the OAuth client; the source may still exist.
   - **Actually deleted** (`SOURCE_NOT_FOUND` after permissions confirmed) — the source is gone.
3. If genuinely gone, **archive the local source reference** (Settings/Sources → Archive) rather than syncing to it; archiving is local only and does not call Genesys.
4. If a replacement source exists, rediscover and import it (runbook 9, step 3).

---

## 11. Optional source delete — unknown outcome

**Symptom:** A flag-gated delete (`DELETE /knowledge/sources/{sourceId}`, requires `ENABLE_SOURCE_DELETE`) returned ambiguously. Code `SOURCE_DELETE_UNKNOWN` (warning, **not retryable**). Note delete is also blocked while a sync is active/ambiguous (`SOURCE_DELETE_BLOCKED_ACTIVE_SYNC`).

**Safe next steps:**

1. **Do not auto-retry the delete.** Deleting a Knowledge Fabric source may be unrecoverable.
2. Verify in Genesys (Discovery `GET /knowledge/sources`, or the Genesys UI) whether the source still exists.
3. If it is **gone**, archive the local record (the app only marks the local record archived after confirmed remote deletion).
4. If it **still exists** and you intend to delete it, ensure no sync is active/ambiguous (resolve or cancel first per runbooks 6/7), then re-issue the delete with the required typed confirmation (`confirmName` must match).
5. If a sync is active/ambiguous you will see `SOURCE_DELETE_BLOCKED_ACTIVE_SYNC` — resolve the sync before deleting.
