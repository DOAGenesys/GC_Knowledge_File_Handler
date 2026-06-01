# Genesys Cloud setup

This guide covers the one-time Genesys Cloud configuration the Knowledge Fabric File Sync Manager requires: an OAuth client, the least-privilege Knowledge permissions for the features you enable, and the region API host value. It assumes you can administer an OAuth client in your Genesys Cloud org.

The app talks to Genesys entirely **server-side**. The client secret lives only in environment variables, the access token lives only in server/workflow memory, and neither is ever returned to the browser, logged, or persisted (`src/server/genesys/oauth.ts`, PRODUCT.md §9.1, §5.3). See [Secrets stay server-side](#secrets-stay-server-side) below.

---

## 1. Create the OAuth client (Client Credentials grant)

In Genesys Cloud: **Admin → Integrations → OAuth → + Add Client**.

| Field | Value |
|---|---|
| App Name | e.g. `Knowledge Fabric File Sync Manager` |
| Grant Types | **Client Credentials** |
| Token Duration | default is fine (the app caches and refreshes the token with a 60s safety buffer) |
| Roles | a role granting only the Knowledge permissions in [section 2](#2-least-privilege-knowledge-permissions) |

The Client Credentials grant has no user context, so the role assigned to the OAuth client is what bounds its access. Assign the **least-privilege** role for the features you intend to enable — do not grant broad Knowledge admin.

After saving, copy the **Client ID** and **Client Secret** into the app's environment:

```bash
GENESYS_CLIENT_ID=...        # OAuth client ID
GENESYS_CLIENT_SECRET=...    # OAuth client secret (server-side only)
GENESYS_REGION_API_HOST=api.mypurecloud.com   # see section 3 — bare host, NO scheme
```

These three variables are required for any Genesys call. If any is missing the app still boots, but sync actions are disabled and Diagnostics reports the gap (`src/server/config.ts`). The separate single-admin login (`ADMIN_USERNAME`, `ADMIN_PASSWORD`, `APP_SESSION_SECRET`) is also required and fails closed if absent — that is app access control, not Genesys auth.

---

## 2. Least-privilege Knowledge permissions

The app calls **only** the endpoints in `src/lib/constants.ts` (`GENESYS_ENDPOINTS`). Nothing outside this allowlist is ever called, and a guardrail test enforces it. Grant the OAuth client's role only the permissions for the features (env flags) you turn on. Everything destructive or support-only defaults **off** (`src/lib/feature-flags.ts`).

| Feature flag (env) | Default | In-scope endpoint | Genesys operation to permit |
|---|---|---|---|
| `ENABLE_SOURCE_DISCOVERY` | `true` | `GET /api/v2/knowledge/sources`, `GET /api/v2/knowledge/sources/{sourceId}` | List / view Knowledge sources (read) |
| `ENABLE_SOURCE_HISTORY` | `true` | `GET /api/v2/knowledge/sources/{sourceId}/synchronizations`, `GET …/synchronizations/{synchronizationId}` | Read source synchronization history (read) |
| `ENABLE_SOURCE_CREATION` | `true` | `POST /api/v2/knowledge/sources` | Create a `FileUpload` source |
| _(core sync, always on)_ | — | `POST …/{sourceId}/synchronizations`<br>`POST …/synchronizations/{synchronizationId}/uploads`<br>`PATCH …/synchronizations/{synchronizationId}` | Start a sync round, request an upload URL per file, complete/cancel the round |
| `ENABLE_SOURCE_UPDATE` | `false` | `PUT /api/v2/knowledge/sources/{sourceId}` | Edit a source — grant **only** if this flag is on |
| `ENABLE_SOURCE_DELETE` | `false` | `DELETE /api/v2/knowledge/sources/{sourceId}` | Delete a source — grant **only** if this flag is on |
| `ENABLE_ORG_SYNC_DIAGNOSTICS` | `false` | `GET /api/v2/knowledge/sources/synchronizations` | Org-wide sync history (support only) — grant **only** if this flag is on |

Guidance:

- Map these to the Knowledge permissions available in your org's permission model (typically under the **Knowledge** domain). Genesys permission names vary by release; choose the narrowest read vs. add/edit/delete permissions that cover the operations above.
- **Read-only baseline:** discovery + history need only read/view permissions on sources and synchronizations.
- **Core sync requires write:** even with all optional flags off, creating sync rounds, requesting upload URLs, and patching completion are writes against synchronizations. If you enable `ENABLE_SOURCE_CREATION`, add the source-create permission too.
- **Do not** grant update, delete, or org-wide synchronization read unless the matching `ENABLE_*` flag is enabled. The server re-checks the flag on every optional route, but the OAuth role should not carry a permission the app will never exercise.

The token endpoint path (`/oauth/token`) needs no Knowledge permission — it is the standard Client Credentials grant.

---

## 3. Region API host (`GENESYS_REGION_API_HOST`)

Set `GENESYS_REGION_API_HOST` to your org's **API host as a bare hostname — no `https://` scheme and no path**. The app strips a leading scheme and trailing slashes and validates basic host shape (`src/server/config.ts`, `normalizeRegionHost`); an invalid value makes Genesys appear unconfigured.

Common region API hosts:

| Region | `GENESYS_REGION_API_HOST` |
|---|---|
| US East (Virginia) | `api.mypurecloud.com` |
| US West (Oregon) | `api.usw2.pure.cloud` |
| US East 2 (Ohio, FedRAMP) | `api.use2.us-gov-pure.cloud` |
| Canada (Central) | `api.cac1.pure.cloud` |
| EU (Ireland) | `api.mypurecloud.ie` |
| EU (London) | `api.euw2.pure.cloud` |
| EU (Frankfurt) | `api.mypurecloud.de` |
| EU Central 2 (Zurich) | `api.euc2.pure.cloud` |
| Asia Pacific (Sydney) | `api.mypurecloud.com.au` |
| Asia Pacific (Tokyo) | `api.mypurecloud.jp` |
| Asia Pacific (Seoul) | `api.apne2.pure.cloud` |
| Asia Pacific (Mumbai) | `api.aps1.pure.cloud` |
| Middle East (UAE) | `api.mec1.pure.cloud` |
| South America (São Paulo) | `api.sae1.pure.cloud` |

Use the host that matches the region of the org where you created the OAuth client. If your region is not listed, use the `api.*` host from your org's Genesys Cloud API documentation — anything matching the bare-host pattern is accepted.

### Login host is derived automatically

You do **not** configure a separate login/auth host. The OAuth token is requested from the **login host**, derived from the API host by replacing the `api.` prefix with `login.` (`deriveLoginHost` in `src/server/genesys/oauth.ts`):

| `GENESYS_REGION_API_HOST` | Derived token host (`POST /oauth/token`) |
|---|---|
| `api.mypurecloud.com` | `login.mypurecloud.com` |
| `api.mypurecloud.ie` | `login.mypurecloud.ie` |
| `api.usw2.pure.cloud` | `login.usw2.pure.cloud` |
| `api.mypurecloud.com.au` | `login.mypurecloud.com.au` |
| `api.cac1.pure.cloud` | `login.cac1.pure.cloud` |

Set the API host correctly and the login host follows.

---

## 4. Verify with the Diagnostics screen

After setting the environment variables and deploying (or running locally), log in and open the **Diagnostics** screen (`/diagnostics`). It runs server-side probes that confirm configuration **without ever revealing secret values** — only presence/validity and probe pass/fail (`src/server/diagnostics.ts`, PRODUCT.md §12.8).

Relevant server checks:

| Check | Group | What a pass means |
|---|---|---|
| App access protection | Security | Single-admin login is configured (`ADMIN_*` + `APP_SESSION_SECRET` present) |
| Genesys region API host | Connectivity | `GENESYS_REGION_API_HOST` is set and valid; the screen shows the resolved host |
| OAuth token acquisition | Connectivity | Client Credentials succeeded against `login.<region>`; the token is never shown. `skip` if Genesys is unconfigured |
| Source list permission | Knowledge API | `GET /knowledge/sources` worked. `fail` on permission denied, `warn` on other errors, `skip` if discovery is off or the token check failed |
| Source sync history | Knowledge API | `ENABLE_SOURCE_HISTORY` is on (`skip` if off) |
| Org-wide sync diagnostics | Knowledge API | `ENABLE_ORG_SYNC_DIAGNOSTICS` is on (`skip` if off) |

Interpreting results:

- **OAuth token acquisition `fail`** → wrong client ID/secret, wrong region (token went to the wrong `login.<region>`), or the OAuth client is not a Client Credentials grant.
- **Source list permission `fail`** → the OAuth client's role is missing the Knowledge source read permission. Add it (section 2) and re-run.
- **`skip`** on a Knowledge check is expected when the matching feature flag is off — not an error.

The Diagnostics screen also runs browser-side checks (WebCrypto, localStorage, MD5/SHA-256) merged into the same view; those are unrelated to Genesys setup.

---

## Secrets stay server-side

- `GENESYS_CLIENT_SECRET` is read only in server code and never sent to the browser, logged, or written to `localStorage` (PRODUCT.md §5.3, §10.4).
- The access token lives only in server/workflow memory, is refreshed before expiry, and is redacted from logs and errors (`src/server/genesys/oauth.ts`).
- Set these in **Vercel → Project → Settings → Environment Variables** for deployed environments; use `.env.local` only for local development. Never commit real secrets.
- Only non-secret readiness booleans, the resolved region host, feature flags, and limits ever cross to the client (`getReadiness` in `src/server/config.ts`). The token value never does.
