/* Sources — local registry + remote discovery, validation, activity, danger zone (v1.1) */
function SourcesScreen() {
  const { sources, setSources, features, navigate, toast, activeRun } = useApp();
  const [view, setView] = useState('registry');
  const [showCreate, setShowCreate] = useState(false);
  const [showExisting, setShowExisting] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detail, setDetail] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [refreshing, setRefreshing] = useState({});

  const visible = sources.filter(s => showArchived ? true : !s.archived);
  const addSource = (rec) => setSources(s => [rec, ...s.filter(x => x.sourceId !== rec.sourceId)]);

  const refreshStatus = (key) => {
    setRefreshing(r => ({ ...r, [key]: true }));
    setTimeout(() => {
      setSources(arr => arr.map(x => x.localSourceKey === key ? { ...x, lastValidatedAt: Date.now(), remoteStatus: x.remoteStatus || 'Active', isCompatibleFileUploadSource: true } : x));
      setRefreshing(r => ({ ...r, [key]: false }));
      toast({ tone: 'success', title: 'Source validated', body: 'GET /knowledge/sources/{id} · status refreshed' });
    }, 850);
  };

  const tabs = [{ value: 'registry', label: 'Your registry' }];
  if (features.ENABLE_SOURCE_DISCOVERY) tabs.push({ value: 'discovery', label: 'Discover remote' });

  return (
    <div className="page">
      <div className="page-head between" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 14 }}>
        <div style={{ minWidth: 0 }}><div className="page-title">Sources</div><div className="page-desc">Your local registry of Genesys Knowledge Fabric <span className="mono" style={{ fontSize: 13 }}>FileUpload</span> sources. IDs live only in your encrypted vault — discovery and status come live from Genesys.</div></div>
        <div className="row" style={{ gap: 10 }}>
          <Btn variant="default" icon="link" onClick={() => setShowExisting(true)}>Add by ID</Btn>
          {features.ENABLE_SOURCE_CREATION && <Btn variant="primary" icon="plus" onClick={() => setShowCreate(true)}>Create source</Btn>}
        </div>
      </div>

      {tabs.length > 1 && (
        <div className="between" style={{ marginBottom: 18 }}>
          <Segmented value={view} onChange={setView} options={tabs} accent />
          {view === 'registry' && <label className="row" style={{ gap: 8, cursor: 'pointer' }}><Toggle checked={showArchived} onChange={setShowArchived} /><span className="faint" style={{ fontSize: 12.5 }}>Show archived</span></label>}
        </div>
      )}

      {view === 'registry' ? (
        <div className="grid" style={{ gap: 16 }}>
          {visible.map(s => (
            <SourceCard key={s.localSourceKey} s={s} refreshing={!!refreshing[s.localSourceKey]}
              onRefresh={() => refreshStatus(s.localSourceKey)} onRename={() => setRenameTarget(s)}
              onArchive={() => setArchiveTarget(s)} onDetail={() => setDetail(s)} onSync={() => navigate('new')} />
          ))}
          {visible.length === 0 && <Card><Empty icon="database" title="No sources in your registry">Discover remote sources, create a new FileUpload source, or add one by ID.</Empty></Card>}
        </div>
      ) : (
        <DiscoveryPanel registry={sources} onImport={addSource} toast={toast} />
      )}

      <CreateSourceModal open={showCreate} onClose={() => setShowCreate(false)} existing={sources} onCreate={(rec) => { addSource(rec); setShowCreate(false); toast({ tone: 'success', title: 'Source created', body: `${rec.displayName} · validated & saved to vault` }); }} />
      <ExistingSourceModal open={showExisting} onClose={() => setShowExisting(false)} onAdd={(rec) => { addSource(rec); setShowExisting(false); toast({ tone: 'success', title: 'Source added', body: 'Validated reference saved to your encrypted vault.' }); }} />
      <RenameModal target={renameTarget} onClose={() => setRenameTarget(null)} onSave={(name) => { setSources(arr => arr.map(x => x.localSourceKey === renameTarget.localSourceKey ? { ...x, displayName: name } : x)); setRenameTarget(null); toast({ tone: 'success', title: 'Renamed locally' }); }} />
      <ConfirmModal open={!!archiveTarget} onClose={() => setArchiveTarget(null)} onConfirm={() => { setSources(arr => arr.map(x => x.localSourceKey === archiveTarget.localSourceKey ? { ...x, archived: !x.archived } : x)); toast({ tone: 'info', title: archiveTarget.archived ? 'Source restored' : 'Source archived', body: 'Local reference only — nothing changes in Genesys.' }); setArchiveTarget(null); }}
        tone="warning" icon="archive" title={archiveTarget?.archived ? 'Restore source?' : 'Archive source?'} body={<>This affects your <strong>local reference only</strong> — nothing is deleted in Genesys. You can restore it anytime.</>} confirmLabel={archiveTarget?.archived ? 'Restore' : 'Archive'} />
      <SourceDetailDrawer source={detail} onClose={() => setDetail(null)}
        onRefresh={(key) => { refreshStatus(key); }}
        onUpdate={(name) => { setSources(arr => arr.map(x => x.localSourceKey === detail.localSourceKey ? { ...x, displayName: name, remoteName: name, lastValidatedAt: Date.now() } : x)); setDetail(d => ({ ...d, displayName: name, remoteName: name })); toast({ tone: 'success', title: 'Source updated', body: 'PUT /knowledge/sources/{id} · name changed in Genesys' }); }}
        onDelete={() => { setDeleteTarget(detail); }} />
      <DeleteSourceModal target={deleteTarget} activeRun={activeRun} onClose={() => setDeleteTarget(null)}
        onConfirm={() => { setSources(arr => arr.filter(x => x.localSourceKey !== deleteTarget.localSourceKey)); toast({ tone: 'danger', title: 'Source deleted', body: 'DELETE confirmed in Genesys · local reference removed.' }); setDeleteTarget(null); setDetail(null); }} />
    </div>
  );
}

function RemoteStatusPill({ status }) {
  if (!status) return <Badge tone="neutral" icon="help">Not validated</Badge>;
  const m = REMOTE_STATUS_META[status] || { tone: 'neutral', label: status };
  return <span className={`badge badge-${m.tone}`}><span className="dot" style={{ width: 6, height: 6, borderRadius: 99, background: 'currentColor' }}></span>{m.label}</span>;
}

function SourceCard({ s, refreshing, onRefresh, onRename, onArchive, onDetail, onSync }) {
  const tmeta = SOURCE_TYPE_META[s.sourceType] || {};
  return (
    <Card style={{ opacity: s.archived ? 0.62 : 1 }}>
      <div className="card-pad between" style={{ alignItems: 'flex-start', gap: 14 }}>
        <div className="row" style={{ gap: 14, alignItems: 'flex-start', minWidth: 0 }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name={tmeta.icon || 'database'} size={20} /></div>
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button onClick={onDetail} style={{ background: 'none', border: 'none', padding: 0, fontWeight: 700, fontSize: 15, color: 'var(--text)', cursor: 'pointer' }}>{s.displayName}</button>
              <RemoteStatusPill status={s.remoteStatus} />
              {s.createdByApp ? <Badge tone="neutral">Created by app</Badge> : <Badge tone="info" icon="link">Imported</Badge>}
              {s.archived && <Badge tone="neutral" icon="archive">Archived</Badge>}
            </div>
            <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              <CopyId value={s.sourceId} label="sourceId" truncate={24} />
              {s.lastValidatedAt ? <span className="faint" style={{ fontSize: 12 }}>Validated {relTime(s.lastValidatedAt)}</span> : <span className="faint" style={{ fontSize: 12 }}>Never validated</span>}
            </div>
            {s.localOnly && <div style={{ marginTop: 12 }}><Callout tone="warning" icon="alert">Local-only reference. If this vault is lost, the friendly name can't be rediscovered — only the ID exists in Genesys.</Callout></div>}
            {s.lastSync && <div className="row" style={{ gap: 8, marginTop: 12 }}><span className="faint" style={{ fontSize: 12 }}>Last sync:</span><StatusBadge status={s.lastSync.status} /><span className="faint" style={{ fontSize: 12 }}>{s.lastSync.files} files · {relTime(s.lastSync.when)}</span></div>}
          </div>
        </div>
        <div className="row" style={{ gap: 6, flexShrink: 0 }}>
          {!s.archived && <Btn variant="primary" size="sm" icon="sync" onClick={onSync}>Sync</Btn>}
          <Tip text="Refresh status from Genesys"><IconBtn icon={refreshing ? 'loader' : 'refresh'} size={15} label="Refresh" className={refreshing ? 'spin' : ''} onClick={onRefresh} /></Tip>
          <Tip text="Activity & details"><IconBtn icon="activity" size={15} label="Details" onClick={onDetail} /></Tip>
          <IconBtn icon="edit" size={15} label="Rename" onClick={onRename} />
          <IconBtn icon="archive" size={15} label="Archive" onClick={onArchive} />
        </div>
      </div>
    </Card>
  );
}
/* ---------------- Discovery ---------------- */
function DiscoveryPanel({ registry, onImport, toast }) {
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState([]);
  const [compatOnly, setCompatOnly] = useState(true);
  const importedIds = new Set(registry.map(r => r.sourceId));

  const load = () => { setLoading(true); setTimeout(() => { setList(seedRemoteSources()); setLoading(false); }, 900); };
  useEffect(() => { load(); }, []);

  const rows = list.filter(r => compatOnly ? SOURCE_TYPE_META[r.type]?.compatible : true);

  const doImport = (r) => {
    onImport({
      localSourceKey: uuid(), sourceId: r.sourceId, displayName: r.name, remoteName: r.name,
      sourceType: r.type, isCompatibleFileUploadSource: true, remoteStatus: r.status,
      createdByApp: false, dateAddedToVault: Date.now(), lastValidatedAt: Date.now(),
      lastRemoteSyncAt: r.lastSyncAt, lastUsedAt: null, lastSyncRunId: null, archived: false,
      lastSync: r.lastSyncAt ? { status: 'Completed', files: 0, when: r.lastSyncAt } : null,
    });
    toast({ tone: 'success', title: 'Source imported', body: `${r.name} · saved to your vault` });
  };

  return (
    <Card>
      <div className="card-head">
        <Icon name="globe" size={16} style={{ color: 'var(--accent)' }} />
        <h3>Remote Knowledge sources</h3>
        <span className="sub mono">GET /knowledge/sources</span>
        <div className="row" style={{ marginLeft: 'auto', gap: 10 }}>
          <label className="row" style={{ gap: 8, cursor: 'pointer' }}><Toggle checked={compatOnly} onChange={setCompatOnly} /><span className="faint" style={{ fontSize: 12.5 }}>Compatible only</span></label>
          <Btn variant="default" size="sm" icon={loading ? 'loader' : 'refresh'} className={loading ? '' : ''} onClick={load} disabled={loading}>{loading ? <><Spinner size={14} /> Listing…</> : 'Refresh'}</Btn>
        </div>
      </div>
      {loading ? (
        <div className="empty"><Spinner size={22} /><div style={{ marginTop: 12 }} className="faint">Listing accessible sources…</div></div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th style={{ width: '36%' }}>Source</th><th>Type</th><th>Status</th><th>Documents</th><th>Last sync</th><th></th></tr></thead>
            <tbody>
              {rows.map(r => {
                const tm = SOURCE_TYPE_META[r.type] || {};
                const imported = importedIds.has(r.sourceId);
                return (
                  <tr key={r.sourceId}>
                    <td>
                      <div className="row" style={{ gap: 11 }}>
                        <span style={{ color: tm.compatible ? 'var(--accent)' : 'var(--text-faint)', flexShrink: 0 }}><Icon name={tm.icon || 'database'} size={18} /></span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                          <div className="faint mono" style={{ fontSize: 11, marginTop: 2 }}>{r.sourceId.slice(0, 18)}…</div>
                        </div>
                      </div>
                    </td>
                    <td>{tm.compatible ? <Badge tone="success" icon="check">{tm.label}</Badge> : <Tip text="Not a FileUpload source — managed elsewhere"><Badge tone="neutral">{tm.label}</Badge></Tip>}</td>
                    <td><RemoteStatusPill status={r.status} /></td>
                    <td className="tnum mono" style={{ fontSize: 12 }}>{r.documentCount.toLocaleString()}</td>
                    <td className="faint" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{r.lastSyncAt ? relTime(r.lastSyncAt) : '—'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {imported ? <Badge tone="neutral" icon="check">In registry</Badge>
                        : tm.compatible ? <Btn variant="default" size="sm" icon="download" onClick={() => doImport(r)}>Import</Btn>
                        : <Tip text="Only FileUpload sources can be managed here"><span><Btn variant="ghost" size="sm" disabled>Unsupported</Btn></span></Tip>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ padding: '0 20px 18px' }}>
        <Callout tone="info" icon="shield">Sources are not imported automatically — you choose which to add. Non-FileUpload sources are read-only here and can't be synced.</Callout>
      </div>
    </Card>
  );
}

/* ---------------- Source detail drawer (activity + danger zone) ---------------- */
function SourceDetailDrawer({ source, onClose, onRefresh, onUpdate, onDelete }) {
  const { features, toast } = useApp();
  const [selSync, setSelSync] = useState(null);
  const [editName, setEditName] = useState('');
  const [editing, setEditing] = useState(false);
  useEffect(() => { setSelSync(null); setEditing(false); if (source) setEditName(source.displayName); }, [source]);
  if (!source) return null;
  const tm = SOURCE_TYPE_META[source.sourceType] || {};
  const activity = features.ENABLE_SOURCE_HISTORY ? genSyncActivity(source.sourceId) : null;
  const dangerOn = features.ENABLE_SOURCE_UPDATE || features.ENABLE_SOURCE_DELETE;

  return (
    <Modal open={!!source} onClose={onClose} wide>
      <div className="card-head" style={{ padding: '18px 24px' }}>
        <div className="row" style={{ gap: 10, minWidth: 0 }}><Icon name={tm.icon || 'database'} size={18} style={{ color: 'var(--accent)' }} /><h3 style={{ fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.displayName}</h3><RemoteStatusPill status={source.remoteStatus} /></div>
        <div className="row" style={{ marginLeft: 'auto', gap: 8 }}>
          <Btn variant="default" size="sm" icon="refresh" onClick={() => onRefresh(source.localSourceKey)}>Refresh</Btn>
          <IconBtn icon="x" size={16} label="Close" onClick={onClose} />
        </div>
      </div>
      <div className="modal-body scroll" style={{ maxHeight: '66vh', overflowY: 'auto' }}>
        <div className="grid g2" style={{ gap: 14 }}>
          <DetailField label="Source ID" value={<CopyId value={source.sourceId} />} />
          <DetailField label="Type" value={tm.compatible ? <Badge tone="success" icon="check">{tm.label}</Badge> : <Badge tone="neutral">{tm.label}</Badge>} />
          <DetailField label="Remote status" value={<RemoteStatusPill status={source.remoteStatus} />} />
          <DetailField label="Compatible for sync" value={source.isCompatibleFileUploadSource ? <span className="row" style={{ gap: 6, color: 'var(--success)' }}><Icon name="check" size={15} />Yes</span> : <span className="row" style={{ gap: 6, color: 'var(--danger)' }}><Icon name="x" size={15} />No</span>} />
          <DetailField label="Last validated" value={source.lastValidatedAt ? fmtDateFull(source.lastValidatedAt) : 'Never'} />
          <DetailField label="Last remote sync" value={source.lastRemoteSyncAt ? fmtDateFull(source.lastRemoteSyncAt) : '—'} />
        </div>

        {features.ENABLE_SOURCE_HISTORY ? (
          <div style={{ marginTop: 22 }}>
            <div className="between" style={{ marginBottom: 10 }}>
              <span className="row" style={{ gap: 8, fontWeight: 700, fontSize: 13.5 }}><Icon name="history" size={15} style={{ color: 'var(--text-muted)' }} /> Synchronization activity</span>
              <span className="sub mono faint" style={{ fontSize: 11 }}>GET …/synchronizations</span>
            </div>
            <Card style={{ boxShadow: 'none', borderColor: 'var(--border)' }}>
              <table className="table">
                <thead><tr><th>Type</th><th>Status</th><th>Files</th><th>When</th><th></th></tr></thead>
                <tbody>
                  {activity.map(a => (
                    <tr key={a.synchronizationId} style={{ cursor: 'pointer', background: selSync?.synchronizationId === a.synchronizationId ? 'var(--surface-3)' : '' }} onClick={() => setSelSync(a)}>
                      <td><Badge tone="neutral">{a.type}</Badge></td>
                      <td><StatusBadge status={a.status} /></td>
                      <td className="mono tnum" style={{ fontSize: 12 }}>{a.uploadedCount}/{a.fileCount}</td>
                      <td className="faint" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtDate(a.createdAt)}</td>
                      <td style={{ textAlign: 'right' }}><Icon name="chevR" size={14} className="faint" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            {selSync && (
              <div className="fade-in" style={{ marginTop: 12 }}>
                <Card pad style={{ borderColor: 'var(--accent-line)' }}>
                  <div className="between" style={{ marginBottom: 12 }}><span className="row" style={{ gap: 8, fontWeight: 650, fontSize: 13 }}><Icon name="zap" size={14} style={{ color: 'var(--accent)' }} /> Synchronization detail</span><span className="sub mono faint" style={{ fontSize: 11 }}>GET …/{'{syncId}'}</span></div>
                  <div className="grid g2" style={{ gap: 12 }}>
                    <DetailField label="Synchronization ID" value={<CopyId value={selSync.synchronizationId} truncate={22} />} />
                    <DetailField label="Authoritative status" value={<StatusBadge status={selSync.status} />} />
                    <DetailField label="Type" value={selSync.type} />
                    <DetailField label="Files" value={`${selSync.uploadedCount} / ${selSync.fileCount}`} />
                    <DetailField label="Started" value={fmtDateFull(selSync.createdAt)} />
                    <DetailField label="Completed" value={selSync.completedAt ? fmtDateFull(selSync.completedAt) : '—'} />
                  </div>
                </Card>
              </div>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 20 }}><Callout tone="info" icon="info">Source sync history is disabled. Enable <span className="mono">ENABLE_SOURCE_HISTORY</span> in Settings to read remote activity.</Callout></div>
        )}

        {dangerOn && (
          <div style={{ marginTop: 22 }}>
            <div className="row" style={{ gap: 8, marginBottom: 10 }}><Icon name="alert" size={15} style={{ color: 'var(--danger)' }} /><span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--danger)' }}>Danger zone</span></div>
            <Card pad style={{ borderColor: 'var(--danger-line)', background: 'var(--danger-soft)' }}>
              {features.ENABLE_SOURCE_UPDATE && (
                <div className="between" style={{ paddingBottom: features.ENABLE_SOURCE_DELETE ? 14 : 0, borderBottom: features.ENABLE_SOURCE_DELETE ? '1px solid var(--danger-line)' : 'none', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}><div style={{ fontWeight: 650, fontSize: 13 }}>Update source name</div><div className="faint" style={{ fontSize: 12, marginTop: 2 }}>PUT — only FileUpload-safe fields are sent.</div></div>
                  {editing ? (
                    <div className="row" style={{ gap: 8 }}>
                      <input className="input btn-sm" style={{ height: 32, width: 200 }} value={editName} onChange={e => setEditName(e.target.value)} autoFocus />
                      <Btn variant="primary" size="sm" onClick={() => { onUpdate(editName); setEditing(false); }}>Save</Btn>
                      <Btn variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Btn>
                    </div>
                  ) : <Btn variant="default" size="sm" icon="edit" onClick={() => setEditing(true)}>Edit name</Btn>}
                </div>
              )}
              {features.ENABLE_SOURCE_DELETE && (
                <div className="between" style={{ paddingTop: features.ENABLE_SOURCE_UPDATE ? 14 : 0, gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}><div style={{ fontWeight: 650, fontSize: 13 }}>Delete this source</div><div className="faint" style={{ fontSize: 12, marginTop: 2 }}>Unrecoverable. Requires typed confirmation.</div></div>
                  <Btn variant="danger-solid" size="sm" icon="trash" onClick={onDelete}>Delete source</Btn>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ---------------- Modals ---------------- */
function CreateSourceModal({ open, onClose, onCreate, existing }) {
  const [name, setName] = useState(''); const [err, setErr] = useState('');
  const dupe = existing.some(s => s.displayName.toLowerCase() === name.trim().toLowerCase());
  const submit = () => {
    if (!name.trim()) { setErr('Enter a source name.'); return; }
    const id = genSourceId();
    onCreate({ localSourceKey: uuid(), sourceId: id, displayName: name.trim(), remoteName: name.trim(), sourceType: 'FileUpload', isCompatibleFileUploadSource: true, remoteStatus: 'Active', createdByApp: true, dateAddedToVault: Date.now(), lastValidatedAt: Date.now(), lastRemoteSyncAt: null, lastUsedAt: null, lastSyncRunId: null, archived: false, lastSync: null });
    setName('');
  };
  useEffect(() => { if (open) { setName(''); setErr(''); } }, [open]);
  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-body">
        <div className="modal-head"><div className="modal-icon" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="plus" size={20} /></div>
          <div style={{ flex: 1 }}><h3 style={{ fontSize: 16 }}>Create FileUpload source</h3><div className="muted" style={{ fontSize: 13, marginTop: 4 }}><span className="mono">POST /knowledge/sources</span> then validate with <span className="mono">GET /{'{id}'}</span>.</div></div></div>
        <div style={{ marginTop: 20 }}>
          <Field label="Source name" error={err} hint="2–200 characters · stored encrypted in your local vault">
            <input className={`input ${err ? 'input-err' : ''}`} value={name} onChange={e => { setName(e.target.value); setErr(''); }} placeholder="e.g. Support KB — Production" autoFocus onKeyDown={e => e.key === 'Enter' && submit()} />
          </Field>
          {dupe && <div style={{ marginTop: 12 }}><Callout tone="warning" icon="alert">A source with this name already exists locally. Confirm before creating a duplicate.</Callout></div>}
          <div style={{ marginTop: 14 }}><Callout tone="info" icon="shield">If create times out, the outcome is marked <span className="mono">SourceCreateUnknown</span> — instead of blind retry, use Discovery to find a likely-created source first.</Callout></div>
        </div>
      </div>
      <div className="modal-foot"><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="primary" icon="plus" onClick={submit}>Create source</Btn></div>
    </Modal>
  );
}

function ExistingSourceModal({ open, onClose, onAdd }) {
  const [id, setId] = useState(''); const [name, setName] = useState(''); const [err, setErr] = useState('');
  const [state, setState] = useState('idle'); // idle | validating | found | incompatible | notfound
  const [remote, setRemote] = useState(null);
  const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
  useEffect(() => { if (open) { setId(''); setName(''); setErr(''); setState('idle'); setRemote(null); } }, [open]);

  const validate = () => {
    if (!validId) { setErr('Enter a valid source ID (UUID).'); return; }
    setState('validating'); setErr('');
    setTimeout(() => {
      const match = seedRemoteSources().find(r => r.sourceId === id.trim());
      if (!match) { setState('notfound'); }
      else if (!SOURCE_TYPE_META[match.type]?.compatible) { setState('incompatible'); setRemote(match); }
      else { setState('found'); setRemote(match); setName(match.name); }
    }, 800);
  };
  const add = () => {
    if (!name.trim()) { setErr('Enter a display name.'); return; }
    onAdd({ localSourceKey: uuid(), sourceId: id.trim(), displayName: name.trim(), remoteName: remote?.name || null, sourceType: remote?.type || 'FileUpload', isCompatibleFileUploadSource: true, remoteStatus: remote?.status || 'Active', createdByApp: false, dateAddedToVault: Date.now(), lastValidatedAt: Date.now(), lastRemoteSyncAt: remote?.lastSyncAt || null, lastUsedAt: null, lastSyncRunId: null, archived: false, lastSync: null });
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-body">
        <div className="modal-head"><div className="modal-icon" style={{ background: 'var(--info-soft)', color: 'var(--info)' }}><Icon name="link" size={20} /></div>
          <div style={{ flex: 1 }}><h3 style={{ fontSize: 16 }}>Add source by ID</h3><div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Validated server-side with <span className="mono">GET /knowledge/sources/{'{id}'}</span> before it's saved.</div></div></div>
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Source ID" error={err && !validId ? err : ''} hint="UUID format">
            <div className="row" style={{ gap: 8 }}>
              <input className={`input mono ${err && !validId ? 'input-err' : ''}`} value={id} onChange={e => { setId(e.target.value); setState('idle'); setErr(''); }} placeholder="9b2e4f17-3c8a-4d56-bb20-7e1a9c4d2f88" autoFocus />
              <Btn variant="default" onClick={validate} disabled={state === 'validating'}>{state === 'validating' ? <Spinner size={15} /> : 'Validate'}</Btn>
            </div>
          </Field>
          <div className="faint" style={{ fontSize: 11.5, marginTop: -6 }}>Tip: a real Fabric source like <span className="mono">9b2e4f17-…</span> validates; others return “not accessible”.</div>

          {state === 'found' && remote && (
            <>
              <Callout tone="info" icon="check" title="Source validated">
                <span className="mono">{remote.name}</span> · {SOURCE_TYPE_META[remote.type].label} · {REMOTE_STATUS_META[remote.status].label}
              </Callout>
              <Field label="Display name (local)" error={err && validId ? err : ''}>
                <input className={`input ${err && validId ? 'input-err' : ''}`} value={name} onChange={e => { setName(e.target.value); setErr(''); }} />
              </Field>
            </>
          )}
          {state === 'incompatible' && remote && <Callout tone="danger" icon="alertCircle" title="Incompatible source type">This is a <strong>{SOURCE_TYPE_META[remote.type].label}</strong> source, not FileUpload. It can't be synced here and won't be imported.</Callout>}
          {state === 'notfound' && <Callout tone="danger" icon="xCircle" title="Source not accessible">No accessible source matched this ID. Check the ID and your OAuth permissions. The local record is not created.</Callout>}
        </div>
      </div>
      <div className="modal-foot"><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="primary" icon="check" onClick={add} disabled={state !== 'found'}>Add to vault</Btn></div>
    </Modal>
  );
}

function RenameModal({ target, onClose, onSave }) {
  const [name, setName] = useState('');
  useEffect(() => { if (target) setName(target.displayName); }, [target]);
  return (
    <Modal open={!!target} onClose={onClose}>
      <div className="modal-body">
        <h3 style={{ fontSize: 16, marginBottom: 14 }}>Rename source</h3>
        <Field label="Display name" hint="Local label only — the Genesys source is unchanged">
          <input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && onSave(name)} />
        </Field>
      </div>
      <div className="modal-foot"><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={() => onSave(name)}>Save</Btn></div>
    </Modal>
  );
}

function DeleteSourceModal({ target, activeRun, onClose, onConfirm }) {
  const [typed, setTyped] = useState('');
  useEffect(() => { if (target) setTyped(''); }, [target]);
  if (!target) return null;
  const blocked = activeRun && activeRun.sourceId === target.sourceId && ['Running', 'Cancelling', 'NeedsUserAction'].includes(activeRun.status);
  const match = typed.trim() === target.displayName;
  return (
    <Modal open={!!target} onClose={onClose}>
      <div className="modal-body">
        <div className="modal-head"><div className="modal-icon" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}><Icon name="trash" size={20} /></div>
          <div style={{ flex: 1 }}><h3 style={{ fontSize: 16 }}>Delete source</h3><div className="muted" style={{ fontSize: 13, marginTop: 4 }}><span className="mono">DELETE /knowledge/sources/{'{id}'}</span></div></div></div>
        <div style={{ marginTop: 18 }}>
          <Callout tone="danger" icon="alertCircle" title="This is unrecoverable">Deleting a Knowledge Fabric source removes it and its ingested content in Genesys. This cannot be undone. The local reference is archived only after remote deletion is confirmed.</Callout>
          {blocked ? (
            <div style={{ marginTop: 14 }}><Callout tone="warning" icon="alert" title="Blocked — sync in progress">A sync for this source is active or ambiguous. Resolve or cancel it before deleting.</Callout></div>
          ) : (
            <div style={{ marginTop: 16 }}>
              <Field label={<>Type <span className="mono" style={{ color: 'var(--danger)' }}>{target.displayName}</span> to confirm</>}>
                <input className="input" value={typed} onChange={e => setTyped(e.target.value)} placeholder={target.displayName} autoFocus />
              </Field>
            </div>
          )}
        </div>
      </div>
      <div className="modal-foot"><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="danger-solid" icon="trash" disabled={blocked || !match} onClick={onConfirm}>Delete permanently</Btn></div>
    </Modal>
  );
}

window.SourcesScreen = SourcesScreen;
window.DetailField = window.DetailField || function DetailField({ label, value }) {
  return <div><div className="faint" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>{label}</div><div style={{ fontSize: 13.5 }}>{value}</div></div>;
};
