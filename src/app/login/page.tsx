'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icon';
import { Btn, Card, Field, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api-client';
import { STORAGE_KEYS } from '@/lib/constants';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const toggleTheme = () => {
    const current =
      document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(STORAGE_KEYS.theme, next);
    } catch {
      /* ignore */
    }
  };

  const submit = async () => {
    setErr('');
    if (!username || !password) {
      setErr('Enter your username and password.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/auth/login', { username, password });
      const params = new URLSearchParams(window.location.search);
      const next = params.get('next');
      const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
      router.replace(dest);
    } catch (e) {
      setErr(
        e instanceof ApiError && e.status === 429
          ? 'Too many attempts. Wait a minute and try again.'
          : 'Invalid username or password.',
      );
      setPassword('');
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
        onClick={toggleTheme}
      >
        <Icon name="moon" size={18} />
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
              Genesys Cloud · administrator sign-in
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
                background: 'var(--accent-soft)',
                color: 'var(--accent)',
              }}
            >
              <Icon name="shield" size={26} />
            </div>
            <h2 style={{ fontSize: 19, letterSpacing: '-0.02em' }}>Sign in</h2>
            <p className="muted" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.55 }}>
              This deployment is restricted to a single administrator. No feature is reachable
              without signing in.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Username">
              <input
                className="input"
                value={username}
                autoFocus
                autoComplete="username"
                onChange={(e) => {
                  setUsername(e.target.value);
                  setErr('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </Field>
            <Field label="Password" error={err}>
              <div style={{ position: 'relative' }}>
                <input
                  className={`input ${err ? 'input-err' : ''}`}
                  type={show ? 'text' : 'password'}
                  value={password}
                  autoComplete="current-password"
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErr('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
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
                  aria-label={show ? 'Hide password' : 'Show password'}
                  type="button"
                >
                  <Icon name={show ? 'eyeOff' : 'eye'} size={16} />
                </button>
              </div>
            </Field>
            <Btn variant="primary" className="btn-block" onClick={submit} disabled={busy}>
              {busy ? (
                <>
                  <Spinner /> Signing in…
                </>
              ) : (
                <>
                  <Icon name="key" size={16} /> Sign in
                </>
              )}
            </Btn>
          </div>
        </Card>
      </div>
    </div>
  );
}
