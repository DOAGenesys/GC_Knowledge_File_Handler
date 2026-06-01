/**
 * localStorage adapter for the encrypted vault (PRODUCT.md §10.1).
 *
 * Writes ONLY the four namespaced keys. The vault key holds the encrypted
 * envelope; vault-meta holds non-secret KDF metadata for fast availability
 * checks. Never stores plaintext app data, secrets, tokens, URLs, or bytes.
 */
import { STORAGE_KEYS } from '../constants';
import type { VaultEnvelope } from './crypto';

export class StorageUnavailableError extends Error {
  constructor() {
    super('Browser localStorage is unavailable. The app runs in ephemeral mode.');
    this.name = 'StorageUnavailableError';
  }
}

export class QuotaExceededError extends Error {
  constructor() {
    super('Local storage quota exceeded. Export and clear old data to continue.');
    this.name = 'QuotaExceededError';
  }
}

function ls(): Storage {
  if (typeof window === 'undefined' || !window.localStorage) throw new StorageUnavailableError();
  return window.localStorage;
}

/** Probe whether localStorage can actually be written (private mode/quota). */
export function isStorageAvailable(): boolean {
  try {
    const probe = '__gkfsm_probe__';
    const store = ls();
    store.setItem(probe, '1');
    store.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function readEnvelope(): VaultEnvelope | null {
  const raw = ls().getItem(STORAGE_KEYS.vault);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VaultEnvelope;
  } catch {
    // Corrupt JSON is surfaced by the caller as a corrupt-vault state.
    return JSON.parse('null');
  }
}

export function hasVault(): boolean {
  try {
    return ls().getItem(STORAGE_KEYS.vault) != null;
  } catch {
    return false;
  }
}

export function writeEnvelope(envelope: VaultEnvelope): void {
  try {
    const store = ls();
    store.setItem(STORAGE_KEYS.vault, JSON.stringify(envelope));
    store.setItem(
      STORAGE_KEYS.vaultMeta,
      JSON.stringify({ schemaVersion: envelope.schemaVersion, updatedAt: envelope.updatedAt }),
    );
  } catch (err) {
    if (err instanceof StorageUnavailableError) throw err;
    if (
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    ) {
      throw new QuotaExceededError();
    }
    throw err;
  }
}

/** Remove every app-managed key (clear local data, PRODUCT.md §12.7). */
export function clearAll(): void {
  const store = ls();
  for (const key of Object.values(STORAGE_KEYS)) store.removeItem(key);
}

/** Read the raw envelope string for export. */
export function exportEnvelopeString(): string | null {
  return ls().getItem(STORAGE_KEYS.vault);
}
