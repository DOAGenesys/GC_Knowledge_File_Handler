import type { NextRequest } from 'next/server';
import { AppError } from '@/lib/errors';
import { FILE_UPLOAD_SOURCE_TYPE } from '@/lib/constants';
import { deleteSourceBodySchema, updateSourceBodySchema, uuidSchema } from '@/lib/schemas';
import { requireAuth, requireCsrf, requireFeature, requireGenesys } from '@/server/auth/guards';
import { deleteSource, getSource, updateSource } from '@/server/genesys/client';
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

// Validate / fetch a specific source (core read; always available when authed).
export const GET = route(async (req, ctx) => {
  await requireAuth(req);
  requireGenesys();
  const { sourceId } = await ctx.params;
  const source = await getSource(parseSourceId(sourceId));
  return jsonOk({ source: annotate(source) });
});

// Update a source's name (flag-gated; only the FileUpload-safe name is sent).
export const PUT = route(async (req: NextRequest, ctx) => {
  await requireAuth(req);
  requireCsrf(req);
  requireFeature('ENABLE_SOURCE_UPDATE');
  requireGenesys();
  const { sourceId } = await ctx.params;
  const { name } = await readJsonBody(req, updateSourceBodySchema, { maxBytes: 4096 });
  const source = await updateSource(parseSourceId(sourceId), name);
  return jsonOk({ source: annotate(source) });
});

// Delete a source (flag-gated, danger zone; typed confirmation enforced).
export const DELETE = route(async (req: NextRequest, ctx) => {
  await requireAuth(req);
  requireCsrf(req);
  requireGenesys();
  const { sourceId } = await ctx.params;
  const id = parseSourceId(sourceId);
  const body = await readJsonBody(req, deleteSourceBodySchema, { maxBytes: 4096 });
  requireFeature(body.purpose === 'reset' ? 'ENABLE_SOURCE_RESET' : 'ENABLE_SOURCE_DELETE');
  if (body.sourceId !== id || !body.confirmName.trim()) {
    throw new AppError('APP_BAD_REQUEST', { detail: 'confirmation mismatch' });
  }
  await deleteSource(id);
  return jsonOk({ ok: true, sourceId: id });
});
