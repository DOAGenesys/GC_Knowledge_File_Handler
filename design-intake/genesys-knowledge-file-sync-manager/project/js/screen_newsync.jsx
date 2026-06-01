/* New Sync — source select, drop, validate, hash, preflight, rename */
function NewSyncScreen() {
  const { sources, prefs, features, setSources, navigate, setActiveRun, setDraftPlan, toast } = useApp();
  const active = sources.filter(s => !s.archived);
  const fullEnabled = features.ENABLE_FULL_SYNC;
  const [sourceKey, setSourceKey] = useState(active[0]?.localSourceKey || '');
  const [syncType, setSyncType] = useState(prefs.defaultSyncType === 'Full' && !fullEnabled ? 'Incremental' : prefs.defaultSyncType);
  const [validating, setValidating] = useState(false);
  const [items, setItems] = useState([]);
  const [over, setOver] = useState(false);
  const [editId, setEditId] = useState(null);
  const [confirmFull, setConfirmFull] = useState(false);
  const [showAdv, setShowAdv] = useState(false);
  const [tags, setTags] = useState('');
  const inputRef = useRef(null);

  const source = active.find(s => s.localSourceKey === sourceKey);

  const validateSource = () => {
    if (!source) return;
    setValidating(true);
    setTimeout(() => {
      setSources(arr => arr.map(x => x.localSourceKey === source.localSourceKey ? { ...x, lastValidatedAt: Date.now(), remoteStatus: x.remoteStatus || 'Active', isCompatibleFileUploadSource: true } : x));
      setValidating(false);
      toast({ tone: 'success', title: 'Source validated', body: 'GET /knowledge/sources/{id} · FileUpload · accessible' });
    }, 800);
  };

  const updateItem = (id, patch) => setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));

  const startHashing = (id) => {
    let p = 0;
    const tick = () => {
      p += 8 + Math.random() * 16;
      if (p >= 100) {
        updateItem(id, { hashing: false, hashProgress: 100, sha256: sha256b64(), md5: md5b64() });
      } else {
        updateItem(id, { hashProgress: Math.round(p) });
        setTimeout(tick, 80 + Math.random() * 90);
      }
    };
    setTimeout(tick, 200 + Math.random() * 300);
  };

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList).map(f => ({
      id: uuid(),
      originalName: f.name,
      uploadName: f.name,
      size: f.size,
      type: f.type || '',
      lastModified: f.lastModified || Date.now(),
      hashing: false, hashProgress: 0, sha256: null, md5: null,
    }));
    setItems(prev => {
      const next = [...prev, ...incoming];
      // begin hashing for valid ones
      incoming.forEach(it => {
        const v = validateFile({ name: it.uploadName, size: it.size, type: it.type, lastModified: it.lastModified });
        if (v.status !== 'Invalid') { it.hashing = true; startHashing(it.id); }
      });
      return next;
    });
  };

  const onDrop = (e) => {
    e.preventDefault(); setOver(false);
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  };

  // compute validation across the plan (with duplicate detection)
  const computed = useMemo(() => {
    const counts = {};
    items.forEach(it => { const k = sanitizeName(it.uploadName).toLowerCase(); counts[k] = (counts[k] || 0) + 1; });
    return items.map(it => {
      const v = validateFile({ name: it.uploadName, size: it.size, type: it.type, lastModified: it.lastModified });
      const k = sanitizeName(it.uploadName).toLowerCase();
      const blocking = [...v.blocking];
      if (counts[k] > 1) blocking.push({ code: 'DUP', msg: 'Duplicate upload name in this plan.' });
      let status = it.hashing ? 'Hashing' : (blocking.length ? 'Invalid' : v.warnings.length ? 'Warning' : 'Ready');
      return { ...it, v: { ...v, blocking }, status };
    });
  }, [items]);

  const blockingCount = computed.filter(c => c.v.blocking.length).length;
  const readyCount = computed.filter(c => c.status === 'Ready' || c.status === 'Warning').length;
  const hashingCount = computed.filter(c => c.hashing).length;
  const totalSize = items.reduce((s, it) => s + it.size, 0);
  const canStart = items.length > 0 && blockingCount === 0 && hashingCount === 0 && !!source && source.isCompatibleFileUploadSource !== false;

  const applySuggestion = (id, suggestion) => { updateItem(id, { uploadName: suggestion }); };
  const fixAll = () => {
    setItems(prev => prev.map(it => {
      const v = validateFile({ name: it.uploadName, size: it.size, type: it.type, lastModified: it.lastModified });
      return v.suggestion ? { ...it, uploadName: v.suggestion } : it;
    }));
    toast({ tone: 'success', title: 'Applied safe renames', body: 'Upload names sanitized to Genesys constraints.' });
  };
  const removeItem = (id) => setItems(prev => prev.filter(it => it.id !== id));

  const doStart = () => {
    if (syncType === 'Full') { setConfirmFull(true); return; }
    launch();
  };
  const launch = () => {
    const files = computed.filter(c => c.status !== 'Invalid').map(c => ({
      id: c.id, originalName: c.originalName, uploadName: sanitizeName(c.uploadName),
      ext: getExt(c.uploadName), size: c.size, type: c.type, sha256: c.sha256, md5: c.md5,
      status: 'Selected', progress: 0, attempts: 0, errorCode: null,
    }));
    const run = {
      runId: genRunId(), syncId: null, sourceId: source.sourceId, sourceName: source.displayName,
      syncType, status: 'Running', files, startedAt: Date.now(), currentStep: 'validate',
      stepStates: {}, scenario: 'normal', cancelable: true,
    };
    setActiveRun(run); setDraftPlan(null);
    toast({ tone: 'success', title: 'Sync started', body: `${files.length} files queued · ${syncType}` });
    navigate('run');
  };

  return (
    <div className="page">
      <div className="page-head"><div className="page-title">New sync</div>
        <div className="page-desc">Files are validated and fingerprinted in your browser. Bytes never touch our server — only metadata starts the workflow.</div></div>

      <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 18 }}>
        {/* config row */}
        <div className="grid g2" style={{ gap: 18 }}>
          <Card pad>
            <div className="between" style={{ marginBottom: 10 }}>
              <div className="label">Destination source</div>
              <Btn variant="ghost" size="sm" icon={validating ? 'loader' : 'shieldCheck'} className={validating ? '' : ''} onClick={validateSource} disabled={validating || !source}>{validating ? <><Spinner size={14} /> Validating</> : 'Validate'}</Btn>
            </div>
            <select className="select" value={sourceKey} onChange={e => setSourceKey(e.target.value)}>
              {active.map(s => <option key={s.localSourceKey} value={s.localSourceKey}>{s.displayName}</option>)}
            </select>
            {source && (
              <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
                <CopyId value={source.sourceId} label="sourceId" truncate={20} />
                <Badge tone="success" icon="check">FileUpload</Badge>
                {source.lastValidatedAt ? <Badge tone="neutral" icon="shieldCheck">Validated {relTime(source.lastValidatedAt)}</Badge> : <Badge tone="warning" icon="alert">Not validated</Badge>}
                {source.localOnly && <Badge tone="warning" icon="alert">Local-only ref</Badge>}
              </div>
            )}
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 12, paddingLeft: 0 }} onClick={() => navigate('sources')}><Icon name="plus" size={14} /> Discover, add or create a source</button>
          </Card>

          <Card pad>
            <div className="label" style={{ marginBottom: 10 }}>Sync type</div>
            <Segmented value={syncType} onChange={setSyncType} accent options={fullEnabled ? [{ value: 'Incremental', label: 'Incremental' }, { value: 'Full', label: 'Full' }] : [{ value: 'Incremental', label: 'Incremental' }]} />
            <div className="faint" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>
              {syncType === 'Incremental'
                ? 'Default. Adds or updates the files you upload this round.'
                : 'Replacement semantics depend on your Genesys environment — requires explicit confirmation.'}
            </div>
            {!fullEnabled && <div style={{ marginTop: 12 }}><Callout tone="info" icon="lock">Full sync is disabled by deployment policy (<span className="mono">ENABLE_FULL_SYNC</span>). Enable it in Settings.</Callout></div>}
            {syncType === 'Full' && <div style={{ marginTop: 12 }}><Callout tone="warning" title="Full sync">Verify deletion / full-replacement behavior in Genesys before relying on it.</Callout></div>}
          </Card>
        </div>

        {/* dropzone */}
        <input ref={inputRef} type="file" multiple style={{ display: 'none' }} onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
        <div className={`dropzone ${over ? 'over' : ''}`}
          onDragOver={e => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)} onDrop={onDrop}>
          <div className="dz-ico"><Icon name="uploadCloud" size={26} /></div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Drop files here</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>or browse — names are validated instantly against Genesys constraints</div>
          <div className="row" style={{ justifyContent: 'center', gap: 10, marginTop: 18 }}>
            <Btn variant="default" icon="folder" onClick={() => inputRef.current?.click()}>Browse files</Btn>
            <Btn variant="ghost" icon="zap" onClick={() => addFiles(makeSampleFiles())}>Add sample set</Btn>
          </div>
          <div className="row" style={{ justifyContent: 'center', gap: 6, marginTop: 20, flexWrap: 'wrap' }}>
            {SUPPORTED_EXT.map(e => <span key={e} className="tag-mini">{e}</span>)}
          </div>
        </div>

        {/* preflight */}
        {items.length > 0 && (
          <Card>
            <div className="card-head">
              <Icon name="filter" size={16} style={{ color: 'var(--accent)' }} />
              <h3>Preflight</h3>
              <span className="sub">{items.length} files · {fmtBytes(totalSize)}</span>
              <div className="row" style={{ marginLeft: 'auto', gap: 8 }}>
                {computed.some(c => c.v.suggestion) && <Btn variant="default" size="sm" icon="wand" onClick={fixAll}>Fix all names</Btn>}
                <Btn variant="ghost" size="sm" icon="trash" onClick={() => setItems([])}>Clear</Btn>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th style={{ width: '40%' }}>File</th><th>Size</th><th>Fingerprint</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {computed.map(c => <PreflightRow key={c.id} c={c} editId={editId} setEditId={setEditId}
                  onName={(n) => updateItem(c.id, { uploadName: n })} onApply={() => applySuggestion(c.id, c.v.suggestion)} onRemove={() => removeItem(c.id)} />)}
              </tbody>
            </table>
            </div>
          </Card>
        )}

        {/* advanced */}
        {items.length > 0 && (
          <Card pad>
            <button className="between" style={{ width: '100%', background: 'none', border: 'none', padding: 0 }} onClick={() => setShowAdv(s => !s)}>
              <span className="row" style={{ gap: 8, fontWeight: 650, fontSize: 13.5 }}><Icon name="settings" size={15} /> Optional metadata & tags</span>
              <Icon name={showAdv ? 'chevD' : 'chevR'} size={16} className="faint" />
            </button>
            {showAdv && (
              <div className="grid g2" style={{ marginTop: 16, gap: 16 }}>
                <Field label="Tags" hint="Comma-separated · applied to every file in this round">
                  <input className="input" placeholder="kb, support, v2026" value={tags} onChange={e => setTags(e.target.value)} />
                </Field>
                <Field label="Origin URI (optional)" hint="For traceability only — sent if Genesys accepts it">
                  <input className="input mono" placeholder="https://intranet/kb/export" />
                </Field>
                <div style={{ gridColumn: '1 / -1' }}><Callout tone="info" icon="shield">Never paste secrets into metadata. Metadata is redacted in logs and is sent to Genesys as plain attributes.</Callout></div>
              </div>
            )}
          </Card>
        )}
      </div>

      {/* sticky footer summary */}
      {items.length > 0 && (
        <div style={{ position: 'sticky', bottom: 0, marginTop: 22, zIndex: 5 }}>
          <Card style={{ boxShadow: 'var(--shadow-lg)' }}>
            <div className="between" style={{ padding: '14px 20px' }}>
              <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
                <PreflightStat icon="checkCircle" tone="success" n={readyCount} label="ready" />
                <PreflightStat icon="xCircle" tone="danger" n={blockingCount} label="blocking" />
                <PreflightStat icon="fingerprint" tone="accent" n={hashingCount} label="hashing" />
              </div>
              <div className="row" style={{ gap: 12 }}>
                {blockingCount > 0 && <span className="faint" style={{ fontSize: 12.5 }}>Resolve blocking errors to continue</span>}
                {hashingCount > 0 && <span className="row faint" style={{ fontSize: 12.5, gap: 6 }}><Spinner size={14} /> Fingerprinting…</span>}
                <Btn variant="primary" size="lg" icon="zap" disabled={!canStart} onClick={doStart}>Start sync</Btn>
              </div>
            </div>
          </Card>
        </div>
      )}

      <ConfirmModal open={confirmFull} onClose={() => setConfirmFull(false)} onConfirm={() => { setConfirmFull(false); launch(); }}
        tone="warning" icon="alert" title="Confirm Full synchronization"
        body={<>A <strong>Full</strong> sync may have replacement or deletion semantics depending on your Genesys configuration. The app makes no undocumented promises about how missing files are treated. Confirm you have verified this behavior in your Genesys environment.</>}
        confirmLabel="I understand — start Full sync" />
    </div>
  );
}

function PreflightStat({ icon, tone, n, label }) {
  return <div className="row" style={{ gap: 7 }}><span style={{ color: `var(--${tone})` }}><Icon name={icon} size={16} /></span><span style={{ fontWeight: 700 }} className="tnum">{n}</span><span className="faint" style={{ fontSize: 12.5 }}>{label}</span></div>;
}

function PreflightRow({ c, editId, setEditId, onName, onApply, onRemove }) {
  const editing = editId === c.id;
  const renamed = c.uploadName !== c.originalName;
  return (
    <tr>
      <td>
        <div className="row" style={{ gap: 11 }}>
          <span style={{ color: 'var(--text-faint)', flexShrink: 0 }}><Icon name={EXT_ICON[getExt(c.uploadName)] || 'file'} size={18} /></span>
          <div style={{ minWidth: 0, flex: 1 }}>
            {editing ? (
              <input className="input mono btn-sm" style={{ height: 30, fontSize: 12 }} defaultValue={c.uploadName} autoFocus
                onBlur={e => { onName(e.target.value); setEditId(null); }}
                onKeyDown={e => { if (e.key === 'Enter') { onName(e.target.value); setEditId(null); } }} />
            ) : (
              <div className="row" style={{ gap: 6 }}>
                <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.uploadName}</span>
                <button className="iconbtn" style={{ width: 22, height: 22, border: 'none', background: 'transparent', boxShadow: 'none' }} onClick={() => setEditId(c.id)} aria-label="rename"><Icon name="edit" size={13} /></button>
              </div>
            )}
            {renamed && <div className="faint" style={{ fontSize: 11, marginTop: 2, textDecoration: 'line-through' }}>{c.originalName}</div>}
            {c.v.blocking.map((b, i) => <div key={i} className="row" style={{ gap: 5, fontSize: 11.5, color: 'var(--danger)', marginTop: 3 }}><Icon name="alertCircle" size={12} />{b.msg}</div>)}
            {c.v.warnings.map((w, i) => <div key={i} className="row" style={{ gap: 5, fontSize: 11.5, color: 'var(--warning)', marginTop: 3 }}><Icon name="alert" size={12} />{w.msg}</div>)}
          </div>
        </div>
      </td>
      <td className="tnum mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtBytes(c.size)}</td>
      <td style={{ minWidth: 130 }}>
        {c.hashing ? <div style={{ width: 110 }}><Bar value={c.hashProgress} tone="accent" striped /><div className="faint mono" style={{ fontSize: 10, marginTop: 4 }}>SHA-256 {c.hashProgress}%</div></div>
          : c.sha256 ? <Tip text={`SHA-256: ${c.sha256}\nMD5(b64): ${c.md5}`}><span className="row tag-mini" style={{ gap: 5 }}><Icon name="fingerprint" size={12} />{c.sha256.slice(0, 10)}…</span></Tip>
          : <span className="faint" style={{ fontSize: 12 }}>—</span>}
      </td>
      <td><StatusBadge status={c.status} /></td>
      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        {c.v.suggestion && <Tip text={`Rename to ${c.v.suggestion}`}><button className="iconbtn" style={{ width: 28, height: 28, color: 'var(--accent)' }} onClick={onApply} aria-label="fix"><Icon name="wand" size={14} /></button></Tip>}
        <button className="iconbtn" style={{ width: 28, height: 28, marginLeft: 6 }} onClick={onRemove} aria-label="remove"><Icon name="x" size={14} /></button>
      </td>
    </tr>
  );
}

window.NewSyncScreen = NewSyncScreen;
