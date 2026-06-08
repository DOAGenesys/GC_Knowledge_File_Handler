import type { NextRequest } from 'next/server';
import { jsonOk, route } from '@/server/http/route-helpers';
import { requireAuth } from '@/server/auth/guards';
import { currentGenesysIdentity } from '@/server/genesys/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Returns the current authenticated identity. Gated by middleware AND here.
export const GET = route(async (req: NextRequest) => {
  const session = await requireAuth(req);
  const genesys = await currentGenesysIdentity();
  return jsonOk({
    username: genesys?.username ?? session.sub,
    regionHost: genesys?.regionHost ?? null,
    expiresAt: session.exp,
    genesysExpiresAt: genesys?.expiresAt ?? null,
  });
});
