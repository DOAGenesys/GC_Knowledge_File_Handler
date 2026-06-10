/**
 * Centralized, stable error codes and their user-facing presentation
 * (PRODUCT.md §16). Codes are stable identifiers safe to log and
 * include in support bundles. User messages never contain secrets, tokens, URLs
 * or raw provider responses.
 */

export type ErrorSeverity = 'info' | 'warning' | 'error';

/**
 * Outcome classification for an external (non-idempotent) effect. `Unknown`
 * means we could not confirm whether the side effect happened — it must never
 * be silently retried or presented as success (PRODUCT.md §15).
 */
export type OutcomeClass = 'Success' | 'RetryableFailure' | 'FatalFailure' | 'Unknown';

export const ERROR_CODES = [
  // App access / auth
  'APP_UNAUTHENTICATED',
  'APP_CSRF_REJECTED',
  'APP_FORBIDDEN_FEATURE_DISABLED',
  'APP_BAD_REQUEST',
  'APP_PAYLOAD_TOO_LARGE',
  // Genesys auth / config
  'GENESYS_NOT_CONFIGURED',
  'GENESYS_AUTH_FAILED',
  'GENESYS_PERMISSION_DENIED',
  // Source lifecycle
  'SOURCE_NOT_FOUND',
  'SOURCE_VALIDATION_FAILED',
  'SOURCE_INCOMPATIBLE_TYPE',
  'SOURCE_CREATE_FAILED',
  'SOURCE_CREATE_UNKNOWN',
  'SOURCE_UPDATE_FAILED',
  'SOURCE_DELETE_FAILED',
  'SOURCE_DELETE_UNKNOWN',
  'SOURCE_IN_USE',
  // Synchronization lifecycle
  'SYNC_START_FAILED',
  'SYNC_START_UNKNOWN',
  'UPLOAD_TICKET_FAILED',
  'UPLOAD_TICKET_UNKNOWN',
  'COMPLETION_FAILED',
  'COMPLETION_UNKNOWN',
  'CANCELLATION_FAILED',
  'CANCELLATION_UNKNOWN',
  // Validation
  'FILE_VALIDATION_FAILED',
  // Infra
  'RATE_LIMITED',
  'GENESYS_UPSTREAM_ERROR',
  'UNKNOWN_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorMeta {
  code: ErrorCode;
  severity: ErrorSeverity;
  /** Whether the *same* operation may be safely auto-retried. */
  retryable: boolean;
  /** Short, plain-language summary safe to render verbatim. */
  message: string;
  /** Recommended next user action. */
  nextAction: string;
  /** HTTP status to return when surfaced from an API route. */
  httpStatus: number;
}

export const ERROR_META: Record<ErrorCode, ErrorMeta> = {
  APP_UNAUTHENTICATED: {
    code: 'APP_UNAUTHENTICATED',
    severity: 'error',
    retryable: false,
    message: 'Your session is not authenticated.',
    nextAction: 'Sign in again to continue.',
    httpStatus: 401,
  },
  APP_CSRF_REJECTED: {
    code: 'APP_CSRF_REJECTED',
    severity: 'error',
    retryable: false,
    message: 'The request failed a cross-site request forgery check.',
    nextAction: 'Reload the page and try again.',
    httpStatus: 403,
  },
  APP_FORBIDDEN_FEATURE_DISABLED: {
    code: 'APP_FORBIDDEN_FEATURE_DISABLED',
    severity: 'error',
    retryable: false,
    message: 'This capability is disabled by deployment policy.',
    nextAction: 'Enable the corresponding feature flag if appropriate.',
    httpStatus: 403,
  },
  APP_BAD_REQUEST: {
    code: 'APP_BAD_REQUEST',
    severity: 'error',
    retryable: false,
    message: 'The request was malformed or failed validation.',
    nextAction: 'Correct the input and try again.',
    httpStatus: 400,
  },
  APP_PAYLOAD_TOO_LARGE: {
    code: 'APP_PAYLOAD_TOO_LARGE',
    severity: 'error',
    retryable: false,
    message: 'The request body exceeded the allowed size.',
    nextAction: 'Reduce the payload size and try again.',
    httpStatus: 413,
  },
  GENESYS_NOT_CONFIGURED: {
    code: 'GENESYS_NOT_CONFIGURED',
    severity: 'error',
    retryable: false,
    message: 'Genesys sign-in is not connected.',
    nextAction: 'Sign in with Genesys Cloud again.',
    httpStatus: 503,
  },
  GENESYS_AUTH_FAILED: {
    code: 'GENESYS_AUTH_FAILED',
    severity: 'error',
    retryable: false,
    message: 'Genesys authentication failed.',
    nextAction: 'Sign in with Genesys Cloud again and verify the region and Client ID.',
    httpStatus: 502,
  },
  GENESYS_PERMISSION_DENIED: {
    code: 'GENESYS_PERMISSION_DENIED',
    severity: 'error',
    retryable: false,
    message: 'Your Genesys user does not have permission for this operation.',
    nextAction: 'Ask an administrator to grant the needed Knowledge permissions.',
    httpStatus: 403,
  },
  SOURCE_NOT_FOUND: {
    code: 'SOURCE_NOT_FOUND',
    severity: 'error',
    retryable: false,
    message: 'No accessible source matched this ID.',
    nextAction: 'Check the source ID and your OAuth permissions.',
    httpStatus: 404,
  },
  SOURCE_VALIDATION_FAILED: {
    code: 'SOURCE_VALIDATION_FAILED',
    severity: 'error',
    retryable: false,
    message: 'The source could not be validated.',
    nextAction: 'Re-check the source or refresh its status.',
    httpStatus: 400,
  },
  SOURCE_INCOMPATIBLE_TYPE: {
    code: 'SOURCE_INCOMPATIBLE_TYPE',
    severity: 'error',
    retryable: false,
    message: 'This source is not a FileUpload source and cannot be synced here.',
    nextAction: 'Choose a FileUpload source.',
    httpStatus: 422,
  },
  SOURCE_CREATE_FAILED: {
    code: 'SOURCE_CREATE_FAILED',
    severity: 'error',
    retryable: true,
    message: 'Creating the source failed before Genesys recorded it.',
    nextAction: 'Retry creating the source.',
    httpStatus: 502,
  },
  SOURCE_CREATE_UNKNOWN: {
    code: 'SOURCE_CREATE_UNKNOWN',
    severity: 'warning',
    retryable: false,
    message: 'The source may have been created, but the response was lost.',
    nextAction: 'Use Discovery to locate a likely-created source before retrying.',
    httpStatus: 504,
  },
  SOURCE_UPDATE_FAILED: {
    code: 'SOURCE_UPDATE_FAILED',
    severity: 'error',
    retryable: false,
    message: 'Updating the source failed.',
    nextAction: 'Review the change and try again.',
    httpStatus: 502,
  },
  SOURCE_DELETE_FAILED: {
    code: 'SOURCE_DELETE_FAILED',
    severity: 'error',
    retryable: false,
    message: 'Deleting the source failed.',
    nextAction: 'Verify the source state in Genesys before retrying.',
    httpStatus: 502,
  },
  SOURCE_DELETE_UNKNOWN: {
    code: 'SOURCE_DELETE_UNKNOWN',
    severity: 'warning',
    retryable: false,
    message: 'The deletion outcome is unknown.',
    nextAction: 'Verify the source no longer exists in Genesys before retrying.',
    httpStatus: 504,
  },
  SOURCE_IN_USE: {
    code: 'SOURCE_IN_USE',
    severity: 'error',
    retryable: false,
    message:
      'This source is linked to other Genesys assets and cannot be deleted. Detach or unlink it from Agent Copilot, AVAs, or other assets before deleting.',
    nextAction:
      'Detach or unlink this source from Agent Copilot, AVAs, or other Genesys assets before deleting it.',
    httpStatus: 409,
  },
  SYNC_START_FAILED: {
    code: 'SYNC_START_FAILED',
    severity: 'error',
    retryable: true,
    message: 'Starting the synchronization failed before Genesys recorded it.',
    nextAction: 'Retry starting the sync.',
    httpStatus: 502,
  },
  SYNC_START_UNKNOWN: {
    code: 'SYNC_START_UNKNOWN',
    severity: 'warning',
    retryable: false,
    message: 'A sync may have started, but the response was lost.',
    nextAction: 'Check the source synchronization history before retrying.',
    httpStatus: 504,
  },
  UPLOAD_TICKET_FAILED: {
    code: 'UPLOAD_TICKET_FAILED',
    severity: 'error',
    retryable: true,
    message: 'Requesting an upload URL failed.',
    nextAction: 'Retry the upload for this file.',
    httpStatus: 502,
  },
  UPLOAD_TICKET_UNKNOWN: {
    code: 'UPLOAD_TICKET_UNKNOWN',
    severity: 'warning',
    retryable: false,
    message: 'The upload URL request outcome is unknown.',
    nextAction: 'Pause and verify before retrying this file.',
    httpStatus: 504,
  },
  COMPLETION_FAILED: {
    code: 'COMPLETION_FAILED',
    severity: 'error',
    retryable: true,
    message: 'Completing the synchronization failed.',
    nextAction: 'Retry completion once all files are uploaded.',
    httpStatus: 502,
  },
  COMPLETION_UNKNOWN: {
    code: 'COMPLETION_UNKNOWN',
    severity: 'warning',
    retryable: false,
    message: 'All files uploaded, but completion was not confirmed.',
    nextAction: 'Verify the synchronization status in Genesys before starting a new round.',
    httpStatus: 504,
  },
  CANCELLATION_FAILED: {
    code: 'CANCELLATION_FAILED',
    severity: 'error',
    retryable: true,
    message: 'Cancelling the synchronization failed.',
    nextAction: 'Retry cancellation or verify in Genesys.',
    httpStatus: 502,
  },
  CANCELLATION_UNKNOWN: {
    code: 'CANCELLATION_UNKNOWN',
    severity: 'warning',
    retryable: false,
    message: 'The cancellation outcome is unknown.',
    nextAction: 'Verify the synchronization status in Genesys.',
    httpStatus: 504,
  },
  FILE_VALIDATION_FAILED: {
    code: 'FILE_VALIDATION_FAILED',
    severity: 'error',
    retryable: false,
    message: 'One or more files failed validation.',
    nextAction: 'Fix blocking validation errors before starting the sync.',
    httpStatus: 400,
  },
  RATE_LIMITED: {
    code: 'RATE_LIMITED',
    severity: 'warning',
    retryable: true,
    message: 'Genesys rate-limited the request.',
    nextAction: 'The app will retry automatically with backoff.',
    httpStatus: 429,
  },
  GENESYS_UPSTREAM_ERROR: {
    code: 'GENESYS_UPSTREAM_ERROR',
    severity: 'error',
    retryable: true,
    message: 'Genesys returned a server error.',
    nextAction: 'The app will retry safe operations automatically.',
    httpStatus: 502,
  },
  UNKNOWN_ERROR: {
    code: 'UNKNOWN_ERROR',
    severity: 'error',
    retryable: false,
    message: 'An unexpected error occurred.',
    nextAction: 'Copy a support bundle and retry.',
    httpStatus: 500,
  },
};

/**
 * A redaction-safe application error. `detail` is for server logs only and must
 * already be redacted by the caller; it is never sent to the browser.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly detail?: string;
  override readonly cause?: unknown;

  constructor(code: ErrorCode, options?: { detail?: string; cause?: unknown }) {
    const meta = ERROR_META[code];
    super(meta.message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = meta.httpStatus;
    this.detail = options?.detail;
    this.cause = options?.cause;
  }

  /** The non-secret payload safe to return to the browser. */
  toClientJSON(): { error: { code: ErrorCode; message: string; nextAction: string } } {
    const meta = ERROR_META[this.code];
    return { error: { code: this.code, message: meta.message, nextAction: meta.nextAction } };
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
