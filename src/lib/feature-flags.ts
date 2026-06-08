/**
 * Feature flags (PRODUCT.md §9.3). The set of enabled flags is resolved
 * server-side from environment variables and exposed to the browser through a
 * non-secret `/api/features` payload. The UI hides disabled features and the
 * server independently re-checks the relevant flag on every optional route.
 */

export const FEATURE_KEYS = [
  'ENABLE_SOURCE_DISCOVERY',
  'ENABLE_SOURCE_CREATION',
  'ENABLE_SOURCE_HISTORY',
  'ENABLE_ORG_SYNC_DIAGNOSTICS',
  'ENABLE_FULL_SYNC',
  'ENABLE_SOURCE_UPDATE',
  'ENABLE_SOURCE_RESET',
  'ENABLE_SOURCE_DELETE',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type FeatureFlags = Record<FeatureKey, boolean>;

/**
 * Default production posture (PRODUCT.md §9.3). Read-only discovery/history and
 * source creation default ON; support-only and destructive capabilities OFF.
 * The actual deployment value always comes from env — these are the fallbacks
 * applied when a variable is unset.
 */
export const FEATURE_DEFAULTS: FeatureFlags = {
  ENABLE_SOURCE_DISCOVERY: true,
  ENABLE_SOURCE_CREATION: true,
  ENABLE_SOURCE_HISTORY: true,
  ENABLE_ORG_SYNC_DIAGNOSTICS: false,
  ENABLE_FULL_SYNC: false,
  ENABLE_SOURCE_UPDATE: false,
  ENABLE_SOURCE_RESET: true,
  ENABLE_SOURCE_DELETE: false,
};

export interface FeatureMeta {
  key: FeatureKey;
  label: string;
  desc: string;
  endpoint: string;
  /** Read-only (non-mutating) capability. */
  read?: boolean;
  /** Destructive / high-risk capability — shown in danger styling. */
  danger?: boolean;
}

/** UI metadata describing each flag (mirrors the design prototype). */
export const FEATURE_META: readonly FeatureMeta[] = [
  {
    key: 'ENABLE_SOURCE_DISCOVERY',
    label: 'Source discovery',
    desc: 'List & import remote Knowledge sources',
    endpoint: 'GET /knowledge/sources',
    read: true,
  },
  {
    key: 'ENABLE_SOURCE_CREATION',
    label: 'Source creation',
    desc: 'Create new FileUpload sources',
    endpoint: 'POST /knowledge/sources',
  },
  {
    key: 'ENABLE_SOURCE_HISTORY',
    label: 'Source sync history',
    desc: 'Read per-source synchronization activity',
    endpoint: 'GET …/synchronizations',
    read: true,
  },
  {
    key: 'ENABLE_ORG_SYNC_DIAGNOSTICS',
    label: 'Org-wide sync diagnostics',
    desc: 'Support-only organization activity view',
    endpoint: 'GET /sources/synchronizations',
    read: true,
  },
  {
    key: 'ENABLE_FULL_SYNC',
    label: 'Full sync',
    desc: 'Allow Full replacement synchronizations',
    endpoint: 'type: Full',
  },
  {
    key: 'ENABLE_SOURCE_UPDATE',
    label: 'Update source',
    desc: 'Edit FileUpload-safe source fields',
    endpoint: 'PUT /knowledge/sources/{id}',
    danger: true,
  },
  {
    key: 'ENABLE_SOURCE_RESET',
    label: 'Reset source',
    desc: 'Replace an existing source with a new empty source',
    endpoint: 'POST /knowledge/sources + DELETE /knowledge/sources/{id}',
    danger: true,
  },
  {
    key: 'ENABLE_SOURCE_DELETE',
    label: 'Delete source',
    desc: 'Permanently delete a Knowledge source — unrecoverable',
    endpoint: 'DELETE /knowledge/sources/{id}',
    danger: true,
  },
];
