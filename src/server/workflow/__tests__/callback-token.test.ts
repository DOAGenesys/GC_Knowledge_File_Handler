import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('callback token', () => {
  beforeEach(() => {
    process.env.APP_SESSION_SECRET = 'test-secret';
  });

  afterEach(async () => {
    const config = await import('@/server/config');
    config.__resetConfigCache();
  });

  it('binds callbacks to one run, file, and attempt', async () => {
    const config = await import('@/server/config');
    config.__resetConfigCache();
    const { signCallbackToken, verifyCallbackToken } = await import('../callback-token');

    const token = await signCallbackToken('run-1', 'file-1', 'attempt-1');

    await expect(
      verifyCallbackToken(token, {
        localRunKey: 'run-1',
        localFileKey: 'file-1',
        attemptId: 'attempt-1',
      }),
    ).resolves.toBe(true);
  });

  it('rejects callbacks for a different binding', async () => {
    const config = await import('@/server/config');
    config.__resetConfigCache();
    const { signCallbackToken, verifyCallbackToken } = await import('../callback-token');

    const token = await signCallbackToken('run-1', 'file-1', 'attempt-1');

    await expect(
      verifyCallbackToken(token, {
        localRunKey: 'run-1',
        localFileKey: 'file-1',
        attemptId: 'attempt-2',
      }),
    ).resolves.toBe(false);
  });

  it('rejects tampered tokens', async () => {
    const config = await import('@/server/config');
    config.__resetConfigCache();
    const { signCallbackToken, verifyCallbackToken } = await import('../callback-token');

    const token = await signCallbackToken('run-1', 'file-1', 'attempt-1');
    const tampered = token.replace('a', 'b');

    await expect(
      verifyCallbackToken(tampered, {
        localRunKey: 'run-1',
        localFileKey: 'file-1',
        attemptId: 'attempt-1',
      }),
    ).resolves.toBe(false);
  });
});
