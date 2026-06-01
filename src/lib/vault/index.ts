/**
 * Vault session manager — the single entry point the UI uses for the encrypted
 * local store. Holds the derived AES-GCM key ONLY in memory; locking drops it.
 *
 * All persistence flows through here, so the database-free / no-secrets
 * invariants live in one place.
 */
import { uuid } from '../ids';
import type { VaultData } from '../types';
import {
  CorruptVaultError,
  deriveKey,
  deriveKeyForEnvelope,
  newSalt,
  openEnvelope,
  sealEnvelope,
  assertEnvelope,
  type VaultEnvelope,
} from './crypto';
import { emptyVaultData, migrateVaultData } from './migrations';
import { clearAll, readEnvelope, writeEnvelope, exportEnvelopeString } from './storage';

export { WrongPassphraseError, CorruptVaultError } from './crypto';
export {
  StorageUnavailableError,
  QuotaExceededError,
  hasVault,
  isStorageAvailable,
} from './storage';
export type { VaultEnvelope } from './crypto';

function fromBase64(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/**
 * An unlocked vault session. The CryptoKey and decrypted data live only on this
 * instance; dropping the instance (lock) clears them.
 */
export class VaultSession {
  private constructor(
    private key: CryptoKey,
    private salt: Uint8Array,
    private readonly createdAt: string,
    private data: VaultData,
  ) {}

  /** Create a brand-new vault with the given passphrase. */
  static async create(passphrase: string): Promise<VaultSession> {
    const salt = newSalt();
    const key = await deriveKey(passphrase, salt);
    const createdAt = new Date().toISOString();
    const data = emptyVaultData(Date.now());
    const envelope = await sealEnvelope(key, salt, data, createdAt);
    writeEnvelope(envelope);
    return new VaultSession(key, salt, createdAt, data);
  }

  /** Unlock the stored vault. Throws WrongPassphraseError / CorruptVaultError. */
  static async unlock(passphrase: string): Promise<VaultSession> {
    const envelope = readEnvelope();
    if (envelope === null) throw new CorruptVaultError('no vault present or unreadable');
    assertEnvelope(envelope);
    const key = await deriveKeyForEnvelope(passphrase, envelope);
    const raw = await openEnvelope<unknown>(key, envelope);
    const { data, migrated } = migrateVaultData(raw);
    const salt = fromBase64(envelope.kdf.salt);
    const session = new VaultSession(key, salt, envelope.createdAt, data);
    if (migrated) await session.persist();
    return session;
  }

  isUnlocked(): boolean {
    return true;
  }

  /** Read-only snapshot of the decrypted data. */
  snapshot(): VaultData {
    return structuredClone(this.data);
  }

  /** Apply a synchronous mutation and persist the re-encrypted envelope. */
  async update(mutator: (draft: VaultData) => void): Promise<VaultData> {
    const draft = structuredClone(this.data);
    mutator(draft);
    draft.updatedAt = Date.now();
    this.data = draft;
    await this.persist();
    return structuredClone(this.data);
  }

  private async persist(): Promise<void> {
    const envelope = await sealEnvelope(this.key, this.salt, this.data, this.createdAt);
    writeEnvelope(envelope);
  }

  /**
   * Verify a candidate passphrase against the persisted envelope by attempting
   * to derive+decrypt with it. Used to confirm the current passphrase before a
   * passphrase change.
   */
  async verifyPassphrase(passphrase: string): Promise<boolean> {
    const envelope = readEnvelope();
    if (!envelope) return false;
    try {
      assertEnvelope(envelope);
      const key = await deriveKeyForEnvelope(passphrase, envelope);
      await openEnvelope<unknown>(key, envelope);
      return true;
    } catch {
      return false;
    }
  }

  /** Re-derive the key from a new passphrase and re-encrypt the vault. */
  async changePassphrase(newPassphrase: string): Promise<void> {
    const salt = newSalt();
    this.key = await deriveKey(newPassphrase, salt);
    this.salt = salt;
    await this.persist();
  }

  /** The raw encrypted envelope string, safe to back up. */
  export(): string {
    return exportEnvelopeString() ?? '';
  }

  /**
   * Import an encrypted envelope using its passphrase, replacing the current
   * vault after successful decryption + migration.
   */
  static async import(envelopeString: string, passphrase: string): Promise<VaultSession> {
    let envelope: VaultEnvelope;
    try {
      envelope = JSON.parse(envelopeString) as VaultEnvelope;
    } catch {
      throw new CorruptVaultError('import payload is not valid JSON');
    }
    assertEnvelope(envelope);
    const key = await deriveKeyForEnvelope(passphrase, envelope);
    const raw = await openEnvelope<unknown>(key, envelope);
    const { data } = migrateVaultData(raw);
    const salt = fromBase64(envelope.kdf.salt);
    const session = new VaultSession(key, salt, envelope.createdAt, data);
    await session.persist();
    return session;
  }
}

/** Permanently clear all local data (after the user confirms). */
export function clearLocalData(): void {
  clearAll();
}

/** Generate a new install id (used when seeding ephemeral state). */
export function newInstallId(): string {
  return uuid();
}
