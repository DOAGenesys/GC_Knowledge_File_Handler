import type { NextRequest } from 'next/server';
import { AppError, isAppError } from '@/lib/errors';
import { uploadTicketRequestSchema } from '@/lib/schemas';
import { validateFile } from '@/lib/validation';
import { requireAuth, requireCsrf, requireGenesys } from '@/server/auth/guards';
import { requestUploadUrl } from '@/server/genesys/client';
import { signCallbackToken } from '@/server/workflow/callback-token';
import { jsonOk, readJsonBody, route } from '@/server/http/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * On-demand upload-ticket route. The durable workflow stream only signals
 * `ticketReady` (no secret); the browser calls this route to obtain a fresh
 * Genesys pre-signed URL + signed headers, which are returned ONLY in this
 * HTTPS response body and never persisted to a durable store or log
 * (PRODUCT.md §5.3/§10.4). A signed callback token is always returned (even on
 * a ticket-request failure) so the browser can report the outcome and the
 * workflow's engine can retry/handle it.
 */
export const POST = route(async (req: NextRequest) => {
  await requireAuth(req);
  requireCsrf(req);
  requireGenesys();

  const body = await readJsonBody(req, uploadTicketRequestSchema, { maxBytes: 16_384 });

  // Defensive re-validation of the upload file name against Genesys constraints.
  const v = validateFile({
    name: body.fileName,
    size: body.contentLength ?? 1,
    type: body.contentType,
  });
  if (v.blocking.length)
    throw new AppError('FILE_VALIDATION_FAILED', {
      detail: v.blocking.map((b) => b.code).join(','),
    });

  // Always mint the callback token so the browser can report success OR failure.
  const callbackToken = await signCallbackToken(
    body.localRunKey,
    body.localFileKey,
    body.attemptId,
  );

  try {
    const ticket = await requestUploadUrl(body.sourceId, body.synchronizationId, {
      fileName: body.fileName,
      contentMd5: body.contentMd5,
      contentType: body.contentType,
      contentLength: body.contentLength,
      originUri: body.originUri,
      tags: body.tags,
      metadata: body.metadata,
    });
    return jsonOk({
      url: ticket.url,
      headers: ticket.headers,
      method: 'PUT' as const,
      callbackToken,
    });
  } catch (err) {
    // Surface the ticket-request failure WITH a valid callback token so the
    // browser can post a 'Failed' result and the workflow can retry / pause.
    const code = isAppError(err) ? err.code : 'UPLOAD_TICKET_FAILED';
    return jsonOk({ callbackToken, ticketError: code });
  }
});
