import { describe, expect, it } from 'vitest';
import {
  allSucceeded,
  applyEvent,
  counts,
  createEngine,
  evaluate,
  selectTicketsToIssue,
  type EngineState,
} from '../engine';

/** Drive the engine to completion given a per-file result function. */
function run(
  keys: string[],
  resultFor: (key: string, attempt: number) => 'Uploaded' | 'Failed' | 'CorsUnknown',
  opts?: { concurrency?: number; maxAttempts?: number; cancelAfter?: number },
): EngineState {
  const state = createEngine(keys, opts);
  let processed = 0;
  // Safety bound on iterations.
  for (let i = 0; i < 1000; i += 1) {
    if (evaluate(state)) break;
    const tickets = selectTicketsToIssue(state);
    if (tickets.length === 0 && !Object.values(state.files).some((f) => f.status === 'ticketed')) {
      break;
    }
    for (const key of tickets) {
      if (opts?.cancelAfter != null && processed >= opts.cancelAfter) {
        applyEvent(state, { type: 'cancel' });
        evaluate(state);
        return state;
      }
      const attempt = state.files[key]!.attempts + 1;
      applyEvent(state, { type: 'uploadResult', fileKey: key, result: resultFor(key, attempt) });
      processed += 1;
    }
  }
  evaluate(state);
  return state;
}

describe('engine — completion safety', () => {
  it('completes only when every file uploaded', () => {
    const state = run(['a', 'b', 'c'], () => 'Uploaded');
    expect(state.finished).toBe('Completed');
    expect(allSucceeded(state)).toBe(true);
  });

  it('NEVER completes if a file result is unknown (CORS)', () => {
    const state = run(['a', 'b'], (k) => (k === 'b' ? 'CorsUnknown' : 'Uploaded'));
    expect(state.finished).toBe('NeedsUserAction');
    expect(state.finished).not.toBe('Completed');
    expect(counts(state).unknown).toBe(1);
  });

  it('retries a transient failure then pauses for the user after the attempt budget', () => {
    const state = run(['a'], () => 'Failed', { maxAttempts: 3 });
    expect(state.files.a!.attempts).toBe(3);
    expect(state.files.a!.status).toBe('failed_recoverable');
    expect(state.finished).toBe('NeedsUserAction');
  });

  it('recovers when a retry eventually succeeds', () => {
    const state = run(['a'], (_k, attempt) => (attempt < 2 ? 'Failed' : 'Uploaded'), {
      maxAttempts: 3,
    });
    expect(state.files.a!.status).toBe('uploaded');
    expect(state.finished).toBe('Completed');
  });

  it('cancel always wins over in-flight work', () => {
    const state = run(['a', 'b', 'c', 'd'], () => 'Uploaded', { concurrency: 1, cancelAfter: 1 });
    expect(state.finished).toBe('Cancelled');
  });
});

describe('engine — concurrency window', () => {
  it('issues at most `concurrency` tickets at a time', () => {
    const state = createEngine(['a', 'b', 'c', 'd', 'e'], { concurrency: 2 });
    const first = selectTicketsToIssue(state);
    expect(first).toEqual(['a', 'b']);
    // No more slots until one completes.
    expect(selectTicketsToIssue(state)).toEqual([]);
    applyEvent(state, { type: 'uploadResult', fileKey: 'a', result: 'Uploaded' });
    expect(selectTicketsToIssue(state)).toEqual(['c']);
  });
});

describe('engine — reselect & timeout', () => {
  it('marks a timed-out file needs_reselect and pauses', () => {
    const state = createEngine(['a', 'b']);
    selectTicketsToIssue(state);
    applyEvent(state, { type: 'uploadResult', fileKey: 'a', result: 'Uploaded' });
    applyEvent(state, { type: 'timeout', fileKey: 'b' });
    expect(state.files.b!.status).toBe('needs_reselect');
    expect(evaluate(state)).toBe('NeedsUserAction');
  });

  it('re-queues a file after reselect so it can resume', () => {
    const state = createEngine(['b']);
    selectTicketsToIssue(state);
    applyEvent(state, { type: 'timeout', fileKey: 'b' });
    applyEvent(state, { type: 'reselectDone', fileKey: 'b' });
    expect(state.files.b!.status).toBe('queued');
    expect(selectTicketsToIssue(state)).toEqual(['b']);
  });
});

describe('engine — robustness', () => {
  it('ignores duplicate / stale upload callbacks', () => {
    const state = createEngine(['a']);
    selectTicketsToIssue(state);
    applyEvent(state, { type: 'uploadResult', fileKey: 'a', result: 'Uploaded' });
    // A duplicate callback must not corrupt state.
    applyEvent(state, { type: 'uploadResult', fileKey: 'a', result: 'Failed' });
    expect(state.files.a!.status).toBe('uploaded');
  });

  it('ignores callbacks for unknown files', () => {
    const state = createEngine(['a']);
    selectTicketsToIssue(state);
    applyEvent(state, { type: 'uploadResult', fileKey: 'ghost', result: 'Uploaded' });
    expect(state.files.a!.status).toBe('ticketed');
  });
});
