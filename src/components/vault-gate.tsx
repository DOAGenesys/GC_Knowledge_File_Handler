'use client';

/**
 * Vault gate shown until the encrypted local vault is unlocked. Handles unlock,
 * first-run onboarding (create), corrupt-vault recovery, and ephemeral mode
 * (storage unavailable). The decryption key never leaves memory.
 */
import { useState } from 'react';
import { Icon } from './icon';
import { Btn, Callout, Card, Field, Spinner } from './ui';
import { useApp } from './app-context';

export function VaultGate() {
  const { vaultState, theme, setTheme, createVault, unlockVault, clearLocalData, toast } = useApp();
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [attempts, setAttempts] = useState(0);

  const isCreate = vaultState === 'absent';
  const isCorrupt = vaultState === 'corrupt';
  const isEphemeral = vaultState === 'ephemeral';

  const submit = async () => {
    setErr('');
    if (!pass) {
      setErr(isCreate ? 'Choose a vault passphrase.' : 'Enter your vault passphrase.');
      return;
    }
    if (isCreate && pass !== confirm) {
      setErr('Passphrases do not match.');
      return;
    }
    if (isCreate && pass.length < 8) {
      setErr('Use at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      if (isCreate) {
        await createVault(pass);
        toast({
          tone: 'success',
          title: 'Vault created',
          body: 'Encrypted with AES-GCM · key in memory only.',
        });
      } else {
        await unlockVault(pass);
        toast({
          tone: 'success',
          title: 'Vault unlocked',
          body: 'Decryption key held in memory only.',
        });
      }
    } catch (e) {
      setAttempts((a) => a + 1);
      setErr(
        e instanceof Error && e.name === 'WrongPassphraseError'
          ? 'Incorrect passphrase. Decryption failed.'
          : 'Could not open the vault.',
      );
      setPass('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <button
        className="iconbtn"
        style={{ position: 'absolute', top: 20, right: 22 }}
        aria-label="Toggle theme"
        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      >
        <Icon name={theme === 'light' ? 'moon' : 'sun'} size={18} />
      </button>

      <div className="fade-in" style={{ width: 412, maxWidth: '90vw' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 26,
            justifyContent: 'center',
          }}
        >
          <div className="brand-mark" style={{ width: 38, height: 38 }}>
            <Icon name="layers" size={20} strokeWidth={2} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.02em' }}>
              Knowledge Fabric File Sync Manager
            </div>
            <div className="faint" style={{ fontSize: 12 }}>
              Genesys Cloud · database-free
            </div>
          </div>
        </div>

        <Card pad style={{ padding: 28 }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                margin: '0 auto 16px',
                display: 'grid',
                placeItems: 'center',
                background: isCorrupt ? 'var(--danger-soft)' : 'var(--accent-soft)',
                color: isCorrupt ? 'var(--danger)' : 'var(--accent)',
              }}
            >
              <Icon name={isCorrupt ? 'alertCircle' : isCreate ? 'plus' : 'lock'} size={26} />
            </div>
            <h2 style={{ fontSize: 19, letterSpacing: '-0.02em' }}>
              {isCorrupt
                ? 'Local vault is corrupt'
                : isEphemeral
                  ? 'Storage unavailable'
                  : isCreate
                    ? 'Create your local vault'
                    : 'Unlock your local vault'}
            </h2>
            <p className="muted" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.55 }}>
              {isCorrupt
                ? 'The encrypted vault failed integrity validation. Restore from an export, or reset local data. No partial parsing is attempted.'
                : isEphemeral
                  ? 'Browser storage is not available, so the app runs in ephemeral mode — nothing is persisted locally. You can still run a sync this session.'
                  : isCreate
                    ? 'Pick a strong passphrase. Your non-secret metadata is encrypted at rest; no secrets, tokens, or file bytes are ever stored.'
                    : 'Your encrypted metadata is decrypted in memory only. No secrets, tokens, or file bytes are ever stored.'}
            </p>
          </div>

          {!isCorrupt && !isEphemeral && (
            <>
              <Field error={err}>
                <div style={{ position: 'relative' }}>
                  <input
                    className={`input mono ${err ? 'input-err' : ''}`}
                    type={show ? 'text' : 'password'}
                    placeholder="Vault passphrase"
                    value={pass}
                    autoFocus
                    aria-label="Vault passphrase"
                    onChange={(e) => {
                      setPass(e.target.value);
                      setErr('');
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && !isCreate && submit()}
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    className="iconbtn"
                    style={{
                      position: 'absolute',
                      right: 4,
                      top: 4,
                      width: 30,
                      height: 30,
                      border: 'none',
                      boxShadow: 'none',
                      background: 'transparent',
                    }}
                    onClick={() => setShow((s) => !s)}
                    aria-label={show ? 'Hide passphrase' : 'Show passphrase'}
                  >
                    <Icon name={show ? 'eyeOff' : 'eye'} size={16} />
                  </button>
                </div>
              </Field>
              {isCreate && (
                <div style={{ marginTop: 12 }}>
                  <Field>
                    <input
                      className="input mono"
                      type={show ? 'text' : 'password'}
                      placeholder="Confirm passphrase"
                      value={confirm}
                      aria-label="Confirm passphrase"
                      onChange={(e) => setConfirm(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submit()}
                    />
                  </Field>
                </div>
              )}
              {attempts >= 2 && !isCreate && (
                <div style={{ marginTop: 12 }}>
                  <Callout tone="warning" title="Multiple failed attempts">
                    No detail about the stored data is revealed on failure. If you forgot the
                    passphrase, the vault cannot be recovered — reset local data and re-import
                    sources from Genesys.
                  </Callout>
                </div>
              )}
              <Btn
                variant="primary"
                className="btn-block"
                style={{ marginTop: 16 }}
                onClick={submit}
                disabled={busy}
              >
                {busy ? (
                  <>
                    <Spinner /> {isCreate ? 'Creating…' : 'Decrypting…'}
                  </>
                ) : (
                  <>
                    <Icon name="key" size={16} /> {isCreate ? 'Create vault' : 'Unlock vault'}
                  </>
                )}
              </Btn>
            </>
          )}

          {isCorrupt && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Callout tone="danger" icon="alertCircle">
                Restore from a previously exported encrypted blob in Settings, or reset to start
                fresh. Your Genesys sources are unaffected and can be re-discovered.
              </Callout>
              <Btn
                variant="danger"
                icon="trash"
                onClick={() => {
                  clearLocalData();
                  toast({
                    tone: 'info',
                    title: 'Local data reset',
                    body: 'A fresh empty vault can now be created.',
                  });
                }}
              >
                Reset local data
              </Btn>
            </div>
          )}

          {isEphemeral && (
            <Callout tone="warning" icon="alert">
              Source references and run history will not persist after you close this tab.
            </Callout>
          )}
        </Card>

        <div className="row" style={{ justifyContent: 'center', gap: 14, marginTop: 18 }}>
          <span className="row faint" style={{ fontSize: 11.5, gap: 5 }}>
            <Icon name="shieldCheck" size={13} /> AES-GCM
          </span>
          <span className="row faint" style={{ fontSize: 11.5, gap: 5 }}>
            <Icon name="cpu" size={13} /> PBKDF2-SHA-256
          </span>
          <span className="row faint" style={{ fontSize: 11.5, gap: 5 }}>
            <Icon name="database" size={13} /> No server DB
          </span>
        </div>
      </div>
    </div>
  );
}
