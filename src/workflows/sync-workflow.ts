/**
 * Durable sync workflow (PRODUCT.md §14, Block 7).
 *
 * The `"use workflow"` function is pure orchestration: it drives the tested,
 * runtime-free engine (engine.ts) and contains no Node APIs, no fetch, and no
 * randomness/clock reads — so durable replay is deterministic. All external
 * effects (Genesys calls, stream writes) live in `"use step"` functions.
 *
 * CRITICAL invariants enforced here:
 *  - Steps that perform NON-IDEMPOTENT Genesys calls catch ambiguity and RETURN
 *    a discriminated result instead of throwing, so the runtime's automatic step
 *    retry can never duplicate a source, sync round, or completion/cancellation.
 *  - The pre-signed upload URL/headers are NEVER placed in the (durable) run
 *    stream. The stream only carries a non-secret `ticketReady` signal; the
 *    browser fetches the actual ticket on demand from /api/sync/upload-ticket.
 *  - The cancel hook is created BEFORE any source/sync setup so a cancel can
 *    never be lost (resumeHook would otherwise throw HookNotFoundError).
 *  - The final stream message carries the SAFETY-DOWNGRADED outcome, so an
 *    unconfirmed completion is never reported to the browser as success.
 */
import { createHook, getWritable } from 'workflow';
import { FILE_UPLOAD_SOURCE_TYPE } from '@/lib/constants';
import { AppError, type ErrorCode } from '@/lib/errors';
import { startSyncInputSchema, type StartSyncInput } from '@/lib/schemas';
import { validateFile } from '@/lib/validation';
import { uuid } from '@/lib/ids';
import {
  createSource,
  getSource,
  getSourceSynchronization,
  patchSynchronization,
  startSynchronization,
} from '@/server/genesys/client';
import {
  applyEvent,
  counts,
  createEngine,
  evaluate,
  selectTicketsToIssue,
  type EngineState,
  type RunOutcome,
} from './engine';
import { syncHookToken, type WorkflowHookMessage, type WorkflowStreamMessage } from './contract';

const CONCURRENCY = 2;
const MAX_ATTEMPTS = 3;

/* ----------------------------- steps ----------------------------- */

async function writeStreamStep(message: WorkflowStreamMessage): Promise<void> {
  'use step';
  const writer = getWritable<WorkflowStreamMessage>().getWriter();
  try {
    await writer.write(message);
  } finally {
    writer.releaseLock();
  }
}

async function validateInputStep(input: StartSyncInput): Promise<void> {
  'use step';
  const parsed = startSyncInputSchema.safeParse(input);
  if (!parsed.success) throw new Error('workflow input failed validation');
  const names = parsed.data.files.map((f) => f.uploadFileName);
  parsed.data.files.forEach((file, idx) => {
    // Filter siblings by INDEX, not by value, so two identical upload names are
    // both preserved and the duplicate-name BLOCKING check actually fires
    // (PRODUCT.md §4.1/§13.2). A by-value filter would remove both copies,
    // silently passing colliding names to Genesys on a crafted/replayed POST.
    const siblings = names.filter((_, i) => i !== idx);
    const v = validateFile(
      {
        name: file.uploadFileName,
        size: file.contentLength,
        type: file.contentType,
        lastModified: file.lastModified,
      },
      siblings,
    );
    if (v.blocking.length) throw new Error(`file ${file.localFileKey} failed validation`);
  });
}

type ResolveResult =
  | { ok: true; sourceId: string; createdByApp: boolean }
  | { ok: false; code: ErrorCode };

async function resolveSourceStep(input: StartSyncInput): Promise<ResolveResult> {
  'use step';
  try {
    if (input.sourceMode === 'create' && input.createSourceName) {
      const created = await createSource(input.createSourceName);
      return { ok: true, sourceId: created.id, createdByApp: true };
    }
    const source = await getSource(input.sourceId!);
    if (source.type !== FILE_UPLOAD_SOURCE_TYPE) {
      return { ok: false, code: 'SOURCE_INCOMPATIBLE_TYPE' };
    }
    return { ok: true, sourceId: source.id, createdByApp: false };
  } catch (err) {
    return { ok: false, code: err instanceof AppError ? err.code : 'SOURCE_VALIDATION_FAILED' };
  }
}

type StartSyncResult = { ok: true; synchronizationId: string } | { ok: false; code: ErrorCode };

async function startSyncStep(
  sourceId: string,
  syncType: StartSyncInput['syncType'],
): Promise<StartSyncResult> {
  'use step';
  try {
    const sync = await startSynchronization(sourceId, syncType);
    return { ok: true, synchronizationId: sync.id };
  } catch (err) {
    return { ok: false, code: err instanceof AppError ? err.code : 'SYNC_START_FAILED' };
  }
}

/**
 * Allocate an attempt for a file and signal the browser to upload it. NO secret
 * is produced or persisted here — the browser fetches the actual pre-signed URL
 * from /api/sync/upload-ticket on receiving this signal.
 */
async function emitTicketReadyStep(localFileKey: string): Promise<string> {
  'use step';
  const attemptId = uuid();
  const writer = getWritable<WorkflowStreamMessage>().getWriter();
  try {
    await writer.write({ kind: 'ticketReady', localFileKey, attemptId });
  } finally {
    writer.releaseLock();
  }
  return attemptId;
}

type PatchResult = { status: 'ok' | 'unknown' | 'failed'; remoteStatus: string | null };

async function patchStep(
  sourceId: string,
  synchronizationId: string,
  target: 'Completed' | 'Cancelled',
): Promise<PatchResult> {
  'use step';
  try {
    const result = await patchSynchronization(sourceId, synchronizationId, target);
    return { status: 'ok', remoteStatus: result.status };
  } catch (err) {
    if (
      err instanceof AppError &&
      (err.code === 'COMPLETION_UNKNOWN' || err.code === 'CANCELLATION_UNKNOWN')
    ) {
      return { status: 'unknown', remoteStatus: null };
    }
    return { status: 'failed', remoteStatus: null };
  }
}

async function refreshStatusStep(
  sourceId: string,
  synchronizationId: string,
): Promise<string | null> {
  'use step';
  try {
    const s = await getSourceSynchronization(sourceId, synchronizationId);
    return s.status;
  } catch {
    return null;
  }
}

/* --------------------------- orchestration --------------------------- */

function countsMessage(engine: EngineState): WorkflowStreamMessage {
  const c = counts(engine);
  return { kind: 'counts', ...c };
}

export interface SyncWorkflowSummary {
  outcome: RunOutcome | 'SourceCreateUnknown' | 'SyncStartUnknown' | 'FailedFatal';
  sourceId: string | null;
  synchronizationId: string | null;
  lastRemoteStatus: string | null;
  errorSummary: string | null;
}

export async function syncWorkflow(input: StartSyncInput): Promise<SyncWorkflowSummary> {
  'use workflow';

  await writeStreamStep({ kind: 'state', runState: 'WorkflowStarting' });

  // Create the cancel/upload hook BEFORE any setup so a cancel that arrives
  // during source create / sync start can never be lost (resumeHook would
  // otherwise throw HookNotFoundError on a not-yet-registered token).
  const hook = createHook<WorkflowHookMessage>({ token: syncHookToken(input.localRunKey) });

  await validateInputStep(input);

  // Resolve source.
  await writeStreamStep({ kind: 'state', runState: 'SourceValidating', step: 'source' });
  const resolved = await resolveSourceStep(input);
  if (!resolved.ok) {
    const outcome =
      resolved.code === 'SOURCE_CREATE_UNKNOWN' ? 'SourceCreateUnknown' : 'FailedFatal';
    await writeStreamStep({
      kind: 'final',
      outcome: 'NeedsUserAction',
      synchronizationId: null,
      lastRemoteStatus: null,
      errorSummary: resolved.code,
    });
    return {
      outcome,
      sourceId: null,
      synchronizationId: null,
      lastRemoteStatus: null,
      errorSummary: resolved.code,
    };
  }
  const sourceId = resolved.sourceId;
  await writeStreamStep({ kind: 'source', sourceId, createdByApp: resolved.createdByApp });

  // Start synchronization.
  await writeStreamStep({ kind: 'state', runState: 'SynchronizationStarting', step: 'sync' });
  const started = await startSyncStep(sourceId, input.syncType);
  if (!started.ok) {
    const outcome = started.code === 'SYNC_START_UNKNOWN' ? 'SyncStartUnknown' : 'FailedFatal';
    await writeStreamStep({
      kind: 'final',
      outcome: 'NeedsUserAction',
      synchronizationId: null,
      lastRemoteStatus: null,
      errorSummary: started.code,
    });
    return {
      outcome,
      sourceId,
      synchronizationId: null,
      lastRemoteStatus: null,
      errorSummary: started.code,
    };
  }
  const synchronizationId = started.synchronizationId;
  await writeStreamStep({ kind: 'sync', synchronizationId });

  // Upload loop driven by the engine.
  const engine = createEngine(
    input.files.map((f) => f.localFileKey),
    { concurrency: CONCURRENCY, maxAttempts: MAX_ATTEMPTS },
  );
  const attemptOf: Record<string, string> = {};

  const fill = async (): Promise<void> => {
    for (const key of selectTicketsToIssue(engine)) {
      const attemptId = await emitTicketReadyStep(key);
      attemptOf[key] = attemptId;
      await writeStreamStep({ kind: 'fileState', localFileKey: key, status: 'ticketed' });
    }
    await writeStreamStep(countsMessage(engine));
  };

  await fill();
  let outcome = evaluate(engine);

  if (!outcome) {
    for await (const msg of hook) {
      if (msg.type === 'cancel') {
        applyEvent(engine, { type: 'cancel' });
      } else if (attemptOf[msg.localFileKey] === msg.attemptId) {
        applyEvent(engine, { type: 'uploadResult', fileKey: msg.localFileKey, result: msg.status });
        await writeStreamStep({
          kind: 'fileState',
          localFileKey: msg.localFileKey,
          status: engine.files[msg.localFileKey]!.status,
        });
      }
      outcome = evaluate(engine);
      await writeStreamStep(countsMessage(engine));
      if (outcome) break;
      await fill();
    }
  }

  const finalOutcome: RunOutcome = outcome ?? 'NeedsUserAction';
  let lastRemoteStatus: string | null = null;
  let errorSummary: string | null = null;

  if (finalOutcome === 'Completed') {
    await writeStreamStep({
      kind: 'state',
      runState: 'CompletingSynchronization',
      step: 'complete',
    });
    const patch = await patchStep(sourceId, synchronizationId, 'Completed');
    if (patch.status === 'unknown') {
      errorSummary = 'COMPLETION_UNKNOWN';
    } else if (patch.status === 'failed') {
      errorSummary = 'COMPLETION_FAILED';
    }
    lastRemoteStatus = patch.remoteStatus ?? (await refreshStatusStep(sourceId, synchronizationId));
  } else if (finalOutcome === 'Cancelled') {
    await writeStreamStep({ kind: 'state', runState: 'Cancelling', step: 'cancel' });
    const patch = await patchStep(sourceId, synchronizationId, 'Cancelled');
    if (patch.status === 'unknown') errorSummary = 'CANCELLATION_UNKNOWN';
    lastRemoteStatus = patch.remoteStatus ?? (await refreshStatusStep(sourceId, synchronizationId));
  } else {
    // NeedsUserAction: never patch Completed. Leave the round open for the user.
    errorSummary = 'NeedsUserAction';
    lastRemoteStatus = await refreshStatusStep(sourceId, synchronizationId);
  }

  // SAFETY DOWNGRADE: a Completed run whose PATCH was not confirmed must NOT be
  // reported to the browser as success — emit NeedsUserAction on the (durable)
  // stream so the UI shows an honest CompletionUnknown state, not a green
  // "completed" toast. errorSummary still carries the precise reason.
  const completionAmbiguous =
    finalOutcome === 'Completed' &&
    (errorSummary === 'COMPLETION_UNKNOWN' || errorSummary === 'COMPLETION_FAILED');
  const streamOutcome: RunOutcome = completionAmbiguous ? 'NeedsUserAction' : finalOutcome;
  const summaryOutcome: SyncWorkflowSummary['outcome'] = completionAmbiguous
    ? 'NeedsUserAction'
    : finalOutcome;

  await writeStreamStep({
    kind: 'final',
    outcome: streamOutcome,
    synchronizationId,
    lastRemoteStatus,
    errorSummary,
  });
  return { outcome: summaryOutcome, sourceId, synchronizationId, lastRemoteStatus, errorSummary };
}
