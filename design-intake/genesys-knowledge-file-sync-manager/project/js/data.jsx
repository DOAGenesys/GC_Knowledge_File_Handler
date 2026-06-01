/* Data layer: constants, validation, formatters, mock data, sample files */

const SUPPORTED_EXT = ['.txt', '.md', '.doc', '.docx', '.csv', '.xls', '.xlsx', '.html', '.pdf'];
const DISALLOWED_CHARS = ['\\', '{', '^', '}', '%', '`', ']', '"', '>', '[', '~', '<', '#', '|'];
const MAX_NAME_LEN = 180;
const DEFAULT_SIZE_WARN_MB = 50;

const EXT_ICON = {
  '.pdf': 'file', '.doc': 'fileText', '.docx': 'fileText', '.txt': 'fileText',
  '.md': 'fileText', '.csv': 'list', '.xls': 'list', '.xlsx': 'list', '.html': 'file',
};

/* ---------- formatters ---------- */
function fmtBytes(b) {
  if (b === 0) return '0 B';
  if (b == null) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return (b / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + u[i];
}
function fmtDate(d) {
  const dt = typeof d === 'number' ? new Date(d) : d;
  return dt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtDateFull(d) {
  const dt = typeof d === 'number' ? new Date(d) : d;
  return dt.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function relTime(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return s + 's ago';
  const m = Math.round(s / 60); if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60); if (h < 24) return h + 'h ago';
  const d = Math.round(h / 24); return d + 'd ago';
}
function getExt(name) {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i).toLowerCase();
}

/* ---------- fake ids / hashes ---------- */
const HEX = '0123456789abcdef';
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function rnd(set, n) { let s = ''; for (let i = 0; i < n; i++) s += set[Math.floor(Math.random() * set.length)]; return s; }
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; const v = c === 'x' ? r : (r & 0x3 | 0x8); return v.toString(16);
  });
}
function sha256b64() { return rnd(B64, 43) + '='; }
function md5b64() { return rnd(B64, 22) + '=='; }
function genSourceId() { return uuid(); }
function genRunId() { return 'run_' + rnd('abcdefghijklmnopqrstuvwxyz0123456789', 22); }
function genSyncId() { return uuid(); }
function genWfStep() { return rnd(HEX, 8); }

/* ---------- filename validation ---------- */
function sanitizeName(name) {
  let base = name.normalize('NFC');
  let ext = getExt(base);
  let stem = ext ? base.slice(0, base.length - ext.length) : base;
  stem = stem.replace(/[\u0000-\u001f\u007f]/g, '');      // control chars
  stem = stem.replace(/[\\/]/g, '');                       // path separators
  stem = stem.replace(/\.\.+/g, '.');                      // traversal
  stem = stem.replace(/\s+/g, '_');                        // whitespace -> _
  DISALLOWED_CHARS.forEach(c => { stem = stem.split(c).join(''); });
  stem = stem.replace(/_{2,}/g, '_').replace(/^[._]+/, '').replace(/[._]+$/, '');
  if (!stem) stem = 'file';
  return stem + ext;
}

/* returns { blocking: [], warnings: [], suggestion: string|null } */
function validateFile(file, allNames) {
  const name = file.name;
  const ext = getExt(name);
  const blocking = [], warnings = [];

  if (!name || !name.trim()) blocking.push({ code: 'EMPTY', msg: 'File name is empty.' });
  if (!SUPPORTED_EXT.includes(ext)) blocking.push({ code: 'EXT', msg: `Unsupported type "${ext || 'none'}". Allowed: ${SUPPORTED_EXT.join(' ')}` });
  if (name.startsWith('.')) blocking.push({ code: 'DOT', msg: 'Name must not start with a dot.' });
  if (name.endsWith('/')) blocking.push({ code: 'SLASH', msg: 'Name must not end with a forward slash.' });
  if (/\s/.test(name)) blocking.push({ code: 'WS', msg: 'Name contains whitespace.' });
  const bad = DISALLOWED_CHARS.filter(c => name.includes(c));
  if (bad.length) blocking.push({ code: 'CHARS', msg: `Contains disallowed characters: ${bad.join(' ')}` });
  if (/[\\/]/.test(name)) blocking.push({ code: 'SEP', msg: 'Contains a path separator.' });
  if (/[\u0000-\u001f\u007f]/.test(name)) blocking.push({ code: 'CTRL', msg: 'Contains control characters.' });
  if (name.includes('..')) blocking.push({ code: 'TRAVERSAL', msg: 'Contains ".." path traversal segment.' });

  if (name.length > MAX_NAME_LEN) warnings.push({ code: 'LONG', msg: `Very long name (${name.length} chars).` });
  if (file.size === 0) warnings.push({ code: 'ZERO', msg: 'Zero-byte file — confirm before uploading.' });
  if (file.size > DEFAULT_SIZE_WARN_MB * 1024 * 1024) warnings.push({ code: 'BIG', msg: `Large file (${fmtBytes(file.size)}) — exceeds ${DEFAULT_SIZE_WARN_MB} MB threshold.` });
  if (/[\u0400-\u04FF].*[a-z]|[a-z].*[\u0400-\u04FF]/i.test(name)) warnings.push({ code: 'SPOOF', msg: 'Mixed Unicode scripts — possible spoofing.' });
  if (!file.lastModified) warnings.push({ code: 'NOMOD', msg: 'Missing modified timestamp.' });

  // duplicate detection on sanitized upload name
  const upload = sanitizeName(name);
  const dupes = (allNames || []).filter(n => sanitizeName(n).toLowerCase() === upload.toLowerCase());
  if (dupes.length > 1) blocking.push({ code: 'DUP', msg: 'Duplicate upload name within this sync plan.' });

  const needsRename = blocking.some(b => ['DOT', 'WS', 'CHARS', 'SEP', 'CTRL', 'TRAVERSAL', 'SLASH'].includes(b.code));
  const suggestion = needsRename && SUPPORTED_EXT.includes(ext) ? upload : null;

  let status = 'Ready';
  if (blocking.length) status = 'Invalid';
  else if (warnings.length) status = 'Warning';

  return { blocking, warnings, suggestion, uploadName: upload, status };
}

/* ---------- sample files (curated to show every state) ---------- */
function makeSampleFiles() {
  const now = Date.now();
  const f = (name, size, type, mod) => ({ name, size, type: type || '', lastModified: mod == null ? now - Math.random() * 9e8 : mod, __sample: true });
  return [
    f('Onboarding_Playbook_2026.pdf', 2_412_544, 'application/pdf'),
    f('Refund Policy v3.docx', 184_320, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    f('product-faq.md', 28_904, 'text/markdown'),
    f('Tier 1 Macros#draft.csv', 51_200, 'text/csv'),
    f('escalation_matrix.xlsx', 96_100, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    f('.hidden_notes.txt', 1_204, 'text/plain'),
    f('release_notes.exe', 8_900_000, 'application/octet-stream'),
    f('Knowledge Base Export.html', 740_000, 'text/html'),
    f('empty_template.txt', 0, 'text/plain'),
  ];
}

/* ---------- source type + remote status metadata ---------- */
const SOURCE_TYPE_META = {
  FileUpload: { label: 'FileUpload', compatible: true, icon: 'database' },
  Web:        { label: 'Web crawl', compatible: false, icon: 'globe' },
  SharePoint: { label: 'SharePoint', compatible: false, icon: 'folder' },
  Salesforce: { label: 'Salesforce', compatible: false, icon: 'cloud' },
  ServiceNow: { label: 'ServiceNow', compatible: false, icon: 'server' },
};
const REMOTE_STATUS_META = {
  Active:  { tone: 'success', label: 'Active' },
  Idle:    { tone: 'neutral', label: 'Idle' },
  Syncing: { tone: 'accent',  label: 'Syncing' },
  Error:   { tone: 'danger',  label: 'Error' },
};

/* ---------- feature flags (v1.1 endpoint scope) ---------- */
const FEATURE_DEFAULTS = {
  ENABLE_SOURCE_DISCOVERY: true,
  ENABLE_SOURCE_CREATION: true,
  ENABLE_SOURCE_HISTORY: true,
  ENABLE_ORG_SYNC_DIAGNOSTICS: false,
  ENABLE_FULL_SYNC: false,
  ENABLE_PROXY_UPLOAD: false,
  ENABLE_SOURCE_UPDATE: false,
  ENABLE_SOURCE_DELETE: false,
};
const FEATURE_META = [
  { key: 'ENABLE_SOURCE_DISCOVERY', label: 'Source discovery', desc: 'List & import remote Knowledge sources', endpoint: 'GET /knowledge/sources', read: true },
  { key: 'ENABLE_SOURCE_CREATION', label: 'Source creation', desc: 'Create new FileUpload sources', endpoint: 'POST /knowledge/sources' },
  { key: 'ENABLE_SOURCE_HISTORY', label: 'Source sync history', desc: 'Read per-source synchronization activity', endpoint: 'GET …/synchronizations', read: true },
  { key: 'ENABLE_ORG_SYNC_DIAGNOSTICS', label: 'Org-wide sync diagnostics', desc: 'Support-only organization activity view', endpoint: 'GET /sources/synchronizations', read: true },
  { key: 'ENABLE_FULL_SYNC', label: 'Full sync', desc: 'Allow Full replacement synchronizations', endpoint: 'type: Full' },
  { key: 'ENABLE_PROXY_UPLOAD', label: 'Proxy upload fallback', desc: 'Stream bytes via server when CORS blocks direct upload', endpoint: 'streaming proxy' },
  { key: 'ENABLE_SOURCE_UPDATE', label: 'Update source', desc: 'Edit FileUpload-safe source fields', endpoint: 'PUT /knowledge/sources/{id}', danger: true },
  { key: 'ENABLE_SOURCE_DELETE', label: 'Delete source', desc: 'Permanently delete a Knowledge source — unrecoverable', endpoint: 'DELETE /knowledge/sources/{id}', danger: true },
];

/* ---------- mock source registry (local vault) ---------- */
function seedSources() {
  return [
    { localSourceKey: uuid(), sourceId: 'a7f3c9e2-1b44-4d8a-9c21-6e0f2b8d4a11', displayName: 'Support KB — Production', remoteName: 'Support KB — Production', sourceType: 'FileUpload', isCompatibleFileUploadSource: true, remoteStatus: 'Active', createdByApp: true, dateAddedToVault: Date.now() - 41 * 864e5, lastValidatedAt: Date.now() - 2 * 36e5, lastRemoteSyncAt: Date.now() - 2 * 36e5, lastUsedAt: Date.now() - 2 * 36e5, lastSyncRunId: 'run_9fk2mq', archived: false, lastSync: { status: 'Completed', files: 14, when: Date.now() - 2 * 36e5 } },
    { localSourceKey: uuid(), sourceId: 'c1d8b4a0-77e2-4f19-bb3c-90a1e7c2f558', displayName: 'Billing & Refunds KB', remoteName: 'Billing & Refunds KB', sourceType: 'FileUpload', isCompatibleFileUploadSource: true, remoteStatus: 'Idle', createdByApp: true, dateAddedToVault: Date.now() - 18 * 864e5, lastValidatedAt: Date.now() - 6 * 864e5, lastRemoteSyncAt: Date.now() - 6 * 864e5, lastUsedAt: Date.now() - 6 * 864e5, lastSyncRunId: 'run_3xz8la', archived: false, lastSync: { status: 'NeedsUserAction', files: 6, when: Date.now() - 6 * 864e5 } },
    { localSourceKey: uuid(), sourceId: 'e5a2f7c3-90b1-4a6d-8e44-2c9b0d1f3a76', displayName: 'Field Ops Manual (existing)', remoteName: null, sourceType: 'FileUpload', isCompatibleFileUploadSource: true, remoteStatus: null, createdByApp: false, dateAddedToVault: Date.now() - 9 * 864e5, lastValidatedAt: null, lastRemoteSyncAt: null, lastUsedAt: Date.now() - 9 * 864e5, lastSyncRunId: null, archived: false, localOnly: true, lastSync: null },
  ];
}

/* ---------- remote source discovery (GET /knowledge/sources) ---------- */
function seedRemoteSources() {
  const d = 864e5;
  return [
    { sourceId: 'a7f3c9e2-1b44-4d8a-9c21-6e0f2b8d4a11', name: 'Support KB — Production', type: 'FileUpload', status: 'Active', lastSyncAt: Date.now() - 2 * 36e5, documentCount: 142 },
    { sourceId: 'c1d8b4a0-77e2-4f19-bb3c-90a1e7c2f558', name: 'Billing & Refunds KB', type: 'FileUpload', status: 'Idle', lastSyncAt: Date.now() - 6 * d, documentCount: 38 },
    { sourceId: 'e5a2f7c3-90b1-4a6d-8e44-2c9b0d1f3a76', name: 'Field Ops Manual', type: 'FileUpload', status: 'Active', lastSyncAt: Date.now() - 9 * d, documentCount: 61 },
    { sourceId: '9b2e4f17-3c8a-4d56-bb20-7e1a9c4d2f88', name: 'HR Policies — Fabric', type: 'FileUpload', status: 'Active', lastSyncAt: null, documentCount: 0 },
    { sourceId: '4c7a1d93-5b2e-4f08-9a16-3d8c0e2b7f41', name: 'Product Docs — Fabric', type: 'FileUpload', status: 'Idle', lastSyncAt: Date.now() - 3 * d, documentCount: 207 },
    { sourceId: '2f1d8b60-7e3a-4c19-8d52-6a0b9f1c3e74', name: 'Help Center — Web Crawl', type: 'Web', status: 'Active', lastSyncAt: Date.now() - 1 * d, documentCount: 980 },
    { sourceId: '8e3b9a02-1f6c-4d83-bb47-5c2e0a9d6f15', name: 'Engineering Wiki — SharePoint', type: 'SharePoint', status: 'Error', lastSyncAt: Date.now() - 4 * d, documentCount: 412 },
    { sourceId: 'd6a90c34-2b7e-4f51-9a83-1e5d8c0b2f96', name: 'Salesforce Knowledge', type: 'Salesforce', status: 'Idle', lastSyncAt: Date.now() - 12 * d, documentCount: 1530 },
  ];
}

/* ---------- per-source remote sync activity (GET …/synchronizations) ---------- */
const _activityCache = {};
function genSyncActivity(sourceId) {
  if (_activityCache[sourceId]) return _activityCache[sourceId];
  let seed = 0; for (const c of sourceId) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const statuses = ['Completed', 'Completed', 'Completed', 'Cancelled', 'CompletionUnknown', 'Completed'];
  const n = 4 + Math.floor(rng() * 3);
  const out = [];
  for (let i = 0; i < n; i++) {
    const st = i === 0 && rng() > 0.8 ? 'Running' : statuses[Math.floor(rng() * statuses.length)];
    const files = 3 + Math.floor(rng() * 28);
    const created = Date.now() - (i + 1) * (1 + Math.floor(rng() * 5)) * 864e5 - Math.floor(rng() * 36e5);
    out.push({
      synchronizationId: uuid(), type: rng() > 0.78 ? 'Full' : 'Incremental', status: st,
      createdAt: created, completedAt: ['Completed'].includes(st) ? created + (3 + Math.floor(rng() * 25)) * 6e4 : null,
      fileCount: files, uploadedCount: st === 'Completed' ? files : Math.floor(files * rng()),
    });
  }
  _activityCache[sourceId] = out;
  return out;
}

/* ---------- mock history ---------- */
function seedHistory() {
  return [
    { localRunKey: uuid(), workflowRunId: 'run_9fk2mqp4d8s', sourceId: 'a7f3c9e2-1b44-4d8a-9c21-6e0f2b8d4a11', sourceName: 'Support KB — Production', synchronizationId: '3b7e1c90-44a2-4f8e-9d12-77c0a1e4b2f3', syncType: 'Incremental', status: 'Completed', createdAt: Date.now() - 2 * 36e5, completedAt: Date.now() - 2 * 36e5 + 9 * 6e4, fileCount: 14, uploadedCount: 14, failedCount: 0, skippedCount: 0, errorSummary: null },
    { localRunKey: uuid(), workflowRunId: 'run_3xz8laq2m1k', sourceId: 'c1d8b4a0-77e2-4f19-bb3c-90a1e7c2f558', sourceName: 'Billing & Refunds KB', synchronizationId: 'f0c2a8d1-6b33-4e91-aa70-1d8e3c5f2901', syncType: 'Incremental', status: 'NeedsUserAction', createdAt: Date.now() - 6 * 864e5, completedAt: null, fileCount: 6, uploadedCount: 4, failedCount: 0, skippedCount: 0, needsUserActionCount: 2, errorSummary: 'UploadResultUnknown — 2 files awaiting reselect' },
    { localRunKey: uuid(), workflowRunId: 'run_pl5tk9w3z7n', sourceId: 'a7f3c9e2-1b44-4d8a-9c21-6e0f2b8d4a11', sourceName: 'Support KB — Production', synchronizationId: '8d4a1f60-2c77-4b09-91ee-5a0c7e2d1b48', syncType: 'Full', status: 'Completed', createdAt: Date.now() - 11 * 864e5, completedAt: Date.now() - 11 * 864e5 + 21 * 6e4, fileCount: 31, uploadedCount: 31, failedCount: 0, skippedCount: 2, errorSummary: null },
    { localRunKey: uuid(), workflowRunId: 'run_kq2m8x4v6b1', sourceId: 'c1d8b4a0-77e2-4f19-bb3c-90a1e7c2f558', sourceName: 'Billing & Refunds KB', synchronizationId: 'a1b2c3d4-5e6f-4a8b-9c0d-1e2f3a4b5c6d', syncType: 'Incremental', status: 'Cancelled', createdAt: Date.now() - 14 * 864e5, completedAt: null, cancelledAt: Date.now() - 14 * 864e5 + 3 * 6e4, fileCount: 8, uploadedCount: 3, failedCount: 0, skippedCount: 0, errorSummary: 'Cancelled by user after 3 uploads' },
    { localRunKey: uuid(), workflowRunId: 'run_w7n3p9k2t5x', sourceId: 'a7f3c9e2-1b44-4d8a-9c21-6e0f2b8d4a11', sourceName: 'Support KB — Production', synchronizationId: '5f8e2a10-9c44-4d23-8b71-0e3a6c9f1d22', syncType: 'Incremental', status: 'CompletionUnknown', createdAt: Date.now() - 23 * 864e5, completedAt: null, fileCount: 12, uploadedCount: 12, failedCount: 0, skippedCount: 0, errorSummary: 'Completion patch timed out — verify in Genesys' },
  ];
}

/* ---------- workflow step catalogue (for Active Run timeline) ---------- */
const WF_STEPS = [
  { key: 'validate', name: 'Validate workflow input', detail: 'Pure validation · no file bytes present' },
  { key: 'token', name: 'Acquire Genesys access token', detail: 'Client-credentials · server memory only' },
  { key: 'source', name: 'Resolve & validate source', detail: 'Reuse + GET /sources/{id} · FileUpload check' },
  { key: 'sync', name: 'Start synchronization round', detail: 'POST /sources/{id}/synchronizations' },
  { key: 'upload', name: 'Upload files', detail: 'Per-file ticket → browser PUT → callback' },
  { key: 'complete', name: 'Complete synchronization', detail: 'PATCH status: Completed' },
  { key: 'summary', name: 'Emit final summary', detail: 'Redacted run summary' },
];

const REGION = 'mypurecloud.com (us-east-1)';

Object.assign(window, {
  SUPPORTED_EXT, DISALLOWED_CHARS, EXT_ICON, DEFAULT_SIZE_WARN_MB, REGION,
  fmtBytes, fmtDate, fmtDateFull, relTime, getExt,
  uuid, sha256b64, md5b64, genSourceId, genRunId, genSyncId, genWfStep,
  sanitizeName, validateFile, makeSampleFiles, seedSources, seedHistory, WF_STEPS,
  SOURCE_TYPE_META, REMOTE_STATUS_META, FEATURE_DEFAULTS, FEATURE_META,
  seedRemoteSources, genSyncActivity,
});
