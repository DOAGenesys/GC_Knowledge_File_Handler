/**
 * Vault cryptography (PRODUCT.md §10.2). WebCrypto AES-GCM with a PBKDF2-SHA-256
 * derived key. Pure functions — no DOM, no localStorage — so they run under the
 * node test environment using the platform Web Crypto API.
 *
 * Security properties:
 *  - The passphrase-derived key is an AES-GCM CryptoKey; the raw key bytes are
 *    never exposed (deriveKey, not deriveBits).
 *  - A unique random IV is generated for every encryption.
 *  - The GCM authentication tag is implicit (appended to the ciphertext);
 *    decryption throws if the ciphertext or tag is tampered with, or if the
 *    passphrase is wrong.
 *  - Only ciphertext and non-secret KDF metadata (salt, iterations) are stored.
 */
import { VAULT_KDF, VAULT_SCHEMA_VERSION } from '../constants';

export interface VaultEnvelope {
  version: number;
  createdAt: string;
  updatedAt: string;
  kdf: {
    name: 'PBKDF2-SHA-256';
    iterations: number;
    salt: string;
  };
  cipher: {
    name: 'AES-GCM';
    iv: string;
    ciphertext: string;
    authTagImplicit: true;
  };
  schemaVersion: number;
}

function toBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }
  return Buffer.from(bytes).toString('base64');
}

export function fromBase64(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** Derive an AES-GCM key from a passphrase + salt using PBKDF2-SHA-256. */
export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = VAULT_KDF.iterations,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: VAULT_KDF.hash },
    baseKey,
    { name: 'AES-GCM', length: VAULT_KDF.keyLengthBits },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Generate a fresh random KDF salt. */
export function newSalt(): Uint8Array {
  return randomBytes(VAULT_KDF.saltBytes);
}

/** Encrypt arbitrary JSON-serializable data into a sealed envelope. */
export async function sealEnvelope(
  key: CryptoKey,
  salt: Uint8Array,
  data: unknown,
  createdAt: string,
): Promise<VaultEnvelope> {
  const iv = randomBytes(VAULT_KDF.ivBytes);
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plaintext),
  );
  const now = new Date().toISOString();
  return {
    version: 1,
    createdAt,
    updatedAt: now,
    kdf: { name: 'PBKDF2-SHA-256', iterations: VAULT_KDF.iterations, salt: toBase64(salt) },
    cipher: {
      name: 'AES-GCM',
      iv: toBase64(iv),
      ciphertext: toBase64(ciphertext),
      authTagImplicit: true,
    },
    schemaVersion: VAULT_SCHEMA_VERSION,
  };
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('Decryption failed — incorrect passphrase or corrupt vault.');
    this.name = 'WrongPassphraseError';
  }
}

export class CorruptVaultError extends Error {
  constructor(detail: string) {
    super(`Vault envelope is malformed: ${detail}`);
    this.name = 'CorruptVaultError';
  }
}

/** Validate the shape of a parsed envelope without trusting its contents. */
export function assertEnvelope(value: unknown): asserts value is VaultEnvelope {
  if (!value || typeof value !== 'object') throw new CorruptVaultError('not an object');
  const v = value as Record<string, unknown>;
  const kdf = v.kdf as Record<string, unknown> | undefined;
  const cipher = v.cipher as Record<string, unknown> | undefined;
  if (!kdf || typeof kdf.salt !== 'string' || typeof kdf.iterations !== 'number') {
    throw new CorruptVaultError('missing kdf');
  }
  if (!cipher || typeof cipher.iv !== 'string' || typeof cipher.ciphertext !== 'string') {
    throw new CorruptVaultError('missing cipher');
  }
}

/** Derive the key for an existing envelope (using its stored salt/iterations). */
export async function deriveKeyForEnvelope(
  passphrase: string,
  envelope: VaultEnvelope,
): Promise<CryptoKey> {
  return deriveKey(passphrase, fromBase64(envelope.kdf.salt), envelope.kdf.iterations);
}

/** Decrypt an envelope. Throws WrongPassphraseError on auth failure/tamper. */
export async function openEnvelope<T>(key: CryptoKey, envelope: VaultEnvelope): Promise<T> {
  assertEnvelope(envelope);
  const iv = fromBase64(envelope.cipher.iv);
  const ciphertext = fromBase64(envelope.cipher.ciphertext);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource,
    );
  } catch {
    throw new WrongPassphraseError();
  }
  try {
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    throw new CorruptVaultError('decrypted payload is not valid JSON');
  }
}

export const __testing = { toBase64, fromBase64 };
