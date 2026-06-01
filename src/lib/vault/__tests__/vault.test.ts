// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CorruptVaultError,
  VaultSession,
  WrongPassphraseError,
  clearLocalData,
  hasVault,
} from '../index';
import { STORAGE_KEYS } from '../../constants';
import { migrateVaultData, UnknownSchemaError } from '../migrations';

beforeEach(() => {
  localStorage.clear();
});

describe('VaultSession', () => {
  it('creates an empty vault and persists an encrypted envelope', async () => {
    const session = await VaultSession.create('correct horse battery staple');
    expect(hasVault()).toBe(true);
    const snap = session.snapshot();
    expect(snap.sourceRegistry).toEqual([]);
    expect(snap.syncRuns).toEqual([]);

    // The stored envelope must be ciphertext, not plaintext data.
    const raw = localStorage.getItem(STORAGE_KEYS.vault)!;
    expect(raw).not.toContain('sourceRegistry');
    const env = JSON.parse(raw);
    expect(env.cipher.name).toBe('AES-GCM');
    expect(typeof env.cipher.ciphertext).toBe('string');
  });

  it('round-trips data through lock (drop) and unlock', async () => {
    const session = await VaultSession.create('pw-123456');
    await session.update((d) => {
      d.preferences.theme = 'dark';
      d.sourceRegistry.push({
        localSourceKey: 'k1',
        sourceId: 'a7f3c9e2-1b44-4d8a-9c21-6e0f2b8d4a11',
        displayName: 'Support KB',
        sourceType: 'FileUpload',
        remoteName: 'Support KB',
        remoteStatus: 'Active',
        isCompatibleFileUploadSource: true,
        createdByApp: true,
        dateAddedToVault: Date.now(),
        lastValidatedAt: null,
        lastRemoteSyncAt: null,
        lastUsedAt: null,
        lastSyncRunId: null,
        archived: false,
      });
    });

    const reopened = await VaultSession.unlock('pw-123456');
    const snap = reopened.snapshot();
    expect(snap.preferences.theme).toBe('dark');
    expect(snap.sourceRegistry).toHaveLength(1);
    expect(snap.sourceRegistry[0]!.displayName).toBe('Support KB');
  });

  it('rejects the wrong passphrase without revealing data', async () => {
    await VaultSession.create('right-passphrase');
    await expect(VaultSession.unlock('wrong-passphrase')).rejects.toBeInstanceOf(
      WrongPassphraseError,
    );
  });

  it('fails closed when the ciphertext is tampered with', async () => {
    await VaultSession.create('pw-abcdef');
    const env = JSON.parse(localStorage.getItem(STORAGE_KEYS.vault)!);
    // Flip a character in the ciphertext.
    const ct: string = env.cipher.ciphertext;
    env.cipher.ciphertext = (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1);
    localStorage.setItem(STORAGE_KEYS.vault, JSON.stringify(env));
    await expect(VaultSession.unlock('pw-abcdef')).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it('detects a structurally corrupt envelope', async () => {
    localStorage.setItem(STORAGE_KEYS.vault, JSON.stringify({ not: 'a vault' }));
    await expect(VaultSession.unlock('whatever')).rejects.toBeInstanceOf(CorruptVaultError);
  });

  it('exports and re-imports the encrypted blob', async () => {
    const session = await VaultSession.create('export-pw');
    await session.update((d) => d.sourceRegistry.push(makeSource()));
    const blob = session.export();

    clearLocalData();
    expect(hasVault()).toBe(false);

    const imported = await VaultSession.import(blob, 'export-pw');
    expect(imported.snapshot().sourceRegistry).toHaveLength(1);
    expect(hasVault()).toBe(true);
  });

  it('changes the passphrase and re-encrypts', async () => {
    const session = await VaultSession.create('old-pw');
    await session.changePassphrase('new-pw-stronger');
    await expect(VaultSession.unlock('old-pw')).rejects.toBeInstanceOf(WrongPassphraseError);
    const reopened = await VaultSession.unlock('new-pw-stronger');
    expect(reopened.isUnlocked()).toBe(true);
  });

  it('uses a unique IV per encryption', async () => {
    const session = await VaultSession.create('iv-pw');
    const iv1 = JSON.parse(localStorage.getItem(STORAGE_KEYS.vault)!).cipher.iv;
    await session.update((d) => (d.preferences.sizeWarnMb = 99));
    const iv2 = JSON.parse(localStorage.getItem(STORAGE_KEYS.vault)!).cipher.iv;
    expect(iv1).not.toBe(iv2);
  });
});

describe('vault migrations', () => {
  it('migrates a v1 payload up to the current schema', () => {
    const { data, migrated } = migrateVaultData({
      schemaVersion: 1,
      sourceRegistry: [],
      syncRuns: [],
    });
    expect(migrated).toBe(true);
    expect(data.schemaVersion).toBe(2);
    expect(data.installId).toBeTruthy();
    expect(data.preferences.theme).toBeDefined();
  });

  it('does not downgrade an unknown future schema', () => {
    expect(() => migrateVaultData({ schemaVersion: 999 })).toThrow(UnknownSchemaError);
  });
});

function makeSource() {
  return {
    localSourceKey: 'k2',
    sourceId: 'c1d8b4a0-77e2-4f19-bb3c-90a1e7c2f558',
    displayName: 'Billing KB',
    sourceType: 'FileUpload' as const,
    remoteName: 'Billing KB',
    remoteStatus: 'Idle' as const,
    isCompatibleFileUploadSource: true,
    createdByApp: false,
    dateAddedToVault: Date.now(),
    lastValidatedAt: null,
    lastRemoteSyncAt: null,
    lastUsedAt: null,
    lastSyncRunId: null,
    archived: false,
  };
}
