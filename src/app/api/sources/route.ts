import type { NextRequest } from 'next/server';
import { FILE_UPLOAD_SOURCE_TYPE } from '@/lib/constants';
import { createSourceBodySchema } from '@/lib/schemas';
import { requireAuth, requireCsrf, requireFeature, requireGenesys } from '@/server/auth/guards';
import { createSource, getSource, listSources } from '@/server/genesys/client';
import { jsonOk, readJsonBody, route } from '@/server/http/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function annotate<T extends { type: string }>(s: T): T & { isCompatibleFileUploadSource: boolean } {
  return { ...s, isCompatibleFileUploadSource: s.type === FILE_UPLOAD_SOURCE_TYPE };
}

// List remote Knowledge sources for discovery (read-only, flag-gated).
export const GET = route(async (req: NextRequest) => {
  await requireAuth(req);
  requireFeature('ENABLE_SOURCE_DISCOVERY');
  requireGenesys();
  const sources = (await listSources()).map(annotate);
  return jsonOk({ sources });
});

// Create a new FileUpload source (flag-gated, CSRF-protected).
export const POST = route(async (req: NextRequest) => {
  await requireAuth(req);
  requireCsrf(req);
  requireFeature('ENABLE_SOURCE_CREATION');
  requireGenesys();
  const { name } = await readJsonBody(req, createSourceBodySchema, { maxBytes: 4096 });
  const created = await createSource(name);
  // Best-effort post-create validation via GET when available.
  let validated = created;
  try {
    validated = await getSource(created.id);
  } catch {
    // Keep the create result if the immediate read fails; the UI can revalidate.
  }
  return jsonOk({ source: annotate(validated) }, { status: 201 });
});
