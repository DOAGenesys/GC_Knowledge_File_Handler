/* Active Run — workflow state machine + live per-file upload simulation */
const SETUP_STEPS = ['validate', 'token', 'source', 'sync'];
const CONCURRENCY = 2;

function buildSampleRun() {
  const names = ['Onboarding_Playbook_2026.pdf', 'Refund_Policy_v3.docx', 'product-faq.md', 'Tier_1_Macros.csv', 'escalation_matrix.xlsx', 'Knowledge_Base_Export.html'];
  const sizes = [2412544, 184320, 28904, 51200, 96100, 740000];
  return {
    runId: genRunId(), syncId: null, sourceId: 'a7f3c9e2-1b44-4d8a-9c21-6e0f2b8d4a11',
    sourceName: 'Support KB — Production', syncType: 'Incremental', status: 'Running',
    startedAt: Date.now(), currentStep: 'validate', stepStates: {}, scenario: 'normal', cancelable: true,
    files: names.map((n, i) => ({ id: uuid(), originalName: n, uploadName: n, ext: getExt(n), size: sizes[i], type: '', sha256: sha256b64(), md5: md5b64(), status: 'Selected', progress: 0, attempts: 0, errorCode: null })),
  };
}

function ActiveRunScreen() {
  const { activeRun, setActiveRun, setHistory, navigate, toast } = useApp();
  const sim = useRef({ phase: 'setup', stepIndex: 0, stepTick: 0, tick: 0, fm: {}, paused: false });
  const recorded = useRef(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [paused, setPaused] = useState(false);
  const [checkingRemote, setCheckingRemote] = useState(false);

  const refreshRemote = () => {
    if (!activeRun) return;
    setCheckingRemote(true);
    setTimeout(() => {
      setActiveRun(run => {
        if (!run) return run;
        const map = { Running: 'InProgress', Cancelling: 'InProgress', Completed: 'Completed', Cancelled: 'Cancelled', NeedsUserAction: 'InProgress', CompletionUnknown: 'Unknown' };
        return { ...run, lastRemoteStatus: map[run.status] || 'InProgress', lastRemoteCheckedAt: Date.now() };
      });
      setCheckingRemote(false);
      toast({ tone: 'info', title: 'Remote status refreshed', body: 'GET …/synchronizations/{id} · Genesys is authoritative for sync state.' });
    }, 750);
  };

  // engine
  useEffect(() => {
    if (!activeRun || activeRun.scenario !== 'normal') return;
    // init sim for this run
    sim.current = { phase: 'setup', stepIndex: 0, stepTick: 0, tick: 0, fm: {}, paused: false };
    recorded.current = false;
    // designate a recoverable failure on the 2nd file
    if (activeRun.files[1]) sim.current.fm[activeRun.files[1].id] = { willFail: true };
    const iv = setInterval(() => {
      if (sim.current.paused) return;
      sim.current.tick++;
      setActiveRun(run => run ? advance(run, sim.current) : run);
    }, 135);
    return () => clearInterval(iv);
    // eslint-disable-next-line
  }, [activeRun?.runId, activeRun?.scenario]);

  // record completion into history once
  useEffect(() => {
    if (!activeRun || recorded.current) return;
    if (['Completed', 'Cancelled', 'CompletionUnknown'].includes(activeRun.status)) {
      recorded.current = true;
      const r = activeRun;
      const up = r.files.filter(f => f.status === 'Uploaded').length;
      setHistory(h => [{
        localRunKey: uuid(), workflowRunId: r.runId, sourceId: r.sourceId, sourceName: r.sourceName,
        synchronizationId: r.syncId, syncType: r.syncType, status: r.status, createdAt: r.startedAt,
        completedAt: r.status === 'Completed' ? Date.now() : null, fileCount: r.files.length, uploadedCount: up,
        failedCount: r.files.filter(f => f.status.includes('Fatal')).length, skippedCount: 0,
        errorSummary: r.status === 'Completed' ? null : r.status,
      }, ...h]);
      if (r.status === 'Completed') toast({ tone: 'success', title: 'Sync completed', body: `${up} files synchronized to ${r.sourceName}` });
    }
  }, [activeRun?.status]);

  const togglePause = () => { sim.current.paused = !sim.current.paused; setPaused(sim.current.paused); };

  const cancelRun = () => {
    setConfirmCancel(false);
    sim.current.paused = true;
    setActiveRun(run => ({ ...run, status: 'Cancelling', cancelable: false, files: run.files.map(f => ['TicketRequested', 'TicketIssued', 'Uploading'].includes(f.status) ? { ...f, status: 'Cancelled' } : f) }));
    setTimeout(() => setActiveRun(run => run ? { ...run, status: 'Cancelled', stepStates: { ...run.stepStates, upload: 'error' } } : run), 1100);
    toast({ tone: 'info', title: 'Cancelling sync', body: 'Stopping new tickets · aborting in-flight uploads.' });
  };

  const retryFile = (id) => {
    sim.current.fm[id] = { ...(sim.current.fm[id] || {}), willFail: false, failed: false };
    setActiveRun(run => ({ ...run, status: 'Running', files: run.files.map(f => f.id === id ? { ...f, status: 'Selected', progress: 0, errorCode: null } : f) }));
    if (sim.current.phase !== 'complete') sim.current.phase = 'upload';
    sim.current.paused = false; setPaused(false);
  };

  const reselectFile = (id) => {
    setActiveRun(run => ({ ...run, files: run.files.map(f => f.id === id ? { ...f, status: 'Uploading', progress: 30 } : f), status: 'Running' }));
    let p = 30; const iv = setInterval(() => { p += 22; setActiveRun(run => { if (!run) { clearInterval(iv); return run; } const files = run.files.map(f => f.id === id ? { ...f, progress: Math.min(100, p), status: p >= 100 ? 'Uploaded' : 'Uploading' } : f); const allUp = files.every(x => ['Uploaded', 'Skipped'].includes(x.status)); if (p >= 100) clearInterval(iv); return { ...run, files, status: allUp ? 'Running' : run.status }; }); }, 160);
  };

  const loadScenario = (sc) => {
    if (sc === 'live') { setActiveRun(buildSampleRun()); return; }
    const base = activeRun || buildSampleRun();
    const files = base.files.map((f, i) => ({ ...f }));
    if (sc === 'needs') {
      files.forEach((f, i) => { f.status = i < files.length - 2 ? 'Uploaded' : (i === files.length - 1 ? 'NeedsReselect' : 'UploadResultUnknown'); f.progress = f.status === 'Uploaded' ? 100 : 0; });
      setActiveRun({ ...base, syncId: base.syncId || genSyncId(), status: 'NeedsUserAction', scenario: 'needs', stepStates: { validate: 'done', token: 'done', source: 'done', sync: 'done', upload: 'error' }, currentStep: 'upload' });
    } else if (sc === 'unknown') {
      files.forEach(f => { f.status = 'Uploaded'; f.progress = 100; });
      setActiveRun({ ...base, files, syncId: base.syncId || genSyncId(), status: 'CompletionUnknown', scenario: 'unknown', stepStates: { validate: 'done', token: 'done', source: 'done', sync: 'done', upload: 'done', complete: 'error' }, currentStep: 'complete' });
    }
  };

  if (!activeRun) {
    return (
      <div className="page">
        <div className="page-head"><div className="page-title">Active run</div><div className="page-desc">A durable workflow coordinates each sync. Watch its atomic steps and per-file uploads in real time.</div></div>
        <Card><Empty icon="activity" title="No active sync run">
          Start a sync from a source and files, or replay a sample run to see the workflow engine in motion.
          <div className="row" style={{ justifyContent: 'center', gap: 10, marginTop: 18 }}>
            <Btn variant="primary" icon="sync" onClick={() => navigate('new')}>New sync</Btn>
            <Btn variant="default" icon="run" onClick={() => setActiveRun(buildSampleRun())}>Replay sample run</Btn>
          </div>
        </Empty></Card>
      </div>
    );
  }

  const r = activeRun;
  const done = r.files.filter(f => f.status === 'Uploaded').length;
  const pct = Math.round((done / r.files.length) * 100);
  const live = r.status === 'Running' || r.status === 'Cancelling';

  return (
    <div className="page">
      <div className="page-head between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}><div className="page-title">Active run</div><StatusBadge status={r.status} /></div>
          <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 650 }}>{r.sourceName}</span>
            <Badge tone="neutral" icon="sync">{r.syncType}</Badge>
            <CopyId value={r.runId} label="run" truncate={18} />
            {r.syncId && <CopyId value={r.syncId} label="sync" truncate={18} />}
            {r.syncId && <Btn variant="ghost" size="sm" icon={checkingRemote ? 'loader' : 'refresh'} onClick={refreshRemote} disabled={checkingRemote}>{checkingRemote ? <><Spinner size={13} /> Checking</> : 'Refresh remote status'}</Btn>}
          </div>
          {r.lastRemoteCheckedAt && <div className="row faint" style={{ gap: 6, fontSize: 11.5, marginTop: 8 }}><Icon name="cloud" size={13} />Remote status <span className="mono" style={{ color: 'var(--text-muted)' }}>{r.lastRemoteStatus}</span> · checked {relTime(r.lastRemoteCheckedAt)}</div>}
        </div>
        <Tip text="Prototype: preview workflow states">
          <Segmented value={r.scenario === 'normal' ? 'live' : r.scenario} onChange={loadScenario}
            options={[{ value: 'live', label: 'Live' }, { value: 'needs', label: 'Needs action' }, { value: 'unknown', label: 'Unknown' }]} />
        </Tip>
      </div>

      {r.status === 'NeedsUserAction' && <div style={{ marginBottom: 18 }}><Callout tone="warning" icon="shieldAlert" title="This run needs your decision">Some files did not confirm a successful upload. The synchronization will <strong>not</strong> be completed until every file succeeds. Reselect missing files, retry, or cancel the round.</Callout></div>}
      {r.status === 'CompletionUnknown' && <div style={{ marginBottom: 18 }}><Callout tone="warning" icon="help" title="Completion outcome is unknown">All files uploaded, but the completion request did not return a confirmed response. The app will not retry blindly. Verify the synchronization status in Genesys before starting another round.<div style={{ marginTop: 10 }} className="row"><Btn variant="default" size="sm" icon="external">Open Genesys</Btn><Btn variant="ghost" size="sm" icon="copy">Copy support bundle</Btn></div></Callout></div>}
      {r.status === 'Completed' && <div style={{ marginBottom: 18 }}><Callout tone="accent" icon="checkCircle" title="Synchronization completed">All {r.files.length} files uploaded and the round was patched <span className="mono">Completed</span>. A redacted summary was saved to your local vault.</Callout></div>}
      {r.status === 'Cancelled' && <div style={{ marginBottom: 18 }}><Callout tone="info" icon="stop" title="Run cancelled">The synchronization was patched <span className="mono">Cancelled</span>. {done} file(s) uploaded before cancellation may remain in the incomplete round.</Callout></div>}

      <div className="grid" style={{ gridTemplateColumns: '300px 1fr', gap: 18, alignItems: 'start' }}>
        {/* Workflow timeline */}
        <Card pad style={{ position: 'sticky', top: 18 }}>
          <div className="row" style={{ marginBottom: 18, gap: 8 }}><Icon name="cpu" size={16} style={{ color: 'var(--accent)' }} /><span style={{ fontWeight: 700, fontSize: 14 }}>Workflow steps</span></div>
          <div className="steps">
            {WF_STEPS.map(s => {
              const st = r.stepStates[s.key] || (s.key === r.currentStep ? 'active' : 'pending');
              const cls = st === 'done' ? 'done' : st === 'active' ? 'active' : st === 'error' ? 'error' : '';
              return (
                <div className={`step ${cls}`} key={s.key}>
                  <div className="stepline"></div>
                  <div className="stepdot">{st === 'done' ? <Icon name="check" size={14} /> : st === 'error' ? <Icon name="x" size={14} /> : st === 'active' ? <Spinner size={13} /> : <Icon name="clock" size={12} />}</div>
                  <div className="stepbody">
                    <div className="stepname">{s.name}</div>
                    <div className="stepmeta">{s.key === 'upload' ? `${done}/${r.files.length} uploaded` : s.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <hr className="divider" style={{ margin: '18px 0 14px' }} />
          <div className="between" style={{ marginBottom: 10 }}><span className="faint" style={{ fontSize: 12 }}>Overall</span><span className="mono tnum" style={{ fontSize: 12, fontWeight: 600 }}>{pct}%</span></div>
          <Bar value={pct} tone={r.status === 'Completed' ? 'success' : r.status === 'Cancelled' || r.status === 'NeedsUserAction' ? 'warning' : undefined} striped={live} />
        </Card>

        {/* Files + controls */}
        <div className="grid" style={{ gap: 18 }}>
          <Card>
            <div className="card-head">
              <Icon name="files" size={16} style={{ color: 'var(--text-muted)' }} /><h3>Files</h3><span className="sub">{done} of {r.files.length} uploaded</span>
              <div className="row" style={{ marginLeft: 'auto', gap: 8 }}>
                {live && <Btn variant="default" size="sm" icon={paused ? 'run' : 'pause'} onClick={togglePause}>{paused ? 'Resume' : 'Pause'}</Btn>}
                {r.cancelable && r.status === 'Running' && <Btn variant="danger" size="sm" icon="stop" onClick={() => setConfirmCancel(true)}>Cancel</Btn>}
                {(r.status === 'Completed' || r.status === 'Cancelled' || r.status === 'CompletionUnknown') && <Btn variant="primary" size="sm" icon="sync" onClick={() => navigate('new')}>New sync</Btn>}
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th style={{ width: '42%' }}>File</th><th>Size</th><th>Progress</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {r.files.map(f => <RunFileRow key={f.id} f={f} onRetry={() => retryFile(f.id)} onReselect={() => reselectFile(f.id)} />)}
              </tbody>
            </table>
            </div>
          </Card>

          <div className="grid g2" style={{ gap: 18 }}>
            <Card pad>
              <div className="row" style={{ gap: 8, marginBottom: 12 }}><Icon name="shield" size={15} style={{ color: 'var(--text-muted)' }} /><span style={{ fontWeight: 650, fontSize: 13.5 }}>Safety guarantees</span></div>
              <SafetyRow ok text="Completion only after every file succeeds" />
              <SafetyRow ok text="Upload URLs treated as bearer secrets — never stored" />
              <SafetyRow ok text="Ambiguous outcomes pause for your decision" />
              <SafetyRow ok text="No file bytes in workflow payloads" />
            </Card>
            <Card pad>
              <div className="between" style={{ marginBottom: 12 }}><span className="row" style={{ gap: 8, fontWeight: 650, fontSize: 13.5 }}><Icon name="inbox" size={15} style={{ color: 'var(--text-muted)' }} /> Support bundle</span></div>
              <p className="faint" style={{ fontSize: 12.5, lineHeight: 1.55, marginTop: 0 }}>Export a redacted diagnostics bundle — run ID, counts, and error codes only. No tokens, URLs, signed headers, or file bytes.</p>
              <Btn variant="default" size="sm" icon="copy" style={{ marginTop: 6 }} onClick={() => toast({ tone: 'success', title: 'Support bundle copied', body: 'Redacted run details on your clipboard.' })}>Copy redacted bundle</Btn>
            </Card>
          </div>
        </div>
      </div>

      <ConfirmModal open={confirmCancel} onClose={() => setConfirmCancel(false)} onConfirm={cancelRun}
        tone="danger" icon="stop" title="Cancel this sync round?"
        body={<>Cancellation may leave already-uploaded files in an incomplete Genesys synchronization round. The app will stop issuing upload URLs, abort in-flight uploads, and patch the round <span className="mono">Cancelled</span>.</>}
        confirmLabel="Cancel sync round" cancelLabel="Keep running" />
    </div>
  );
}

function SafetyRow({ ok, text }) {
  return <div className="row" style={{ gap: 9, padding: '5px 0', alignItems: 'flex-start' }}><span style={{ color: 'var(--success)', marginTop: 1 }}><Icon name="checkCircle" size={15} /></span><span style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>{text}</span></div>;
}

function RunFileRow({ f, onRetry, onReselect }) {
  const uploading = f.status === 'Uploading';
  const fail = f.status === 'UploadFailedRecoverable' || f.status === 'UploadResultUnknown';
  return (
    <tr>
      <td>
        <div className="row" style={{ gap: 11 }}>
          <span style={{ color: 'var(--text-faint)', flexShrink: 0 }}><Icon name={EXT_ICON[f.ext] || 'file'} size={18} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="mono" style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>{f.uploadName}</div>
            {f.attempts > 0 && <div className="faint" style={{ fontSize: 11, marginTop: 2 }}>attempt {f.attempts + 1}{f.errorCode ? ` · ${f.errorCode}` : ''}</div>}
          </div>
        </div>
      </td>
      <td className="tnum mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtBytes(f.size)}</td>
      <td style={{ minWidth: 130 }}>
        {uploading ? <div style={{ width: 110 }}><Bar value={f.progress} striped /><div className="faint mono tnum" style={{ fontSize: 10, marginTop: 4 }}>{Math.round(f.progress)}%</div></div>
          : f.status === 'Uploaded' ? <span className="row" style={{ gap: 5, color: 'var(--success)', fontSize: 12 }}><Icon name="check" size={13} />100%</span>
          : <span className="faint" style={{ fontSize: 12 }}>—</span>}
      </td>
      <td><StatusBadge status={f.status} /></td>
      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        {f.status === 'UploadFailedRecoverable' && <Btn variant="default" size="sm" icon="rotate" onClick={onRetry}>Retry</Btn>}
        {f.status === 'NeedsReselect' && <Btn variant="default" size="sm" icon="refresh" onClick={onReselect}>Reselect</Btn>}
        {f.status === 'UploadResultUnknown' && <Btn variant="default" size="sm" icon="rotate" onClick={onRetry}>Retry</Btn>}
      </td>
    </tr>
  );
}

/* ---- pure engine ---- */
function advance(run, sim) {
  if (run.status !== 'Running') return run;
  if (sim.phase === 'setup') {
    sim.stepTick++;
    const cur = SETUP_STEPS[sim.stepIndex];
    const stepStates = { ...run.stepStates, [cur]: 'active' };
    let next = { ...run, currentStep: cur, stepStates };
    if (sim.stepTick >= 7) {
      stepStates[cur] = 'done';
      if (cur === 'sync') next.syncId = genSyncId();
      sim.stepIndex++; sim.stepTick = 0;
      if (sim.stepIndex >= SETUP_STEPS.length) { sim.phase = 'upload'; next.currentStep = 'upload'; stepStates.upload = 'active'; }
    }
    return next;
  }
  if (sim.phase === 'complete') {
    sim.stepTick++;
    const ss = { ...run.stepStates, upload: 'done', complete: 'active' };
    if (sim.stepTick >= 6) { ss.complete = 'done'; ss.summary = 'done'; return { ...run, stepStates: ss, status: 'Completed', currentStep: 'summary', cancelable: false }; }
    return { ...run, stepStates: ss, currentStep: 'complete' };
  }
  // upload phase
  let files = run.files.map(f => {
    const m = sim.fm[f.id] || (sim.fm[f.id] = {});
    const g = { ...f };
    if (g.status === 'TicketRequested') { m.t = (m.t || 0) + 1; if (m.t >= 3) g.status = 'TicketIssued'; }
    else if (g.status === 'TicketIssued') { g.status = 'Uploading'; g.progress = 0; }
    else if (g.status === 'Uploading') {
      g.progress = Math.min(100, g.progress + 6 + Math.random() * 13);
      if (m.willFail && !m.failed && g.progress > 52) { g.status = 'UploadFailedRecoverable'; g.errorCode = 'NetworkTransientError'; g.attempts = (g.attempts || 0) + 1; m.failed = true; m.retryAt = sim.tick + 16; }
      else if (g.progress >= 100) { g.status = 'Uploaded'; g.progress = 100; }
    }
    else if (g.status === 'UploadFailedRecoverable') {
      if (sim.tick >= (m.retryAt || 0)) { g.status = 'Selected'; g.progress = 0; g.errorCode = null; m.t = 0; }
    }
    return g;
  });
  let flight = files.filter(f => ['TicketRequested', 'TicketIssued', 'Uploading'].includes(f.status)).length;
  for (let i = 0; i < files.length && flight < CONCURRENCY; i++) {
    if (files[i].status === 'Selected') { files[i] = { ...files[i], status: 'TicketRequested' }; sim.fm[files[i].id] = sim.fm[files[i].id] || {}; sim.fm[files[i].id].t = 0; flight++; }
  }
  let next = { ...run, files };
  const terminal = files.every(f => ['Uploaded', 'Skipped', 'UploadFailedFatal', 'NeedsReselect'].includes(f.status));
  if (terminal) {
    if (files.every(f => ['Uploaded', 'Skipped'].includes(f.status))) sim.phase = 'complete';
    else { next.status = 'NeedsUserAction'; next.stepStates = { ...run.stepStates, upload: 'error' }; }
  }
  return next;
}

window.ActiveRunScreen = ActiveRunScreen;
