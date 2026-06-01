import 'server-only';

import { FEATURE_DEFAULTS, FEATURE_KEYS, type FeatureFlags } from '@/lib/feature-flags';
import { DEFAULT_MAX_SELECTED_FILES, DEFAULT_SIZE_WARN_MB } from '@/lib/constants';

/**
 * Server configuration & readiness (Block 2). Parsed lazily from environment
 * variables and memoized. Secrets are read here but NEVER returned to the
 * browser — only readiness booleans and non-secret limits cross to the client.
 *
 * The app boots even when Genesys is unconfigured: sync actions are disabled
 * and Diagnostics shows actionable, secret-free guidance (fail closed on the
 * action, not on boot). Authentication, however, requires the admin
 * credentials + session secret to be present; without them the login route
 * fails closed and no feature is reachable.
 */

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function int(value: string | undefined, fallback: number): number {
  const n = value != null ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** A Genesys region API host must be a bare host (no scheme, no path). */
function normalizeRegionHost(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
  // Basic host shape: labels separated by dots, e.g. api.mypurecloud.com
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(trimmed)) return null;
  return trimmed;
}

export interface ServerConfig {
  genesys: {
    clientId: string | null;
    clientSecret: string | null;
    regionHost: string | null;
    configured: boolean;
  };
  auth: {
    adminUsername: string | null;
    adminPassword: string | null;
    sessionSecret: string | null;
    sessionTtlMinutes: number;
    configured: boolean;
  };
  features: FeatureFlags;
  limits: {
    maxFileWarnMb: number;
    maxSelectedFiles: number;
    proxyUploadMaxBytes: number;
    uploadWaitSeconds: number;
  };
  /** Space-separated HTTPS origins added to CSP connect-src for direct upload. */
  uploadConnectSrc: string[];
  environmentLabel: string;
  appVersion: string;
}

let cached: ServerConfig | null = null;

export function getServerConfig(): ServerConfig {
  if (cached) return cached;

  const clientId = process.env.GENESYS_CLIENT_ID?.trim() || null;
  const clientSecret = process.env.GENESYS_CLIENT_SECRET?.trim() || null;
  const regionHost = normalizeRegionHost(process.env.GENESYS_REGION_API_HOST);

  const adminUsername = process.env.ADMIN_USERNAME?.trim() || null;
  const adminPassword = process.env.ADMIN_PASSWORD || null;
  const sessionSecret = process.env.APP_SESSION_SECRET || null;

  const features = Object.fromEntries(
    FEATURE_KEYS.map((key) => [key, bool(process.env[key], FEATURE_DEFAULTS[key])]),
  ) as FeatureFlags;

  const uploadConnectSrc = (process.env.GENESYS_UPLOAD_CONNECT_SRC ?? '')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && /^https:\/\//i.test(s));

  cached = {
    genesys: {
      clientId,
      clientSecret,
      regionHost,
      configured: Boolean(clientId && clientSecret && regionHost),
    },
    auth: {
      adminUsername,
      adminPassword,
      sessionSecret,
      sessionTtlMinutes: int(process.env.SESSION_TTL_MINUTES, 720),
      configured: Boolean(adminUsername && adminPassword && sessionSecret),
    },
    features,
    limits: {
      maxFileWarnMb: int(process.env.MAX_FILE_WARN_MB, DEFAULT_SIZE_WARN_MB),
      maxSelectedFiles: int(process.env.MAX_SELECTED_FILES, DEFAULT_MAX_SELECTED_FILES),
      proxyUploadMaxBytes: int(process.env.PROXY_UPLOAD_MAX_BYTES, 26_214_400),
      uploadWaitSeconds: int(process.env.WORKFLOW_UPLOAD_WAIT_SECONDS, 900),
    },
    uploadConnectSrc,
    environmentLabel: process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL?.trim() || 'local',
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION?.trim() || '0.0.0',
  };
  return cached;
}

/** Reset memoized config (tests only). */
export function __resetConfigCache(): void {
  cached = null;
}

/** Non-secret readiness summary safe to send to the browser/diagnostics. */
export interface ReadinessReport {
  genesysConfigured: boolean;
  authConfigured: boolean;
  missing: string[];
  regionHostValid: boolean;
  features: FeatureFlags;
  environmentLabel: string;
  appVersion: string;
  limits: ServerConfig['limits'];
  directUploadConnectSrcConfigured: boolean;
}

export function getReadiness(): ReadinessReport {
  const cfg = getServerConfig();
  const missing: string[] = [];
  if (!cfg.genesys.clientId) missing.push('GENESYS_CLIENT_ID');
  if (!cfg.genesys.clientSecret) missing.push('GENESYS_CLIENT_SECRET');
  if (!cfg.genesys.regionHost) missing.push('GENESYS_REGION_API_HOST');
  if (!cfg.auth.adminUsername) missing.push('ADMIN_USERNAME');
  if (!cfg.auth.adminPassword) missing.push('ADMIN_PASSWORD');
  if (!cfg.auth.sessionSecret) missing.push('APP_SESSION_SECRET');
  return {
    genesysConfigured: cfg.genesys.configured,
    authConfigured: cfg.auth.configured,
    missing,
    regionHostValid: cfg.genesys.regionHost != null,
    features: cfg.features,
    environmentLabel: cfg.environmentLabel,
    appVersion: cfg.appVersion,
    limits: cfg.limits,
    directUploadConnectSrcConfigured: cfg.uploadConnectSrc.length > 0,
  };
}
