import '@testing-library/jest-dom/vitest';
import { webcrypto } from 'node:crypto';

// Ensure the platform Web Crypto API (with SubtleCrypto) is reachable as the
// global `crypto` even under the jsdom environment, which does not implement
// SubtleCrypto. Node's webcrypto is a complete implementation.
const existing = (globalThis as { crypto?: Crypto }).crypto;
if (!existing || !existing.subtle) {
  try {
    Object.defineProperty(globalThis, 'crypto', {
      value: webcrypto as unknown as Crypto,
      configurable: true,
      writable: true,
    });
  } catch {
    // If the environment exposes a non-configurable crypto without subtle,
    // patch just the subtle/getRandomValues members.
    try {
      (globalThis.crypto as unknown as { subtle: SubtleCrypto }).subtle =
        webcrypto.subtle as unknown as SubtleCrypto;
    } catch {
      /* best effort */
    }
  }
}
