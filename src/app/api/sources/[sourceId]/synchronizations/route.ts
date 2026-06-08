import { AppError } from '@/lib/errors';
import { uuidSchema } from '@/lib/schemas';
import { requireAuth, requireFeature } from '@/server/auth/guards';
import { getSourceSynchronizations } from '@/server/genesys/client';
import { jsonOk, route } from '@/server/http/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Read a source's synchronization history (read-only, flag-gated).
export const GET = route(async (req, ctx) => {
  await requireAuth(req);
  requireFeature('ENABLE_SOURCE_HISTORY');
  const { sourceId } = await ctx.params;
  const parsed = uuidSchema.safeParse(sourceId);
  if (!parsed.success) throw new AppError('APP_BAD_REQUEST', { detail: 'invalid sourceId' });
  const synchronizations = await getSourceSynchronizations(parsed.data);
  return jsonOk({ synchronizations });
});
