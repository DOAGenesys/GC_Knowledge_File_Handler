import type { NextRequest } from 'next/server';
import { getReadiness } from '@/server/config';
import { requireAuth } from '@/server/auth/guards';
import { currentGenesysIdentity } from '@/server/genesys/oauth';
import { jsonOk, route } from '@/server/http/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Non-secret readiness + feature flags for the authenticated UI. Never includes
// secret values — only presence/validity booleans.
export const GET = route(async (req: NextRequest) => {
  await requireAuth(req);
  const genesys = await currentGenesysIdentity();
  return jsonOk(getReadiness(genesys));
});
