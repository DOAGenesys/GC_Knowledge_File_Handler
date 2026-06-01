# Storage model

Local persistence and the database-free invariant for the Genesys Knowledge Fabric File Sync Manager.

This app has **no application database**. It never provisions or imports PostgreSQL, MySQL,
Redis, Vercel KV/Postgres/Blob, S3, Firebase, Supabase, or IndexedDB. The only places state
lives are:

| Store | Holds | Authority |
|---|---|---|
| Encrypted browser `localStorage` vault | Non-secret source registry, run summaries, file metadata, preferences | App-owned local state |
| Vercel Workflow run state | Durable orchestration / event state for an in-flight sync | Managed by the Workflow SDK |
| Genesys Cloud | Knowledge sources, synchronizations, ingested files | Authoritative remote state |

Everything the app itself persists goes through the encrypted vault. Genesys secrets and tokens
exist only server-side (Vercel environment variables / server memory) and are never written to
the browser. See `PRODUCT.md` §5.2–§5.3 and §10.

---

## localStorage keys

The app writes **only** the namespaced, versioned keys defined in
`src/lib/constants.ts` (`STORAGE_KEYS`). No other key is ever written.

| Key | Constant | Contents | Encrypted? |
|---|---|---|---|
| `gkfsm:v1:vault` | `STORAGE_KEYS.vault` | The sealed AES-GCM envelope (all app data) | Yes (ciphertext) |
| `gkfsm:v1:vault-meta` | `STORAGE_KEYS.vaultMeta` | Non-secret metadata: `{ schemaVersion, updatedAt }` for fast availability checks | No (non-secret) |
| `gkfsm:v1:lock` | `STORAGE_KEYS.lock` | Short-lived local coordination lock, no secrets | No (non-secret) |
| `gkfsm:v1:crash-recovery` | `STORAGE_KEYS.crashRecovery` | Minimal pointer to last active run, if needed | No (non-secret) |
| `gkfsm:v1:theme` | `STORAGE_KEYS.theme` | UI theme preference, readable **before** the vault is unlocked | No (non-secret) |

The `theme` key exists outside the vault so the correct light/dark theme can render on the
lock screen. (A `theme` preference is also stored inside the encrypted vault under
`preferences.theme`; the unencrypted key is the pre-unlock fallback only.)

The storage adapter `src/lib/vault/storage.ts` is the single writer. `clearAll()` iterates
`Object.values(STORAGE_KEYS)` and removes every app-managed key — it cannot leave stray keys
behind. `isStorageAvailable()` probes a throwaway `__gkfsm_probe__` key (immediately removed) to
detect private-mode / quota conditions.

---

## Encrypted vault envelope

The vault is a single JSON envelope (`VaultEnvelope` in `src/lib/vault/crypto.ts`) stored under
`gkfsm:v1:vault`. It uses WebCrypto **AES-GCM** for confidentiality + integrity, with the key
derived from the user's passphrase via **PBKDF2-SHA-256**.

### Envelope shape

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

### KDF / cipher parameters

Parameters come from `VAULT_KDF` and `VAULT_SCHEMA_VERSION` in `src/lib/constants.ts`:

| Parameter | Value | Notes |
|---|---|---|
| KDF | `PBKDF2-SHA-256` | `name: 'PBKDF2-SHA-256'`, `hash: 'SHA-256'` |
| Iterations | `300_000` | Persisted in the envelope's `kdf.iterations` |
| Salt | 16 bytes (`saltBytes`) | Random per vault; persisted as base64 in `kdf.salt` |
| IV / nonce | 12 bytes (`ivBytes`) | **Fresh random IV per encryption**; persisted in `cipher.iv` |
| Key length | 256 bits (`keyLengthBits`) | AES-GCM key |
| Schema version | `VAULT_SCHEMA_VERSION = 2` | Persisted in `schemaVersion` |

### Security properties (enforced in `crypto.ts`)

- The passphrase-derived key is an AES-GCM `CryptoKey` produced with `deriveKey` (not
  `deriveBits`), with `extractable: false` — the raw key bytes are never exposed.
- The derived key lives **only in memory** on the unlocked `VaultSession`
  (`src/lib/vault/index.ts`). Locking drops the instance and the key.
- The GCM auth tag is implicit (appended to the ciphertext). Decryption throws
  `WrongPassphraseError` on a wrong passphrase or any tamper; `CorruptVaultError` on a
  malformed envelope or non-JSON plaintext.
- Only ciphertext and **non-secret** KDF metadata (salt, iterations) are stored. `assertEnvelope`
  validates envelope shape before trusting it.

`writeEnvelope()` maps a browser `QuotaExceededError` / `NS_ERROR_DOM_QUOTA_REACHED` to a typed
`QuotaExceededError` so the UI can prompt the user to export and clear old data.

---

## What MAY be persisted

Only **non-secret** app metadata, encrypted inside the vault. The decrypted payload is
`VaultData` (`src/lib/types.ts`), mirroring `PRODUCT.md` §11 / §10.3:

- Source registry (`SourceRecord[]`): `sourceId`, display name, source type, compatibility flag,
  `createdByApp`, last-known remote status / last-sync summary, `localOnly` flag, archived flag,
  notes, timestamps.
- Sync run records (`SyncRunRecord[]`): `workflowRunId`, `synchronizationId`, sync type, run
  `status` (a `RunState`), file/uploaded/failed/skipped/needs-action counts, redacted
  `errorSummary`, timestamps.
- File records (`FileRecord[]`) — **metadata only, never bytes**: original name, sanitized upload
  name, extension, MIME `contentType`, `contentLength`, `lastModified`, `sha256Base64` (local
  fingerprint), `contentMd5Base64` (Genesys integrity), optional `originUri` / `tags` / `metadata`,
  per-file `uploadStatus` (`FileState`), attempt count, redacted last error.
- Preferences (`Preferences`): `defaultSyncType`, `sizeWarnMb`, `uploadMode`, `autoRename`,
  `redactNames`, `theme`.
- Install metadata: `installId`, `schemaVersion`, `createdAt`, `updatedAt`.

## What must NEVER be persisted

Per `PRODUCT.md` §5.3 / §10.4, the following must **never** appear in any `localStorage` key
(encrypted or not), and are kept server-side / in-memory only:

- Genesys client secret, access token, or refresh token.
- The admin password / session secret.
- Pre-signed Genesys upload URLs and their signed upload headers (the `GenesysUploadTicket.url`
  and `.headers` in `src/lib/types.ts` are bearer secrets — flow through the browser transiently,
  never stored).
- Raw file bytes.
- File previews or extracted text.
- Full unredacted API errors that could carry tokens, signatures, or internal details (only
  redacted summaries / error codes are stored).

`localStorage` is readable by any JavaScript in the origin, so a successful XSS can read it.
Encryption is **defense-in-depth, not permission to store secrets** — the vault is not a security
boundary against active XSS.

---

## Architectural guardrails

Two automated guardrails fail the build if the database-free / endpoint-scope invariants are
violated.

### `no-restricted-imports` (no persistence layers)

`eslint.config.mjs` bans importing any disallowed storage/persistence package anywhere under
`src/**/*.{ts,tsx}`. Each ban points back to this document. Banned modules:

| Category | Banned modules |
|---|---|
| SQL / ORM | `@prisma/client`, `prisma`, `pg`, `mysql2`, `@vercel/postgres` |
| Cache / KV | `redis`, `ioredis`, `@vercel/kv` |
| Object / blob storage | `@vercel/blob`, `@aws-sdk/client-s3` |
| BaaS | `firebase`, `firebase-admin`, `@supabase/supabase-js` |
| Browser IndexedDB | `idb`, `idb-keyval` |

This enforces "Allowed persistence = encrypted localStorage vault + Vercel Workflow run state +
Genesys" by construction.

### Endpoint-scope test

`src/server/genesys/__tests__/endpoint-scope.test.ts` scans every production `.ts`/`.tsx` file
under `src/` (excluding `__tests__` and `.test`/`.spec` files) and:

- Fails if any file references an out-of-scope Knowledge family: `/knowledge/knowledgebases`,
  `/knowledge/guest`, `/knowledge/settings`, `/knowledge/documentuploads`,
  `/knowledge/connections`, `/knowledge/integrations`, `/knowledge/search`, `sources/salesforce`,
  or `sources/servicenow`.
- Asserts every builder in `GENESYS_ENDPOINTS` (`src/lib/constants.ts`) produces a path under
  `/api/v2/knowledge/sources`. These builders are the **only** Knowledge paths the app may call
  (list/create/get source, source synchronizations, specific synchronization, uploads, and the
  diagnostics-only org-wide synchronizations endpoint).

---

## Migration, export/import, and clear

### Migration framework

`src/lib/vault/migrations.ts` runs ordered, sequential migrations on unlock. Each `Migration`
takes data at version `to - 1` and returns version `to`. The current chain:

- **v1 → v2**: backfills `installId` and merges `preferences` with `DEFAULT_PREFERENCES` (adding
  `theme`), then sets `schemaVersion: 2`.

`migrateVaultData()` throws `UnknownSchemaError` if the stored `schemaVersion` is **newer** than
`VAULT_SCHEMA_VERSION` (forward-incompatible vault from a newer app build), and defensively
normalizes the result so missing arrays/fields are backfilled. On unlock
(`VaultSession.unlock`), if any migration ran the migrated form is immediately re-persisted; the
original envelope is the implicit backup until the migrated write succeeds.

### Export / import

- **Export** (`VaultSession.export()` / `exportEnvelopeString()`): returns the raw encrypted
  envelope string from `gkfsm:v1:vault` verbatim. The export is ciphertext only — safe to back up,
  useless without the passphrase. Used before clearing browser data (`PRODUCT.md` §12.7).
- **Import** (`VaultSession.import(envelopeString, passphrase)`): parses and shape-validates the
  envelope (`assertEnvelope`), derives the key from the supplied passphrase, decrypts, migrates,
  then persists — replacing the current vault. A bad JSON payload throws `CorruptVaultError`; a
  wrong passphrase throws `WrongPassphraseError`.
- **Change passphrase** (`VaultSession.changePassphrase`): generates a fresh salt, re-derives the
  key, and re-encrypts in place.

### Clear local data

`clearLocalData()` → `clearAll()` removes every key in `STORAGE_KEYS` (vault, vault-meta, lock,
crash-recovery, theme). This is destructive and unrecoverable without a prior export — the UI
gates it behind explicit confirmation (`PRODUCT.md` §12.7). Because all app state is browser-local,
clearing local data (or losing the device) loses any source that is `localOnly` and cannot be
rediscovered via Genesys.
