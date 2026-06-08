'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icon';
import {
  Badge,
  Bar,
  Btn,
  Callout,
  Card,
  ConfirmModal,
  CopyId,
  Segmented,
  Spinner,
  StatusBadge,
  Tip,
} from '@/components/ui';
import { useApp } from '@/components/app-context';
import { api, ApiError } from '@/lib/api-client';
import { SUPPORTED_EXTENSIONS } from '@/lib/constants';
import { fmtBytes, extIcon, relTime } from '@/lib/format';
import { hashBlob, mapWithConcurrency } from '@/lib/hashing';
import { uuid } from '@/lib/ids';
import {
  getExtension,
  mimeFromExtension,
  sanitizeUploadName,
  validateFile,
  type FileValidationResult,
} from '@/lib/validation';
import type { SyncType } from '@/lib/types';
import type { ActiveRunFile, ActiveRunState } from '@/components/run-types';

interface Item {
  id: string;
  file: File;
  originalName: string;
  uploadName: string;
  size: number;
  type: string;
  lastModified: number;
  hashing: boolean;
  progress: number;
  sha256: string | null;
  md5: string | null;
}

interface Computed extends Item {
  v: FileValidationResult;
  status: string;
}

export default function NewSyncPage() {
  const router = useRouter();
  const { sources, prefs, features, setActiveRun, updateVault, toast } = useApp();

  const active = sources.filter((s) => !s.archived && s.isCompatibleFileUploadSource !== false);
  const fullEnabled = features.ENABLE_FULL_SYNC;
  const [sourceKey, setSourceKey] = useState(active[0]?.localSourceKey ?? '');
  const [syncType, setSyncType] = useState<SyncType>(
    prefs.defaultSyncType === 'Full' && !fullEnabled ? 'Incremental' : prefs.defaultSyncType,
  );
  const [validating, setValidating] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmFull, setConfirmFull] = useState(false);
  const [starting, setStarting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const source = active.find((s) => s.localSourceKey === sourceKey);

  const updateItem = (id: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const startHashing = async (newItems: Item[]) => {
    await mapWithConcurrency(newItems, 2, async (it) => {
      try {
        const r = await hashBlob(it.file, {
          onProgress: (frac) => updateItem(it.id, { progress: Math.round(frac * 100) }),
        });
        updateItem(it.id, {
          hashing: false,
          progress: 100,
          sha256: r.sha256Base64,
          md5: r.md5Base64,
        });
      } catch {
        updateItem(it.id, { hashing: false });
      }
    });
  };

  const addFiles = (fileList: FileList | File[]) => {
    const incoming: Item[] = Array.from(fileList).map((f) => ({
      id: uuid(),
      file: f,
      originalName: f.name,
      uploadName: f.name,
      size: f.size,
      type: f.type || '',
      lastModified: f.lastModified || 0,
      hashing: false,
      progress: 0,
      sha256: null,
      md5: null,
    }));
    const toHash: Item[] = [];
    for (const it of incoming) {
      const v = validateFile({
        name: it.uploadName,
        size: it.size,
        type: it.type,
        lastModified: it.lastModified,
      });
      if (v.status !== 'Invalid') {
        it.hashing = true;
        toHash.push(it);
      }
    }
    setItems((prev) => [...prev, ...incoming]);
    if (toHash.length) void startHashing(toHash);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  };

  const computed: Computed[] = useMemo(() => {
    const names = items.map((it) => sanitizeUploadName(it.uploadName));
    return items.map((it, idx) => {
      const siblings = names.filter((_, i) => i !== idx);
      const v = validateFile(
        { name: it.uploadName, size: it.size, type: it.type, lastModified: it.lastModified },
        siblings,
        { sizeWarnMb: prefs.sizeWarnMb },
      );
      const status = it.hashing
        ? 'Hashing'
        : v.status === 'Invalid'
          ? 'Invalid'
          : v.status === 'Warning'
            ? 'Warning'
            : 'Ready';
      return { ...it, v, status };
    });
  }, [items, prefs.sizeWarnMb]);

  const blockingCount = computed.filter((c) => c.v.blocking.length).length;
  const readyCount = computed.filter((c) => c.status === 'Ready' || c.status === 'Warning').length;
  const hashingCount = computed.filter((c) => c.hashing).length;
  const totalSize = items.reduce((s, it) => s + it.size, 0);
  const canStart =
    items.length > 0 && blockingCount === 0 && hashingCount === 0 && !!source && !starting;

  const fixAll = () => {
    setItems((prev) =>
      prev.map((it) => {
        const v = validateFile({
          name: it.uploadName,
          size: it.size,
          type: it.type,
          lastModified: it.lastModified,
        });
        return v.suggestion ? { ...it, uploadName: v.suggestion } : it;
      }),
    );
    toast({
      tone: 'success',
      title: 'Applied safe renames',
      body: 'File names were updated for Genesys.',
    });
  };

  const validateSource = async () => {
    if (!source) return;
    setValidating(true);
    try {
      const { source: remote } = await api.get<{
        source: {
          id: string;
          type: string;
          status?: string;
          isCompatibleFileUploadSource: boolean;
        };
      }>(`/api/sources/${source.sourceId}`);
      await updateVault((d) => {
        const rec = d.sourceRegistry.find((x) => x.localSourceKey === source.localSourceKey);
        if (rec) {
          rec.lastValidatedAt = Date.now();
          rec.isCompatibleFileUploadSource = remote.isCompatibleFileUploadSource;
          if (remote.status) rec.remoteStatus = remote.status as never;
        }
      });
      toast({
        tone: 'success',
        title: 'Source validated',
        body: 'This source is ready to use.',
      });
    } catch (e) {
      toast({
        tone: 'danger',
        title: 'Validation failed',
        body: e instanceof ApiError ? e.message : 'Could not validate source.',
      });
    } finally {
      setValidating(false);
    }
  };

  const doStart = () => {
    if (syncType === 'Full') {
      setConfirmFull(true);
      return;
    }
    void launch();
  };

  const launch = async () => {
    if (!source) return;
    setStarting(true);
    const valid = computed.filter((c) => c.status !== 'Invalid');
    const localRunKey = uuid();

    const manifest = valid.map((c) => {
      const uploadFileName = sanitizeUploadName(c.uploadName);
      const ext = getExtension(uploadFileName);
      return {
        localFileKey: c.id,
        originalName: c.originalName,
        uploadFileName,
        extension: ext,
        contentType: c.type || mimeFromExtension(ext),
        contentLength: c.size,
        lastModified: c.lastModified,
        sha256Base64: c.sha256,
        contentMd5Base64: c.md5,
      };
    });

    try {
      const { workflowRunId } = await api.post<{ workflowRunId: string; localRunKey: string }>(
        '/api/sync/start',
        {
          localRunKey,
          sourceMode: 'existing',
          sourceId: source.sourceId,
          syncType,
          fullSyncConfirmed: syncType === 'Full' ? true : undefined,
          files: manifest,
        },
      );

      const runFiles: ActiveRunFile[] = valid.map((c) => ({
        localFileKey: c.id,
        file: c.file,
        originalName: c.originalName,
        uploadFileName: sanitizeUploadName(c.uploadName),
        extension: getExtension(c.uploadName),
        contentType: c.type || mimeFromExtension(getExtension(c.uploadName)),
        contentLength: c.size,
        lastModified: c.lastModified,
        sha256Base64: c.sha256,
        contentMd5Base64: c.md5,
        status: 'Ready',
        progress: 0,
        attemptId: null,
        attempts: 0,
        errorCode: null,
      }));

      const run: ActiveRunState = {
        localRunKey,
        workflowRunId,
        sourceId: source.sourceId,
        sourceName: source.displayName,
        syncType,
        status: 'Running',
        files: runFiles,
        startedAt: Date.now(),
        synchronizationId: null,
        lastRemoteStatus: null,
        lastRemoteCheckedAt: null,
        currentStep: 'source',
        errorSummary: null,
      };
      setActiveRun(run);
      toast({
        tone: 'success',
        title: 'Sync started',
        body: `${manifest.length} files queued · ${syncType}`,
      });
      router.push('/run');
    } catch (e) {
      toast({
        tone: 'danger',
        title: 'Could not start sync',
        body: e instanceof ApiError ? e.message : 'Unknown error.',
      });
      setStarting(false);
    }
  };

  if (active.length === 0) {
    return (
      <div className="page">
        <div className="page-head">
          <div className="page-title">New sync</div>
          <div className="page-desc">
            Choose a compatible source, then drop files to review and sync.
          </div>
        </div>
        <Card pad>
          <Callout tone="info" icon="database" title="No compatible sources yet">
            Discover, add, or create an upload source first.
            <div style={{ marginTop: 12 }}>
              <Link href="/sources" className="btn btn-primary btn-sm">
                <Icon name="plus" size={15} /> Go to Sources
              </Link>
            </div>
          </Callout>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-title">New sync</div>
        <div className="page-desc">
          Choose files, review any warnings, and start the sync when everything is ready.
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 18 }}>
        <div className="grid g2" style={{ gap: 18 }}>
          <Card pad>
            <div className="between" style={{ marginBottom: 10 }}>
              <div className="label">Destination source</div>
              <Btn
                variant="ghost"
                size="sm"
                icon={validating ? 'loader' : 'shieldCheck'}
                onClick={validateSource}
                disabled={validating || !source}
              >
                {validating ? (
                  <>
                    <Spinner size={14} /> Validating
                  </>
                ) : (
                  'Validate'
                )}
              </Btn>
            </div>
            <select
              className="select"
              value={sourceKey}
              onChange={(e) => setSourceKey(e.target.value)}
              aria-label="Destination source"
            >
              {active.map((s) => (
                <option key={s.localSourceKey} value={s.localSourceKey}>
                  {s.displayName}
                </option>
              ))}
            </select>
            {source ? (
              <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
                <CopyId value={source.sourceId} label="sourceId" truncate={20} />
                <Badge tone="success" icon="check">
                  Upload source
                </Badge>
                {source.lastValidatedAt ? (
                  <Badge tone="neutral" icon="shieldCheck">
                    Validated {relTime(source.lastValidatedAt)}
                  </Badge>
                ) : (
                  <Badge tone="warning" icon="alert">
                    Not validated
                  </Badge>
                )}
                {source.localOnly ? (
                  <Badge tone="warning" icon="alert">
                    Added manually
                  </Badge>
                ) : null}
              </div>
            ) : null}
            <Link
              href="/sources"
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 12, paddingLeft: 0 }}
            >
              <Icon name="plus" size={14} /> Discover, add or create a source
            </Link>
          </Card>

          <Card pad>
            <div className="label" style={{ marginBottom: 10 }}>
              Sync type
            </div>
            <Segmented
              value={syncType}
              onChange={setSyncType}
              accent
              options={
                fullEnabled
                  ? [
                      { value: 'Incremental', label: 'Incremental' },
                      { value: 'Full', label: 'Full' },
                    ]
                  : [{ value: 'Incremental', label: 'Incremental' }]
              }
            />
            <div className="faint" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>
              {syncType === 'Incremental'
                ? 'Default. Adds or updates the files you upload this round.'
                : 'Replacement semantics depend on your Genesys environment — requires explicit confirmation.'}
            </div>
            {!fullEnabled ? (
              <div style={{ marginTop: 12 }}>
                <Callout tone="info" icon="lock">
                  Full sync is not enabled for this deployment.
                </Callout>
              </div>
            ) : null}
            {syncType === 'Full' ? (
              <div style={{ marginTop: 12 }}>
                <Callout tone="warning" title="Full sync">
                  Confirm how your Genesys environment handles files that are missing from this
                  upload.
                </Callout>
              </div>
            ) : null}
          </Card>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          aria-hidden="true"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <div
          className={`dropzone ${over ? 'over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          role="button"
          tabIndex={0}
          aria-label="Drop files or press Enter to browse"
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        >
          <div className="dz-ico">
            <Icon name="uploadCloud" size={26} />
          </div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Drop files here</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            or browse — file names are checked before upload
          </div>
          <div className="row" style={{ justifyContent: 'center', gap: 10, marginTop: 18 }}>
            <Btn variant="default" icon="folder" onClick={() => inputRef.current?.click()}>
              Browse files
            </Btn>
          </div>
          <div
            className="row"
            style={{ justifyContent: 'center', gap: 6, marginTop: 20, flexWrap: 'wrap' }}
          >
            {SUPPORTED_EXTENSIONS.map((e) => (
              <span key={e} className="tag-mini">
                {e}
              </span>
            ))}
          </div>
        </div>

        {items.length > 0 && (
          <Card>
            <div className="card-head">
              <Icon name="filter" size={16} style={{ color: 'var(--accent)' }} />
              <h3>Preflight</h3>
              <span className="sub">
                {items.length} files · {fmtBytes(totalSize)}
              </span>
              <div className="row" style={{ marginLeft: 'auto', gap: 8 }}>
                {computed.some((c) => c.v.suggestion) ? (
                  <Btn variant="default" size="sm" icon="wand" onClick={fixAll}>
                    Fix all names
                  </Btn>
                ) : null}
                <Btn variant="ghost" size="sm" icon="trash" onClick={() => setItems([])}>
                  Clear
                </Btn>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '40%' }}>File</th>
                    <th>Size</th>
                    <th>Check</th>
                    <th>Status</th>
                    <th aria-label="actions" />
                  </tr>
                </thead>
                <tbody>
                  {computed.map((c) => (
                    <PreflightRow
                      key={c.id}
                      c={c}
                      editing={editId === c.id}
                      onEdit={() => setEditId(c.id)}
                      onName={(n) => {
                        updateItem(c.id, { uploadName: n });
                        setEditId(null);
                      }}
                      onApply={() =>
                        c.v.suggestion && updateItem(c.id, { uploadName: c.v.suggestion })
                      }
                      onRemove={() => setItems((prev) => prev.filter((it) => it.id !== c.id))}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {items.length > 0 && (
        <div style={{ position: 'sticky', bottom: 0, marginTop: 22, zIndex: 5 }}>
          <Card style={{ boxShadow: 'var(--shadow-lg)' }}>
            <div className="between" style={{ padding: '14px 20px' }}>
              <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
                <Stat icon="checkCircle" tone="success" n={readyCount} label="ready" />
                <Stat icon="xCircle" tone="danger" n={blockingCount} label="blocking" />
                <Stat icon="fingerprint" tone="accent" n={hashingCount} label="checking" />
              </div>
              <div className="row" style={{ gap: 12 }}>
                {blockingCount > 0 ? (
                  <span className="faint" style={{ fontSize: 12.5 }}>
                    Resolve blocking errors to continue
                  </span>
                ) : null}
                {hashingCount > 0 ? (
                  <span className="row faint" style={{ fontSize: 12.5, gap: 6 }}>
                    <Spinner size={14} /> Checking files…
                  </span>
                ) : null}
                <Btn variant="primary" size="lg" icon="zap" disabled={!canStart} onClick={doStart}>
                  {starting ? (
                    <>
                      <Spinner /> Starting…
                    </>
                  ) : (
                    'Start sync'
                  )}
                </Btn>
              </div>
            </div>
          </Card>
        </div>
      )}

      <ConfirmModal
        open={confirmFull}
        onClose={() => setConfirmFull(false)}
        onConfirm={() => {
          setConfirmFull(false);
          void launch();
        }}
        tone="warning"
        icon="alert"
        title="Confirm Full synchronization"
        body={
          <>
            A <strong>Full</strong> sync may replace existing content depending on your Genesys
            configuration. Confirm you understand how missing files are handled before continuing.
          </>
        }
        confirmLabel="I understand — start Full sync"
      />
    </div>
  );
}

function Stat({ icon, tone, n, label }: { icon: string; tone: string; n: number; label: string }) {
  return (
    <div className="row" style={{ gap: 7 }}>
      <span style={{ color: `var(--${tone})` }}>
        <Icon name={icon} size={16} />
      </span>
      <span style={{ fontWeight: 700 }} className="tnum">
        {n}
      </span>
      <span className="faint" style={{ fontSize: 12.5 }}>
        {label}
      </span>
    </div>
  );
}

function PreflightRow({
  c,
  editing,
  onEdit,
  onName,
  onApply,
  onRemove,
}: {
  c: Computed;
  editing: boolean;
  onEdit: () => void;
  onName: (n: string) => void;
  onApply: () => void;
  onRemove: () => void;
}) {
  const renamed = c.uploadName !== c.originalName;
  return (
    <tr>
      <td>
        <div className="row" style={{ gap: 11 }}>
          <span style={{ color: 'var(--text-faint)', flexShrink: 0 }}>
            <Icon name={extIcon(getExtension(c.uploadName))} size={18} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            {editing ? (
              <input
                className="input mono btn-sm"
                style={{ height: 30, fontSize: 12 }}
                defaultValue={c.uploadName}
                autoFocus
                aria-label="Upload file name"
                onBlur={(e) => onName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onName((e.target as HTMLInputElement).value);
                }}
              />
            ) : (
              <div className="row" style={{ gap: 6 }}>
                <span
                  className="mono"
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.uploadName}
                </span>
                <button
                  className="iconbtn"
                  style={{
                    width: 22,
                    height: 22,
                    border: 'none',
                    background: 'transparent',
                    boxShadow: 'none',
                  }}
                  onClick={onEdit}
                  aria-label="Rename file"
                >
                  <Icon name="edit" size={13} />
                </button>
              </div>
            )}
            {renamed ? (
              <div
                className="faint"
                style={{ fontSize: 11, marginTop: 2, textDecoration: 'line-through' }}
              >
                {c.originalName}
              </div>
            ) : null}
            {c.v.blocking.map((b, i) => (
              <div
                key={i}
                className="row"
                style={{ gap: 5, fontSize: 11.5, color: 'var(--danger)', marginTop: 3 }}
              >
                <Icon name="alertCircle" size={12} />
                {b.message}
              </div>
            ))}
            {c.v.warnings.map((w, i) => (
              <div
                key={i}
                className="row"
                style={{ gap: 5, fontSize: 11.5, color: 'var(--warning)', marginTop: 3 }}
              >
                <Icon name="alert" size={12} />
                {w.message}
              </div>
            ))}
          </div>
        </div>
      </td>
      <td className="tnum mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
        {fmtBytes(c.size)}
      </td>
      <td style={{ minWidth: 130 }}>
        {c.hashing ? (
          <div style={{ width: 110 }}>
            <Bar value={c.progress} tone="success" striped />
            <div className="faint mono" style={{ fontSize: 10, marginTop: 4 }}>
              SHA-256 {c.progress}%
            </div>
          </div>
        ) : c.sha256 ? (
          <Tip text={`SHA-256: ${c.sha256}\nMD5(b64): ${c.md5}`}>
            <span className="row tag-mini" style={{ gap: 5 }}>
              <Icon name="fingerprint" size={12} />
              {c.sha256.slice(0, 10)}…
            </span>
          </Tip>
        ) : (
          <span className="faint" style={{ fontSize: 12 }}>
            —
          </span>
        )}
      </td>
      <td>
        <StatusBadge status={c.status} />
      </td>
      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        {c.v.suggestion ? (
          <Tip text={`Rename to ${c.v.suggestion}`}>
            <button
              className="iconbtn"
              style={{ width: 28, height: 28, color: 'var(--accent)' }}
              onClick={onApply}
              aria-label="Apply safe rename"
            >
              <Icon name="wand" size={14} />
            </button>
          </Tip>
        ) : null}
        <button
          className="iconbtn"
          style={{ width: 28, height: 28, marginLeft: 6 }}
          onClick={onRemove}
          aria-label="Remove file"
        >
          <Icon name="x" size={14} />
        </button>
      </td>
    </tr>
  );
}
