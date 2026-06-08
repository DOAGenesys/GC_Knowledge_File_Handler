import type { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth/guards';
import { runServerDiagnostics } from '@/server/diagnostics';
import { jsonOk, route } from '@/server/http/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (req: NextRequest) => {
  await requireAuth(req);
  const checks = await runServerDiagnostics();
  return jsonOk({ checks });
});
