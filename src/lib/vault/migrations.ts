/**
 * Vault schema migration framework (Block 4). Migrations run sequentially on
 * unlock; the caller backs up the pre-migration envelope and only persists the
 * migrated form after every step succeeds, rolling back on failure.
 */
import { VAULT_SCHEMA_VERSION } from '../constants';
import { DEFAULT_PREFERENCES, type VaultData } from '../types';
import { uuid } from '../ids';

type AnyData = Record<string, unknown>;

interface Migration {
  to: number;
  migrate: (data: AnyData) => AnyData;
}

/**
 * Ordered migrations. Each takes data at version `to - 1` and returns `to`.
 * v1→v2 backfills the `preferences.theme` field and the `installId`.
 */
const MIGRATIONS: Migration[] = [
  {
    to: 2,
    migrate: (data) => {
      const prefs = (data.preferences as AnyData | undefined) ?? {};
      return {
        ...data,
        installId: (data.installId as string | undefined) ?? uuid(),
        preferences: { ...DEFAULT_PREFERENCES, ...prefs },
        schemaVersion: 2,
      };
    },
  },
];

export class UnknownSchemaError extends Error {
  constructor(version: number) {
    super(
      `Vault schema version ${version} is newer than this app supports (${VAULT_SCHEMA_VERSION}).`,
    );
    this.name = 'UnknownSchemaError';
  }
}

/**
 * Migrate raw decrypted data up to the current schema version. Returns the
 * migrated data and whether any migration ran (so the caller can re-persist).
 */
export function migrateVaultData(raw: unknown): { data: VaultData; migrated: boolean } {
  const data = (raw && typeof raw === 'object' ? { ...(raw as AnyData) } : {}) as AnyData;
  let version = typeof data.schemaVersion === 'number' ? data.schemaVersion : 1;

  if (version > VAULT_SCHEMA_VERSION) throw new UnknownSchemaError(version);

  let current = data;
  let migrated = false;
  for (const step of MIGRATIONS) {
    if (version < step.to) {
      current = step.migrate(current);
      version = step.to;
      migrated = true;
    }
  }

  // Backfill required structure defensively.
  const normalized: VaultData = {
    schemaVersion: VAULT_SCHEMA_VERSION,
    installId: (current.installId as string | undefined) ?? uuid(),
    createdAt: (current.createdAt as number | undefined) ?? Date.now(),
    updatedAt: (current.updatedAt as number | undefined) ?? Date.now(),
    sourceRegistry: Array.isArray(current.sourceRegistry)
      ? (current.sourceRegistry as VaultData['sourceRegistry'])
      : [],
    syncRuns: Array.isArray(current.syncRuns) ? (current.syncRuns as VaultData['syncRuns']) : [],
    preferences: { ...DEFAULT_PREFERENCES, ...(current.preferences as object | undefined) },
  };

  return { data: normalized, migrated };
}

/** A fresh, empty vault payload for a brand-new install. */
export function emptyVaultData(now: number): VaultData {
  return {
    schemaVersion: VAULT_SCHEMA_VERSION,
    installId: uuid(),
    createdAt: now,
    updatedAt: now,
    sourceRegistry: [],
    syncRuns: [],
    preferences: { ...DEFAULT_PREFERENCES },
  };
}
