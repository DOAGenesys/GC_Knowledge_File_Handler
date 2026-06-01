import 'server-only';

import { AppError } from '@/lib/errors';
import { GENESYS_TOKEN_PATH } from '@/lib/constants';
import { genesysTokenSchema } from '@/lib/schemas';
import { getServerConfig } from '../config';
import { logger } from '../logger';

/**
 * Genesys OAuth Client-Credentials token acquisition (PRODUCT.md §9.1).
 *
 * The access token lives ONLY in server memory, is refreshed before expiry, and
 * is never returned to the browser or logged. The token endpoint is on the
 * region LOGIN host (login.<region>), derived from the API host.
 */
interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

let cache: CachedToken | null = null;
let inFlight: Promise<string> | null = null;

/** Derive the login host (login.<region>) from the API host (api.<region>). */
export function deriveLoginHost(apiHost: string): string {
  if (apiHost.startsWith('api.')) return `login.${apiHost.slice(4)}`;
  // Fallback for non-standard hosts: prefix with login.
  return `login.${apiHost}`;
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  const raw = `${clientId}:${clientSecret}`;
  const b64 = typeof btoa === 'function' ? btoa(raw) : Buffer.from(raw, 'utf8').toString('base64');
  return `Basic ${b64}`;
}

async function fetchToken(): Promise<string> {
  const cfg = getServerConfig();
  if (
    !cfg.genesys.configured ||
    !cfg.genesys.clientId ||
    !cfg.genesys.clientSecret ||
    !cfg.genesys.regionHost
  ) {
    throw new AppError('GENESYS_NOT_CONFIGURED');
  }
  const loginHost = deriveLoginHost(cfg.genesys.regionHost);
  const url = `https://${loginHost}${GENESYS_TOKEN_PATH}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(cfg.genesys.clientId, cfg.genesys.clientSecret),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (err) {
    logger.error('genesys.oauth.network_error', { name: (err as Error)?.name });
    throw new AppError('GENESYS_AUTH_FAILED', { cause: err });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    logger.error('genesys.oauth.failed', { status: res.status });
    throw new AppError('GENESYS_AUTH_FAILED', { detail: `token endpoint status ${res.status}` });
  }

  const parsed = genesysTokenSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) {
    throw new AppError('GENESYS_AUTH_FAILED', { detail: 'unexpected token response shape' });
  }

  const ttlMs = Math.max(0, parsed.data.expires_in * 1000 - 60_000); // 60s safety buffer
  cache = { accessToken: parsed.data.access_token, expiresAtMs: Date.now() + ttlMs };
  return cache.accessToken;
}

/** Get a valid access token, refreshing if necessary. Coalesces concurrent calls. */
export async function getAccessToken(): Promise<string> {
  if (cache && cache.expiresAtMs > Date.now()) return cache.accessToken;
  if (inFlight) return inFlight;
  inFlight = fetchToken().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Test/operational helper: clear the in-memory token cache. */
export function __resetTokenCache(): void {
  cache = null;
  inFlight = null;
}
