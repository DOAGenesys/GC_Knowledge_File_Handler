/* Vault lock / unlock screen + corrupt state */
function VaultLock() {
  const { vault, setVault, toast, theme, setTheme } = useApp();
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const corrupt = vault === 'corrupt';

  const unlock = () => {
    if (corrupt) return;
    if (!pass) { setErr('Enter your vault passphrase.'); return; }
    setBusy(true); setErr('');
    setTimeout(() => {
      setBusy(false);
      // demo: "wrong" unlocks unless passphrase literally is "wrong"
      if (pass.toLowerCase() === 'wrong') {
        setAttempts(a => a + 1);
        setErr('Incorrect passphrase. Decryption failed.');
        setPass('');
      } else {
        setVault('unlocked');
        toast({ tone: 'success', title: 'Vault unlocked', body: 'Decryption key held in memory only.' });
      }
    }, 700);
  };

  return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center', position: 'relative',
      background: 'radial-gradient(900px 500px at 50% -10%, var(--accent-soft) 0%, transparent 55%), linear-gradient(180deg, var(--bg), var(--bg-grad))' }}>
      <button className="iconbtn" style={{ position: 'absolute', top: 20, right: 22 }} aria-label="theme"
        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}><Icon name={theme === 'light' ? 'moon' : 'sun'} size={18} /></button>

      <div className="fade-in" style={{ width: 412, maxWidth: '90vw' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 26, justifyContent: 'center' }}>
          <div className="brand-mark" style={{ width: 38, height: 38 }}><Icon name="layers" size={20} strokeWidth={2} /></div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.02em' }}>Knowledge Fabric File Sync Manager</div>
            <div className="faint" style={{ fontSize: 12 }}>Genesys Cloud · database-free</div>
          </div>
        </div>

        <Card pad style={{ padding: 28 }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px', display: 'grid', placeItems: 'center',
              background: corrupt ? 'var(--danger-soft)' : 'var(--accent-soft)', color: corrupt ? 'var(--danger)' : 'var(--accent)' }}>
              <Icon name={corrupt ? 'alertCircle' : 'lock'} size={26} />
            </div>
            <h2 style={{ fontSize: 19, letterSpacing: '-0.02em' }}>{corrupt ? 'Local vault is corrupt' : 'Unlock your local vault'}</h2>
            <p className="muted" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.55 }}>
              {corrupt
                ? 'The encrypted vault failed integrity validation. Restore from an export, or reset local data. No partial parsing is attempted.'
                : 'Your encrypted metadata is decrypted in memory only. No secrets, tokens, or file bytes are ever stored.'}
            </p>
          </div>

          {!corrupt && (
            <>
              <Field error={err}>
                <div style={{ position: 'relative' }}>
                  <input className={`input mono ${err ? 'input-err' : ''}`} type={show ? 'text' : 'password'} placeholder="Vault passphrase"
                    value={pass} onChange={e => { setPass(e.target.value); setErr(''); }} onKeyDown={e => e.key === 'Enter' && unlock()} autoFocus
                    style={{ paddingRight: 40 }} />
                  <button className="iconbtn" style={{ position: 'absolute', right: 4, top: 4, width: 30, height: 30, border: 'none', boxShadow: 'none', background: 'transparent' }}
                    onClick={() => setShow(s => !s)} aria-label="show"><Icon name={show ? 'eyeOff' : 'eye'} size={16} /></button>
                </div>
              </Field>
              {attempts >= 2 && <div style={{ marginTop: 12 }}><Callout tone="warning" title="Multiple failed attempts">Unlock attempts are rate-limited locally. No detail about the stored data is revealed.</Callout></div>}
              <Btn variant="primary" className="btn-block" style={{ marginTop: 16 }} onClick={unlock} disabled={busy}>
                {busy ? <><Spinner /> Decrypting…</> : <><Icon name="key" size={16} /> Unlock vault</>}
              </Btn>
              <div className="row" style={{ justifyContent: 'center', marginTop: 16, gap: 6 }}>
                <Icon name="info" size={13} className="faint" />
                <span className="faint" style={{ fontSize: 11.5 }}>Tip: type <span className="kbd">wrong</span> to preview a failed unlock</span>
              </div>
            </>
          )}

          {corrupt && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Btn variant="default" icon="download" onClick={() => toast({ tone: 'info', title: 'Restore from export', body: 'Select a previously exported vault blob.' })}>Restore from export</Btn>
              <Btn variant="danger" icon="trash" onClick={() => { setVault('unlocked'); toast({ tone: 'success', title: 'Local data reset', body: 'A fresh empty vault was created.' }); }}>Reset local data</Btn>
            </div>
          )}
        </Card>

        <div className="row" style={{ justifyContent: 'center', gap: 14, marginTop: 18 }}>
          <span className="row faint" style={{ fontSize: 11.5, gap: 5 }}><Icon name="shieldCheck" size={13} /> AES-GCM</span>
          <span className="row faint" style={{ fontSize: 11.5, gap: 5 }}><Icon name="cpu" size={13} /> PBKDF2-SHA-256</span>
          <span className="row faint" style={{ fontSize: 11.5, gap: 5 }}><Icon name="database" size={13} /> No server DB</span>
        </div>
      </div>
    </div>
  );
}
window.VaultLock = VaultLock;
