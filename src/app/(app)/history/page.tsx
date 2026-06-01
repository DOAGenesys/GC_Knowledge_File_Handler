'use client';

/**
 * History screen — encrypted local run summaries cross-checked against
 * authoritative Genesys synchronization history. Local history lives only in the
 * vault and clears when site data is cleared; remote history is authoritative for
 * status but cannot restore browser-local file bytes.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/app-context';
import {
  Badge,
  Btn,
  Callout,
  Card,
  CopyId,
  DetailField,
  Empty,
  IconBtn,
  Modal,
  Segmented,
  Spinner,
  StatusBadge,
} from '@/components/ui';
import { Icon } from '@/components/icon';
import { api, ApiError } from '@/lib/api-client';
import { fmtDate, fmtDateFull } from '@/lib/format';
import type { GenesysSynchronizationSummary, SyncRunRecord } from '@/lib/types';

type LocalFilter = 'all' | 'completed' | 'attention';
type HistoryView = 'local' | 'remote';

const ATTENTION_STATUSES = ['NeedsUserAction', 'CompletionUnknown', 'CancellationUnknown'] as const;

function needsAttention(status: string): boolean {
  return (ATTENTION_STATUSES as readonly string[]).includes(status);
}

interface RemoteRow {
  key: string;
  synchronizationId: string;
  sourceName: string;
  type: string;
  status: string;
  uploadedCount: number;
  fileCount: number;
  createdAtMs: number;
}

function toMs(value: string | null | undefined): number {
  if (!value) return 0;
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
}

export default function HistoryPage() {
  const { syncRuns, sources, features, toast } = useApp();
  const router = useRouter();

  const [selected, setSelected] = useState<SyncRunRecord | null>(null);
  const [filter, setFilter] = useState<LocalFilter>('all');
  const [view, setView] = useState<HistoryView>('local');

  const filtered = useMemo(
    () =>
      syncRuns.filter((h) =>
        filter === 'all'
          ? true
          : filter === 'attention'
            ? needsAttention(h.status)
            : h.status === 'Completed',
      ),
    [syncRuns, filter],
  );

  // ---- Remote activity (Genesys) ----
  const remoteSources = useMemo(
    () =>
      sources.filter(
        (s) => !s.archived && s.isCompatibleFileUploadSource !== false && s.remoteStatus,
      ),
    [sources],
  );

  const [remoteRows, setRemoteRows] = useState<RemoteRow[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);

  const remoteEnabled = features.ENABLE_SOURCE_HISTORY;

  useEffect(() => {
    if (!remoteEnabled || view !== 'remote') return;
    let active = true;
    const controller = new AbortController();

    (async () => {
      setRemoteLoading(true);
      setRemoteError(null);
      try {
        const rows: RemoteRow[] = [];
        for (const src of remoteSources) {
          const { synchronizations } = await api.get<{
            synchronizations: GenesysSynchronizationSummary[];
          }>(`/api/sources/${src.sourceId}/synchronizations`, controller.signal);
          for (const s of synchronizations) {
            rows.push({
              key: `${src.sourceId}:${s.id}`,
              synchronizationId: s.id,
              sourceName: src.displayName,
              type: typeof s.type === 'string' ? s.type : String(s.type),
              status: s.status,
              uploadedCount: s.uploadedCount ?? 0,
              fileCount: s.fileCount ?? 0,
              createdAtMs: toMs(s.dateCreated),
            });
          }
        }
        rows.sort((a, b) => b.createdAtMs - a.createdAtMs);
        if (active) setRemoteRows(rows);
      } catch (err) {
        if (controller.signal.aborted) return;
        const message =
          err instanceof ApiError ? err.message : 'Could not load remote synchronization history.';
        if (active) {
          setRemoteError(message);
          setRemoteRows([]);
        }
        toast({ tone: 'danger', title: 'Remote history unavailable', body: message });
      } finally {
        if (active) setRemoteLoading(false);
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [remoteEnabled, view, remoteSources, toast]);

  return (
    <div className="page">
      <div
        className="page-head between"
        style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 14 }}
      >
        <div style={{ minWidth: 0 }}>
          <div className="page-title">History</div>
          <div className="page-desc">
            Local run summaries from your encrypted vault, cross-checked against authoritative
            Genesys synchronization history. Local history clears if you clear site data.
          </div>
        </div>
        {view === 'local' && (
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'completed', label: 'Completed' },
              { value: 'attention', label: 'Attention' },
            ]}
          />
        )}
      </div>

      {remoteEnabled && (
        <div style={{ marginBottom: 18 }}>
          <Segmented
            value={view}
            onChange={setView}
            accent
            options={[
              { value: 'local', label: 'Local vault history' },
              { value: 'remote', label: 'Remote activity (Genesys)' },
            ]}
          />
        </div>
      )}

      {view === 'local' ? (
        <Card>
          <table className="table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Type</th>
                <th>Files</th>
                <th>Local status</th>
                <th>Remote status</th>
                <th>Started</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((h) => (
                <tr
                  key={h.localRunKey}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelected(h)}
                >
                  <td style={{ fontWeight: 600 }}>{h.sourceName}</td>
                  <td>
                    <Badge tone="neutral">{h.syncType}</Badge>
                  </td>
                  <td className="mono tnum" style={{ fontSize: 12 }}>
                    {h.uploadedCount}/{h.fileCount}
                  </td>
                  <td>
                    <StatusBadge status={h.status} />
                  </td>
                  <td>
                    {h.lastRemoteStatus ? (
                      <span className="tag-mini">{h.lastRemoteStatus}</span>
                    ) : (
                      <span className="faint" style={{ fontSize: 12 }}>
                        —
                      </span>
                    )}
                  </td>
                  <td className="faint" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                    {fmtDate(h.createdAt)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Icon name="chevR" size={15} className="faint" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <Empty icon="history" title="No runs to show">
              Runs you start will appear here as redacted local summaries.
            </Empty>
          )}
        </Card>
      ) : (
        <Card>
          <div className="card-head">
            <Icon name="globe" size={16} style={{ color: 'var(--accent)' }} />
            <h3>Remote synchronization activity</h3>
            <span className="sub mono">GET …/synchronizations</span>
          </div>

          {remoteLoading ? (
            <div
              className="row"
              style={{ gap: 10, justifyContent: 'center', padding: '40px 20px' }}
            >
              <Spinner size={18} />
              <span className="faint" style={{ fontSize: 13 }}>
                Reading Genesys synchronization history…
              </span>
            </div>
          ) : remoteError ? (
            <div style={{ padding: '0 20px 18px' }}>
              <Callout tone="danger" icon="alertCircle" title="Could not load remote history">
                {remoteError}
              </Callout>
            </div>
          ) : (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Files</th>
                    <th>When</th>
                    <th>Sync ID</th>
                  </tr>
                </thead>
                <tbody>
                  {remoteRows.map((a) => (
                    <tr key={a.key}>
                      <td style={{ fontWeight: 600 }}>{a.sourceName}</td>
                      <td>
                        <Badge tone="neutral">{a.type}</Badge>
                      </td>
                      <td>
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="mono tnum" style={{ fontSize: 12 }}>
                        {a.uploadedCount}/{a.fileCount}
                      </td>
                      <td className="faint" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                        {a.createdAtMs ? fmtDate(a.createdAtMs) : '—'}
                      </td>
                      <td>
                        <span className="tag-mini">{a.synchronizationId.slice(0, 13)}…</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {remoteRows.length === 0 && (
                <Empty icon="globe" title="No remote activity">
                  Validate or import sources to read their Genesys synchronization history.
                </Empty>
              )}
            </>
          )}

          <div style={{ padding: '0 20px 18px' }}>
            <Callout tone="info" icon="shield">
              Genesys is authoritative for remote sync status, but remote history cannot restore
              browser-local file bytes — reselect is still required to resume an interrupted upload.
            </Callout>
          </div>
        </Card>
      )}

      <RunDetail
        run={selected}
        onClose={() => setSelected(null)}
        onResume={() => {
          setSelected(null);
          toast({
            tone: 'info',
            title: 'Resuming run',
            body: 'Reselect any files the browser no longer holds.',
          });
          router.push('/run');
        }}
        onCopyBundle={() =>
          toast({
            tone: 'success',
            title: 'Support bundle copied',
            body: 'Redacted run details on clipboard.',
          })
        }
      />
    </div>
  );
}

function CountStat({
  tone,
  icon,
  n,
  label,
}: {
  tone: 'success' | 'danger' | 'neutral' | 'warning' | 'info';
  icon: string;
  n: number;
  label: string;
}) {
  return (
    <div className="row" style={{ gap: 8 }}>
      <span style={{ color: `var(--${tone})` }}>
        <Icon name={icon} size={17} />
      </span>
      <span className="stat-num" style={{ fontSize: 20 }}>
        {n}
      </span>
      <span className="faint" style={{ fontSize: 12.5 }}>
        {label}
      </span>
    </div>
  );
}

function RunDetail({
  run,
  onClose,
  onResume,
  onCopyBundle,
}: {
  run: SyncRunRecord | null;
  onClose: () => void;
  onResume: () => void;
  onCopyBundle: () => void;
}) {
  if (!run) return null;
  const attention = needsAttention(run.status);
  const durSec =
    run.completedAt != null ? Math.round((run.completedAt - run.createdAt) / 1000) : null;

  return (
    <Modal open={!!run} onClose={onClose} wide>
      <div className="card-head" style={{ padding: '18px 24px' }}>
        <div className="row" style={{ gap: 10 }}>
          <h3 style={{ fontSize: 16 }}>{run.sourceName}</h3>
          <StatusBadge status={run.status} />
        </div>
        <IconBtn
          icon="x"
          size={16}
          label="Close"
          style={{ marginLeft: 'auto' }}
          onClick={onClose}
        />
      </div>

      <div className="modal-body scroll" style={{ maxHeight: '64vh', overflowY: 'auto' }}>
        {attention && (
          <div style={{ marginBottom: 18 }}>
            <Callout
              tone="warning"
              icon={run.status === 'NeedsUserAction' ? 'shieldAlert' : 'help'}
              title={
                run.status === 'NeedsUserAction'
                  ? 'Needs action'
                  : run.status === 'CompletionUnknown'
                    ? 'Completion unknown'
                    : 'Cancellation unknown'
              }
            >
              {run.errorSummary || 'This run reached an ambiguous state and was not completed.'} The
              app prefers a safe pause over unsafe completion.
              <div className="row" style={{ marginTop: 12, gap: 8 }}>
                {run.status === 'NeedsUserAction' && (
                  <Btn variant="primary" size="sm" icon="refresh" onClick={onResume}>
                    Resume &amp; reselect
                  </Btn>
                )}
                <Btn variant="default" size="sm" icon="copy" onClick={onCopyBundle}>
                  Copy support bundle
                </Btn>
              </div>
            </Callout>
          </div>
        )}

        <div className="grid g2" style={{ gap: 14 }}>
          <DetailField
            label="Sync type"
            value={
              <Badge tone="neutral" icon="sync">
                {run.syncType}
              </Badge>
            }
          />
          <DetailField label="Final status" value={<StatusBadge status={run.status} />} />
          <DetailField label="Started" value={fmtDateFull(run.createdAt)} />
          <DetailField
            label="Duration"
            value={durSec != null ? `${Math.floor(durSec / 60)}m ${durSec % 60}s` : '—'}
          />
          <DetailField
            label="Workflow run ID"
            value={run.workflowRunId ? <CopyId value={run.workflowRunId} label="run" /> : '—'}
          />
          <DetailField
            label="Synchronization ID"
            value={
              run.synchronizationId ? <CopyId value={run.synchronizationId} truncate={22} /> : '—'
            }
          />
          <DetailField label="Source ID" value={<CopyId value={run.sourceId} redact />} />
          <DetailField
            label="Last remote status"
            value={
              run.lastRemoteStatus ? (
                <span className="tag-mini">{run.lastRemoteStatus}</span>
              ) : (
                <span className="faint">—</span>
              )
            }
          />
        </div>

        <hr className="divider" style={{ margin: '20px 0' }} />

        <div className="row" style={{ gap: 20, flexWrap: 'wrap' }}>
          <CountStat tone="success" icon="checkCircle" n={run.uploadedCount} label="uploaded" />
          <CountStat tone="danger" icon="xCircle" n={run.failedCount} label="failed" />
          <CountStat tone="neutral" icon="x" n={run.skippedCount} label="skipped" />
          {run.needsUserActionCount > 0 && (
            <CountStat
              tone="warning"
              icon="shieldAlert"
              n={run.needsUserActionCount}
              label="need action"
            />
          )}
          <CountStat tone="info" icon="files" n={run.fileCount} label="total" />
        </div>

        <div style={{ marginTop: 20 }}>
          <Callout tone="info" icon="shield" title="Privacy">
            This summary contains no tokens, upload URLs, signed headers, or file bytes. File names
            are stored only in your encrypted vault and redacted from server logs.
          </Callout>
        </div>
      </div>

      <div className="modal-foot">
        <Btn variant="ghost" icon="copy" onClick={onCopyBundle}>
          Copy support bundle
        </Btn>
        <Btn variant="default" onClick={onClose}>
          Close
        </Btn>
      </div>
    </Modal>
  );
}
