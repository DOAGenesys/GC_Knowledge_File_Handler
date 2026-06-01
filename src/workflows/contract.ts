/**
 * Shared workflow ⇄ browser stream contract. Pure types + the hook token helper
 * so the workflow, the API routes, and the browser all agree on the message
 * shapes.
 *
 * IMPORTANT: Vercel Workflow run streams are DURABLE (event-sourced, replayable),
 * so they are a persistence surface. Per PRODUCT.md §5.3/§10.4 the pre-signed
 * upload URL and signed headers must NEVER be persisted — therefore the stream
 * only ever carries a non-secret `ticketReady` signal. The browser fetches the
 * actual URL/headers on demand from the authenticated, non-persisting
 * `/api/sync/upload-ticket` route, holds them in memory only, and discards them
 * after the upload.
 */
import type { RunOutcome } from './engine';

/** Hook token (and stream key) base, derived from the browser-controlled key. */
export function syncHookToken(localRunKey: string): string {
  return `sync:${localRunKey}`;
}

/** Messages the workflow writes to its (durable) run stream. NO SECRETS. */
export type WorkflowStreamMessage =
  | { kind: 'state'; runState: string; step?: string }
  | { kind: 'source'; sourceId: string; createdByApp: boolean }
  | { kind: 'sync'; synchronizationId: string }
  | {
      /**
       * The engine has allocated a concurrency slot for this file; the browser
       * should now fetch a fresh upload ticket from /api/sync/upload-ticket and
       * upload. Contains NO secret — just the file + attempt identity.
       */
      kind: 'ticketReady';
      localFileKey: string;
      attemptId: string;
    }
  | {
      kind: 'counts';
      total: number;
      uploaded: number;
      failed: number;
      unknown: number;
      needsReselect: number;
      pending: number;
    }
  | { kind: 'fileState'; localFileKey: string; status: string }
  | {
      kind: 'final';
      outcome: RunOutcome;
      synchronizationId: string | null;
      lastRemoteStatus: string | null;
      errorSummary: string | null;
    };

/** Messages delivered to the workflow's hook (from callback / cancel routes). */
export type WorkflowHookMessage =
  | {
      type: 'uploadResult';
      localFileKey: string;
      attemptId: string;
      status: 'Uploaded' | 'Failed' | 'CorsUnknown';
    }
  | { type: 'cancel' };
