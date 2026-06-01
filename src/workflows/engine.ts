/**
 * Pure sync orchestration engine — the safety-critical core of the workflow,
 * with NO dependency on the durable runtime so it can be exhaustively unit
 * tested (Block 7).
 *
 * Invariants it guarantees (PRODUCT.md §5.1, §14, §15):
 *  - The run reaches `Completed` ONLY when every file is `Uploaded` (or
 *    deliberately `Skipped`). Any pending/failed/ambiguous file → `NeedsUserAction`.
 *  - A cancel signal always wins → `Cancelled`.
 *  - Ambiguous upload results (`CorsUnknown`) are never treated as success.
 *  - Bounded-concurrency ticket issuance with per-file attempt limits.
 */

export type FileLifecycle =
  | 'queued'
  | 'ticketed'
  | 'uploaded'
  | 'failed_recoverable'
  | 'result_unknown'
  | 'needs_reselect'
  | 'skipped'
  | 'cancelled';

export type RunOutcome = 'Completed' | 'Cancelled' | 'NeedsUserAction' | 'FailedFatal';

export type UploadResult = 'Uploaded' | 'Failed' | 'CorsUnknown';

export interface EngineState {
  readonly concurrency: number;
  readonly maxAttempts: number;
  files: Record<string, { status: FileLifecycle; attempts: number }>;
  order: string[];
  cancelled: boolean;
  finished: RunOutcome | null;
}

export interface EngineEvent {
  type: 'uploadResult' | 'cancel' | 'timeout' | 'reselectDone';
  fileKey?: string;
  result?: UploadResult;
}

export function createEngine(
  fileKeys: readonly string[],
  options: { concurrency?: number; maxAttempts?: number } = {},
): EngineState {
  const files: EngineState['files'] = {};
  for (const k of fileKeys) files[k] = { status: 'queued', attempts: 0 };
  return {
    concurrency: Math.max(1, options.concurrency ?? 2),
    maxAttempts: Math.max(1, options.maxAttempts ?? 3),
    files,
    order: [...fileKeys],
    cancelled: false,
    finished: null,
  };
}

function outstandingCount(state: EngineState): number {
  return Object.values(state.files).filter((f) => f.status === 'ticketed').length;
}

/**
 * Choose the next files to issue upload tickets for, respecting the concurrency
 * window. Marks them `ticketed` and returns their keys (in plan order).
 */
export function selectTicketsToIssue(state: EngineState): string[] {
  if (state.cancelled || state.finished) return [];
  const slots = state.concurrency - outstandingCount(state);
  if (slots <= 0) return [];
  const picks: string[] = [];
  for (const key of state.order) {
    if (picks.length >= slots) break;
    if (state.files[key]!.status === 'queued') {
      state.files[key]!.status = 'ticketed';
      picks.push(key);
    }
  }
  return picks;
}

/** Apply an upload result for a file, handling retry/ambiguity classification. */
export function applyUploadResult(state: EngineState, fileKey: string, result: UploadResult): void {
  const file = state.files[fileKey];
  if (!file || file.status !== 'ticketed') return; // ignore stale/duplicate callbacks
  file.attempts += 1;
  if (result === 'Uploaded') {
    file.status = 'uploaded';
  } else if (result === 'CorsUnknown') {
    // The browser could not read the response — never assume success.
    file.status = 'result_unknown';
  } else {
    // Transient failure: retry until the attempt budget is exhausted.
    file.status = file.attempts < state.maxAttempts ? 'queued' : 'failed_recoverable';
  }
}

/** A file's bytes are no longer held by the browser; needs reselect. */
export function applyTimeout(state: EngineState, fileKey: string): void {
  const file = state.files[fileKey];
  if (!file) return;
  if (file.status === 'ticketed' || file.status === 'queued') file.status = 'needs_reselect';
}

/** Signal cancellation. */
export function applyCancel(state: EngineState): void {
  state.cancelled = true;
}

export function applyEvent(state: EngineState, event: EngineEvent): void {
  switch (event.type) {
    case 'uploadResult':
      if (event.fileKey && event.result) applyUploadResult(state, event.fileKey, event.result);
      break;
    case 'timeout':
      if (event.fileKey) applyTimeout(state, event.fileKey);
      break;
    case 'reselectDone':
      if (event.fileKey && state.files[event.fileKey]?.status === 'needs_reselect') {
        state.files[event.fileKey]!.status = 'queued';
      }
      break;
    case 'cancel':
      applyCancel(state);
      break;
  }
}

/** True iff every file reached a successful terminal state. */
export function allSucceeded(state: EngineState): boolean {
  return Object.values(state.files).every((f) => f.status === 'uploaded' || f.status === 'skipped');
}

/** True iff some file could still make automatic progress (queued or ticketed). */
export function hasProgressableWork(state: EngineState): boolean {
  return Object.values(state.files).some((f) => f.status === 'queued' || f.status === 'ticketed');
}

/**
 * Evaluate whether the run has reached a terminal outcome and set `finished`.
 * This is the single place the Completed/NeedsUserAction decision is made, so
 * the "never complete unless all uploaded" invariant is centralized.
 */
export function evaluate(state: EngineState): RunOutcome | null {
  if (state.finished) return state.finished;
  if (state.cancelled) {
    state.finished = 'Cancelled';
    return state.finished;
  }
  if (allSucceeded(state)) {
    state.finished = 'Completed';
    return state.finished;
  }
  if (!hasProgressableWork(state)) {
    // Nothing left that will advance on its own, but not all uploaded → pause
    // honestly for the user. NEVER Completed here.
    state.finished = 'NeedsUserAction';
    return state.finished;
  }
  return null;
}

export interface EngineCounts {
  total: number;
  uploaded: number;
  failed: number;
  unknown: number;
  needsReselect: number;
  pending: number;
}

export function counts(state: EngineState): EngineCounts {
  const values = Object.values(state.files);
  return {
    total: values.length,
    uploaded: values.filter((f) => f.status === 'uploaded' || f.status === 'skipped').length,
    failed: values.filter((f) => f.status === 'failed_recoverable').length,
    unknown: values.filter((f) => f.status === 'result_unknown').length,
    needsReselect: values.filter((f) => f.status === 'needs_reselect').length,
    pending: values.filter((f) => f.status === 'queued' || f.status === 'ticketed').length,
  };
}
