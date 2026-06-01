/**
 * Identifier helpers. Uses the platform crypto RNG; available in browser, Node,
 * and edge runtimes.
 */

/** RFC 4122 v4 UUID. */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex: string[] = [];
  for (const b of bytes) hex.push(b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
    .slice(6, 8)
    .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

/** A short, URL-safe local key (not a UUID) for vault-internal references. */
export function localKey(prefix = 'k'): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let s = '';
  for (const b of bytes) s += b.toString(36).padStart(1, '0');
  return `${prefix}_${s.slice(0, 18)}`;
}

/** A run identifier in the `run_xxxx` shape used across the UI. */
export function runId(): string {
  return localKey('run');
}
