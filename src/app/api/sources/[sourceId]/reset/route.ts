import type { NextRequest } from 'next/server';
import { AppError } from '@/lib/errors';
import { FILE_UPLOAD_SOURCE_TYPE } from '@/lib/constants';
import { resetSourceBodySchema, uuidSchema } from '@/lib/schemas';
import { requireAuth, requireCsrf, requireFeature } from '@/server/auth/guards';
import { resetSource } from '@/server/genesys/client';
import { jsonOk, readJsonBody, route } from '@/server/http/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function annotate<T extends { type: string }>(s: T): T & { isCompatibleFileUploadSource: boolean } {
  return { ...s, isCompatibleFileUploadSource: s.type === FILE_UPLOAD_SOURCE_TYPE };
}

function parseSourceId(raw: string | undefined): string {
  const parsed = uuidSchema.safeParse(raw);
  if (!parsed.success) throw new AppError('APP_BAD_REQUEST', { detail: 'invalid sourceId' });
  return parsed.data;
}

export const POST = route(async (req: NextRequest, ctx) => {
  await requireAuth(req);
  requireCsrf(req);
  requireFeature('ENABLE_SOURCE_RESET');

  const { sourceId } = await ctx.params;
  const id = parseSourceId(sourceId);
  const body = await readJsonBody(req, resetSourceBodySchema, { maxBytes: 4096 });

  if (body.sourceId !== id || !body.confirmName.trim() || !body.replacementName.trim()) {
    throw new AppError('APP_BAD_REQUEST', { detail: 'confirmation mismatch' });
  }

  const result = await resetSource(id, body.replacementName);
  return jsonOk({ source: annotate(result.source), renamed: result.renamed });
});
