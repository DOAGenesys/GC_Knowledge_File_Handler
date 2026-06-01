/**
 * Self-contained, streaming-capable MD5 (RFC 1321) over byte arrays.
 *
 * MD5 is used ONLY because the Genesys upload API accepts `contentMd5` for
 * upload-integrity verification. It is NOT a secure hash and must never be
 * described as one (PRODUCT.md §13.4). A vetted in-repo implementation avoids
 * pulling an unaudited npm dependency into a security-sensitive app, and is
 * verified against the published RFC 1321 test vectors in md5.test.ts.
 *
 * Exposes both a one-shot (`md5Bytes`) and an incremental (`Md5`) API. The
 * incremental API lets the browser hash a file chunk-by-chunk without holding
 * the whole file in memory (Block 10).
 */

function safeAdd(x: number, y: number): number {
  const lsw = (x & 0xffff) + (y & 0xffff);
  const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return ((msw << 16) | (lsw & 0xffff)) >>> 0;
}

function rotl(num: number, cnt: number): number {
  return ((num << cnt) | (num >>> (32 - cnt))) >>> 0;
}

function cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
  return safeAdd(rotl(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
}
function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
  return cmn((b & c) | (~b & d), a, b, x, s, t);
}
function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
  return cmn((b & d) | (c & ~d), a, b, x, s, t);
}
function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
  return cmn(b ^ c ^ d, a, b, x, s, t);
}
function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
  return cmn(c ^ (b | ~d), a, b, x, s, t);
}

/** Process one 64-byte block (16 little-endian words) into the running state. */
function md5Block(state: number[], w: number[]): void {
  let a = state[0]!;
  let b = state[1]!;
  let c = state[2]!;
  let d = state[3]!;

  a = ff(a, b, c, d, w[0]!, 7, -680876936);
  d = ff(d, a, b, c, w[1]!, 12, -389564586);
  c = ff(c, d, a, b, w[2]!, 17, 606105819);
  b = ff(b, c, d, a, w[3]!, 22, -1044525330);
  a = ff(a, b, c, d, w[4]!, 7, -176418897);
  d = ff(d, a, b, c, w[5]!, 12, 1200080426);
  c = ff(c, d, a, b, w[6]!, 17, -1473231341);
  b = ff(b, c, d, a, w[7]!, 22, -45705983);
  a = ff(a, b, c, d, w[8]!, 7, 1770035416);
  d = ff(d, a, b, c, w[9]!, 12, -1958414417);
  c = ff(c, d, a, b, w[10]!, 17, -42063);
  b = ff(b, c, d, a, w[11]!, 22, -1990404162);
  a = ff(a, b, c, d, w[12]!, 7, 1804603682);
  d = ff(d, a, b, c, w[13]!, 12, -40341101);
  c = ff(c, d, a, b, w[14]!, 17, -1502002290);
  b = ff(b, c, d, a, w[15]!, 22, 1236535329);

  a = gg(a, b, c, d, w[1]!, 5, -165796510);
  d = gg(d, a, b, c, w[6]!, 9, -1069501632);
  c = gg(c, d, a, b, w[11]!, 14, 643717713);
  b = gg(b, c, d, a, w[0]!, 20, -373897302);
  a = gg(a, b, c, d, w[5]!, 5, -701558691);
  d = gg(d, a, b, c, w[10]!, 9, 38016083);
  c = gg(c, d, a, b, w[15]!, 14, -660478335);
  b = gg(b, c, d, a, w[4]!, 20, -405537848);
  a = gg(a, b, c, d, w[9]!, 5, 568446438);
  d = gg(d, a, b, c, w[14]!, 9, -1019803690);
  c = gg(c, d, a, b, w[3]!, 14, -187363961);
  b = gg(b, c, d, a, w[8]!, 20, 1163531501);
  a = gg(a, b, c, d, w[13]!, 5, -1444681467);
  d = gg(d, a, b, c, w[2]!, 9, -51403784);
  c = gg(c, d, a, b, w[7]!, 14, 1735328473);
  b = gg(b, c, d, a, w[12]!, 20, -1926607734);

  a = hh(a, b, c, d, w[5]!, 4, -378558);
  d = hh(d, a, b, c, w[8]!, 11, -2022574463);
  c = hh(c, d, a, b, w[11]!, 16, 1839030562);
  b = hh(b, c, d, a, w[14]!, 23, -35309556);
  a = hh(a, b, c, d, w[1]!, 4, -1530992060);
  d = hh(d, a, b, c, w[4]!, 11, 1272893353);
  c = hh(c, d, a, b, w[7]!, 16, -155497632);
  b = hh(b, c, d, a, w[10]!, 23, -1094730640);
  a = hh(a, b, c, d, w[13]!, 4, 681279174);
  d = hh(d, a, b, c, w[0]!, 11, -358537222);
  c = hh(c, d, a, b, w[3]!, 16, -722521979);
  b = hh(b, c, d, a, w[6]!, 23, 76029189);
  a = hh(a, b, c, d, w[9]!, 4, -640364487);
  d = hh(d, a, b, c, w[12]!, 11, -421815835);
  c = hh(c, d, a, b, w[15]!, 16, 530742520);
  b = hh(b, c, d, a, w[2]!, 23, -995338651);

  a = ii(a, b, c, d, w[0]!, 6, -198630844);
  d = ii(d, a, b, c, w[7]!, 10, 1126891415);
  c = ii(c, d, a, b, w[14]!, 15, -1416354905);
  b = ii(b, c, d, a, w[5]!, 21, -57434055);
  a = ii(a, b, c, d, w[12]!, 6, 1700485571);
  d = ii(d, a, b, c, w[3]!, 10, -1894986606);
  c = ii(c, d, a, b, w[10]!, 15, -1051523);
  b = ii(b, c, d, a, w[1]!, 21, -2054922799);
  a = ii(a, b, c, d, w[8]!, 6, 1873313359);
  d = ii(d, a, b, c, w[15]!, 10, -30611744);
  c = ii(c, d, a, b, w[6]!, 15, -1560198380);
  b = ii(b, c, d, a, w[13]!, 21, 1309151649);
  a = ii(a, b, c, d, w[4]!, 6, -145523070);
  d = ii(d, a, b, c, w[11]!, 10, -1120210379);
  c = ii(c, d, a, b, w[2]!, 15, 718787259);
  b = ii(b, c, d, a, w[9]!, 21, -343485551);

  state[0] = safeAdd(state[0]!, a);
  state[1] = safeAdd(state[1]!, b);
  state[2] = safeAdd(state[2]!, c);
  state[3] = safeAdd(state[3]!, d);
}

/** Convert a 64-byte block into 16 little-endian words. */
function blockToWords(buf: Uint8Array, offset: number): number[] {
  const w = new Array<number>(16);
  for (let i = 0; i < 16; i += 1) {
    const j = offset + i * 4;
    w[i] = (buf[j]! | (buf[j + 1]! << 8) | (buf[j + 2]! << 16) | (buf[j + 3]! << 24)) >>> 0;
  }
  return w;
}

/** Incremental MD5. Feed `update(chunk)` any number of times, then `digest()`. */
export class Md5 {
  private state = [1732584193, -271733879, -1732584194, 271733878];
  private readonly tail = new Uint8Array(64);
  private tailLen = 0;
  private totalLen = 0;
  private done = false;

  update(chunk: Uint8Array): this {
    if (this.done) throw new Error('Md5: update after digest');
    this.totalLen += chunk.length;
    let offset = 0;

    if (this.tailLen > 0) {
      const need = 64 - this.tailLen;
      const take = Math.min(need, chunk.length);
      this.tail.set(chunk.subarray(0, take), this.tailLen);
      this.tailLen += take;
      offset = take;
      if (this.tailLen === 64) {
        md5Block(this.state, blockToWords(this.tail, 0));
        this.tailLen = 0;
      }
    }

    while (offset + 64 <= chunk.length) {
      md5Block(this.state, blockToWords(chunk, offset));
      offset += 64;
    }

    if (offset < chunk.length) {
      const rest = chunk.length - offset;
      this.tail.set(chunk.subarray(offset), this.tailLen);
      this.tailLen += rest;
    }
    return this;
  }

  digest(): Uint8Array {
    if (this.done) throw new Error('Md5: digest called twice');
    this.done = true;
    const bitLenLo = (this.totalLen * 8) >>> 0;
    const bitLenHi = Math.floor(this.totalLen / 0x20000000) >>> 0;

    // Padding: 0x80 then zeros until length ≡ 56 (mod 64), then 8-byte length.
    const padLen = this.tailLen < 56 ? 56 - this.tailLen : 120 - this.tailLen;
    const pad = new Uint8Array(padLen + 8);
    pad[0] = 0x80;
    pad[padLen] = bitLenLo & 0xff;
    pad[padLen + 1] = (bitLenLo >>> 8) & 0xff;
    pad[padLen + 2] = (bitLenLo >>> 16) & 0xff;
    pad[padLen + 3] = (bitLenLo >>> 24) & 0xff;
    pad[padLen + 4] = bitLenHi & 0xff;
    pad[padLen + 5] = (bitLenHi >>> 8) & 0xff;
    pad[padLen + 6] = (bitLenHi >>> 16) & 0xff;
    pad[padLen + 7] = (bitLenHi >>> 24) & 0xff;

    // Feed padding through the same block path.
    const buf = new Uint8Array(this.tailLen + pad.length);
    buf.set(this.tail.subarray(0, this.tailLen), 0);
    buf.set(pad, this.tailLen);
    for (let off = 0; off + 64 <= buf.length; off += 64) {
      md5Block(this.state, blockToWords(buf, off));
    }

    const out = new Uint8Array(16);
    for (let i = 0; i < 4; i += 1) {
      const word = this.state[i]!;
      out[i * 4] = word & 0xff;
      out[i * 4 + 1] = (word >>> 8) & 0xff;
      out[i * 4 + 2] = (word >>> 16) & 0xff;
      out[i * 4 + 3] = (word >>> 24) & 0xff;
    }
    return out;
  }
}

/** Compute the raw 16-byte MD5 digest of the given bytes (one-shot). */
export function md5Bytes(input: Uint8Array): Uint8Array {
  return new Md5().update(input).digest();
}

const HEX = '0123456789abcdef';

/** Hex-encode bytes. */
export function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += HEX[b >> 4]! + HEX[b & 0x0f]!;
  return s;
}

/** Base64-encode bytes (RFC 4648, standard alphabet, with padding). */
export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }
  return Buffer.from(bytes).toString('base64');
}

/** Hex MD5 digest. */
export function md5Hex(input: Uint8Array): string {
  return bytesToHex(md5Bytes(input));
}

/** Base64 MD5 digest — the form Genesys expects for `contentMd5`. */
export function md5Base64(input: Uint8Array): string {
  return bytesToBase64(md5Bytes(input));
}
