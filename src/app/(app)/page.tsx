'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icon';
import { Badge, Bar, Btn, Callout, Card, CopyId, StatusBadge } from '@/components/ui';
import { useApp } from '@/components/app-context';
import { FEATURE_META } from '@/lib/feature-flags';
import { relTime } from '@/lib/format';
import type { ActiveRunState } from '@/components/run-types';

function StatusTile({
  icon,
  tone,
  value,
  label,
  sub,
  href,
}: {
  icon: string;
  tone: 'success' | 'warning' | 'danger' | 'info' | 'accent';
  value: string;
  label: string;
  sub?: string;
  href?: string;
}) {
  const inner = (
    <Card
      pad
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        cursor: href ? 'pointer' : 'default',
        height: '100%',
      }}
    >
      <div className="between">
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 11,
            display: 'grid',
            placeItems: 'center',
            background: `var(--${tone}-soft)`,
            color: `var(--${tone})`,
          }}
        >
          <Icon name={icon} size={19} />
        </div>
        <span
          className="dot dot-pulse"
          style={{
            width: 8,
            height: 8,
            borderRadius: 99,
            background: `var(--${tone})`,
            color: `var(--${tone})`,
          }}
        />
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em' }}>{value}</div>
        <div className="stat-lbl" style={{ marginTop: 4 }}>
          {label}
        </div>
        {sub ? (
          <div className="faint" style={{ fontSize: 11.5, marginTop: 6 }}>
            {sub}
          </div>
        ) : null}
      </div>
    </Card>
  );
  return href ? (
    <Link href={href} style={{ color: 'inherit' }}>
      {inner}
    </Link>
  ) : (
    inner
  );
}

function ActiveRunMini({ run }: { run: ActiveRunState }) {
  const done = run.files.filter((f) => f.status === 'Uploaded').length;
  const pct = run.files.length ? Math.round((done / run.files.length) * 100) : 0;
  const uploading = run.files.filter((f) => f.status === 'Uploading').length;
  return (
    <div style={{ padding: 20 }}>
      <div className="between" style={{ marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 700 }}>{run.sourceName}</div>
          <div className="row faint" style={{ fontSize: 12, gap: 8, marginTop: 4 }}>
            <Badge tone="neutral" icon="sync">
              {run.syncType}
            </Badge>
            {run.workflowRunId ? (
              <CopyId value={run.workflowRunId} label="run" truncate={16} />
            ) : null}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="stat-num tnum" style={{ fontSize: 24 }}>
            {done}/{run.files.length}
          </div>
          <div className="stat-lbl">uploaded</div>
        </div>
      </div>
      <Bar value={pct} striped={run.status === 'Running'} />
      <div className="row" style={{ marginTop: 16, gap: 10 }}>
        <Link href="/run" className="btn btn-primary btn-sm">
          Open run <Icon name="arrowR" size={15} />
        </Link>
        <span className="faint" style={{ fontSize: 12 }}>
          {uploading} uploading · {run.files.length - done} pending
        </span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { sources, syncRuns, activeRun, readiness, features, prefs } = useApp();

  const liveSources = sources.filter((s) => !s.archived);
  const needsAttention = syncRuns.filter((h) =>
    ['NeedsUserAction', 'CompletionUnknown', 'CancellationUnknown'].includes(h.status),
  );
  const totalUploaded = syncRuns.reduce((s, h) => s + (h.uploadedCount || 0), 0);
  const connected = readiness?.genesysConfigured ?? false;

  return (
    <div className="page">
      <div className="page-head between" style={{ alignItems: 'flex-end' }}>
        <div>
          <div className="page-title">Welcome back</div>
          <div className="page-desc">
            Manage Genesys source files, start syncs, and review anything that needs attention.
          </div>
        </div>
        <Link href="/new" className="btn btn-primary btn-lg">
          <Icon name="sync" size={16} /> Start a sync
        </Link>
      </div>

      {!connected && (
        <div style={{ marginBottom: 18 }}>
          <Callout tone="warning" title="Genesys is not configured">
            Ask your administrator to finish the Genesys connection settings, then run Diagnostics.
          </Callout>
        </div>
      )}

      <div className="grid g4" style={{ marginBottom: 18 }}>
        <StatusTile
          icon={connected ? 'shieldCheck' : 'alert'}
          tone={connected ? 'success' : 'warning'}
          value={connected ? 'Connected' : 'Not configured'}
          label="Genesys Cloud"
          sub={readiness?.regionHostValid ? 'Connection ready' : 'Check connection settings'}
          href="/diagnostics"
        />
        <StatusTile
          icon="lock"
          tone="success"
          value="Unlocked"
          label="Local data"
          sub="Available on this device"
          href="/settings"
        />
        <StatusTile
          icon="shield"
          tone="success"
          value="Protected"
          label="App access"
          sub="Sign-in required"
          href="/diagnostics"
        />
        <StatusTile
          icon="database"
          tone="info"
          value="Local"
          label="Saved data"
          sub="Stored on this device"
        />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.6fr 1fr', marginBottom: 18 }}>
        <Card>
          <div className="card-head">
            <Icon name="activity" size={17} style={{ color: 'var(--accent)' }} />
            <h3>Active sync run</h3>
            {activeRun ? (
              <div style={{ marginLeft: 'auto' }}>
                <StatusBadge status={activeRun.status} />
              </div>
            ) : null}
          </div>
          {activeRun ? (
            <ActiveRunMini run={activeRun} />
          ) : (
            <div style={{ padding: '34px 24px', textAlign: 'center' }}>
              <div
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 14,
                  background: 'var(--surface-3)',
                  display: 'grid',
                  placeItems: 'center',
                  margin: '0 auto 14px',
                  color: 'var(--text-faint)',
                }}
              >
                <Icon name="inbox" size={24} />
              </div>
              <div style={{ fontWeight: 650 }}>No sync running</div>
              <div
                className="muted"
                style={{ fontSize: 13, margin: '6px auto 18px', maxWidth: 360 }}
              >
                Select a source, choose files, and the app will guide the sync from start to finish.
              </div>
              <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
                <Link href="/new" className="btn btn-primary">
                  <Icon name="sync" size={16} /> New sync
                </Link>
                {needsAttention.length > 0 ? (
                  <Btn variant="default" icon="refresh" onClick={() => router.push('/history')}>
                    Review previous runs
                  </Btn>
                ) : null}
              </div>
            </div>
          )}
        </Card>

        <Card pad>
          <div className="row" style={{ marginBottom: 16 }}>
            <Icon name="gauge" size={17} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontWeight: 700, fontSize: 14.5 }}>At a glance</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <div className="stat-num">{liveSources.length}</div>
              <div className="stat-lbl">Sources</div>
            </div>
            <div>
              <div className="stat-num">{syncRuns.length}</div>
              <div className="stat-lbl">Runs (local)</div>
            </div>
            <div>
              <div className="stat-num tnum">{totalUploaded}</div>
              <div className="stat-lbl">Files uploaded</div>
            </div>
            <div>
              <div
                className="stat-num"
                style={{ color: needsAttention.length ? 'var(--warning)' : 'var(--text)' }}
              >
                {needsAttention.length}
              </div>
              <div className="stat-lbl">Need attention</div>
            </div>
          </div>
          <hr className="divider" style={{ margin: '18px 0' }} />
          <div className="between">
            <span className="faint" style={{ fontSize: 12 }}>
              Default sync type
            </span>
            <Badge tone="neutral" icon="sync">
              {prefs.defaultSyncType}
            </Badge>
          </div>
          <div className="between" style={{ marginTop: 10 }}>
            <span className="faint" style={{ fontSize: 12 }}>
              Upload path
            </span>
            <Badge tone="accent" icon="uploadCloud">
              {prefs.uploadMode === 'proxy' ? 'Proxy fallback' : 'Direct to Genesys'}
            </Badge>
          </div>
        </Card>
      </div>

      {needsAttention.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <Callout
            tone="warning"
            icon="shieldAlert"
            title={`${needsAttention.length} run${needsAttention.length > 1 ? 's' : ''} need your attention`}
          >
            Ambiguous outcomes are never auto-completed. Review each run for safe next steps —
            reselect files, verify in Genesys, or cancel.
            <div style={{ marginTop: 10 }}>
              <Btn
                variant="default"
                size="sm"
                iconR="arrowR"
                onClick={() => router.push('/history')}
              >
                Review runs
              </Btn>
            </div>
          </Callout>
        </div>
      )}

      <Card pad style={{ marginBottom: 18 }}>
        <div className="between" style={{ marginBottom: 14 }}>
          <span className="row" style={{ gap: 8, fontWeight: 700, fontSize: 14.5 }}>
            <Icon name="layers" size={16} style={{ color: 'var(--text-muted)' }} /> Enabled features
          </span>
          <Link href="/settings" className="btn btn-ghost btn-sm">
            Manage <Icon name="chevR" size={14} />
          </Link>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {FEATURE_META.map((f) => {
            const on = features[f.key];
            return (
              <Tipless key={f.key} text={`${f.desc}${on ? '' : ' · Disabled'}`}>
                <span
                  className={`badge badge-${on ? (f.danger ? 'danger' : 'success') : 'neutral'}`}
                  style={{ opacity: on ? 1 : 0.6 }}
                >
                  <Icon name={on ? (f.danger ? 'alert' : 'check') : 'x'} size={12} />
                  {f.label}
                </span>
              </Tipless>
            );
          })}
        </div>
      </Card>

      <Card>
        <div className="card-head">
          <Icon name="history" size={17} style={{ color: 'var(--text-muted)' }} />
          <h3>Recent runs</h3>
          <Link href="/history" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}>
            View all <Icon name="chevR" size={14} />
          </Link>
        </div>
        {syncRuns.length === 0 ? (
          <div style={{ padding: '32px 24px', textAlign: 'center' }} className="faint">
            No runs yet. Start a sync to see recent activity here.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Type</th>
                <th>Files</th>
                <th>Status</th>
                <th>When</th>
                <th aria-label="open" />
              </tr>
            </thead>
            <tbody>
              {syncRuns.slice(0, 4).map((h) => (
                <tr
                  key={h.localRunKey}
                  style={{ cursor: 'pointer' }}
                  onClick={() => router.push('/history')}
                >
                  <td style={{ fontWeight: 600 }}>{h.sourceName}</td>
                  <td>
                    <Badge tone="neutral">{h.syncType}</Badge>
                  </td>
                  <td className="tnum mono" style={{ fontSize: 12 }}>
                    {h.uploadedCount}/{h.fileCount}
                  </td>
                  <td>
                    <StatusBadge status={h.status} />
                  </td>
                  <td className="faint" style={{ fontSize: 12.5 }}>
                    {relTime(h.createdAt)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Icon name="chevR" size={15} className="faint" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// Local lightweight tooltip wrapper to avoid importing Tip twice with same name.
function Tipless({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="tip">
      {children}
      <span className="tip-pop" role="tooltip">
        {text}
      </span>
    </span>
  );
}
