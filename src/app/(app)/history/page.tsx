'use client';

/**
 * History screen — encrypted local run summaries cross-checked against
 * authoritative Genesys synchronization history. Local history lives only in the
 * vault and clears when site data is cleared; remote history is authoritative for
 * status but cannot restore browser-local file bytes.
 */
import { useMemo, useState } from 'react';
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
  StatusBadge,
} from '@/components/ui';
import { Icon } from '@/components/icon';
import { fmtDate, fmtDateFull } from '@/lib/format';
import type { SyncRunRecord } from '@/lib/types';

type LocalFilter = 'all' | 'completed' | 'attention';

const ATTENTION_STATUSES = ['NeedsUserAction', 'CompletionUnknown', 'CancellationUnknown'] as const;

function needsAttention(status: string): boolean {
  return (ATTENTION_STATUSES as readonly string[]).includes(status);
}

function buildSupportBundle(run: SyncRunRecord, redactNames: boolean) {
  return {
    workflowRunId: run.workflowRunId,
    synchronizationId: run.synchronizationId,
    sourceId: redactNames ? `${run.sourceId.slice(0, 6)}...` : run.sourceId,
    sourceName: redactNames ? undefined : run.sourceName,
    syncType: run.syncType,
    status: run.status,
    lastRemoteStatus: run.lastRemoteStatus,
    counts: {
      total: run.fileCount,
      uploaded: run.uploadedCount,
      failed: run.failedCount,
      needsUserAction: run.needsUserActionCount,
    },
    files: run.files.map((f) => ({
      name: redactNames ? undefined : f.uploadFileName,
      ext: f.extension,
      bytes: f.contentLength,
      status: f.uploadStatus,
      attempts: f.attempts,
      errorCode: f.lastErrorCode,
    })),
  };
}

export default function HistoryPage() {
  const { syncRuns, prefs, toast } = useApp();

  const [selected, setSelected] = useState<SyncRunRecord | null>(null);
  const [filter, setFilter] = useState<LocalFilter>('all');

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

  const copyBundle = async (run: SyncRunRecord) => {
    await navigator.clipboard?.writeText(JSON.stringify(buildSupportBundle(run, prefs.redactNames), null, 2));
    toast({
      tone: 'success',
      title: 'Support bundle copied',
      body: 'Redacted run details on your clipboard.',
    });
  };

  return (
    <div className="page">
      <div
        className="page-head between"
        style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 14 }}
      >
        <div style={{ minWidth: 0 }}>
          <div className="page-title">History</div>
          <div className="page-desc">
            Redacted local run summaries from your encrypted vault. Genesys remains authoritative
            for remote status; source detail pages show remote activity when enabled.
          </div>
        </div>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'completed', label: 'Completed' },
            { value: 'attention', label: 'Attention' },
          ]}
        />
      </div>

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

      <RunDetail
        run={selected}
        onClose={() => setSelected(null)}
        onCopyBundle={(run) => void copyBundle(run)}
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
  onCopyBundle,
}: {
  run: SyncRunRecord | null;
  onClose: () => void;
  onCopyBundle: (run: SyncRunRecord) => void;
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
              app prefers a safe pause over unsafe completion. If browser file handles were lost,
              start a new sync with the same files.
              <div className="row" style={{ marginTop: 12, gap: 8 }}>
                <Btn variant="default" size="sm" icon="copy" onClick={() => onCopyBundle(run)}>
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
        <Btn variant="ghost" icon="copy" onClick={() => onCopyBundle(run)}>
          Copy support bundle
        </Btn>
        <Btn variant="default" onClick={onClose}>
          Close
        </Btn>
      </div>
    </Modal>
  );
}
