/* Dashboard — command center */
function StatusTile({ icon, tone, label, value, sub, onClick }) {
  return (
    <Card pad style={{ cursor: onClick ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', gap: 14 }} onClick={onClick}>
      <div className="between">
        <div style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', background: `var(--${tone}-soft)`, color: `var(--${tone})` }}>
          <Icon name={icon} size={19} />
        </div>
        <span className="dot dot-pulse" style={{ width: 8, height: 8, borderRadius: 99, background: `var(--${tone})`, color: `var(--${tone})` }}></span>
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em' }}>{value}</div>
        <div className="stat-lbl" style={{ marginTop: 4 }}>{label}</div>
        {sub && <div className="faint" style={{ fontSize: 11.5, marginTop: 6 }}>{sub}</div>}
      </div>
    </Card>
  );
}

function Dashboard() {
  const { sources, history, activeRun, navigate, accessProtected, prefs, features, setActiveRun, setDraftPlan, toast } = useApp();
  const lastDone = history.find(h => h.status === 'Completed');
  const needsAttn = history.filter(h => ['NeedsUserAction', 'CompletionUnknown', 'CancellationUnknown'].includes(h.status));
  const totalUploaded = history.reduce((s, h) => s + (h.uploadedCount || 0), 0);

  const resumeDemo = () => {
    // demonstrate resume + reselect flow by re-opening the NeedsUserAction run
    const r = history.find(h => h.status === 'NeedsUserAction');
    navigate('history', r?.localRunKey);
  };

  return (
    <div className="page">
      <div className="page-head between" style={{ alignItems: 'flex-end' }}>
        <div>
          <div className="page-title">Welcome back</div>
          <div className="page-desc">Orchestrate file-based Genesys Knowledge syncs — validated, fingerprinted, and completed only when every file lands.</div>
        </div>
        <Btn variant="primary" size="lg" icon="sync" onClick={() => navigate('new')}>Start a sync</Btn>
      </div>

      {!accessProtected && (
        <div style={{ marginBottom: 18 }}>
          <Callout tone="warning" title="Deployment is not access-protected">
            This app holds a server-side Genesys client credential. Enable deployment access protection or SSO before exposing it publicly.
          </Callout>
        </div>
      )}

      <div className="grid g4" style={{ marginBottom: 18 }}>
        <StatusTile icon="shieldCheck" tone="success" value="Connected" label="Genesys Cloud" sub={REGION} />
        <StatusTile icon="lock" tone="success" value="Unlocked" label="Local vault" sub="AES-GCM · key in memory" onClick={() => navigate('settings')} />
        <StatusTile icon={accessProtected ? 'shield' : 'shieldAlert'} tone={accessProtected ? 'success' : 'warning'} value={accessProtected ? 'Protected' : 'Open'} label="App access" sub="Deployment access protection" onClick={() => navigate('diagnostics')} />
        <StatusTile icon="database" tone="info" value="None" label="App database" sub="localStorage vault only" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.6fr 1fr', marginBottom: 18 }}>
        {/* Active run / start */}
        <Card>
          <div className="card-head">
            <Icon name="activity" size={17} style={{ color: 'var(--accent)' }} />
            <h3>Active sync run</h3>
            {activeRun && <div style={{ marginLeft: 'auto' }}><StatusBadge status={activeRun.status} /></div>}
          </div>
          {activeRun ? (
            <ActiveRunMini />
          ) : (
            <div style={{ padding: '34px 24px', textAlign: 'center' }}>
              <div style={{ width: 50, height: 50, borderRadius: 14, background: 'var(--surface-3)', display: 'grid', placeItems: 'center', margin: '0 auto 14px', color: 'var(--text-faint)' }}>
                <Icon name="inbox" size={24} />
              </div>
              <div style={{ fontWeight: 650 }}>No sync running</div>
              <div className="muted" style={{ fontSize: 13, margin: '6px auto 18px', maxWidth: 360 }}>
                Select a source, choose files, and the workflow will validate, request upload URLs, and complete the round only when all files succeed.
              </div>
              <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
                <Btn variant="primary" icon="sync" onClick={() => navigate('new')}>New sync</Btn>
                {needsAttn.length > 0 && <Btn variant="default" icon="refresh" onClick={resumeDemo}>Resume previous run</Btn>}
              </div>
            </div>
          )}
        </Card>

        {/* Quick stats */}
        <Card pad>
          <div className="row" style={{ marginBottom: 16 }}><Icon name="gauge" size={17} style={{ color: 'var(--text-muted)' }} /><span style={{ fontWeight: 700, fontSize: 14.5 }}>At a glance</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div><div className="stat-num">{sources.filter(s => !s.archived).length}</div><div className="stat-lbl">Sources</div></div>
            <div><div className="stat-num">{history.length}</div><div className="stat-lbl">Runs (local)</div></div>
            <div><div className="stat-num tnum">{totalUploaded}</div><div className="stat-lbl">Files uploaded</div></div>
            <div><div className="stat-num" style={{ color: needsAttn.length ? 'var(--warning)' : 'var(--text)' }}>{needsAttn.length}</div><div className="stat-lbl">Need attention</div></div>
          </div>
          <hr className="divider" style={{ margin: '18px 0' }} />
          <div className="between"><span className="faint" style={{ fontSize: 12 }}>Default sync type</span><Badge tone="neutral" icon="sync">{prefs.defaultSyncType}</Badge></div>
          <div className="between" style={{ marginTop: 10 }}><span className="faint" style={{ fontSize: 12 }}>Upload path</span><Badge tone="accent" icon="uploadCloud">Direct to Genesys</Badge></div>
        </Card>
      </div>

      {needsAttn.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <Callout tone="warning" icon="shieldAlert" title={`${needsAttn.length} run${needsAttn.length > 1 ? 's' : ''} need your attention`}>
            Ambiguous outcomes are never auto-completed. Review each run for safe next steps — reselect files, verify in Genesys, or cancel.
            <div style={{ marginTop: 10 }}><Btn variant="default" size="sm" iconR="arrowR" onClick={() => navigate('history')}>Review runs</Btn></div>
          </Callout>
        </div>
      )}

      {/* Endpoint features */}
      <Card pad style={{ marginBottom: 18 }}>
        <div className="between" style={{ marginBottom: 14 }}>
          <span className="row" style={{ gap: 8, fontWeight: 700, fontSize: 14.5 }}><Icon name="layers" size={16} style={{ color: 'var(--text-muted)' }} /> Enabled features</span>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('settings')}>Manage <Icon name="chevR" size={14} /></button>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {FEATURE_META.map(f => (
            <Tip key={f.key} text={`${f.endpoint}${features[f.key] ? '' : ' · disabled'}`}>
              <span className={`badge badge-${features[f.key] ? (f.danger ? 'danger' : 'success') : 'neutral'}`} style={{ opacity: features[f.key] ? 1 : 0.6 }}>
                <Icon name={features[f.key] ? (f.danger ? 'alert' : 'check') : 'x'} size={12} />{f.label}
              </span>
            </Tip>
          ))}
        </div>
      </Card>

      {/* Recent activity */}
      <Card>
        <div className="card-head">
          <Icon name="history" size={17} style={{ color: 'var(--text-muted)' }} /><h3>Recent runs</h3>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => navigate('history')}>View all <Icon name="chevR" size={14} /></button>
        </div>
        <table className="table">
          <thead><tr><th>Source</th><th>Type</th><th>Files</th><th>Status</th><th>When</th><th></th></tr></thead>
          <tbody>
            {history.slice(0, 4).map(h => (
              <tr key={h.localRunKey} style={{ cursor: 'pointer' }} onClick={() => navigate('history', h.localRunKey)}>
                <td style={{ fontWeight: 600 }}>{h.sourceName}</td>
                <td><Badge tone="neutral">{h.syncType}</Badge></td>
                <td className="tnum mono" style={{ fontSize: 12 }}>{h.uploadedCount}/{h.fileCount}</td>
                <td><StatusBadge status={h.status} /></td>
                <td className="faint" style={{ fontSize: 12.5 }}>{relTime(h.createdAt)}</td>
                <td style={{ textAlign: 'right' }}><Icon name="chevR" size={15} className="faint" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function ActiveRunMini() {
  const { activeRun, navigate } = useApp();
  const r = activeRun;
  const done = r.files.filter(f => f.status === 'Uploaded').length;
  const pct = Math.round((done / r.files.length) * 100);
  return (
    <div style={{ padding: 20 }}>
      <div className="between" style={{ marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 700 }}>{r.sourceName}</div>
          <div className="row faint" style={{ fontSize: 12, gap: 8, marginTop: 4 }}>
            <Badge tone="neutral" icon="sync">{r.syncType}</Badge>
            <CopyId value={r.runId} label="run" truncate={16} />
          </div>
        </div>
        <div style={{ textAlign: 'right' }}><div className="stat-num tnum" style={{ fontSize: 24 }}>{done}/{r.files.length}</div><div className="stat-lbl">uploaded</div></div>
      </div>
      <Bar value={pct} striped={r.status === 'Running'} />
      <div className="row" style={{ marginTop: 16, gap: 10 }}>
        <Btn variant="primary" size="sm" iconR="arrowR" onClick={() => navigate('run')}>Open run</Btn>
        <span className="faint" style={{ fontSize: 12 }}>{r.files.filter(f => f.status === 'Uploading').length} uploading · {r.files.length - done} pending</span>
      </div>
    </div>
  );
}

window.Dashboard = Dashboard;
