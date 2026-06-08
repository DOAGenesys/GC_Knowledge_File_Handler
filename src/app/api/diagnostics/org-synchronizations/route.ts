import type { NextRequest } from 'next/server';
import { requireAuth, requireFeature } from '@/server/auth/guards';
import { getOrgSynchronizations } from '@/server/genesys/client';
import { jsonOk, route } from '@/server/http/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Organization-wide synchronization activity — support-only, disabled by
// default behind ENABLE_ORG_SYNC_DIAGNOSTICS (PRODUCT.md §4.3).
export const GET = route(async (req: NextRequest) => {
  await requireAuth(req);
  requireFeature('ENABLE_ORG_SYNC_DIAGNOSTICS');
  const synchronizations = await getOrgSynchronizations();
  return jsonOk({ synchronizations });
});
