import type { NextRequest } from 'next/server';
import { resumeHook } from 'workflow/api';
import { cancelSyncSchema } from '@/lib/schemas';
import { requireAuth, requireCsrf } from '@/server/auth/guards';
import { jsonOk, readJsonBody, route } from '@/server/http/route-helpers';
import { syncHookToken } from '@/workflows/contract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Signal cancellation to the running workflow. The workflow stops issuing
// tickets and patches the synchronization Cancelled itself (never a hard kill,
// so the Genesys round is left in a defined state).
//
// The workflow registers its hook as its very first action, so the only window
// in which the hook may not yet exist is the brief gap between `start()`
// returning and the workflow body running. If resumeHook reports the hook is
// not yet registered, we return a retry signal instead of a 5xx so the browser
// can retry rather than lose the cancel.
export const POST = route(async (req: NextRequest) => {
  await requireAuth(req);
  requireCsrf(req);
  const { localRunKey } = await readJsonBody(req, cancelSyncSchema, { maxBytes: 1024 });
  try {
    await resumeHook(syncHookToken(localRunKey), { type: 'cancel' });
    return jsonOk({ ok: true });
  } catch (err) {
    const name = (err as { name?: string } | null)?.name ?? '';
    const message = err instanceof Error ? err.message : '';
    if (
      /hook.?not.?found/i.test(name) ||
      /hook.*not.*found|not.*registered|does not exist/i.test(message)
    ) {
      return jsonOk({ ok: false, retry: true });
    }
    throw err;
  }
});
