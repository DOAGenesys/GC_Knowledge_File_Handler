import { describe, expect, it } from 'vitest';
import { redact, redactErrorMessage, redactString, redactUrl } from '../redact';

describe('redaction', () => {
  it('strips the query string from a URL (pre-signed upload URLs)', () => {
    expect(redactUrl('https://up.example.com/path/file?X-Amz-Signature=abc&exp=1')).toBe(
      'https://up.example.com/path/file?[REDACTED]',
    );
    expect(redactUrl('https://host.example/plain')).toBe('https://host.example/plain');
  });

  it('masks bearer tokens and token-bearing JSON fields in free text', () => {
    expect(redactString('Authorization: Bearer abc.def.ghi')).toContain('Bearer [REDACTED]');
    expect(redactString('{"access_token":"secretvalue"}')).not.toContain('secretvalue');
  });

  it('redacts a pre-signed upload URL embedded in text', () => {
    const out = redactString('uploading to https://b.s3.amazonaws.com/k?X-Amz-Signature=zzz now');
    expect(out).not.toContain('X-Amz-Signature=zzz');
  });

  it('deep-redacts sensitive object keys', () => {
    const obj = {
      authorization: 'Bearer x',
      cookie: 'gkfsm_session=y',
      url: 'https://up/x?sig=1',
      headers: { 'x-amz-acl': 'private' },
      access_token: 'tok',
      password: 'pw',
      callbackToken: 'cb',
      nested: { client_secret: 'cs', safe: 'visible' },
      safeField: 'keepme',
    };
    const r = redact(obj) as Record<string, unknown>;
    expect(r.authorization).toBe('[REDACTED]');
    expect(r.cookie).toBe('[REDACTED]');
    expect(r.url).toBe('[REDACTED]');
    expect(r.headers).toBe('[REDACTED]');
    expect(r.access_token).toBe('[REDACTED]');
    expect(r.password).toBe('[REDACTED]');
    expect(r.callbackToken).toBe('[REDACTED]');
    expect((r.nested as Record<string, unknown>).client_secret).toBe('[REDACTED]');
    expect((r.nested as Record<string, unknown>).safe).toBe('visible');
    expect(r.safeField).toBe('keepme');
  });

  it('redactErrorMessage never throws and masks secrets', () => {
    expect(redactErrorMessage(new Error('token Bearer abc123'))).toContain('Bearer [REDACTED]');
    expect(redactErrorMessage('plain')).toBe('plain');
  });
});
