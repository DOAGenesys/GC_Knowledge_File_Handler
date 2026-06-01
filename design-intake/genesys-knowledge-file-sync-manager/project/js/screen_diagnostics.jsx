/* Diagnostics — environment & capability checks + Knowledge API scope + org-wide sync */
const BASE_CHECKS = [
  { key: 'access', label: 'App access protection', detail: 'Workflow start endpoint requires authentication', group: 'Security' },
  { key: 'region', label: 'Genesys region API host', detail: REGION, group: 'Connectivity' },
  { key: 'token', label: 'OAuth token acquisition', detail: 'Client credentials · token never exposed to browser', group: 'Connectivity' },
  { key: 'workflow', label: 'Durable workflow runtime', detail: 'Durable execution backend reachable', group: 'Connectivity' },
  { key: 'srclist', label: 'Source list permission', detail: 'GET /knowledge/sources', group: 'Knowledge API', flag: 'ENABLE_SOURCE_DISCOVERY' },
  { key: 'srcget', label: 'Source get / validate', detail: 'GET /knowledge/sources/{id}', group: 'Knowledge API' },
  { key: 'srchist', label: 'Source sync history', detail: 'GET …/synchronizations', group: 'Knowledge API', flag: 'ENABLE_SOURCE_HISTORY' },
  { key: 'orgsync', label: 'Org-wide sync diagnostics', detail: 'GET /sources/synchronizations', group: 'Knowledge API', flag: 'ENABLE_ORG_SYNC_DIAGNOSTICS' },
  { key: 'storage', label: 'localStorage availability', detail: 'Encrypted vault read/write', group: 'Browser' },
  { key: 'webcrypto', label: 'WebCrypto (AES-GCM)', detail: 'Required for the local vault', group: 'Browser' },
  { key: 'hash', label: 'SHA-256 / MD5 on test blob', detail: 'Fingerprint + Content-MD5 integrity', group: 'Browser' },
  { key: 'cors', label: 'Direct upload CORS probe', detail: 'Short-lived test ticket · browser PUT allowed', group: 'Connectivity', warn: true },
];

function DiagnosticsScreen() {
  const { toast, features } = useApp();
  const [state, setState] = useState({});
  const [running, setRunning] = useState(false);
  const [orgRows, setOrgRows] = useState(null);
  const [loadingOrg, setLoadingOrg] = useState(false);

  const checks = useMemo(() => BASE_CHECKS.map(c => ({ ...c, skipped: c.flag ? !features[c.flag] : false })), [features]);

  const run = () => {
    setRunning(true);
    const active = checks.filter(c => !c.skipped);
    setState(Object.fromEntries(checks.map(c => [c.key, c.skipped ? 'skip' : 'pending'])));
    active.forEach((c, i) => {
      setTimeout(() => setState(s => ({ ...s, [c.key]: 'running' })), 200 + i * 360);
      setTimeout(() => setState(s => ({ ...s, [c.key]: c.warn ? 'warn' : 'ok' })), 200 + i * 360 + 320);
    });
    setTimeout(() => { setRunning(false); }, 200 + active.length * 360 + 360);
  };

  useEffect(() => { run(); /* eslint-disable-next-line */ }, []);

  const loadOrg = () => { setLoadingOrg(true); setTimeout(() => {
    const rows = [];
    seedRemoteSources().filter(s => SOURCE_TYPE_META[s.type]?.compatible).forEach(s => genSyncActivity(s.sourceId).slice(0, 2).forEach(a => rows.push({ ...a, sourceName: s.name })));
    setOrgRows(rows.sort((a, b) => b.createdAt - a.createdAt)); setLoadingOrg(false);
  }, 900); };

  const groups = ['Security', 'Connectivity', 'Knowledge API', 'Browser'];
  const total = checks.filter(c => !c.skipped).length;
  const okCount = Object.values(state).filter(v => v === 'ok').length;
  const warnCount = Object.values(state).filter(v => v === 'warn').length;

  const metaFor = (st) => ({
    pending: { icon: 'clock', color: 'var(--text-faint)' },
    running: { icon: 'loader', color: 'var(--accent)' },
    ok: { icon: 'checkCircle', color: 'var(--success)' },
    warn: { icon: 'alert', color: 'var(--warning)' },
    skip: { icon: 'x', color: 'var(--text-faint)' },
  }[st] || { icon: 'clock', color: 'var(--text-faint)' });

  return (
    <div className="page narrow">
      <div className="page-head between" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 14 }}>
        <div style={{ minWidth: 0 }}><div className="page-title">Diagnostics</div><div className="page-desc">Verify the deployment is safe and capable — without ever revealing secret values. Checks adapt to your enabled features and redact tokens, URLs, and signed headers.</div></div>
        <Btn variant="default" icon="refresh" onClick={run} disabled={running}>{running ? <><Spinner /> Running…</> : 'Re-run checks'}</Btn>
      </div>

      <Card pad style={{ marginBottom: 18 }}>
        <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
          <div className="row" style={{ gap: 14 }}>
            <Ring value={total ? Math.round((okCount + warnCount) / total * 100) : 0} size={56} tone={warnCount ? 'var(--warning)' : 'var(--success)'} />
            <div><div style={{ fontWeight: 700, fontSize: 15 }}>{running ? 'Running checks…' : warnCount ? 'Ready with warnings' : okCount === total ? 'All systems ready' : 'Not yet run'}</div><div className="faint" style={{ fontSize: 12.5, marginTop: 3 }}>{okCount} passed · {warnCount} warning{warnCount !== 1 ? 's' : ''} · {total} active checks</div></div>
          </div>
          <div style={{ marginLeft: 'auto' }}><Btn variant="default" size="sm" icon="download" onClick={() => toast({ tone: 'success', title: 'Diagnostics exported', body: 'Redacted bundle downloaded.' })}>Export redacted bundle</Btn></div>
        </div>
      </Card>

      <div className="grid" style={{ gap: 18 }}>
        {groups.map(g => {
          const items = checks.filter(c => c.group === g);
          if (!items.length) return null;
          return (
            <Card key={g}>
              <div className="card-head"><span style={{ fontWeight: 700, fontSize: 13.5 }}>{g}</span></div>
              <div>
                {items.map((c, i, arr) => {
                  const st = state[c.key] || (c.skipped ? 'skip' : 'pending');
                  const meta = metaFor(st);
                  return (
                    <div key={c.key} className="between" style={{ padding: '13px 20px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none', opacity: c.skipped ? 0.6 : 1 }}>
                      <div className="row" style={{ gap: 12 }}>
                        <span style={{ color: meta.color, display: 'grid', placeItems: 'center' }}><Icon name={meta.icon} size={17} className={st === 'running' ? 'spin' : ''} /></span>
                        <div><div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.label}</div><div className="faint mono" style={{ fontSize: 11.5, marginTop: 2 }}>{c.detail}</div></div>
                      </div>
                      {st === 'ok' && <Badge tone="success" icon="check">Pass</Badge>}
                      {st === 'warn' && <Badge tone="warning" icon="alert">Review</Badge>}
                      {st === 'skip' && <Badge tone="neutral">Disabled</Badge>}
                      {st === 'running' && <span className="faint" style={{ fontSize: 12 }}>checking…</span>}
                      {st === 'pending' && <span className="faint" style={{ fontSize: 12 }}>queued</span>}
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      <div style={{ marginTop: 18 }}>
        <Callout tone="warning" icon="alert" title="Direct upload CORS — review">
          The test ticket completed, but verify the browser can PUT to the Genesys-provided URL in your region. If CORS blocks it, enable the streaming proxy fallback in Settings.
        </Callout>
      </div>

      {/* Org-wide sync diagnostics (support-only, feature-flagged) */}
      <div style={{ marginTop: 18 }}>
        <Card>
          <div className="card-head">
            <Icon name="globe" size={16} style={{ color: features.ENABLE_ORG_SYNC_DIAGNOSTICS ? 'var(--accent)' : 'var(--text-faint)' }} />
            <h3>Organization-wide sync activity</h3>
            <span className="sub mono">GET /sources/synchronizations</span>
            {features.ENABLE_ORG_SYNC_DIAGNOSTICS && <div style={{ marginLeft: 'auto' }}><Btn variant="default" size="sm" icon={loadingOrg ? 'loader' : 'refresh'} onClick={loadOrg} disabled={loadingOrg}>{loadingOrg ? <><Spinner size={14} /> Loading</> : 'Load'}</Btn></div>}
          </div>
          {!features.ENABLE_ORG_SYNC_DIAGNOSTICS ? (
            <div style={{ padding: 20 }}><Callout tone="info" icon="lock" title="Support-only — disabled by default">This organization-wide view is gated behind <span className="mono">ENABLE_ORG_SYNC_DIAGNOSTICS</span>. It's intended for support staff who lost local vault history. Enable it in Settings only when needed.</Callout></div>
          ) : !orgRows ? (
            <div className="empty"><div className="faint">Load organization-wide synchronization activity across all accessible sources.</div></div>
          ) : (
            <table className="table">
              <thead><tr><th>Source</th><th>Type</th><th>Status</th><th>Files</th><th>When</th></tr></thead>
              <tbody>
                {orgRows.map(a => (
                  <tr key={a.synchronizationId}>
                    <td style={{ fontWeight: 600 }}>{a.sourceName}</td>
                    <td><Badge tone="neutral">{a.type}</Badge></td>
                    <td><StatusBadge status={a.status} /></td>
                    <td className="mono tnum" style={{ fontSize: 12 }}>{a.uploadedCount}/{a.fileCount}</td>
                    <td className="faint" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtDate(a.createdAt)}</td>
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

window.DiagnosticsScreen = DiagnosticsScreen;
