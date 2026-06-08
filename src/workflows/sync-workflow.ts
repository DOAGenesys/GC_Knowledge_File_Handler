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
import { createHook, getWritable, sleep } from 'workflow';
import { FILE_UPLOAD_SOURCE_TYPE } from '@/lib/constants';
import { AppError, type ErrorCode } from '@/lib/errors';
import { startSyncInputSchema, type StartSyncInput } from '@/lib/schemas';
import { validateFile } from '@/lib/validation';
import { uuid } from '@/lib/ids';
import { getServerConfig } from '@/server/config';
import { logger, type LogFields } from '@/server/logger';
import {
  createSource,
  getSource,
  getSourceSynchronization,
  patchSynchronization,
  startSynchronization,
  type GenesysClientContext,
} from '@/server/genesys/client';
import {
  decryptGenesysAuthContext,
  encryptGenesysAuthContext,
  type GenesysAuthContext,
} from '@/server/genesys/oauth';
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

/**
 * Local sentinel returned when the durable upload-wait deadline elapses before
 * the run reaches a terminal outcome. Used only for in-workflow control flow —
 * it never crosses a step boundary, so it does not need to be serializable.
 */
const UPLOAD_WAIT_TIMEOUT = Symbol('uploadWaitTimeout');

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

async function logWorkflowStep(event: string, fields?: LogFields): Promise<void> {
  'use step';
  logger.info(event, fields);
}

async function warnWorkflowStep(event: string, fields?: LogFields): Promise<void> {
  'use step';
  logger.warn(event, fields);
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
  | { ok: true; sourceId: string; createdByApp: boolean; genesysAuth: string }
  | { ok: false; code: ErrorCode; genesysAuth: string };

function syncOnlyInput(input: WorkflowSyncInput): StartSyncInput {
  const { genesysAuth: _genesysAuth, ...syncInput } = input;
  return syncInput;
}

function genesysContext(encryptedAuth: string): {
  authContext: GenesysAuthContext;
  clientContext: GenesysClientContext;
  encryptedAuth: () => string;
} {
  let authContext = decryptGenesysAuthContext(encryptedAuth);
  return {
    authContext,
    clientContext: {
      authContext,
      onAuthContextUpdated: (next) => {
        authContext = next;
      },
    },
    encryptedAuth: () => encryptGenesysAuthContext(authContext),
  };
}

async function resolveSourceStep(
  input: WorkflowSyncInput,
  encryptedAuth: string,
): Promise<ResolveResult> {
  'use step';
  const auth = genesysContext(encryptedAuth);
  try {
    if (input.sourceMode === 'create' && input.createSourceName) {
      const created = await createSource(input.createSourceName, auth.clientContext);
      return {
        ok: true,
        sourceId: created.id,
        createdByApp: true,
        genesysAuth: auth.encryptedAuth(),
      };
    }
    const source = await getSource(input.sourceId!, auth.clientContext);
    if (source.type !== FILE_UPLOAD_SOURCE_TYPE) {
      return { ok: false, code: 'SOURCE_INCOMPATIBLE_TYPE', genesysAuth: auth.encryptedAuth() };
    }
    return {
      ok: true,
      sourceId: source.id,
      createdByApp: false,
      genesysAuth: auth.encryptedAuth(),
    };
  } catch (err) {
    return {
      ok: false,
      code: err instanceof AppError ? err.code : 'SOURCE_VALIDATION_FAILED',
      genesysAuth: auth.encryptedAuth(),
    };
  }
}

type StartSyncResult =
  | { ok: true; synchronizationId: string; genesysAuth: string }
  | { ok: false; code: ErrorCode; genesysAuth: string };

async function startSyncStep(
  sourceId: string,
  syncType: StartSyncInput['syncType'],
  encryptedAuth: string,
): Promise<StartSyncResult> {
  'use step';
  const auth = genesysContext(encryptedAuth);
  try {
    const sync = await startSynchronization(sourceId, syncType, auth.clientContext);
    return { ok: true, synchronizationId: sync.id, genesysAuth: auth.encryptedAuth() };
  } catch (err) {
    return {
      ok: false,
      code: err instanceof AppError ? err.code : 'SYNC_START_FAILED',
      genesysAuth: auth.encryptedAuth(),
    };
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

type PatchResult = {
  status: 'ok' | 'unknown' | 'failed';
  remoteStatus: string | null;
  genesysAuth: string;
};

async function patchStep(
  sourceId: string,
  synchronizationId: string,
  target: 'Completed' | 'Cancelled',
  encryptedAuth: string,
): Promise<PatchResult> {
  'use step';
  const auth = genesysContext(encryptedAuth);
  try {
    const result = await patchSynchronization(
      sourceId,
      synchronizationId,
      target,
      auth.clientContext,
    );
    return { status: 'ok', remoteStatus: result.status, genesysAuth: auth.encryptedAuth() };
  } catch (err) {
    if (
      err instanceof AppError &&
      (err.code === 'COMPLETION_UNKNOWN' || err.code === 'CANCELLATION_UNKNOWN')
    ) {
      return { status: 'unknown', remoteStatus: null, genesysAuth: auth.encryptedAuth() };
    }
    return { status: 'failed', remoteStatus: null, genesysAuth: auth.encryptedAuth() };
  }
}

/**
 * Read the operator-configured upload-wait budget (WORKFLOW_UPLOAD_WAIT_SECONDS)
 * inside a step so the workflow body stays deterministic (no env reads in the
 * sandbox); the value is recorded as step output and reused on replay.
 */
async function resolveUploadWaitStep(): Promise<number> {
  'use step';
  return getServerConfig().limits.uploadWaitSeconds;
}

async function refreshStatusStep(
  sourceId: string,
  synchronizationId: string,
  encryptedAuth: string,
): Promise<{ status: string | null; genesysAuth: string }> {
  'use step';
  const auth = genesysContext(encryptedAuth);
  try {
    const s = await getSourceSynchronization(sourceId, synchronizationId, auth.clientContext);
    return { status: s.status, genesysAuth: auth.encryptedAuth() };
  } catch {
    return { status: null, genesysAuth: auth.encryptedAuth() };
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

export type WorkflowSyncInput = StartSyncInput & { genesysAuth: string };

export async function syncWorkflow(input: WorkflowSyncInput): Promise<SyncWorkflowSummary> {
  'use workflow';
  let genesysAuth = input.genesysAuth;

  await writeStreamStep({ kind: 'state', runState: 'WorkflowStarting' });
  await logWorkflowStep('sync.workflow.started', {
    fileCount: input.files.length,
    sourceMode: input.sourceMode,
    syncType: input.syncType,
  });

  // Create the cancel/upload hook BEFORE any setup so a cancel that arrives
  // during source create / sync start can never be lost (resumeHook would
  // otherwise throw HookNotFoundError on a not-yet-registered token).
  const hook = createHook<WorkflowHookMessage>({ token: syncHookToken(input.localRunKey) });

  await validateInputStep(syncOnlyInput(input));

  // Resolve source.
  await writeStreamStep({ kind: 'state', runState: 'SourceValidating', step: 'source' });
  const resolved = await resolveSourceStep(input, genesysAuth);
  genesysAuth = resolved.genesysAuth;
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
    await warnWorkflowStep('sync.workflow.source_failed', {
      code: resolved.code,
      outcome,
      sourceMode: input.sourceMode,
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
  await logWorkflowStep('sync.workflow.source_resolved', {
    sourceId,
    createdByApp: resolved.createdByApp,
  });

  // Start synchronization.
  await writeStreamStep({ kind: 'state', runState: 'SynchronizationStarting', step: 'sync' });
  const started = await startSyncStep(sourceId, input.syncType, genesysAuth);
  genesysAuth = started.genesysAuth;
  if (!started.ok) {
    const outcome = started.code === 'SYNC_START_UNKNOWN' ? 'SyncStartUnknown' : 'FailedFatal';
    await writeStreamStep({
      kind: 'final',
      outcome: 'NeedsUserAction',
      synchronizationId: null,
      lastRemoteStatus: null,
      errorSummary: started.code,
    });
    await warnWorkflowStep('sync.workflow.start_failed', {
      code: started.code,
      outcome,
      sourceId,
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
  await logWorkflowStep('sync.workflow.sync_started', { sourceId, synchronizationId });

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
    // Bound the wait for browser upload results with a durable deadline. If the
    // browser never reports (tab closed, network lost) the run must PAUSE as
    // NeedsUserAction rather than hang forever — it must never falsely complete.
    const waitSeconds = await resolveUploadWaitStep();
    const iterator = hook[Symbol.asyncIterator]();
    const timeoutSignal: Promise<typeof UPLOAD_WAIT_TIMEOUT> | null =
      waitSeconds > 0
        ? sleep(waitSeconds * 1000).then((): typeof UPLOAD_WAIT_TIMEOUT => UPLOAD_WAIT_TIMEOUT)
        : null;

    for (;;) {
      const event: IteratorResult<WorkflowHookMessage> | symbol = timeoutSignal
        ? await Promise.race([iterator.next(), timeoutSignal])
        : await iterator.next();

      if (typeof event === 'symbol') {
        // Deadline elapsed: mark every still-outstanding file for reselect and
        // pause. evaluate() then yields NeedsUserAction (never Completed).
        for (const key of engine.order) {
          const before = engine.files[key]!.status;
          applyEvent(engine, { type: 'timeout', fileKey: key });
          const after = engine.files[key]!.status;
          if (after !== before) {
            await writeStreamStep({ kind: 'fileState', localFileKey: key, status: after });
          }
        }
        outcome = evaluate(engine);
        await writeStreamStep(countsMessage(engine));
        await warnWorkflowStep('sync.workflow.upload_wait_timeout', {
          sourceId,
          synchronizationId,
          waitSeconds,
        });
        break;
      }

      if (event.done) break;
      const msg = event.value;
      if (msg.type === 'cancel') {
        applyEvent(engine, { type: 'cancel' });
        await logWorkflowStep('sync.workflow.cancel_requested', { sourceId, synchronizationId });
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
    const patch = await patchStep(sourceId, synchronizationId, 'Completed', genesysAuth);
    genesysAuth = patch.genesysAuth;
    if (patch.status === 'unknown') {
      errorSummary = 'COMPLETION_UNKNOWN';
    } else if (patch.status === 'failed') {
      errorSummary = 'COMPLETION_FAILED';
    }
    if (patch.remoteStatus) {
      lastRemoteStatus = patch.remoteStatus;
    } else {
      const refreshed = await refreshStatusStep(sourceId, synchronizationId, genesysAuth);
      genesysAuth = refreshed.genesysAuth;
      lastRemoteStatus = refreshed.status;
    }
  } else if (finalOutcome === 'Cancelled') {
    await writeStreamStep({ kind: 'state', runState: 'Cancelling', step: 'cancel' });
    const patch = await patchStep(sourceId, synchronizationId, 'Cancelled', genesysAuth);
    genesysAuth = patch.genesysAuth;
    if (patch.status === 'unknown') errorSummary = 'CANCELLATION_UNKNOWN';
    if (patch.remoteStatus) {
      lastRemoteStatus = patch.remoteStatus;
    } else {
      const refreshed = await refreshStatusStep(sourceId, synchronizationId, genesysAuth);
      genesysAuth = refreshed.genesysAuth;
      lastRemoteStatus = refreshed.status;
    }
  } else {
    // NeedsUserAction: never patch Completed. Leave the round open for the user.
    errorSummary = 'NeedsUserAction';
    const refreshed = await refreshStatusStep(sourceId, synchronizationId, genesysAuth);
    genesysAuth = refreshed.genesysAuth;
    lastRemoteStatus = refreshed.status;
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
  await logWorkflowStep('sync.workflow.completed', {
    sourceId,
    synchronizationId,
    outcome: summaryOutcome,
    streamOutcome,
    lastRemoteStatus,
    errorSummary,
  });
  return { outcome: summaryOutcome, sourceId, synchronizationId, lastRemoteStatus, errorSummary };
}
