/**
 * Shared zod schemas for request/response validation. Used by API routes,
 * the workflow input validator, and the browser before it posts callbacks.
 *
 * Object schemas that accept browser input use `.strict()` to reject unknown
 * fields and explicitly omit any file-byte-bearing field.
 */
import { z } from 'zod';

/** UUID v4-ish source/sync identifier shape. */
export const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Must be a UUID');

export const syncTypeSchema = z.enum(['Incremental', 'Full']);

export const genesysTagSchema = z.object({ name: z.string().min(1).max(100) }).strict();

const httpsUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => value.toLowerCase().startsWith('https://'), {
    message: 'Must be an HTTPS URL',
  });

/**
 * A single file in a sync manifest. METADATA ONLY — there is no field for file
 * bytes, and the schema is strict so a byte-bearing field would be rejected.
 */
export const manifestFileSchema = z
  .object({
    localFileKey: z.string().min(1).max(64),
    originalName: z.string().min(1).max(1024),
    uploadFileName: z.string().min(1).max(255),
    extension: z.string().min(1).max(16),
    contentType: z.string().max(255).optional(),
    contentLength: z.number().int().nonnegative(),
    lastModified: z.number().int().nonnegative(),
    sha256Base64: z.string().max(64).nullable(),
    contentMd5Base64: z.string().max(32).nullable(),
    originUri: httpsUrlSchema.optional(),
    tags: z.array(genesysTagSchema).max(50).optional(),
    metadata: z.record(z.string().max(128), z.string().max(2048)).optional(),
  })
  .strict();

export type ManifestFile = z.infer<typeof manifestFileSchema>;

/** Input to start the sync workflow. No file bytes. */
export const startSyncInputSchema = z
  .object({
    localRunKey: z.string().min(1).max(64),
    sourceMode: z.enum(['existing', 'create']),
    sourceId: uuidSchema.optional(),
    createSourceName: z.string().min(1).max(200).optional(),
    syncType: syncTypeSchema,
    fullSyncConfirmed: z.boolean().optional(),
    files: z.array(manifestFileSchema).min(1).max(5000),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.sourceMode === 'existing' && !val.sourceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'sourceId required',
        path: ['sourceId'],
      });
    }
    if (val.sourceMode === 'create' && !val.createSourceName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'createSourceName required',
        path: ['createSourceName'],
      });
    }
    if (val.syncType === 'Full' && !val.fullSyncConfirmed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Full sync requires explicit confirmation',
        path: ['fullSyncConfirmed'],
      });
    }
  });

export type StartSyncInput = z.infer<typeof startSyncInputSchema>;

/** Browser → server upload-result callback. No URLs/headers/bytes. */
export const uploadCallbackSchema = z
  .object({
    localRunKey: z.string().min(1).max(64),
    localFileKey: z.string().min(1).max(64),
    attemptId: z.string().min(1).max(64),
    /** Signed token issued with the upload ticket; authorizes this callback. */
    callbackToken: z.string().min(1).max(1024),
    status: z.enum(['Uploaded', 'Failed', 'CorsUnknown']),
    httpStatus: z.number().int().min(0).max(599).optional(),
    errorCode: z.string().max(64).optional(),
  })
  .strict();

/** Browser → server cancellation request for an active run. */
export const cancelSyncSchema = z.object({ localRunKey: z.string().min(1).max(64) }).strict();

/**
 * Browser → server on-demand upload-ticket request. The server requests a fresh
 * pre-signed URL from Genesys and returns it in the HTTPS response body only —
 * the URL/headers are never persisted to any durable store or log.
 */
export const uploadTicketRequestSchema = z
  .object({
    sourceId: uuidSchema,
    synchronizationId: uuidSchema,
    localRunKey: z.string().min(1).max(64),
    localFileKey: z.string().min(1).max(64),
    attemptId: z.string().min(1).max(64),
    fileName: z.string().min(1).max(255),
    contentMd5: z.string().max(32).nullish(),
    contentType: z.string().max(255).optional(),
    contentLength: z.number().int().nonnegative().optional(),
    originUri: httpsUrlSchema.optional(),
    tags: z.array(genesysTagSchema).max(50).optional(),
    metadata: z.record(z.string().max(128), z.string().max(2048)).optional(),
  })
  .strict();

export type UploadTicketRequest = z.infer<typeof uploadTicketRequestSchema>;

export type UploadCallback = z.infer<typeof uploadCallbackSchema>;

/** Create-source request body. */
export const createSourceBodySchema = z.object({ name: z.string().min(1).max(200) }).strict();

/** Add-existing-source / validate-source request body. */
export const validateSourceBodySchema = z.object({ sourceId: uuidSchema }).strict();

/** Update-source request body (feature-flagged). Only FileUpload-safe fields. */
export const updateSourceBodySchema = z.object({ name: z.string().min(1).max(200) }).strict();

/** Delete-source request body (feature-flagged). Typed confirmation required. */
export const deleteSourceBodySchema = z
  .object({
    sourceId: uuidSchema,
    confirmName: z.string().min(1).max(200),
  })
  .strict();

/* ------------------------------------------------------------------ */
/* Genesys response schemas (lenient: tolerate unknown extra fields)  */
/* ------------------------------------------------------------------ */

export const genesysSourceSummarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    status: z.string().optional(),
    dateLastSync: z.string().nullish(),
    documentCount: z.number().nullish(),
  })
  .passthrough();

export const genesysSourceListSchema = z
  .object({
    entities: z.array(genesysSourceSummarySchema).default([]),
    nextUri: z.string().nullish(),
    pageCount: z.number().nullish(),
    pageNumber: z.number().nullish(),
  })
  .passthrough();

export const genesysSynchronizationSchema = z
  .object({
    id: z.string(),
    type: z.string().optional(),
    status: z.string(),
    dateCreated: z.string().nullish(),
    dateCompleted: z.string().nullish(),
    fileCount: z.number().nullish(),
    uploadedCount: z.number().nullish(),
    sourceId: z.string().optional(),
  })
  .passthrough();

export const genesysSynchronizationListSchema = z
  .object({
    entities: z.array(genesysSynchronizationSchema).default([]),
    nextUri: z.string().nullish(),
  })
  .passthrough();

export const genesysUploadTicketSchema = z
  .object({
    url: z.string().url(),
    headers: z.record(z.string(), z.string()).default({}),
    uploadKey: z.string().optional(),
  })
  .passthrough();

export const genesysTokenSchema = z
  .object({
    access_token: z.string(),
    refresh_token: z.string().optional(),
    token_type: z.string().optional(),
    expires_in: z.number(),
  })
  .passthrough();
