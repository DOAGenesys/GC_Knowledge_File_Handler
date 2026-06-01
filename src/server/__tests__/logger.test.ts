import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../logger';

function parseConsoleLine(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  return JSON.parse(String(spy.mock.calls[0]?.[0]));
}

describe('logger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('emits structured JSON with redacted fields', () => {
    logger.info('test.event', {
      safe: 'visible',
      authorization: 'Bearer secret-token',
      nested: { uploadUrl: 'https://up.example.com/file?X-Amz-Signature=secret' },
    });

    const payload = parseConsoleLine(logSpy);
    expect(payload.level).toBe('info');
    expect(payload.event).toBe('test.event');
    expect(payload.safe).toBe('visible');
    expect(payload.authorization).toBe('[REDACTED]');
    expect(payload.nested).toEqual({ uploadUrl: '[REDACTED]' });
    expect(typeof payload.ts).toBe('string');
  });

  it('routes warnings and errors to the matching console methods', () => {
    logger.warn('test.warn', {});
    logger.error('test.error', {});

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(parseConsoleLine(warnSpy).level).toBe('warn');
    expect(parseConsoleLine(errorSpy).level).toBe('error');
  });

  it('suppresses debug logs in production', () => {
    vi.stubEnv('NODE_ENV', 'production');

    logger.debug('test.debug', {});

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('handles circular fields without throwing', () => {
    const circular: Record<string, unknown> = { safe: 'visible' };
    circular.self = circular;

    expect(() => logger.info('test.circular', { circular })).not.toThrow();
    expect(parseConsoleLine(logSpy).circular).toEqual({
      safe: 'visible',
      self: '[CIRCULAR]',
    });
  });

  it('does not throw when field redaction fails', () => {
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('cannot enumerate');
        },
      },
    );

    expect(() => logger.info('test.hostile', hostile as Record<string, unknown>)).not.toThrow();
    expect(parseConsoleLine(logSpy).loggingError).toBe('redaction_failed');
  });
});
