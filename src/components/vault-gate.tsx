'use client';

/**
 * Vault gate shown until the encrypted local vault is unlocked. Handles unlock,
 * first-run onboarding (create), corrupt-vault recovery, and ephemeral mode
 * (storage unavailable). The decryption key never leaves memory.
 */
import { useState } from 'react';
import { BrandHeader } from './brand-header';
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
          title: 'Secure storage created',
          body: 'Your local app data is ready.',
        });
      } else {
        await unlockVault(pass);
        toast({
          tone: 'success',
          title: 'Storage unlocked',
          body: 'You can continue where you left off.',
        });
      }
    } catch (e) {
      setAttempts((a) => a + 1);
      setErr(
        e instanceof Error && e.name === 'WrongPassphraseError'
          ? 'Incorrect passphrase.'
          : 'Could not unlock your local data.',
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
        <BrandHeader layout="auth" subtitle="Genesys Cloud" />

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
                ? 'Local data needs attention'
                : isEphemeral
                  ? 'Storage unavailable'
                  : isCreate
                    ? 'Create your local storage'
                    : 'Unlock your local storage'}
            </h2>
            <p className="muted" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.55 }}>
              {isCorrupt
                ? 'Your saved local data could not be opened. Restore from a backup, or reset local data to start fresh.'
                : isEphemeral
                  ? 'Browser storage is not available, so changes will only last for this session.'
                  : isCreate
                    ? 'Pick a strong passphrase to protect source references and sync history on this device.'
                    : 'Enter your passphrase to access saved sources and sync history on this device.'}
            </p>
          </div>

          {!isCorrupt && !isEphemeral && (
            <>
              <Field error={err}>
                <div style={{ position: 'relative' }}>
                  <input
                    className={`input mono ${err ? 'input-err' : ''}`}
                    type={show ? 'text' : 'password'}
                    placeholder="Passphrase"
                    value={pass}
                    autoFocus
                    aria-label="Passphrase"
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
                    If you forgot the passphrase, reset local data and add your sources again from
                    Genesys.
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
                    <Spinner /> {isCreate ? 'Creating…' : 'Unlocking…'}
                  </>
                ) : (
                  <>
                    <Icon name="key" size={16} /> {isCreate ? 'Create local storage' : 'Unlock'}
                  </>
                )}
              </Btn>
            </>
          )}

          {isCorrupt && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Callout tone="danger" icon="alertCircle">
                Restore from a backup in Settings, or reset to start fresh. Your Genesys sources are
                unaffected and can be added again.
              </Callout>
              <Btn
                variant="danger"
                icon="trash"
                onClick={() => {
                  clearLocalData();
                  toast({
                    tone: 'info',
                    title: 'Local data reset',
                    body: 'You can now create fresh local storage.',
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
            <Icon name="shieldCheck" size={13} /> Protected locally
          </span>
          <span className="row faint" style={{ fontSize: 11.5, gap: 5 }}>
            <Icon name="database" size={13} /> Data stays on this device
          </span>
        </div>
      </div>
    </div>
  );
}
