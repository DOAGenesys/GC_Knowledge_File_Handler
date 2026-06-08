/**
 * Centralized constants shared by client and server.
 *
 * Pure data only — safe to import from any environment. Nothing here reads
 * secrets or performs I/O.
 */

/** Supported File Connector extensions (case-insensitive), per PRODUCT.md §3.2. */
export const SUPPORTED_EXTENSIONS = [
  '.txt',
  '.md',
  '.doc',
  '.docx',
  '.csv',
  '.xls',
  '.xlsx',
  '.html',
  '.pdf',
] as const;

export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

/**
 * Genesys-disallowed characters in upload file names (PRODUCT.md §4.1).
 * Backslash, braces, caret, percent, backtick, brackets, double-quote,
 * angle brackets, hash, and vertical bar.
 */
export const DISALLOWED_FILENAME_CHARS = [
  '\\',
  '{',
  '^',
  '}',
  '%',
  '`',
  ']',
  '"',
  '>',
  '[',
  '~',
  '<',
  '#',
  '|',
] as const;

/** Maximum upload file-name length before a "very long name" warning. */
export const MAX_FILENAME_LENGTH = 180;

/** Default large-file warning threshold (MB) when not configured. */
export const DEFAULT_SIZE_WARN_MB = 50;

/** Default hard cap on number of files per sync round when not configured. */
export const DEFAULT_MAX_SELECTED_FILES = 500;

/**
 * Namespaced, versioned localStorage keys (PRODUCT.md §10.1). No other keys are
 * ever written by the app.
 */
export const STORAGE_KEYS = {
  vault: 'gkfsm:v1:vault',
  vaultMeta: 'gkfsm:v1:vault-meta',
  lock: 'gkfsm:v1:lock',
  crashRecovery: 'gkfsm:v1:crash-recovery',
  /** Non-secret UI theme preference; readable before the vault is unlocked. */
  theme: 'gkfsm:v1:theme',
} as const;

/** Current encrypted-vault schema version (PRODUCT.md §10.2). */
export const VAULT_SCHEMA_VERSION = 2;

/** KDF parameters for the vault (PRODUCT.md §10.2). */
export const VAULT_KDF = {
  name: 'PBKDF2-SHA-256',
  hash: 'SHA-256',
  iterations: 300_000,
  saltBytes: 16,
  ivBytes: 12,
  keyLengthBits: 256,
} as const;

/**
 * In-scope Genesys Knowledge endpoints. These are the ONLY Knowledge paths the
 * app is permitted to call (PRODUCT.md §4). The endpoint-scope guardrail test
 * asserts that no client targets a path outside this allowlist.
 */
export const GENESYS_KNOWLEDGE_BASE = '/api/v2/knowledge';

export const GENESYS_ENDPOINTS = {
  /** GET — list sources (read-only, ENABLE_SOURCE_DISCOVERY). */
  listSources: () => `${GENESYS_KNOWLEDGE_BASE}/sources`,
  /** POST — create a FileUpload source (ENABLE_SOURCE_CREATION). */
  createSource: () => `${GENESYS_KNOWLEDGE_BASE}/sources`,
  /** GET/PUT/DELETE — a specific source. */
  source: (sourceId: string) => `${GENESYS_KNOWLEDGE_BASE}/sources/${sourceId}`,
  /** GET — synchronizations of a source (read-only, ENABLE_SOURCE_HISTORY). */
  sourceSynchronizations: (sourceId: string) =>
    `${GENESYS_KNOWLEDGE_BASE}/sources/${sourceId}/synchronizations`,
  /** GET/PATCH — a specific synchronization of a source. */
  sourceSynchronization: (sourceId: string, synchronizationId: string) =>
    `${GENESYS_KNOWLEDGE_BASE}/sources/${sourceId}/synchronizations/${synchronizationId}`,
  /** POST — request an upload URL within a synchronization. */
  uploads: (sourceId: string, synchronizationId: string) =>
    `${GENESYS_KNOWLEDGE_BASE}/sources/${sourceId}/synchronizations/${synchronizationId}/uploads`,
  /** GET — org-wide synchronizations (diagnostics-only, ENABLE_ORG_SYNC_DIAGNOSTICS). */
  orgSynchronizations: () => `${GENESYS_KNOWLEDGE_BASE}/sources/synchronizations`,
} as const;

/** OAuth token endpoint path (region host prefixed at call time). */
export const GENESYS_TOKEN_PATH = '/oauth/token';

/** App brand strings. */
export const APP_NAME = 'Knowledge Fabric File Sync Manager';
export const APP_SHORT_NAME = 'Sync Manager';

/** Public path to the Genesys wordmark (served from /public/images). */
export const GENESYS_LOGO_SRC = '/images/Genesys_logo.png';

/** Genesys source `type` value this product manages. */
export const FILE_UPLOAD_SOURCE_TYPE = 'FileUpload';
