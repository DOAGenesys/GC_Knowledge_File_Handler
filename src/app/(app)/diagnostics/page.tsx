'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/components/app-context';
import { Btn, Card, Badge, StatusBadge, Ring, Callout, Spinner } from '@/components/ui';
import { Icon } from '@/components/icon';
import { api, ApiError } from '@/lib/api-client';
import { fmtDate } from '@/lib/format';
import { hashBlob } from '@/lib/hashing';

type CheckStatus = 'ok' | 'warn' | 'fail' | 'skip';
type CheckGroup = 'Security' | 'Connectivity' | 'Knowledge API' | 'Browser';

interface ServerCheck {
  key: string;
  label: string;
  detail: string;
  group: 'Security' | 'Connectivity' | 'Knowledge API';
  status: CheckStatus;
}

interface DiagnosticsResponse {
  checks: ServerCheck[];
}

interface DiagCheck {
  key: string;
  label: string;
  detail: string;
  group: CheckGroup;
  status: CheckStatus;
}

interface OrgSyncRow {
  synchronizationId?: string;
  sourceName?: string;
  type?: string;
  status?: string;
  fileCount?: number;
  uploadedCount?: number;
  createdAt?: number;
  [k: string]: unknown;
}

const GROUPS: CheckGroup[] = ['Security', 'Connectivity', 'Knowledge API', 'Browser'];

function statusMeta(status: CheckStatus): {
  icon: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
  label: string;
  color: string;
} {
  switch (status) {
    case 'ok':
      return { icon: 'checkCircle', tone: 'success', label: 'Pass', color: 'var(--success)' };
    case 'warn':
      return { icon: 'alert', tone: 'warning', label: 'Review', color: 'var(--warning)' };
    case 'fail':
      return { icon: 'xCircle', tone: 'danger', label: 'Fail', color: 'var(--danger)' };
    case 'skip':
    default:
      return { icon: 'x', tone: 'neutral', label: 'Disabled', color: 'var(--text-faint)' };
  }
}

async function runBrowserChecks(): Promise<DiagCheck[]> {
  // (a) localStorage availability
  let storageStatus: CheckStatus = 'fail';
  try {
    const probe = '__diag_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    storageStatus = 'ok';
  } catch {
    storageStatus = 'fail';
  }

  // (b) WebCrypto AES-GCM availability
  const webcryptoOk = typeof crypto !== 'undefined' && !!crypto.subtle;

  // (c) SHA-256 / MD5 on a small test blob
  let hashStatus: CheckStatus = 'fail';
  try {
    const r = await hashBlob(new Blob([new Uint8Array([1, 2, 3])]));
    hashStatus = r.sha256Base64 && r.md5Base64 ? 'ok' : 'fail';
  } catch {
    hashStatus = 'fail';
  }

  return [
    {
      key: 'browser-storage',
      label: 'localStorage availability',
      detail: 'Encrypted vault read/write',
      group: 'Browser',
      status: storageStatus,
    },
    {
      key: 'browser-webcrypto',
      label: 'WebCrypto (AES-GCM)',
      detail: 'crypto.subtle required for the local vault',
      group: 'Browser',
      status: webcryptoOk ? 'ok' : 'fail',
    },
    {
      key: 'browser-hash',
      label: 'SHA-256 / MD5 on test blob',
      detail: 'Fingerprint + Content-MD5 integrity',
      group: 'Browser',
      status: hashStatus,
    },
  ];
}

export default function DiagnosticsPage() {
  const { features, readiness, toast } = useApp();

  const [checks, setChecks] = useState<DiagCheck[]>([]);
  const [running, setRunning] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [orgRows, setOrgRows] = useState<OrgSyncRow[] | null>(null);
  const [loadingOrg, setLoadingOrg] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    const browser = await runBrowserChecks();
    try {
      const res = await api.get<DiagnosticsResponse>('/api/diagnostics');
      const server: DiagCheck[] = (res.checks ?? []).map((c) => ({
        key: c.key,
        label: c.label,
        detail: c.detail,
        group: c.group,
        status: c.status,
      }));
      setChecks([...server, ...browser]);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Could not reach the diagnostics endpoint.';
      toast({ tone: 'danger', title: 'Diagnostics failed', body: msg });
      // Mark all server-side checks as fail; keep real browser results.
      const failed: DiagCheck[] = [
        {
          key: 'server-unreachable',
          label: 'Server diagnostics',
          detail: 'GET /api/diagnostics',
          group: 'Connectivity',
          status: 'fail',
        },
      ];
      setChecks([...failed, ...browser]);
    } finally {
      setRunning(false);
      setLoaded(true);
    }
  }, [toast]);

  useEffect(() => {
    void run();
  }, [run]);

  const loadOrg = useCallback(async () => {
    setLoadingOrg(true);
    try {
      const res = await api.get<{ synchronizations: OrgSyncRow[] }>(
        '/api/diagnostics/org-synchronizations',
      );
      const rows = (res.synchronizations ?? [])
        .slice()
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      setOrgRows(rows);
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : 'Could not load organization-wide sync activity.';
      toast({ tone: 'danger', title: 'Load failed', body: msg });
      setOrgRows([]);
    } finally {
      setLoadingOrg(false);
    }
  }, [toast]);

  const exportBundle = useCallback(() => {
    const bundle = {
      generatedAt: new Date().toISOString(),
      readiness: readiness ?? null,
      checks: checks.map((c) => ({ key: c.key, label: c.label, group: c.group, status: c.status })),
    };
    try {
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `diagnostics-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({
        tone: 'success',
        title: 'Diagnostics exported',
        body: 'Redacted bundle downloaded (no secrets).',
      });
    } catch {
      toast({ tone: 'danger', title: 'Export failed', body: 'Could not generate the download.' });
    }
  }, [checks, readiness, toast]);

  const active = useMemo(() => checks.filter((c) => c.status !== 'skip'), [checks]);
  const total = active.length;
  const okCount = active.filter((c) => c.status === 'ok').length;
  const warnCount = active.filter((c) => c.status === 'warn').length;
  const failCount = active.filter((c) => c.status === 'fail').length;
  const percent = total ? Math.round(((okCount + warnCount) / total) * 100) : 0;

  const summaryText = running
    ? 'Running checks…'
    : !loaded
      ? 'Not yet run'
      : failCount
        ? 'Action required'
        : warnCount
          ? 'Ready with warnings'
          : 'All systems ready';

  const ringTone = failCount ? 'var(--danger)' : warnCount ? 'var(--warning)' : 'var(--success)';

  const corsNeedsReview = readiness != null && !readiness.directUploadConnectSrcConfigured;

  return (
    <div className="page narrow">
      <div
        className="page-head between"
        style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 14 }}
      >
        <div style={{ minWidth: 0 }}>
          <div className="page-title">Diagnostics</div>
          <div className="page-desc">
            Verify the deployment is safe and capable — without ever revealing secret values. Checks
            adapt to your enabled features and redact tokens, URLs, and signed headers.
          </div>
        </div>
        <Btn variant="default" icon="refresh" onClick={run} disabled={running}>
          {running ? (
            <>
              <Spinner /> Running…
            </>
          ) : (
            'Re-run checks'
          )}
        </Btn>
      </div>

      <Card pad style={{ marginBottom: 18 }}>
        <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
          <div className="row" style={{ gap: 14 }}>
            <Ring value={percent} size={56} tone={ringTone} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{summaryText}</div>
              <div className="faint" style={{ fontSize: 12.5, marginTop: 3 }}>
                {okCount} passed · {warnCount} warning{warnCount !== 1 ? 's' : ''} · {failCount}{' '}
                failure{failCount !== 1 ? 's' : ''} · {total} active checks
              </div>
            </div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <Btn
              variant="default"
              size="sm"
              icon="download"
              onClick={exportBundle}
              disabled={!loaded}
            >
              Export redacted bundle
            </Btn>
          </div>
        </div>
      </Card>

      {!loaded ? (
        <Card pad>
          <div className="row" style={{ gap: 10, justifyContent: 'center', padding: 8 }}>
            <Spinner />{' '}
            <span className="faint" style={{ fontSize: 13 }}>
              Running diagnostics…
            </span>
          </div>
        </Card>
      ) : (
        <div className="grid" style={{ gap: 18 }}>
          {GROUPS.map((g) => {
            const items = checks.filter((c) => c.group === g);
            if (!items.length) return null;
            return (
              <Card key={g}>
                <div className="card-head">
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>{g}</span>
                </div>
                <div>
                  {items.map((c, i, arr) => {
                    const meta = statusMeta(c.status);
                    return (
                      <div
                        key={c.key}
                        className="between"
                        style={{
                          padding: '13px 20px',
                          borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                          opacity: c.status === 'skip' ? 0.6 : 1,
                        }}
                      >
                        <div className="row" style={{ gap: 12 }}>
                          <span
                            style={{ color: meta.color, display: 'grid', placeItems: 'center' }}
                          >
                            <Icon name={meta.icon} size={17} />
                          </span>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.label}</div>
                            <div className="faint mono" style={{ fontSize: 11.5, marginTop: 2 }}>
                              {c.detail}
                            </div>
                          </div>
                        </div>
                        <Badge
                          tone={meta.tone}
                          icon={
                            c.status === 'ok'
                              ? 'check'
                              : c.status === 'fail'
                                ? 'x'
                                : c.status === 'warn'
                                  ? 'alert'
                                  : undefined
                          }
                        >
                          {meta.label}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {corsNeedsReview && (
        <div style={{ marginTop: 18 }}>
          <Callout tone="warning" icon="alert" title="Direct upload CORS — verify">
            The direct-upload connect-src allowlist is not configured. Verify the browser can PUT to
            the Genesys-provided URL in your region. Configure{' '}
            <span className="mono">GENESYS_UPLOAD_CONNECT_SRC</span> with the regional upload host,
            or enable the streaming proxy fallback in Settings.
          </Callout>
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <Card>
          <div className="card-head">
            <Icon
              name="globe"
              size={16}
              style={{
                color: features.ENABLE_ORG_SYNC_DIAGNOSTICS ? 'var(--accent)' : 'var(--text-faint)',
              }}
            />
            <h3>Organization-wide sync activity</h3>
            <span className="sub mono">GET /sources/synchronizations</span>
            {features.ENABLE_ORG_SYNC_DIAGNOSTICS && (
              <div style={{ marginLeft: 'auto' }}>
                <Btn
                  variant="default"
                  size="sm"
                  icon={loadingOrg ? undefined : 'refresh'}
                  onClick={loadOrg}
                  disabled={loadingOrg}
                >
                  {loadingOrg ? (
                    <>
                      <Spinner /> Loading
                    </>
                  ) : (
                    'Load'
                  )}
                </Btn>
              </div>
            )}
          </div>
          {!features.ENABLE_ORG_SYNC_DIAGNOSTICS ? (
            <div style={{ padding: 20 }}>
              <Callout tone="info" icon="lock" title="Support-only — disabled by default">
                This organization-wide view is gated behind{' '}
                <span className="mono">ENABLE_ORG_SYNC_DIAGNOSTICS</span>. It is intended for
                support staff who lost local vault history. Enable it in deployment env only when
                needed.
              </Callout>
            </div>
          ) : !orgRows ? (
            <div className="empty">
              <div className="faint">
                Load organization-wide synchronization activity across all accessible sources.
              </div>
            </div>
          ) : orgRows.length === 0 ? (
            <div className="empty">
              <div className="faint">No organization-wide synchronization activity found.</div>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Files</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {orgRows.map((a, i) => (
                  <tr key={a.synchronizationId ?? `org-${i}`}>
                    <td style={{ fontWeight: 600 }}>{a.sourceName ?? '—'}</td>
                    <td>
                      <Badge tone="neutral">{a.type ?? '—'}</Badge>
                    </td>
                    <td>{a.status ? <StatusBadge status={a.status} /> : '—'}</td>
                    <td className="mono tnum" style={{ fontSize: 12 }}>
                      {a.uploadedCount ?? 0}/{a.fileCount ?? 0}
                    </td>
                    <td className="faint" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                      {a.createdAt ? fmtDate(a.createdAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
