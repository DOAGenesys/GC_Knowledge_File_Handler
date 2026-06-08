import 'server-only';

import { FEATURE_DEFAULTS, FEATURE_KEYS, type FeatureFlags } from '@/lib/feature-flags';
import { DEFAULT_MAX_SELECTED_FILES, DEFAULT_SIZE_WARN_MB } from '@/lib/constants';

/**
 * Server configuration & readiness (Block 2). Parsed lazily from environment
 * variables and memoized. Secrets are read here but NEVER returned to the
 * browser — only readiness booleans and non-secret limits cross to the client.
 *
 * The app boots without server-side Genesys credentials. Users provide the
 * Genesys Cloud region and OAuth client ID on the sign-in page, then the app
 * uses their own PKCE session for API calls. Server-side authentication only
 * requires the app session secret used to protect cookies and short-lived tokens.
 */

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function int(value: string | undefined, fallback: number): number {
  const n = value != null ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Normalize a Genesys region input (e.g. mypurecloud.de) to an API host
 * (api.mypurecloud.de). Accepts bare region domains, api./login. prefixes, or
 * full https URLs — all are reduced to the region domain before api. is added.
 */
export function normalizeRegionHost(raw: string | undefined): string | null {
  if (!raw) return null;
  let host: string;
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      host = new URL(trimmed).hostname.toLowerCase();
    } catch {
      return null;
    }
  } else {
    if (trimmed.includes('/')) return null;
    host = trimmed.toLowerCase();
  }
  host = host.replace(/^login\./, '').replace(/^api\./, '');
  // Basic host shape: labels separated by dots, e.g. api.mypurecloud.com
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) return null;
  return `api.${host}`;
}

export interface ServerConfig {
  genesys: {
    clientId: string | null;
    regionHost: string | null;
    configured: boolean;
  };
  auth: {
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
  const regionHost = normalizeRegionHost(process.env.GENESYS_REGION);

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
      regionHost,
      configured: Boolean(clientId && regionHost),
    },
    auth: {
      sessionSecret,
      sessionTtlMinutes: int(process.env.SESSION_TTL_MINUTES, 720),
      configured: Boolean(sessionSecret),
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

export function getReadiness(
  genesysSession?: { regionHost?: string | null } | null,
): ReadinessReport {
  const cfg = getServerConfig();
  const missing: string[] = [];
  if (!cfg.auth.sessionSecret) missing.push('APP_SESSION_SECRET');
  const activeRegionHost = genesysSession?.regionHost ?? cfg.genesys.regionHost;
  return {
    genesysConfigured: Boolean(genesysSession ?? cfg.genesys.configured),
    authConfigured: cfg.auth.configured,
    missing,
    regionHostValid: activeRegionHost != null,
    features: cfg.features,
    environmentLabel: cfg.environmentLabel,
    appVersion: cfg.appVersion,
    limits: cfg.limits,
    directUploadConnectSrcConfigured: cfg.uploadConnectSrc.length > 0,
  };
}
