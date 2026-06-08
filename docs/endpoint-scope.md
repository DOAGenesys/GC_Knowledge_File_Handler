# Genesys Knowledge endpoint scope

This is the authoritative decision matrix for which Genesys Cloud Knowledge
endpoints the **Knowledge Fabric File Sync Manager** is permitted to call. The
app deliberately operates on the smallest endpoint set that materially improves
Knowledge Fabric `FileUpload` source management (PRODUCT.md §2, §4). Everything
else in the Knowledge API inventory is intentionally **out of scope**.

The in-scope allowlist lives in code as
[`GENESYS_ENDPOINTS`](../src/lib/constants.ts) over the base path
`/api/v2/knowledge` (constant `GENESYS_KNOWLEDGE_BASE`). The server client that
calls these is [`src/server/genesys/client.ts`](../src/server/genesys/client.ts).

> **Adding any endpoint requires product review.** The in-scope set is fixed for
> v1.1. Expanding it — even to another `/knowledge/sources/...` path — is a
> deliberate scope decision that must be approved, not an incidental code change.
> A CI guardrail (see [below](#ci-guardrail)) fails the build if forbidden
> families are referenced.

---

## In-scope endpoints

Eleven endpoints total: 4 core synchronization, 4 read-only, 1 diagnostics, and
2 feature-flagged lifecycle. Every path begins with `/api/v2/knowledge/sources`.

### Core synchronization flow (4)

These are the backbone of the product — the four-phase File Connector flow
(PRODUCT.md §3.2, §4.1). They are always available (subject only to
`ENABLE_SOURCE_CREATION` gating create-source) and are non-idempotent.

| # | Method | Path | Builder (`GENESYS_ENDPOINTS.*`) | Client fn | Purpose |
|---|--------|------|----------------------------------|-----------|---------|
| 1 | `POST` | `/api/v2/knowledge/sources` | `createSource()` | `createSource` | Create a `FileUpload` source (`triggerType: Manual`). Once per source. Gated by `ENABLE_SOURCE_CREATION`. |
| 2 | `POST` | `/api/v2/knowledge/sources/{sourceId}/synchronizations` | `sourceSynchronizations(sourceId)` | `startSynchronization` | Start a sync round (`type: Incremental` \| `Full`). Once per round. |
| 3 | `POST` | `/api/v2/knowledge/sources/{sourceId}/synchronizations/{synchronizationId}/uploads` | `uploads(sourceId, synchronizationId)` | `requestUploadUrl` | Request one pre-signed upload URL. Once per file attempt. |
| 4 | `PATCH` | `/api/v2/knowledge/sources/{sourceId}/synchronizations/{synchronizationId}` | `sourceSynchronization(sourceId, synchronizationId)` | `patchSynchronization` | Complete or cancel the round (`status: Completed` \| `Cancelled`). `Completed` only after every file upload has definitely succeeded. |

### Read-only support (4)

Idempotent GETs added in v1.1 to reduce operational risk: discovery,
validation, and recovery (PRODUCT.md §4.2). Discovery/history are gated by
feature flags; per-source get is used for validation throughout.

| # | Method | Path | Builder (`GENESYS_ENDPOINTS.*`) | Client fn | Purpose / flag |
|---|--------|------|----------------------------------|-----------|----------------|
| 5 | `GET` | `/api/v2/knowledge/sources` | `listSources()` | `listSources` | List sources for discovery / rehydration. `ENABLE_SOURCE_DISCOVERY`. |
| 6 | `GET` | `/api/v2/knowledge/sources/{sourceId}` | `source(sourceId)` | `getSource` | Validate a source before sync; detect deleted/wrong-type sources. |
| 7 | `GET` | `/api/v2/knowledge/sources/{sourceId}/synchronizations` | `sourceSynchronizations(sourceId)` | `getSourceSynchronizations` | Per-source sync history. `ENABLE_SOURCE_HISTORY`. |
| 8 | `GET` | `/api/v2/knowledge/sources/{sourceId}/synchronizations/{synchronizationId}` | `sourceSynchronization(sourceId, synchronizationId)` | `getSourceSynchronization` | Verify a specific run for ambiguous-state recovery. |

### Diagnostics-only (1)

| # | Method | Path | Builder (`GENESYS_ENDPOINTS.*`) | Client fn | Purpose / flag |
|---|--------|------|----------------------------------|-----------|----------------|
| 9 | `GET` | `/api/v2/knowledge/sources/synchronizations` | `orgSynchronizations()` | `getOrgSynchronizations` | Organization-wide sync activity for support troubleshooting only. Hidden behind Diagnostics. `ENABLE_ORG_SYNC_DIAGNOSTICS` (default **off**). |

### Feature-flagged lifecycle (2)

Destructive / edit actions on the **source** path. Not required for a good first
production release; default **off** and shown in danger styling (PRODUCT.md §4.4).

| # | Method | Path | Builder (`GENESYS_ENDPOINTS.*`) | Client fn | Flag (default) |
|---|--------|------|----------------------------------|-----------|----------------|
| 10 | `PUT` | `/api/v2/knowledge/sources/{sourceId}` | `source(sourceId)` | `updateSource` | `ENABLE_SOURCE_UPDATE` (**off**). Only the FileUpload-safe `name` field is ever sent. |
| 11 | `DELETE` | `/api/v2/knowledge/sources/{sourceId}` | `source(sourceId)` | `deleteSource` | `ENABLE_SOURCE_DELETE` (**off**). Danger-zone; typed confirmation; blocked during active/ambiguous sync. |

> Note that builders are reused across methods: `source(sourceId)` backs GET /
> PUT / DELETE on a single source, and `sourceSynchronization(...)` backs both
> GET and PATCH on a specific synchronization. Method and feature-flag gating
> distinguish the operations.

Feature flags are defined in
[`src/lib/feature-flags.ts`](../src/lib/feature-flags.ts) and resolved from the
`ENABLE_*` environment variables (see [`.env.example`](../.env.example)).

---

## Excluded / deferred endpoint families

These are valid Genesys APIs but do **not** belong in this product. They expand
permissions and complexity without improving FileUpload source management
(PRODUCT.md §2.3, §2.4). Deferred families may return in a future release behind
an explicit product decision; excluded legacy surface is not planned.

| Family / path fragment | Disposition | Why out of scope |
|------------------------|-------------|------------------|
| `/knowledge/knowledgebases/**` | Excluded | Knowledge Workbench V2: documents, categories, labels, versions, variations, feedback, import/export, parse, synchronize jobs. Article-based, not File Connector. |
| `/knowledge/guest/**` | Excluded | Guest-session document search and feedback events — runtime behavior, not source management. |
| `/knowledge/settings/**` | Excluded | Org Knowledge settings; expands permission surface without helping file-source sync. |
| `/knowledge/documentuploads` | Excluded | Legacy document upload path, superseded by the File Connector sync flow. |
| `/knowledge/connections/**` | Deferred | Fabric connection lifecycle (e.g. SharePoint). FileUpload sources need no external connection. |
| `/knowledge/integrations/**` | Deferred | Connector integration options; provider-specific OAuth/connection complexity. |
| `/knowledge/search` (and preview) | Deferred | Runtime search/preview verification — useful later for smoke tests, not ingestion management. |
| `sources/salesforce`, `sources/servicenow` | Excluded | Salesforce / ServiceNow KB sources are article-based Workbench connector flows, not FileUpload Fabric sources. |

No client in `src/**` may reference any of the above. The only `connectionId` /
`filters` fields the app might ever touch on a source are explicitly out of
scope for manual `FileUpload` sources (PRODUCT.md §4.1).

---

## CI guardrail

A build-failing test enforces the allowlist:

- **Test:** [`src/server/genesys/__tests__/endpoint-scope.test.ts`](../src/server/genesys/__tests__/endpoint-scope.test.ts)
- **Command:** `npm run security:scope`
  (runs `vitest run src/server/genesys/__tests__/endpoint-scope.test.ts`; see
  [`package.json`](../package.json))

The guardrail does two things:

1. **Scans all production source files** under `src/` (recursively, excluding
   `__tests__` directories and `*.test.*` / `*.spec.*` files) and **fails** if
   any `.ts` / `.tsx` file contains one of these forbidden literals:

   | Label | Forbidden pattern |
   |-------|-------------------|
   | Workbench knowledgebases | `/knowledge/knowledgebases` |
   | guest runtime sessions | `/knowledge/guest` |
   | org Knowledge settings | `/knowledge/settings` |
   | legacy document uploads | `/knowledge/documentuploads` |
   | fabric connections | `/knowledge/connections` |
   | connector integrations | `/knowledge/integrations` |
   | runtime search | `/knowledge/search` |
   | Salesforce KB source | `sources/salesforce` |
   | ServiceNow KB source | `sources/servicenow` |

2. **Asserts every in-scope builder targets only `/api/v2/knowledge/sources`** —
   it evaluates each `GENESYS_ENDPOINTS.*` builder and requires the resulting
   path to start with `/api/v2/knowledge/sources`, so no in-scope endpoint can
   drift onto a sibling Knowledge path.

If you believe an endpoint must be added, that is a **product review** decision
(PRODUCT.md §2). Update `GENESYS_ENDPOINTS`, the relevant feature flag, this
matrix, and the guardrail together — never bypass the test to land a new path.
