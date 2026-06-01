import 'server-only';

/**
 * Redaction utilities (PRODUCT.md §16.2, §17). Everything that goes to a log or
 * a support bundle passes through here so that tokens, client secrets, upload
 * URLs, signed headers, and authorization material can never leak.
 */

const SENSITIVE_KEY_RE =
  /^(authorization|cookie|set-cookie|x-amz-[a-z-]+|signature|x-genesys-[a-z-]+|access_?token|refresh_?token|id_?token|client_?secret|password|passphrase|secret|callbacktoken|callback_token|sessiontoken|csrf|upload_?url|url|headers)$/i;

const BEARER_RE = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi;
const TOKEN_FIELD_RE =
  /("?(?:access_?token|refresh_?token|client_?secret|password)"?\s*[:=]\s*")[^"]*(")/gi;

/** Redact the query string and fragment of a URL, preserving origin + path. */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    const hasQuery = u.search.length > 0 || u.hash.length > 0;
    return `${u.origin}${u.pathname}${hasQuery ? '?[REDACTED]' : ''}`;
  } catch {
    // Not a parseable URL; redact aggressively if it looks like it has a query.
    return url.includes('?') ? `${url.split('?')[0]}?[REDACTED]` : url;
  }
}

/** Redact sensitive substrings within a free-form string. */
export function redactString(input: string): string {
  let out = input.replace(BEARER_RE, '$1[REDACTED]');
  out = out.replace(TOKEN_FIELD_RE, '$1[REDACTED]$2');
  // Redact obvious pre-signed upload URLs embedded in text.
  out = out.replace(/https?:\/\/[^\s"']+[?&](X-Amz-[^\s"']+|sig=|signature=)[^\s"']*/gi, (m) =>
    redactUrl(m),
  );
  return out;
}

const MAX_DEPTH = 6;

/** Deep-redact an arbitrary value for safe logging / support bundles. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[TRUNCATED]';
  if (value == null) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message) };
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RE.test(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return '[UNSERIALIZABLE]';
}

/** Produce a redacted, single-line string for an error (no stack with secrets). */
export function redactErrorMessage(err: unknown): string {
  if (err instanceof Error) return redactString(err.message);
  if (typeof err === 'string') return redactString(err);
  try {
    return redactString(JSON.stringify(redact(err)));
  } catch {
    return 'Unredactable error';
  }
}
