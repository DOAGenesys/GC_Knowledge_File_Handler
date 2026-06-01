import type { NextRequest } from 'next/server';
import { AppError } from '@/lib/errors';
import { getServerConfig } from '@/server/config';
import { requireAuth, requireCsrf, requireFeature } from '@/server/auth/guards';
import { jsonError, jsonOk } from '@/server/http/route-helpers';
import { logger } from '@/server/logger';
import { redactUrl } from '@/server/redact';
import { verifyProxyUploadToken } from '@/server/workflow/proxy-upload-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Streaming proxy-upload fallback (PRODUCT.md §8.3). Used ONLY when the browser
 * cannot PUT directly to a Genesys pre-signed URL because of CORS. Streams the
 * request body straight to the upstream URL without buffering the whole file or
 * writing it to disk/storage.
 *
 * SSRF guard: normal uploads must carry a short-lived server-signed proxy token
 * minted from a Genesys-issued ticket. Legacy caller-provided URLs are accepted
 * only when ENABLE_PROXY_UPLOAD is on and the host matches
 * GENESYS_UPLOAD_CONNECT_SRC. URLs and signed headers are never persisted or
 * logged unredacted.
 */
function hostAllowed(targetUrl: string, patterns: string[]): boolean {
  let u: URL;
  try {
    u = new URL(targetUrl);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  return patterns.some((p) => {
    let host: string;
    try {
      host = new URL(p).host;
    } catch {
      return false;
    }
    if (host.startsWith('*.')) {
      const base = host.slice(2);
      return u.host === base || u.host.endsWith(`.${base}`);
    }
    return u.host === host;
  });
}

export async function PUT(req: NextRequest): Promise<Response> {
  try {
    await requireAuth(req);
    requireCsrf(req);

    const cfg = getServerConfig();
    const signedProxy = await verifyProxyUploadToken(req.headers.get('x-gkfsm-proxy-token'));
    let targetUrl = signedProxy?.url ?? '';
    let signedHeaders = signedProxy?.headers ?? {};

    if (!signedProxy) {
      requireFeature('ENABLE_PROXY_UPLOAD');
      if (cfg.uploadConnectSrc.length === 0) {
        throw new AppError('APP_FORBIDDEN_FEATURE_DISABLED', {
          detail: 'no upload host allowlist',
        });
      }

      targetUrl = req.headers.get('x-gkfsm-upload-url') ?? '';
      if (!hostAllowed(targetUrl, cfg.uploadConnectSrc)) {
        throw new AppError('APP_BAD_REQUEST', { detail: 'upload host not allowlisted' });
      }

      const headerBlob = req.headers.get('x-gkfsm-upload-headers');
      if (headerBlob) {
        try {
          signedHeaders = JSON.parse(Buffer.from(headerBlob, 'base64').toString('utf8'));
        } catch {
          throw new AppError('APP_BAD_REQUEST', { detail: 'bad upload headers' });
        }
      }
    }

    const limit = cfg.limits.proxyUploadMaxBytes;
    const declared = Number(req.headers.get('content-length') ?? '0');
    if (Number.isFinite(declared) && declared > limit) {
      throw new AppError('APP_PAYLOAD_TOO_LARGE');
    }

    const upstreamContentType = req.headers.get('x-gkfsm-content-type');
    if (upstreamContentType) signedHeaders['Content-Type'] = upstreamContentType;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    // Enforce the size cap on the actual streamed bytes — a chunked / omitted
    // Content-Length cannot bypass it. Aborts the upstream request on overflow.
    let transferred = 0;
    const counter = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctrl) {
        transferred += chunk.byteLength;
        if (transferred > limit) {
          ctrl.error(new AppError('APP_PAYLOAD_TOO_LARGE'));
          controller.abort();
          return;
        }
        ctrl.enqueue(chunk);
      },
    });
    const body = req.body ? req.body.pipeThrough(counter) : undefined;

    let upstream: Response;
    try {
      upstream = await fetch(targetUrl, {
        method: 'PUT',
        headers: signedHeaders,
        body,
        // Never auto-follow redirects: the allowlist/https guard only validates
        // the first hop, so a 30x Location to an internal/metadata address would
        // otherwise turn this into an SSRF relay. A pre-signed PUT URL accepts
        // the body directly and must never redirect.
        redirect: 'manual',
        // Required to stream a request body in undici/Node fetch.
        // @ts-expect-error duplex is valid at runtime but missing from lib types
        duplex: 'half',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (upstream.status >= 300 && upstream.status < 400) {
      logger.warn('proxy.upload.redirect_rejected', {
        host: redactUrl(targetUrl),
        status: upstream.status,
      });
      throw new AppError('APP_BAD_REQUEST', { detail: 'upstream attempted a redirect' });
    }

    logger.info('proxy.upload', { host: redactUrl(targetUrl), status: upstream.status });
    const ok = upstream.status >= 200 && upstream.status < 300;
    return jsonOk({ ok, status: upstream.status }, { status: ok ? 200 : 502 });
  } catch (err) {
    return jsonError(err);
  }
}
