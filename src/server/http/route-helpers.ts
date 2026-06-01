import 'server-only';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { ZodSchema } from 'zod';
import { AppError } from '@/lib/errors';
import { logger } from '../logger';
import { redactErrorMessage } from '../redact';
import { toAppError } from '../auth/guards';

const DEFAULT_MAX_BODY_BYTES = 1_000_000; // 1 MB — manifests are metadata-only.

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data as object, init);
}

export function jsonError(err: unknown): NextResponse {
  const appErr = toAppError(err);
  if (appErr.httpStatus >= 500) {
    logger.error('route.error', {
      code: appErr.code,
      detail: redactErrorMessage(appErr.detail ?? appErr.cause),
    });
  } else {
    logger.warn('route.rejected', { code: appErr.code });
  }
  return NextResponse.json(appErr.toClientJSON(), { status: appErr.httpStatus });
}

/**
 * Parse and validate a JSON request body. Enforces JSON content type, a body
 * size cap, and strict schema validation (unknown fields are rejected by the
 * schemas themselves).
 */
export async function readJsonBody<T>(
  req: NextRequest,
  schema: ZodSchema<T>,
  options: { maxBytes?: number } = {},
): Promise<T> {
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new AppError('APP_BAD_REQUEST', { detail: 'expected application/json' });
  }
  const max = options.maxBytes ?? DEFAULT_MAX_BODY_BYTES;
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > max) {
    throw new AppError('APP_PAYLOAD_TOO_LARGE');
  }

  const text = await req.text();
  if (text.length > max) throw new AppError('APP_PAYLOAD_TOO_LARGE');

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new AppError('APP_BAD_REQUEST', { detail: 'invalid JSON' });
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new AppError('APP_BAD_REQUEST', {
      detail: result.error.issues.map((i) => i.path.join('.')).join(','),
    });
  }
  return result.data;
}

/** Wrap a route handler so any thrown AppError becomes a clean JSON response. */
export function route(
  handler: (
    req: NextRequest,
    ctx: { params: Promise<Record<string, string>> },
  ) => Promise<NextResponse>,
) {
  return async (
    req: NextRequest,
    ctx: { params: Promise<Record<string, string>> },
  ): Promise<NextResponse> => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      return jsonError(err);
    }
  };
}
