/**
 * Core domain types shared by client, server, and workflow.
 *
 * These mirror the data model in PRODUCT.md §11 and the run/file state machines
 * in §14.3–14.4. They are pure type declarations — no runtime values, no I/O.
 */

export type SyncType = 'Incremental' | 'Full';

/** Known Genesys source types. FileUpload is the only compatible-for-sync type. */
export type SourceType = 'FileUpload' | 'Web' | 'SharePoint' | 'Salesforce' | 'ServiceNow';

/** Remote source operational status as surfaced by Genesys. */
export type RemoteSourceStatus = 'Active' | 'Idle' | 'Syncing' | 'Error';

/** Run states (PRODUCT.md §14.3). */
export type RunState =
  | 'DraftLocal'
  | 'PreflightValidating'
  | 'ReadyToStart'
  | 'WorkflowStarting'
  | 'SourceCreating'
  | 'SourceValidating'
  | 'SourceReady'
  | 'SynchronizationStarting'
  | 'SynchronizationReady'
  | 'UploadTicketCreating'
  | 'AwaitingBrowserUpload'
  | 'BrowserUploading'
  | 'FileUploaded'
  | 'FileFailedRecoverable'
  | 'NeedsUserAction'
  | 'RemoteStatusRefreshing'
  | 'CompletingSynchronization'
  | 'Completed'
  | 'Cancelling'
  | 'Cancelled'
  | 'SourceCreateUnknown'
  | 'SyncStartUnknown'
  | 'UploadTicketUnknown'
  | 'UploadResultUnknown'
  | 'CompletionUnknown'
  | 'CancellationUnknown'
  | 'SourceDeleteUnknown'
  | 'FailedFatal';

/** Terminal run states — no further automatic progress is possible. */
export const TERMINAL_RUN_STATES = [
  'Completed',
  'Cancelled',
  'FailedFatal',
] as const satisfies readonly RunState[];

/**
 * Run states that represent an honest "we cannot confirm the external outcome"
 * situation. The app must never present these as success.
 */
export const AMBIGUOUS_RUN_STATES = [
  'SourceCreateUnknown',
  'SyncStartUnknown',
  'UploadTicketUnknown',
  'UploadResultUnknown',
  'CompletionUnknown',
  'CancellationUnknown',
  'SourceDeleteUnknown',
] as const satisfies readonly RunState[];

/** File states (PRODUCT.md §14.4). */
export type FileState =
  | 'Selected'
  | 'Invalid'
  | 'Validated'
  | 'Hashing'
  | 'Ready'
  | 'TicketRequested'
  | 'TicketIssued'
  | 'Uploading'
  | 'Uploaded'
  | 'UploadFailedRecoverable'
  | 'NeedsReselect'
  | 'Cancelled'
  | 'UploadResultUnknown';

/** File states that count as "done and successful" for completion gating. */
export const SUCCESS_FILE_STATES = ['Uploaded'] as const satisfies readonly FileState[];

/** Source record persisted in the encrypted vault (PRODUCT.md §11.2). */
export interface SourceRecord {
  localSourceKey: string;
  sourceId: string;
  displayName: string;
  sourceType: SourceType;
  remoteName: string | null;
  remoteStatus: RemoteSourceStatus | null;
  isCompatibleFileUploadSource: boolean;
  createdByApp: boolean;
  dateAddedToVault: number;
  lastValidatedAt: number | null;
  lastRemoteSyncAt: number | null;
  lastUsedAt: number | null;
  archived: boolean;
  /** True when the source exists only in this vault (cannot be rediscovered). */
  localOnly?: boolean;
  notes?: string;
}

/** Per-file metadata persisted in a run manifest (PRODUCT.md §11.4). No bytes. */
export interface FileRecord {
  localFileKey: string;
  originalName: string;
  uploadFileName: string;
  extension: string;
  contentType: string;
  contentLength: number;
  lastModified: number;
  sha256Base64: string | null;
  contentMd5Base64: string | null;
  originUri?: string;
  tags?: GenesysTag[];
  metadata?: Record<string, string>;
  uploadStatus: FileState;
  attempts: number;
  lastErrorCode: string | null;
  lastErrorMessageRedacted: string | null;
}

/** Sync run record persisted in the vault (PRODUCT.md §11.3). */
export interface SyncRunRecord {
  localRunKey: string;
  workflowRunId: string | null;
  sourceId: string;
  sourceName: string;
  synchronizationId: string | null;
  syncType: SyncType;
  status: RunState;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  cancelledAt: number | null;
  lastRemoteStatus: string | null;
  lastRemoteStatusCheckedAt: number | null;
  fileCount: number;
  uploadedCount: number;
  failedCount: number;
  needsUserActionCount: number;
  errorSummary: string | null;
  files: FileRecord[];
}

export interface GenesysTag {
  /** Genesys tag identifier or name. */
  name: string;
}

/** User preferences persisted in the vault. */
export interface Preferences {
  defaultSyncType: SyncType;
  sizeWarnMb: number;
  uploadMode: 'direct' | 'proxy';
  redactNames: boolean;
  theme: 'light' | 'dark';
}

export const DEFAULT_PREFERENCES: Preferences = {
  defaultSyncType: 'Incremental',
  sizeWarnMb: 50,
  uploadMode: 'direct',
  redactNames: false,
  theme: 'light',
};

/** Decrypted vault contents (PRODUCT.md §11.1). Never contains secrets. */
export interface VaultData {
  schemaVersion: number;
  installId: string;
  createdAt: number;
  updatedAt: number;
  sourceRegistry: SourceRecord[];
  syncRuns: SyncRunRecord[];
  preferences: Preferences;
}

/* ------------------------------------------------------------------ */
/* Genesys API DTOs (normalized, non-secret subset)                   */
/* ------------------------------------------------------------------ */

export interface GenesysSourceSummary {
  id: string;
  name: string;
  type: SourceType | string;
  status?: RemoteSourceStatus | string;
  dateLastSync?: string | null;
  documentCount?: number | null;
}

export interface GenesysSourceDetail extends GenesysSourceSummary {
  dateCreated?: string;
  dateModified?: string;
  /** Added by the API route: whether the source is a syncable FileUpload type. */
  isCompatibleFileUploadSource?: boolean;
}

export interface GenesysSynchronizationSummary {
  id: string;
  type: SyncType | string;
  status: string;
  dateCreated?: string | null;
  dateCompleted?: string | null;
  fileCount?: number | null;
  uploadedCount?: number | null;
  sourceId?: string;
}

/** Upload ticket returned by Genesys. URL + headers are bearer secrets. */
export interface GenesysUploadTicket {
  url: string;
  headers: Record<string, string>;
  /** Optional Genesys-side identifier for the upload, when present. */
  uploadKey?: string;
}
