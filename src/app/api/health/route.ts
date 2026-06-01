import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Liveness probe. Intentionally unauthenticated and secret-free: it reports
// only that the server process is up. Genesys/vault/feature readiness is
// reported by the authenticated /api/diagnostics route.
export function GET() {
  return NextResponse.json({ status: 'ok' });
}
