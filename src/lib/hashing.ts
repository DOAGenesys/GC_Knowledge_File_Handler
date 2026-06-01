/**
 * Browser file hashing pipeline (Block 10).
 *
 * Streams a Blob/File chunk-by-chunk through incremental SHA-256 (local
 * fingerprint) and MD5 (Genesys `contentMd5` integrity), reporting progress and
 * honouring an AbortSignal. The whole file is never held in memory — only the
 * current chunk — so large files are safe when processed with bounded
 * concurrency.
 */
import { Md5, bytesToBase64, bytesToHex } from './md5';
import { Sha256 } from './sha256';

export interface HashResult {
  contentLength: number;
  sha256Base64: string;
  sha256Hex: string;
  md5Base64: string;
}

export interface HashOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Chunk size in bytes (default 1 MiB). */
  chunkSize?: number;
}

const DEFAULT_CHUNK = 1024 * 1024;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Hashing aborted', 'AbortError');
  }
}

/**
 * Hash a Blob/File. Uses the streaming reader when available, falling back to a
 * sliced ArrayBuffer read so it also works in test environments without
 * `Blob.prototype.stream`.
 */
export async function hashBlob(blob: Blob, options: HashOptions = {}): Promise<HashResult> {
  const { onProgress, signal, chunkSize = DEFAULT_CHUNK } = options;
  const md5 = new Md5();
  const sha = new Sha256();
  const total = blob.size;
  let processed = 0;

  const consume = (chunk: Uint8Array): void => {
    md5.update(chunk);
    sha.update(chunk);
    processed += chunk.length;
    onProgress?.(total === 0 ? 1 : processed / total);
  };

  throwIfAborted(signal);

  if (typeof blob.stream === 'function') {
    const reader = blob.stream().getReader();
    try {
      for (;;) {
        throwIfAborted(signal);
        const { done, value } = await reader.read();
        if (done) break;
        if (value) consume(value instanceof Uint8Array ? value : new Uint8Array(value));
      }
    } finally {
      reader.releaseLock?.();
    }
  } else {
    for (let offset = 0; offset < total; offset += chunkSize) {
      throwIfAborted(signal);
      const slice = blob.slice(offset, Math.min(offset + chunkSize, total));
      const buf = new Uint8Array(await slice.arrayBuffer());
      consume(buf);
    }
    if (total === 0) onProgress?.(1);
  }

  const shaBytes = sha.digest();
  return {
    contentLength: total,
    sha256Base64: bytesToBase64(shaBytes),
    sha256Hex: bytesToHex(shaBytes),
    md5Base64: bytesToBase64(md5.digest()),
  };
}

export interface ReselectCandidate {
  name: string;
  size: number;
  lastModified: number;
  sha256Base64?: string | null;
}

export type ReselectMatch =
  | { match: true; method: 'sha256'; confident: true }
  | { match: true; method: 'metadata'; confident: false }
  | { match: false; reason: string };

/**
 * Decide whether a reselected file corresponds to a pending file. SHA-256 is
 * authoritative when both fingerprints are known; otherwise fall back to
 * name + size + lastModified with an explicit low-confidence flag (PRODUCT.md
 * §7.6 / Block 10).
 */
export function matchReselectedFile(
  expected: ReselectCandidate,
  actual: ReselectCandidate,
): ReselectMatch {
  if (expected.sha256Base64 && actual.sha256Base64) {
    return expected.sha256Base64 === actual.sha256Base64
      ? { match: true, method: 'sha256', confident: true }
      : { match: false, reason: 'SHA-256 fingerprint does not match the original file.' };
  }
  const sameMeta =
    expected.name === actual.name &&
    expected.size === actual.size &&
    expected.lastModified === actual.lastModified;
  return sameMeta
    ? { match: true, method: 'metadata', confident: false }
    : { match: false, reason: 'Name, size, or modified time differs from the original file.' };
}

/**
 * Run an async mapper over items with a bounded concurrency limit, so only a
 * few files are read/hashed at once (PRODUCT.md §13.4).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await mapper(items[i]!, i);
    }
  };
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return results;
}
