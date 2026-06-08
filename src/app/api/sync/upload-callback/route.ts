import type { NextRequest } from 'next/server';
import { resumeHook } from 'workflow/api';
import { AppError } from '@/lib/errors';
import { uploadCallbackSchema } from '@/lib/schemas';
import { requireAuth, requireCsrf } from '@/server/auth/guards';
import { verifyCallbackToken } from '@/server/workflow/callback-token';
import { jsonOk, readJsonBody, route } from '@/server/http/route-helpers';
import { syncHookToken, type WorkflowHookMessage } from '@/workflows/contract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Browser → server upload-result callback. Authenticated +
 * CSRF-protected, and additionally bound to a single (run, file, attempt) via a
 * signed callback token so a result cannot be forged for a different file. The
 * workflow's engine independently ignores stale/duplicate/unknown-file results.
 * The body never contains upload URLs, signed headers, or file bytes.
 */
export const POST = route(async (req: NextRequest) => {
  await requireAuth(req);
  requireCsrf(req);
  const body = await readJsonBody(req, uploadCallbackSchema, { maxBytes: 4096 });

  const valid = await verifyCallbackToken(body.callbackToken, {
    localRunKey: body.localRunKey,
    localFileKey: body.localFileKey,
    attemptId: body.attemptId,
  });
  if (!valid) throw new AppError('APP_CSRF_REJECTED', { detail: 'invalid callback token' });

  const message: WorkflowHookMessage = {
    type: 'uploadResult',
    localFileKey: body.localFileKey,
    attemptId: body.attemptId,
    status: body.status,
  };
  await resumeHook(syncHookToken(body.localRunKey), message);
  return jsonOk({ ok: true });
});
