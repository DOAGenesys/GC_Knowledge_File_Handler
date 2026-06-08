import { AppError } from '@/lib/errors';
import { uuidSchema } from '@/lib/schemas';
import { requireAuth, requireFeature } from '@/server/auth/guards';
import { getSourceSynchronization } from '@/server/genesys/client';
import { jsonOk, route } from '@/server/http/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Read a specific synchronization (recovery + Active Run refresh, flag-gated).
export const GET = route(async (req, ctx) => {
  await requireAuth(req);
  requireFeature('ENABLE_SOURCE_HISTORY');
  const { sourceId, synchronizationId } = await ctx.params;
  const sid = uuidSchema.safeParse(sourceId);
  const syncId = uuidSchema.safeParse(synchronizationId);
  if (!sid.success || !syncId.success) {
    throw new AppError('APP_BAD_REQUEST', { detail: 'invalid id' });
  }
  const synchronization = await getSourceSynchronization(sid.data, syncId.data);
  return jsonOk({ synchronization });
});
