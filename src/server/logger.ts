import 'server-only';

import { redact } from './redact';

/**
 * Central structured logger. Every field is passed through redaction before it
 * is emitted, so tokens, upload URLs, and signed headers cannot reach the logs
 * even if a caller forgets to strip them (PRODUCT.md §17).
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

function safeRedact(fields: LogFields): LogFields {
  try {
    return redact(fields) as LogFields;
  } catch {
    return { loggingError: 'redaction_failed' };
  }
}

function serialize(payload: LogFields): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      event: 'logger.serialization_failed',
    });
  }
}

function emit(level: LogLevel, event: string, fields?: LogFields): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...(fields ? safeRedact(fields) : {}),
  };
  const line = serialize(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (event: string, fields?: LogFields) => {
    if (process.env.NODE_ENV !== 'production') emit('debug', event, fields);
  },
  info: (event: string, fields?: LogFields) => emit('info', event, fields),
  warn: (event: string, fields?: LogFields) => emit('warn', event, fields),
  error: (event: string, fields?: LogFields) => emit('error', event, fields),
};
