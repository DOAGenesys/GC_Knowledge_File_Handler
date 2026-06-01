import type { NextRequest } from 'next/server';
import { jsonOk, route } from '@/server/http/route-helpers';
import { requireAuth } from '@/server/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Returns the current authenticated identity. Gated by middleware AND here.
export const GET = route(async (req: NextRequest) => {
  const session = await requireAuth(req);
  return jsonOk({ username: session.sub, expiresAt: session.exp });
});
