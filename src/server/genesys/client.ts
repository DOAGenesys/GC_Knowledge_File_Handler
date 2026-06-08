import 'server-only';

import { AppError, type ErrorCode } from '@/lib/errors';
import { FILE_UPLOAD_SOURCE_TYPE, GENESYS_ENDPOINTS, MANUAL_TRIGGER_TYPE } from '@/lib/constants';
import {
  genesysSourceListSchema,
  genesysSourceSummarySchema,
  genesysSynchronizationListSchema,
  genesysSynchronizationSchema,
  genesysUploadTicketSchema,
} from '@/lib/schemas';
import type {
  GenesysSourceDetail,
  GenesysSourceSummary,
  GenesysSynchronizationSummary,
  GenesysUploadTicket,
  SyncType,
} from '@/lib/types';
import { genesysRequest, type GenesysResult } from './http';
import type { GenesysAuthContext } from './oauth';
import { logger } from '../logger';

export interface GenesysClientContext {
  authContext?: GenesysAuthContext;
  onAuthContextUpdated?: (context: GenesysAuthContext) => void;
}

interface UnwrapContext {
  unknownCode: ErrorCode;
  notFoundCode?: ErrorCode;
  validationCode?: ErrorCode;
  failCode?: ErrorCode;
}

function mapStatusToCode(status: number, ctx: UnwrapContext): ErrorCode {
  switch (status) {
    case 401:
      return 'GENESYS_AUTH_FAILED';
    case 403:
      return 'GENESYS_PERMISSION_DENIED';
    case 404:
      return ctx.notFoundCode ?? 'SOURCE_NOT_FOUND';
    case 400:
    case 422:
      return ctx.validationCode ?? 'SOURCE_VALIDATION_FAILED';
    case 429:
      return 'RATE_LIMITED';
    default:
      return ctx.failCode ?? 'GENESYS_UPSTREAM_ERROR';
  }
}

function unwrap<T>(result: GenesysResult<T>, ctx: UnwrapContext): T {
  if (result.kind === 'ok') return result.data;
  if (result.kind === 'unknown') throw new AppError(ctx.unknownCode);
  throw new AppError(mapStatusToCode(result.status, ctx), {
    detail: `genesys status ${result.status}`,
  });
}

function normalizeSource(
  raw: ReturnType<typeof genesysSourceSummarySchema.parse>,
): GenesysSourceDetail {
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    status: raw.status,
    dateLastSync: raw.dateLastSync ?? null,
    documentCount: raw.documentCount ?? null,
  };
}

function normalizeSync(
  raw: ReturnType<typeof genesysSynchronizationSchema.parse>,
): GenesysSynchronizationSummary {
  return {
    id: raw.id,
    type: raw.type ?? 'Incremental',
    status: raw.status,
    dateCreated: raw.dateCreated ?? null,
    dateCompleted: raw.dateCompleted ?? null,
    fileCount: raw.fileCount ?? null,
    uploadedCount: raw.uploadedCount ?? null,
    sourceId: raw.sourceId,
  };
}

const MAX_PAGES = 20;

/** Extract the path + query of a Genesys `nextUri` (may be relative or absolute). */
function nextPath(nextUri: string | null | undefined): string | null {
  if (!nextUri) return null;
  try {
    const u = new URL(nextUri, 'https://placeholder.invalid');
    return `${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Read-only endpoints (idempotent)                                   */
/* ------------------------------------------------------------------ */

export async function listSources(
  options: { pageSize?: number } = {},
  context: GenesysClientContext = {},
): Promise<GenesysSourceSummary[]> {
  const out: GenesysSourceSummary[] = [];
  let path: string | null = GENESYS_ENDPOINTS.listSources();
  let query: Record<string, string | number | undefined> | undefined = {
    pageSize: options.pageSize ?? 100,
  };
  for (let page = 0; page < MAX_PAGES && path; page += 1) {
    const result: GenesysResult<ReturnType<typeof genesysSourceListSchema.parse>> =
      await genesysRequest({
        path,
        method: 'GET',
        idempotency: 'idempotent',
        query,
        parse: (json) => genesysSourceListSchema.parse(json ?? {}),
        ...context,
      });
    const data = unwrap(result, { unknownCode: 'GENESYS_UPSTREAM_ERROR' });
    for (const e of data.entities) out.push(normalizeSource(e));
    path = nextPath(data.nextUri);
    query = undefined;
  }
  if (path) {
    // More pages exist but we hit the page cap — surface it instead of silently
    // returning an incomplete inventory (affects duplicate detection / recovery).
    logger.warn('genesys.pagination.truncated', {
      endpoint: 'listSources',
      returned: out.length,
      maxPages: MAX_PAGES,
    });
  }
  return out;
}

export async function getSource(
  sourceId: string,
  context: GenesysClientContext = {},
): Promise<GenesysSourceDetail> {
  const result = await genesysRequest({
    path: GENESYS_ENDPOINTS.source(sourceId),
    method: 'GET',
    idempotency: 'idempotent',
    parse: (json) => genesysSourceSummarySchema.parse(json ?? {}),
    ...context,
  });
  return normalizeSource(
    unwrap(result, { unknownCode: 'GENESYS_UPSTREAM_ERROR', notFoundCode: 'SOURCE_NOT_FOUND' }),
  );
}

export async function getSourceSynchronizations(
  sourceId: string,
  context: GenesysClientContext = {},
): Promise<GenesysSynchronizationSummary[]> {
  const out: GenesysSynchronizationSummary[] = [];
  let path: string | null = GENESYS_ENDPOINTS.sourceSynchronizations(sourceId);
  let query: Record<string, string | number | undefined> | undefined = { pageSize: 100 };
  for (let page = 0; page < MAX_PAGES && path; page += 1) {
    const result: GenesysResult<ReturnType<typeof genesysSynchronizationListSchema.parse>> =
      await genesysRequest({
        path,
        method: 'GET',
        idempotency: 'idempotent',
        query,
        parse: (json) => genesysSynchronizationListSchema.parse(json ?? {}),
        ...context,
      });
    const data = unwrap(result, {
      unknownCode: 'GENESYS_UPSTREAM_ERROR',
      notFoundCode: 'SOURCE_NOT_FOUND',
    });
    for (const e of data.entities) out.push(normalizeSync(e));
    path = nextPath(data.nextUri);
    query = undefined;
  }
  if (path) {
    logger.warn('genesys.pagination.truncated', {
      endpoint: 'getSourceSynchronizations',
      returned: out.length,
      maxPages: MAX_PAGES,
    });
  }
  return out;
}

export async function getSourceSynchronization(
  sourceId: string,
  synchronizationId: string,
  context: GenesysClientContext = {},
): Promise<GenesysSynchronizationSummary> {
  const result = await genesysRequest({
    path: GENESYS_ENDPOINTS.sourceSynchronization(sourceId, synchronizationId),
    method: 'GET',
    idempotency: 'idempotent',
    parse: (json) => genesysSynchronizationSchema.parse(json ?? {}),
    ...context,
  });
  return normalizeSync(
    unwrap(result, { unknownCode: 'GENESYS_UPSTREAM_ERROR', notFoundCode: 'SOURCE_NOT_FOUND' }),
  );
}

export async function getOrgSynchronizations(
  context: GenesysClientContext = {},
): Promise<GenesysSynchronizationSummary[]> {
  const out: GenesysSynchronizationSummary[] = [];
  let path: string | null = GENESYS_ENDPOINTS.orgSynchronizations();
  let query: Record<string, string | number | undefined> | undefined = { pageSize: 100 };
  for (let page = 0; page < MAX_PAGES && path; page += 1) {
    const result: GenesysResult<ReturnType<typeof genesysSynchronizationListSchema.parse>> =
      await genesysRequest({
        path,
        method: 'GET',
        idempotency: 'idempotent',
        query,
        parse: (json) => genesysSynchronizationListSchema.parse(json ?? {}),
        ...context,
      });
    const data = unwrap(result, { unknownCode: 'GENESYS_UPSTREAM_ERROR' });
    for (const e of data.entities) out.push(normalizeSync(e));
    path = nextPath(data.nextUri);
    query = undefined;
  }
  if (path) {
    logger.warn('genesys.pagination.truncated', {
      endpoint: 'getOrgSynchronizations',
      returned: out.length,
      maxPages: MAX_PAGES,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Mutating endpoints (non-idempotent)                                */
/* ------------------------------------------------------------------ */

export async function createSource(
  name: string,
  context: GenesysClientContext = {},
): Promise<GenesysSourceDetail> {
  const result = await genesysRequest({
    path: GENESYS_ENDPOINTS.createSource(),
    method: 'POST',
    idempotency: 'nonidempotent',
    body: { name, type: FILE_UPLOAD_SOURCE_TYPE, triggerType: MANUAL_TRIGGER_TYPE },
    parse: (json) => genesysSourceSummarySchema.parse(json ?? {}),
    ...context,
  });
  return normalizeSource(
    unwrap(result, { unknownCode: 'SOURCE_CREATE_UNKNOWN', failCode: 'SOURCE_CREATE_FAILED' }),
  );
}

const MAX_SOURCE_NAME_LENGTH = 200;

function resetStagingName(finalName: string): string {
  const suffix = ` - reset ${Date.now().toString(36)}`;
  const base = finalName.trim();
  const maxBaseLength = Math.max(1, MAX_SOURCE_NAME_LENGTH - suffix.length);
  return `${base.slice(0, maxBaseLength).trimEnd()}${suffix}`;
}

export interface ResetSourceResult {
  source: GenesysSourceDetail;
  renamed: boolean;
}

export async function resetSource(
  sourceId: string,
  replacementName: string,
  context: GenesysClientContext = {},
): Promise<ResetSourceResult> {
  const finalName = replacementName.trim();
  const replacement = await createSource(resetStagingName(finalName), context);

  try {
    await deleteSource(sourceId, context);
  } catch (err) {
    try {
      await deleteSource(replacement.id, context);
    } catch (cleanupErr) {
      logger.warn('genesys.source.reset.cleanup_failed', {
        replacementSourceId: replacement.id,
        cause: (cleanupErr as Error)?.name,
      });
    }
    throw err;
  }

  try {
    return { source: await updateSource(replacement.id, finalName, context), renamed: true };
  } catch (err) {
    logger.warn('genesys.source.reset.rename_failed', {
      replacementSourceId: replacement.id,
      cause: (err as Error)?.name,
    });
    return { source: replacement, renamed: false };
  }
}

export async function startSynchronization(
  sourceId: string,
  type: SyncType,
  context: GenesysClientContext = {},
): Promise<GenesysSynchronizationSummary> {
  const result = await genesysRequest({
    path: GENESYS_ENDPOINTS.sourceSynchronizations(sourceId),
    method: 'POST',
    idempotency: 'nonidempotent',
    body: { type },
    parse: (json) => genesysSynchronizationSchema.parse(json ?? {}),
    ...context,
  });
  return normalizeSync(
    unwrap(result, {
      unknownCode: 'SYNC_START_UNKNOWN',
      notFoundCode: 'SOURCE_NOT_FOUND',
      failCode: 'SYNC_START_FAILED',
    }),
  );
}

export interface RequestUploadInput {
  fileName: string;
  contentMd5?: string | null;
  contentType?: string;
  contentLength?: number;
  metadata?: Record<string, string>;
  originUri?: string;
  tags?: { name: string }[];
}

export async function requestUploadUrl(
  sourceId: string,
  synchronizationId: string,
  input: RequestUploadInput,
  context: GenesysClientContext = {},
): Promise<GenesysUploadTicket> {
  const body: Record<string, unknown> = { fileName: input.fileName };
  if (input.contentMd5) body.contentMd5 = input.contentMd5;
  if (input.contentType) body.contentType = input.contentType;
  if (typeof input.contentLength === 'number') body.contentLength = input.contentLength;
  if (input.metadata && Object.keys(input.metadata).length) body.metadata = input.metadata;
  if (input.originUri) body.originUri = input.originUri;
  if (input.tags && input.tags.length) body.tags = input.tags;

  const result = await genesysRequest({
    path: GENESYS_ENDPOINTS.uploads(sourceId, synchronizationId),
    method: 'POST',
    idempotency: 'nonidempotent',
    body,
    parse: (json) => genesysUploadTicketSchema.parse(json ?? {}),
    ...context,
  });
  const ticket = unwrap(result, {
    unknownCode: 'UPLOAD_TICKET_UNKNOWN',
    failCode: 'UPLOAD_TICKET_FAILED',
    validationCode: 'UPLOAD_TICKET_FAILED',
  });
  return { url: ticket.url, headers: ticket.headers, uploadKey: ticket.uploadKey };
}

export async function patchSynchronization(
  sourceId: string,
  synchronizationId: string,
  status: 'Completed' | 'Cancelled',
  context: GenesysClientContext = {},
): Promise<GenesysSynchronizationSummary> {
  const unknownCode: ErrorCode =
    status === 'Completed' ? 'COMPLETION_UNKNOWN' : 'CANCELLATION_UNKNOWN';
  const failCode: ErrorCode = status === 'Completed' ? 'COMPLETION_FAILED' : 'CANCELLATION_FAILED';
  const result = await genesysRequest({
    path: GENESYS_ENDPOINTS.sourceSynchronization(sourceId, synchronizationId),
    method: 'PATCH',
    idempotency: 'nonidempotent',
    body: { status },
    parse: (json) => genesysSynchronizationSchema.parse(json ?? {}),
    ...context,
  });
  return normalizeSync(unwrap(result, { unknownCode, failCode, notFoundCode: 'SOURCE_NOT_FOUND' }));
}

/* ---- feature-flagged lifecycle endpoints ---- */

export async function updateSource(
  sourceId: string,
  name: string,
  context: GenesysClientContext = {},
): Promise<GenesysSourceDetail> {
  // Only the FileUpload-safe `name` field is ever sent (PRODUCT.md §4.4).
  const result = await genesysRequest({
    path: GENESYS_ENDPOINTS.source(sourceId),
    method: 'PUT',
    idempotency: 'nonidempotent',
    body: { name },
    parse: (json) => genesysSourceSummarySchema.parse(json ?? {}),
    ...context,
  });
  return normalizeSource(
    unwrap(result, { unknownCode: 'SOURCE_UPDATE_FAILED', failCode: 'SOURCE_UPDATE_FAILED' }),
  );
}

export async function deleteSource(
  sourceId: string,
  context: GenesysClientContext = {},
): Promise<void> {
  const result = await genesysRequest<null>({
    path: GENESYS_ENDPOINTS.source(sourceId),
    method: 'DELETE',
    idempotency: 'nonidempotent',
    parse: () => null,
    ...context,
  });
  if (result.kind === 'ok') return;
  if (result.kind === 'unknown') throw new AppError('SOURCE_DELETE_UNKNOWN');
  throw new AppError(
    mapStatusToCode(result.status, {
      unknownCode: 'SOURCE_DELETE_UNKNOWN',
      failCode: 'SOURCE_DELETE_FAILED',
    }),
    {
      detail: `genesys status ${result.status}`,
    },
  );
}
