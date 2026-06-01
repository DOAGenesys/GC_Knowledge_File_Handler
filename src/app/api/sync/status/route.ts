import type { NextRequest } from 'next/server';
import { getRun } from 'workflow/api';
import { AppError } from '@/lib/errors';
import { requireAuth } from '@/server/auth/guards';
import { jsonError } from '@/server/http/route-helpers';
import { logger } from '@/server/logger';
import { redactErrorMessage } from '@/server/redact';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stream a run's workflow messages to the authenticated browser as
 * Server-Sent Events. The stream carries in-memory upload tickets (pre-signed
 * URL + headers); they are delivered over the authenticated HTTPS channel and
 * are never persisted. The browser uploads bytes directly to the URL, then
 * reports the result to /api/sync/upload-callback.
 *
 * NOTE: the exact chunk shape emitted by `run.getReadable()` is normalized
 * defensively below; verify against the deployed Workflow SDK and adjust the
 * `toMessage` mapping if the runtime frames chunks differently.
 */
export async function GET(req: NextRequest): Promise<Response> {
  try {
    await requireAuth(req);
  } catch (err) {
    return jsonError(err);
  }

  const runId = req.nextUrl.searchParams.get('runId');
  if (!runId) return jsonError(new AppError('APP_BAD_REQUEST', { detail: 'runId required' }));

  let source: ReadableStream<unknown>;
  try {
    const run = getRun(runId);
    const startIndex = Number(req.nextUrl.searchParams.get('startIndex') ?? '0') || 0;
    source = run.getReadable({ startIndex }) as ReadableStream<unknown>;
  } catch (err) {
    return jsonError(err);
  }

  const encoder = new TextEncoder();
  const toMessage = (chunk: unknown): string => {
    if (typeof chunk === 'string') return chunk;
    if (chunk instanceof Uint8Array) {
      try {
        return new TextDecoder().decode(chunk);
      } catch {
        return JSON.stringify({ kind: 'raw' });
      }
    }
    return JSON.stringify(chunk);
  };

  const sse = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = source.getReader();
      controller.enqueue(encoder.encode(': connected\n\n'));
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(encoder.encode(`data: ${toMessage(value)}\n\n`));
        }
        controller.enqueue(encoder.encode('event: end\ndata: {}\n\n'));
      } catch (err) {
        logger.warn('sync.status.stream_error', { runId, detail: redactErrorMessage(err) });
        controller.enqueue(encoder.encode('event: error\ndata: {}\n\n'));
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });

  return new Response(sse, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
