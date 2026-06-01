/* Settings */
function SettingsScreen() {
  const { prefs, setPrefs, features, setFeature, setVault, theme, setTheme, toast } = useApp();
  const [showPass, setShowPass] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const set = (k, v) => setPrefs(p => ({ ...p, [k]: v }));

  return (
    <div className="page narrow">
      <div className="page-head"><div className="page-title">Settings</div><div className="page-desc">Preferences and vault controls. Everything here is stored encrypted in your browser — there is no account and no server-side database.</div></div>

      <div className="grid" style={{ gap: 18 }}>
        <Card>
          <div className="card-head"><Icon name="lock" size={16} style={{ color: 'var(--accent)' }} /><h3>Local vault</h3><span className="sub">AES-GCM · PBKDF2-SHA-256</span></div>
          <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <SettingRow title="Lock vault now" desc="Clears the in-memory decryption key. You'll re-unlock on next action.">
              <Btn variant="default" size="sm" icon="lock" onClick={() => { setVault('locked'); toast({ tone: 'info', title: 'Vault locked' }); }}>Lock</Btn>
            </SettingRow>
            <SettingRow title="Change passphrase" desc="Re-derives the key and re-encrypts the vault envelope.">
              <Btn variant="default" size="sm" icon="key" onClick={() => setShowPass(true)}>Change</Btn>
            </SettingRow>
            <SettingRow title="Export encrypted vault" desc="Download the encrypted blob — safe to back up. Keep your passphrase separate.">
              <Btn variant="default" size="sm" icon="download" onClick={() => toast({ tone: 'success', title: 'Vault exported', body: 'gkfsm-vault-2026-06-01.enc' })}>Export</Btn>
            </SettingRow>
            <SettingRow title="Import encrypted vault" desc="Restore from a previously exported blob.">
              <Btn variant="default" size="sm" icon="upload">Import</Btn>
            </SettingRow>
            <SettingRow title="Clear local data" desc="Removes the vault and all local summaries. Cannot be undone." danger last>
              <Btn variant="danger" size="sm" icon="trash" onClick={() => setClearConfirm(true)}>Clear data</Btn>
            </SettingRow>
          </div>
        </Card>

        <Card>
          <div className="card-head"><Icon name="layers" size={16} style={{ color: 'var(--text-muted)' }} /><h3>Endpoint features</h3><span className="sub">Least-privilege · enable only what you need</span></div>
          <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {FEATURE_META.map((f, i) => (
              <div key={f.key} className="between" style={{ padding: '13px 0', borderBottom: i < FEATURE_META.length - 1 ? '1px solid var(--border)' : 'none', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 650, fontSize: 13.5, color: f.danger ? 'var(--danger)' : 'var(--text)' }}>{f.label}</span>
                    {f.danger && <Badge tone="danger" icon="alert">Danger</Badge>}
                    {f.read && <Badge tone="neutral">Read-only</Badge>}
                  </div>
                  <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.45 }}>{f.desc}</div>
                  <div className="tag-mini" style={{ marginTop: 6, display: 'inline-block' }}>{f.endpoint}</div>
                </div>
                <Toggle checked={!!features[f.key]} onChange={v => { setFeature(f.key, v); toast({ tone: v ? 'success' : 'info', title: `${f.label} ${v ? 'enabled' : 'disabled'}`, body: v && f.danger ? 'Danger-zone capability now visible on Sources.' : undefined }); }} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="card-head"><Icon name="sync" size={16} style={{ color: 'var(--text-muted)' }} /><h3>Sync defaults</h3></div>
          <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <SettingRow title="Default sync type" desc="Full syncs always require an extra confirmation.">
              <Segmented value={prefs.defaultSyncType} onChange={v => set('defaultSyncType', v)} options={[{ value: 'Incremental', label: 'Incremental' }, { value: 'Full', label: 'Full' }]} />
            </SettingRow>
            <SettingRow title="Upload path" desc="Direct browser→Genesys is preferred. Proxy is a streaming fallback for CORS-blocked URLs.">
              <Segmented value={prefs.uploadMode} onChange={v => set('uploadMode', v)} options={[{ value: 'direct', label: 'Direct' }, { value: 'proxy', label: 'Proxy fallback' }]} />
            </SettingRow>
            <SettingRow title="Auto-suggest safe renames" desc="Offer sanitized upload names when a file name breaks Genesys constraints.">
              <Toggle checked={prefs.autoRename} onChange={v => set('autoRename', v)} />
            </SettingRow>
            <SettingRow title={`Large-file warning threshold`} desc={`Warn before uploading files larger than ${prefs.sizeWarnMb} MB.`} last>
              <div className="row" style={{ gap: 12, width: 220 }}>
                <input type="range" min="10" max="200" step="10" value={prefs.sizeWarnMb} onChange={e => set('sizeWarnMb', +e.target.value)} style={{ flex: 1, accentColor: 'var(--accent)' }} />
                <span className="mono tnum" style={{ fontSize: 12.5, width: 52, textAlign: 'right' }}>{prefs.sizeWarnMb} MB</span>
              </div>
            </SettingRow>
          </div>
        </Card>

        <Card>
          <div className="card-head"><Icon name="settings" size={16} style={{ color: 'var(--text-muted)' }} /><h3>Appearance & privacy</h3></div>
          <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <SettingRow title="Theme" desc="Light or dark — your choice is remembered locally.">
              <Segmented value={theme} onChange={setTheme} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
            </SettingRow>
            <SettingRow title="Private diagnostics" desc="Exclude file names from diagnostics and support bundles." last>
              <Toggle checked={prefs.redactNames} onChange={v => set('redactNames', v)} />
            </SettingRow>
          </div>
        </Card>

        <Card pad>
          <div className="row" style={{ gap: 8, marginBottom: 14 }}><Icon name="server" size={16} style={{ color: 'var(--text-muted)' }} /><span style={{ fontWeight: 700, fontSize: 14.5 }}>Environment readiness</span></div>
          <div className="grid g2" style={{ gap: 10 }}>
            <EnvRow ok label="GENESYS_CLIENT_ID" value="configured" />
            <EnvRow ok label="GENESYS_CLIENT_SECRET" value="server-only" />
            <EnvRow ok label="GENESYS_REGION_API_HOST" value={REGION} />
            <EnvRow ok label="APP_ACCESS_MODE" value="protected" />
          </div>
          <div style={{ marginTop: 14 }}><Callout tone="info" icon="shield">Secret values are never displayed — only presence is checked. Run full checks in Diagnostics.</Callout></div>
        </Card>
      </div>

      <ConfirmModal open={clearConfirm} onClose={() => setClearConfirm(false)} onConfirm={() => { setClearConfirm(false); toast({ tone: 'info', title: 'Local data cleared', body: 'Active server-side syncs can still be cancelled.' }); }}
        tone="danger" icon="trash" title="Clear all local data?" body={<>This permanently removes your encrypted vault, source registry, and run history from this browser. <strong>Export first</strong> if you want a backup. Server-side Genesys state is unaffected.</>} confirmLabel="Clear everything" />
      <ChangePassModal open={showPass} onClose={() => setShowPass(false)} onSave={() => { setShowPass(false); toast({ tone: 'success', title: 'Passphrase changed', body: 'Vault re-encrypted with the new key.' }); }} />
    </div>
  );
}

function SettingRow({ title, desc, children, danger, last }) {
  return (
    <div className="between" style={{ padding: '14px 0', borderBottom: last ? 'none' : '1px solid var(--border)', gap: 18, alignItems: 'flex-start' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 650, fontSize: 13.5, color: danger ? 'var(--danger)' : 'var(--text)' }}>{title}</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.45 }}>{desc}</div>
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function EnvRow({ ok, label, value }) {
  return (
    <div className="row" style={{ gap: 10, padding: '9px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
      <span style={{ color: ok ? 'var(--success)' : 'var(--danger)' }}><Icon name={ok ? 'checkCircle' : 'xCircle'} size={15} /></span>
      <span className="mono" style={{ fontSize: 11.5, fontWeight: 600 }}>{label}</span>
      <span className="faint" style={{ fontSize: 11.5, marginLeft: 'auto' }}>{value}</span>
    </div>
  );
}

function ChangePassModal({ open, onClose, onSave }) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-body">
        <h3 style={{ fontSize: 16, marginBottom: 16 }}>Change vault passphrase</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Current passphrase"><input className="input mono" type="password" placeholder="••••••••" autoFocus /></Field>
          <Field label="New passphrase" hint="Use a long, unique passphrase"><input className="input mono" type="password" placeholder="••••••••" /></Field>
          <Field label="Confirm new passphrase"><input className="input mono" type="password" placeholder="••••••••" /></Field>
        </div>
      </div>
      <div className="modal-foot"><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="primary" icon="key" onClick={onSave}>Change passphrase</Btn></div>
    </Modal>
  );
}

window.SettingsScreen = SettingsScreen;
