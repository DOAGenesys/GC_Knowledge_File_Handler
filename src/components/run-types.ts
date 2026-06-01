/**
 * Shared UI types for an in-progress sync run. The browser holds the actual
 * File handles in memory (never persisted); on refresh they are lost and the
 * file is marked NeedsReselect.
 */
import type { SyncType } from '@/lib/types';

export type UiFileStatus =
  | 'Ready'
  | 'TicketIssued'
  | 'Uploading'
  | 'Uploaded'
  | 'UploadFailedRecoverable'
  | 'UploadResultUnknown'
  | 'NeedsReselect'
  | 'Cancelled';

export interface ActiveRunFile {
  localFileKey: string;
  /** Browser File handle — in memory only; null after refresh (needs reselect). */
  file: File | null;
  originalName: string;
  uploadFileName: string;
  extension: string;
  contentType: string;
  contentLength: number;
  lastModified: number;
  sha256Base64: string | null;
  contentMd5Base64: string | null;
  status: UiFileStatus;
  progress: number;
  attemptId: string | null;
  attempts: number;
  errorCode: string | null;
  /**
   * A `ticketReady` signal the browser received for a file it could not upload
   * yet (e.g. the File was lost on refresh). Holds NO secret — just the attempt
   * id — so the user can reselect and the browser can request a fresh ticket
   * and resume the same attempt.
   */
  pendingTicketReady?: { attemptId: string } | null;
}

export type ActiveRunStatus =
  | 'Starting'
  | 'Running'
  | 'Completed'
  | 'Cancelling'
  | 'Cancelled'
  | 'NeedsUserAction'
  | 'CompletionUnknown'
  | 'FailedFatal';

export interface ActiveRunState {
  localRunKey: string;
  workflowRunId: string | null;
  sourceId: string;
  sourceName: string;
  syncType: SyncType;
  status: ActiveRunStatus;
  files: ActiveRunFile[];
  startedAt: number;
  synchronizationId: string | null;
  lastRemoteStatus: string | null;
  lastRemoteCheckedAt: number | null;
  currentStep: string | null;
  stepStates: Record<string, 'pending' | 'active' | 'done' | 'error'>;
  errorSummary: string | null;
}
