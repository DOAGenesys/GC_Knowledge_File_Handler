import { describe, expect, it } from 'vitest';
import { Md5, bytesToHex, md5Base64, md5Bytes, md5Hex } from '../md5';
import { Sha256, sha256Bytes } from '../sha256';

const enc = (s: string) => new TextEncoder().encode(s);

describe('md5 (RFC 1321 test suite)', () => {
  const vectors: Array<[string, string]> = [
    ['', 'd41d8cd98f00b204e9800998ecf8427e'],
    ['a', '0cc175b9c0f1b6a831c399e269772661'],
    ['abc', '900150983cd24fb0d6963f7d28e17f72'],
    ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
    ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
    [
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
      'd174ab98d277d9f5a5611c2c9f419d9f',
    ],
    [
      '12345678901234567890123456789012345678901234567890123456789012345678901234567890',
      '57edf4a22be3c955ac49da2e2107b67a',
    ],
    ['The quick brown fox jumps over the lazy dog', '9e107d9d372bb6826bd81d3542a419d6'],
  ];

  it.each(vectors)('md5(%j)', (input, expected) => {
    expect(md5Hex(enc(input))).toBe(expected);
  });

  it('emits base64 (not hex) for Genesys contentMd5', () => {
    expect(md5Base64(enc(''))).toBe('1B2M2Y8AsgTpgAmY7PhCfg==');
    expect(md5Base64(enc('abc'))).toBe('kAFQmDzST7DWlj99KOF/cg==');
  });

  it('incremental update matches one-shot regardless of chunk boundaries', () => {
    const data = enc('The quick brown fox jumps over the lazy dog'.repeat(20));
    const oneShot = bytesToHex(md5Bytes(data));
    for (const chunkSize of [1, 7, 64, 65, 100]) {
      const h = new Md5();
      for (let i = 0; i < data.length; i += chunkSize) h.update(data.subarray(i, i + chunkSize));
      expect(bytesToHex(h.digest())).toBe(oneShot);
    }
  });

  it('handles multi-block input that crosses the 56/64 padding boundary', () => {
    // 56 bytes forces an extra padding block.
    const data = enc('a'.repeat(56));
    expect(md5Hex(data)).toBe('3b0c8ac703f828b04c6c197006d17218');
  });
});

describe('sha256 (FIPS 180-4 vectors)', () => {
  const vectors: Array<[string, string]> = [
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
  ];

  it.each(vectors)('sha256(%j)', (input, expected) => {
    expect(bytesToHex(sha256Bytes(enc(input)))).toBe(expected);
  });

  it('matches the native WebCrypto digest on random data', async () => {
    const data = crypto.getRandomValues(new Uint8Array(5000));
    const native = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
    expect(bytesToHex(sha256Bytes(data))).toBe(bytesToHex(native));
  });

  it('incremental update matches one-shot regardless of chunk boundaries', () => {
    const data = enc('lorem ipsum dolor sit amet '.repeat(50));
    const oneShot = bytesToHex(sha256Bytes(data));
    for (const chunkSize of [1, 13, 64, 100, 1000]) {
      const h = new Sha256();
      for (let i = 0; i < data.length; i += chunkSize) h.update(data.subarray(i, i + chunkSize));
      expect(bytesToHex(h.digest())).toBe(oneShot);
    }
  });
});
