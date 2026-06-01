'use client';

import { memo, useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icon';
import {
  Badge,
  Bar,
  Btn,
  Callout,
  Card,
  ConfirmModal,
  CopyId,
  Empty,
  Spinner,
  StatusBadge,
  Tip,
} from '@/components/ui';
import { useApp } from '@/components/app-context';
import { useRunController } from '@/components/run-controller';
import { api, ApiError } from '@/lib/api-client';
import { fmtBytes, extIcon, relTime } from '@/lib/format';
import { hashBlob, matchReselectedFile } from '@/lib/hashing';
import type { ActiveRunFile, ActiveRunState } from '@/components/run-types';

const WF_STEPS = [
  {
    key: 'validate',
    name: 'Validate workflow input',
    detail: 'Pure validation · no file bytes present',
  },
  {
    key: 'source',
    name: 'Resolve & validate source',
    detail: 'Reuse + GET /sources/{id} · FileUpload check',
  },
  {
    key: 'sync',
    name: 'Start synchronization round',
    detail: 'POST /sources/{id}/synchronizations',
  },
  { key: 'upload', name: 'Upload files', detail: 'Per-file ticket → browser PUT → callback' },
  { key: 'complete', name: 'Complete synchronization', detail: 'PATCH status: Completed' },
  { key: 'summary', name: 'Emit final summary', detail: 'Redacted run summary' },
];

type StepStatus = 'pending' | 'active' | 'done' | 'error';

function stepState(key: string, run: ActiveRunState): StepStatus {
  const terminal = [
    'Completed',
    'Cancelled',
    'NeedsUserAction',
    'CompletionUnknown',
    'FailedFatal',
  ].includes(run.status);
  const hasSync = !!run.synchronizationId;
  switch (key) {
    case 'validate':
      return run.status === 'Starting' ? 'active' : 'done';
    case 'source':
      return hasSync
        ? 'done'
        : run.currentStep === 'source'
          ? 'active'
          : run.status === 'Starting'
            ? 'pending'
            : 'active';
    case 'sync':
      return hasSync ? 'done' : run.currentStep === 'sync' ? 'active' : 'pending';
    case 'upload':
      if (run.status === 'Completed') return 'done';
      if (run.status === 'NeedsUserAction' || run.status === 'FailedFatal') return 'error';
      return hasSync ? 'active' : 'pending';
    case 'complete':
      if (run.status === 'Completed') return 'done';
      if (run.status === 'Cancelled') return 'error';
      return run.currentStep === 'complete' ? 'active' : 'pending';
    case 'summary':
      return terminal ? 'done' : 'pending';
    default:
      return 'pending';
  }
}

export default function ActiveRunPage() {
  const { activeRun, setActiveRun, features, prefs, toast } = useApp();
  const { resumePending } = useRunController();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [checkingRemote, setCheckingRemote] = useState(false);
  const reselectTarget = useRef<string | null>(null);
  const reselectInput = useRef<HTMLInputElement>(null);

  // Stable handler so memoized rows don't re-render when an unrelated file's
  // upload progress mutates `activeRun`.
  const handleReselect = useCallback((localFileKey: string) => {
    reselectTarget.current = localFileKey;
    reselectInput.current?.click();
  }, []);

  if (!activeRun) {
    return (
      <div className="page">
        <div className="page-head">
          <div className="page-title">Active run</div>
          <div className="page-desc">
            A durable workflow coordinates each sync. Its atomic steps and per-file uploads appear
            here in real time.
          </div>
        </div>
        <Card>
          <Empty icon="activity" title="No active sync run">
            Start a sync from a source and files to watch the workflow engine in motion.
            <div className="row" style={{ justifyContent: 'center', gap: 10, marginTop: 18 }}>
              <Link href="/new" className="btn btn-primary">
                <Icon name="sync" size={16} /> New sync
              </Link>
            </div>
          </Empty>
        </Card>
      </div>
    );
  }

  const r = activeRun;
  const done = r.files.filter((f) => f.status === 'Uploaded').length;
  const pct = r.files.length ? Math.round((done / r.files.length) * 100) : 0;
  const live = r.status === 'Running' || r.status === 'Cancelling' || r.status === 'Starting';

  const refreshRemote = async () => {
    if (!r.synchronizationId || !features.ENABLE_SOURCE_HISTORY) return;
    setCheckingRemote(true);
    try {
      const { synchronization } = await api.get<{ synchronization: { status: string } }>(
        `/api/sources/${r.sourceId}/synchronizations/${r.synchronizationId}`,
      );
      setActiveRun((run) =>
        run
          ? { ...run, lastRemoteStatus: synchronization.status, lastRemoteCheckedAt: Date.now() }
          : run,
      );
      toast({
        tone: 'info',
        title: 'Remote status refreshed',
        body: 'Genesys is authoritative for sync state.',
      });
    } catch (e) {
      toast({
        tone: 'danger',
        title: 'Could not refresh',
        body: e instanceof ApiError ? e.message : 'Unknown error.',
      });
    } finally {
      setCheckingRemote(false);
    }
  };

  const cancelRun = async () => {
    setConfirmCancel(false);
    setActiveRun((run) => (run ? { ...run, status: 'Cancelling' } : run));
    // Retry briefly to cover the small window before the workflow registers its
    // hook, so the cancel is never lost.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const res = await api.post<{ ok: boolean; retry?: boolean }>('/api/sync/cancel', {
          localRunKey: r.localRunKey,
        });
        if (res.ok) {
          toast({
            tone: 'info',
            title: 'Cancelling sync',
            body: 'Stopping new tickets · aborting in-flight uploads.',
          });
          return;
        }
        if (!res.retry) break;
      } catch (e) {
        toast({
          tone: 'danger',
          title: 'Cancel failed',
          body: e instanceof ApiError ? e.message : 'Unknown error.',
        });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    toast({
      tone: 'warning',
      title: 'Cancel not yet acknowledged',
      body: 'The run is still starting — try Cancel again in a moment.',
    });
  };

  const onReselectFile = async (file: File) => {
    const key = reselectTarget.current;
    reselectTarget.current = null;
    if (!key) return;
    const target = r.files.find((f) => f.localFileKey === key);
    if (!target) return;
    // When the original SHA-256 fingerprint is known, re-hash the reselected
    // file and match on the authoritative hash (PRODUCT.md §7.6/§13) — never
    // accept a different file with merely-matching name/size/mtime.
    let actualSha: string | null = null;
    if (target.sha256Base64) {
      try {
        actualSha = (await hashBlob(file)).sha256Base64;
      } catch {
        actualSha = null;
      }
    }
    const match = matchReselectedFile(
      {
        name: target.uploadFileName,
        size: target.contentLength,
        lastModified: target.lastModified,
        sha256Base64: target.sha256Base64,
      },
      {
        name: file.name,
        size: file.size,
        lastModified: file.lastModified || 0,
        sha256Base64: actualSha,
      },
    );
    if (!match.match) {
      toast({ tone: 'danger', title: 'File does not match', body: match.reason });
      return;
    }
    setActiveRun((run) =>
      run
        ? {
            ...run,
            files: run.files.map((f) => (f.localFileKey === key ? { ...f, file } : f)),
            status: 'Running',
          }
        : run,
    );
    if (!match.confident)
      toast({
        tone: 'warning',
        title: 'Matched by metadata',
        body: 'No stored SHA-256 — matched by name, size and modified time.',
      });
    // Allow state to settle, then resume the retained ticket.
    setTimeout(() => resumePending(key), 0);
  };

  const copySupportBundle = () => {
    const bundle = {
      appVersion: undefined,
      workflowRunId: r.workflowRunId,
      synchronizationId: r.synchronizationId,
      sourceId: prefs.redactNames ? `${r.sourceId.slice(0, 6)}…` : r.sourceId,
      syncType: r.syncType,
      status: r.status,
      lastRemoteStatus: r.lastRemoteStatus,
      counts: { total: r.files.length, uploaded: done },
      files: r.files.map((f) => ({
        name: prefs.redactNames ? undefined : f.uploadFileName,
        ext: f.extension,
        bytes: f.contentLength,
        status: f.status,
        attempts: f.attempts,
        errorCode: f.errorCode,
      })),
    };
    navigator.clipboard?.writeText(JSON.stringify(bundle, null, 2));
    toast({
      tone: 'success',
      title: 'Support bundle copied',
      body: 'Redacted run details on your clipboard.',
    });
  };

  return (
    <div className="page">
      <input
        ref={reselectInput}
        type="file"
        style={{ display: 'none' }}
        aria-hidden="true"
        onChange={(e) => e.target.files?.[0] && void onReselectFile(e.target.files[0])}
      />

      <div
        className="page-head between"
        style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}
      >
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <div className="page-title">Active run</div>
            <StatusBadge status={r.status} />
          </div>
          <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 650 }}>{r.sourceName}</span>
            <Badge tone="neutral" icon="sync">
              {r.syncType}
            </Badge>
            {r.workflowRunId ? <CopyId value={r.workflowRunId} label="run" truncate={18} /> : null}
            {r.synchronizationId ? (
              <CopyId value={r.synchronizationId} label="sync" truncate={18} />
            ) : null}
            {r.synchronizationId && features.ENABLE_SOURCE_HISTORY ? (
              <Btn
                variant="ghost"
                size="sm"
                icon={checkingRemote ? 'loader' : 'refresh'}
                onClick={refreshRemote}
                disabled={checkingRemote}
              >
                {checkingRemote ? (
                  <>
                    <Spinner size={13} /> Checking
                  </>
                ) : (
                  'Refresh remote status'
                )}
              </Btn>
            ) : null}
          </div>
          {r.lastRemoteCheckedAt ? (
            <div className="row faint" style={{ gap: 6, fontSize: 11.5, marginTop: 8 }}>
              <Icon name="cloud" size={13} />
              Remote status{' '}
              <span className="mono" style={{ color: 'var(--text-muted)' }}>
                {r.lastRemoteStatus}
              </span>{' '}
              · checked {relTime(r.lastRemoteCheckedAt)}
            </div>
          ) : null}
        </div>
      </div>

      {r.status === 'NeedsUserAction' && (
        <div style={{ marginBottom: 18 }}>
          <Callout tone="warning" icon="shieldAlert" title="This run needs your decision">
            Some files did not confirm a successful upload. The synchronization will{' '}
            <strong>not</strong> be completed until every file succeeds. Reselect missing files or
            cancel the round.
          </Callout>
        </div>
      )}
      {r.status === 'CompletionUnknown' && (
        <div style={{ marginBottom: 18 }}>
          <Callout tone="warning" icon="help" title="Completion outcome is unknown">
            All files uploaded, but the completion request did not return a confirmed response. The
            app will not retry blindly. Verify the synchronization status in Genesys before starting
            another round.
          </Callout>
        </div>
      )}
      {r.status === 'Completed' && (
        <div style={{ marginBottom: 18 }}>
          <Callout tone="accent" icon="checkCircle" title="Synchronization completed">
            All {r.files.length} files uploaded and the round was patched{' '}
            <span className="mono">Completed</span>. A redacted summary was saved to your local
            vault.
          </Callout>
        </div>
      )}
      {r.status === 'Cancelled' && (
        <div style={{ marginBottom: 18 }}>
          <Callout tone="info" icon="stop" title="Run cancelled">
            The synchronization was patched <span className="mono">Cancelled</span>. {done} file(s)
            uploaded before cancellation may remain in the incomplete round.
          </Callout>
        </div>
      )}

      <div
        className="grid"
        style={{ gridTemplateColumns: '300px 1fr', gap: 18, alignItems: 'start' }}
      >
        <Card pad style={{ position: 'sticky', top: 18 }}>
          <div className="row" style={{ marginBottom: 18, gap: 8 }}>
            <Icon name="cpu" size={16} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 700, fontSize: 14 }}>Workflow steps</span>
          </div>
          <div className="steps">
            {WF_STEPS.map((s) => {
              const st = stepState(s.key, r);
              const cls =
                st === 'done' ? 'done' : st === 'active' ? 'active' : st === 'error' ? 'error' : '';
              return (
                <div className={`step ${cls}`} key={s.key}>
                  <div className="stepline" />
                  <div className="stepdot">
                    {st === 'done' ? (
                      <Icon name="check" size={14} />
                    ) : st === 'error' ? (
                      <Icon name="x" size={14} />
                    ) : st === 'active' ? (
                      <Spinner size={13} />
                    ) : (
                      <Icon name="clock" size={12} />
                    )}
                  </div>
                  <div className="stepbody">
                    <div className="stepname">{s.name}</div>
                    <div className="stepmeta">
                      {s.key === 'upload' ? `${done}/${r.files.length} uploaded` : s.detail}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <hr className="divider" style={{ margin: '18px 0 14px' }} />
          <div className="between" style={{ marginBottom: 10 }}>
            <span className="faint" style={{ fontSize: 12 }}>
              Overall
            </span>
            <span className="mono tnum" style={{ fontSize: 12, fontWeight: 600 }}>
              {pct}%
            </span>
          </div>
          <Bar
            value={pct}
            tone={
              r.status === 'Completed'
                ? 'success'
                : r.status === 'NeedsUserAction' || r.status === 'Cancelled'
                  ? 'warning'
                  : undefined
            }
            striped={live}
          />
        </Card>

        <div className="grid" style={{ gap: 18 }}>
          <Card>
            <div className="card-head">
              <Icon name="files" size={16} style={{ color: 'var(--text-muted)' }} />
              <h3>Files</h3>
              <span className="sub">
                {done} of {r.files.length} uploaded
              </span>
              <div className="row" style={{ marginLeft: 'auto', gap: 8 }}>
                {r.status === 'Running' || r.status === 'Starting' ? (
                  <Btn
                    variant="danger"
                    size="sm"
                    icon="stop"
                    onClick={() => setConfirmCancel(true)}
                  >
                    Cancel
                  </Btn>
                ) : null}
                {[
                  'Completed',
                  'Cancelled',
                  'NeedsUserAction',
                  'CompletionUnknown',
                  'FailedFatal',
                ].includes(r.status) ? (
                  <Link href="/new" className="btn btn-primary btn-sm">
                    <Icon name="sync" size={15} /> New sync
                  </Link>
                ) : null}
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '42%' }}>File</th>
                    <th>Size</th>
                    <th>Progress</th>
                    <th>Status</th>
                    <th aria-label="actions" />
                  </tr>
                </thead>
                <tbody>
                  {r.files.map((f) => (
                    <RunFileRow key={f.localFileKey} f={f} onReselect={handleReselect} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid g2" style={{ gap: 18 }}>
            <Card pad>
              <div className="row" style={{ gap: 8, marginBottom: 12 }}>
                <Icon name="shield" size={15} style={{ color: 'var(--text-muted)' }} />
                <span style={{ fontWeight: 650, fontSize: 13.5 }}>Safety guarantees</span>
              </div>
              {[
                'Completion only after every file succeeds',
                'Upload URLs treated as bearer secrets — never stored',
                'Ambiguous outcomes pause for your decision',
                'No file bytes in workflow payloads',
              ].map((t) => (
                <div
                  key={t}
                  className="row"
                  style={{ gap: 9, padding: '5px 0', alignItems: 'flex-start' }}
                >
                  <span style={{ color: 'var(--success)', marginTop: 1 }}>
                    <Icon name="checkCircle" size={15} />
                  </span>
                  <span style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                    {t}
                  </span>
                </div>
              ))}
            </Card>
            <Card pad>
              <div className="between" style={{ marginBottom: 12 }}>
                <span className="row" style={{ gap: 8, fontWeight: 650, fontSize: 13.5 }}>
                  <Icon name="inbox" size={15} style={{ color: 'var(--text-muted)' }} /> Support
                  bundle
                </span>
              </div>
              <p className="faint" style={{ fontSize: 12.5, lineHeight: 1.55, marginTop: 0 }}>
                Export a redacted diagnostics bundle — run ID, counts, and error codes only. No
                tokens, URLs, signed headers, or file bytes.
              </p>
              <Btn
                variant="default"
                size="sm"
                icon="copy"
                style={{ marginTop: 6 }}
                onClick={copySupportBundle}
              >
                Copy redacted bundle
              </Btn>
            </Card>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => void cancelRun()}
        tone="danger"
        icon="stop"
        title="Cancel this sync round?"
        body={
          <>
            Cancellation may leave already-uploaded files in an incomplete Genesys synchronization
            round. The app stops issuing upload URLs, aborts in-flight uploads, and patches the
            round <span className="mono">Cancelled</span>.
          </>
        }
        confirmLabel="Cancel sync round"
        cancelLabel="Keep running"
      />
    </div>
  );
}

const RunFileRow = memo(function RunFileRow({
  f,
  onReselect,
}: {
  f: ActiveRunFile;
  onReselect: (localFileKey: string) => void;
}) {
  const uploading = f.status === 'Uploading';
  return (
    <tr>
      <td>
        <div className="row" style={{ gap: 11 }}>
          <span style={{ color: 'var(--text-faint)', flexShrink: 0 }}>
            <Icon name={extIcon(f.extension)} size={18} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div
              className="mono"
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 280,
              }}
            >
              {f.uploadFileName}
            </div>
            {f.attempts > 0 ? (
              <div className="faint" style={{ fontSize: 11, marginTop: 2 }}>
                attempt {f.attempts}
                {f.errorCode ? ` · ${f.errorCode}` : ''}
              </div>
            ) : null}
          </div>
        </div>
      </td>
      <td className="tnum mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
        {fmtBytes(f.contentLength)}
      </td>
      <td style={{ minWidth: 130 }}>
        {uploading ? (
          <div style={{ width: 110 }}>
            <Bar value={f.progress} striped />
            <div className="faint mono tnum" style={{ fontSize: 10, marginTop: 4 }}>
              {Math.round(f.progress)}%
            </div>
          </div>
        ) : f.status === 'Uploaded' ? (
          <span className="row" style={{ gap: 5, color: 'var(--success)', fontSize: 12 }}>
            <Icon name="check" size={13} />
            100%
          </span>
        ) : (
          <span className="faint" style={{ fontSize: 12 }}>
            —
          </span>
        )}
      </td>
      <td>
        <StatusBadge status={f.status} />
      </td>
      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        {f.status === 'NeedsReselect' ? (
          <Tip text="Reselect the original file to resume">
            <Btn
              variant="default"
              size="sm"
              icon="refresh"
              onClick={() => onReselect(f.localFileKey)}
            >
              Reselect
            </Btn>
          </Tip>
        ) : null}
      </td>
    </tr>
  );
});
