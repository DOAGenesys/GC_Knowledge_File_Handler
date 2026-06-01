import type { NextRequest } from 'next/server';
import { start } from 'workflow/api';
import { startSyncInputSchema } from '@/lib/schemas';
import { getServerConfig } from '@/server/config';
import { AppError } from '@/lib/errors';
import { requireAuth, requireCsrf, requireFeature, requireGenesys } from '@/server/auth/guards';
import { jsonOk, readJsonBody, route } from '@/server/http/route-helpers';
import { syncWorkflow } from '@/workflows/sync-workflow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Start the durable sync workflow with a metadata-only manifest (no file bytes).
export const POST = route(async (req: NextRequest) => {
  await requireAuth(req);
  requireCsrf(req);
  requireGenesys();

  const input = await readJsonBody(req, startSyncInputSchema, { maxBytes: 2_000_000 });

  if (input.sourceMode === 'create') requireFeature('ENABLE_SOURCE_CREATION');
  if (input.syncType === 'Full') {
    requireFeature('ENABLE_FULL_SYNC');
    if (!input.fullSyncConfirmed)
      throw new AppError('APP_BAD_REQUEST', { detail: 'full sync not confirmed' });
  }

  const cfg = getServerConfig();
  if (input.files.length > cfg.limits.maxSelectedFiles) {
    throw new AppError('APP_BAD_REQUEST', { detail: 'too many files' });
  }

  const run = await start(syncWorkflow, [input]);
  return jsonOk({ workflowRunId: run.runId, localRunKey: input.localRunKey }, { status: 202 });
});
