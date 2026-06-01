import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('proxy upload token', () => {
  beforeEach(() => {
    process.env.APP_SESSION_SECRET = 'test-secret';
  });

  afterEach(async () => {
    const config = await import('@/server/config');
    config.__resetConfigCache();
  });

  it('round-trips a Genesys-issued upload target', async () => {
    const config = await import('@/server/config');
    config.__resetConfigCache();
    const { signProxyUploadToken, verifyProxyUploadToken } = await import('../proxy-upload-token');

    const token = await signProxyUploadToken('https://upload.example/object?sig=abc', {
      'x-amz-acl': 'private',
    });

    await expect(verifyProxyUploadToken(token)).resolves.toEqual({
      url: 'https://upload.example/object?sig=abc',
      headers: { 'x-amz-acl': 'private' },
    });
  });

  it('rejects tampered tokens', async () => {
    const config = await import('@/server/config');
    config.__resetConfigCache();
    const { signProxyUploadToken, verifyProxyUploadToken } = await import('../proxy-upload-token');

    const token = await signProxyUploadToken('https://upload.example/object?sig=abc', {});
    const tampered = token.replace('a', 'b');

    await expect(verifyProxyUploadToken(tampered)).resolves.toBeNull();
  });
});
