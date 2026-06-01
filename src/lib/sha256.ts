/**
 * Self-contained, streaming-capable SHA-256 (FIPS 180-4).
 *
 * SHA-256 is the local fingerprint used for deduplication and reselect matching
 * (PRODUCT.md §13.4). The browser pipeline prefers the native WebCrypto digest
 * for whole small files; this incremental implementation backs the chunked path
 * for large files so the whole file is never held in memory at once (Block 10).
 * Verified against published vectors in sha256.test.ts.
 */

// First 32 bits of the fractional parts of the cube roots of the first 64 primes.
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/** Incremental SHA-256. Feed `update(chunk)` then call `digest()` once. */
export class Sha256 {
  private h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  private readonly block = new Uint8Array(64);
  private blockLen = 0;
  private totalLen = 0;
  private readonly w = new Uint32Array(64);
  private done = false;

  private process(buf: Uint8Array, offset: number): void {
    const w = this.w;
    for (let i = 0; i < 16; i += 1) {
      const j = offset + i * 4;
      w[i] = ((buf[j]! << 24) | (buf[j + 1]! << 16) | (buf[j + 2]! << 8) | buf[j + 3]!) >>> 0;
    }
    for (let i = 16; i < 64; i += 1) {
      const a = w[i - 15]!;
      const b = w[i - 2]!;
      const s0 = (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) >>> 0;
      const s1 = (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10)) >>> 0;
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = this.h as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];

    for (let i = 0; i < 64; i += 1) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    this.h[0] = (this.h[0]! + a) >>> 0;
    this.h[1] = (this.h[1]! + b) >>> 0;
    this.h[2] = (this.h[2]! + c) >>> 0;
    this.h[3] = (this.h[3]! + d) >>> 0;
    this.h[4] = (this.h[4]! + e) >>> 0;
    this.h[5] = (this.h[5]! + f) >>> 0;
    this.h[6] = (this.h[6]! + g) >>> 0;
    this.h[7] = (this.h[7]! + h) >>> 0;
  }

  update(chunk: Uint8Array): this {
    if (this.done) throw new Error('Sha256: update after digest');
    this.totalLen += chunk.length;
    let offset = 0;

    if (this.blockLen > 0) {
      const need = 64 - this.blockLen;
      const take = Math.min(need, chunk.length);
      this.block.set(chunk.subarray(0, take), this.blockLen);
      this.blockLen += take;
      offset = take;
      if (this.blockLen === 64) {
        this.process(this.block, 0);
        this.blockLen = 0;
      }
    }

    while (offset + 64 <= chunk.length) {
      this.process(chunk, offset);
      offset += 64;
    }

    if (offset < chunk.length) {
      this.block.set(chunk.subarray(offset), this.blockLen);
      this.blockLen += chunk.length - offset;
    }
    return this;
  }

  digest(): Uint8Array {
    if (this.done) throw new Error('Sha256: digest called twice');
    this.done = true;
    const bitLen = this.totalLen * 8;

    const padLen = this.blockLen < 56 ? 56 - this.blockLen : 120 - this.blockLen;
    const pad = new Uint8Array(padLen + 8);
    pad[0] = 0x80;
    // 64-bit big-endian length. totalLen is well below 2^53 so the high 32 bits
    // are computed via division.
    const hi = Math.floor(bitLen / 0x100000000);
    const lo = bitLen >>> 0;
    pad[padLen] = (hi >>> 24) & 0xff;
    pad[padLen + 1] = (hi >>> 16) & 0xff;
    pad[padLen + 2] = (hi >>> 8) & 0xff;
    pad[padLen + 3] = hi & 0xff;
    pad[padLen + 4] = (lo >>> 24) & 0xff;
    pad[padLen + 5] = (lo >>> 16) & 0xff;
    pad[padLen + 6] = (lo >>> 8) & 0xff;
    pad[padLen + 7] = lo & 0xff;

    const buf = new Uint8Array(this.blockLen + pad.length);
    buf.set(this.block.subarray(0, this.blockLen), 0);
    buf.set(pad, this.blockLen);
    for (let off = 0; off + 64 <= buf.length; off += 64) this.process(buf, off);

    const out = new Uint8Array(32);
    for (let i = 0; i < 8; i += 1) {
      const v = this.h[i]!;
      out[i * 4] = (v >>> 24) & 0xff;
      out[i * 4 + 1] = (v >>> 16) & 0xff;
      out[i * 4 + 2] = (v >>> 8) & 0xff;
      out[i * 4 + 3] = v & 0xff;
    }
    return out;
  }
}

/** One-shot SHA-256 digest bytes. */
export function sha256Bytes(input: Uint8Array): Uint8Array {
  return new Sha256().update(input).digest();
}
