import 'server-only';

import { redact } from './redact';

/**
 * Minimal structured logger. Every field is passed through redaction before it
 * is emitted, so tokens, upload URLs, and signed headers cannot reach the logs
 * even if a caller forgets to strip them (TODO Block 3, §17).
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, event: string, fields?: Record<string, unknown>): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...(fields ? (redact(fields) as Record<string, unknown>) : {}),
  };
  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (event: string, fields?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== 'production') emit('debug', event, fields);
  },
  info: (event: string, fields?: Record<string, unknown>) => emit('info', event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => emit('warn', event, fields),
  error: (event: string, fields?: Record<string, unknown>) => emit('error', event, fields),
};
