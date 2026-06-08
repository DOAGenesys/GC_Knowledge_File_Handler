'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/icon';
import { Card, Field, HelpTip, Spinner } from '@/components/ui';
import { GENESYS_LOGO_SRC, STORAGE_KEYS } from '@/lib/constants';

const REGION_STORAGE_KEY = 'gkfsm_genesys_region';
const CLIENT_ID_STORAGE_KEY = 'gkfsm_genesys_client_id';

function CallbackUrlCopy({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard?.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button type="button" className="tip-copy-btn" onClick={copy} aria-label="Copy redirect URI">
      <span className="tip-copy-url">{url}</span>
      <Icon name={copied ? 'check' : 'copy'} size={13} />
    </button>
  );
}

function ClientIdHelp({ callbackUrl }: { callbackUrl: string }) {
  return (
    <HelpTip label="Client ID help">
      <p style={{ margin: 0 }}>
        Create an OAuth Client in your GC org, &ldquo;Code Authorization / PKCE&rdquo; grant type
        with at least the &ldquo;Knowledge&rdquo; scope and the redirect URI below set in{' '}
        <strong>Authorized redirect URIs</strong>. Keep the Client Id (no need for the Client
        secret) and paste it here.
      </p>
      {callbackUrl ? <CallbackUrlCopy url={callbackUrl} /> : null}
    </HelpTip>
  );
}

function errorMessage(code: string | null): string {
  switch (code) {
    case 'access_denied':
      return 'Genesys did not approve the sign-in request.';
    case 'app_not_configured':
      return 'The app is not ready to sign users in yet.';
    case 'sign_in_failed':
      return 'Genesys sign-in could not be completed. Check the region and Client ID.';
    default:
      return '';
  }
}

export default function LoginPage() {
  const [region, setRegion] = useState('');
  const [clientId, setClientId] = useState('');
  const [callbackUrl, setCallbackUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setCallbackUrl(`${window.location.origin}/api/auth/callback`);

    try {
      setRegion(localStorage.getItem(REGION_STORAGE_KEY) ?? '');
      setClientId(localStorage.getItem(CLIENT_ID_STORAGE_KEY) ?? '');
    } catch {
      /* storage may be unavailable */
    }

    const params = new URLSearchParams(window.location.search);
    setErr(errorMessage(params.get('auth_error')));
  }, []);

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

  const submit = () => {
    setErr('');
    const trimmedRegion = region.trim();
    const trimmedClientId = clientId.trim();
    if (!trimmedRegion || !trimmedClientId) {
      setErr('Enter your Genesys Cloud region and Client ID.');
      return;
    }
    setBusy(true);
    try {
      localStorage.setItem(REGION_STORAGE_KEY, trimmedRegion);
      localStorage.setItem(CLIENT_ID_STORAGE_KEY, trimmedClientId);
    } catch {
      /* sign-in can continue without saved defaults */
    }
    const current = new URLSearchParams(window.location.search);
    const next = current.get('next');
    const params = new URLSearchParams({
      region: trimmedRegion,
      clientId: trimmedClientId,
    });
    if (next && next.startsWith('/') && !next.startsWith('//')) params.set('next', next);
    window.location.assign(`/api/auth/login?${params.toString()}`);
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

      <div className="fade-in" style={{ width: 460, maxWidth: '90vw' }}>
        <Card pad style={{ padding: 28 }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div className="genesys-brand-mark" aria-label="Genesys">
              <Image
                src={GENESYS_LOGO_SRC}
                alt="Genesys"
                width={225}
                height={58}
                priority
                className="genesys-brand-logo"
              />
            </div>
            <p className="eyebrow" style={{ marginBottom: 8 }}>
              Genesys Cloud
            </p>
            <h2 style={{ fontSize: 19, letterSpacing: '-0.02em' }}>Sign in with Genesys</h2>
            <p className="muted" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.55 }}>
              Connect with your Genesys Cloud account to manage source syncs and review recent
              activity.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Genesys Cloud region">
              <input
                className="input"
                value={region}
                autoFocus
                autoComplete="off"
                placeholder="mypurecloud.de"
                spellCheck={false}
                onChange={(e) => {
                  setRegion(e.target.value);
                  setErr('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </Field>
            <Field
              label={
                <span className="label-row">
                  Client ID
                  <ClientIdHelp callbackUrl={callbackUrl} />
                </span>
              }
              error={err}
            >
              <input
                className={`input ${err ? 'input-err' : ''}`}
                value={clientId}
                autoComplete="off"
                placeholder="Genesys Cloud Client ID"
                spellCheck={false}
                onChange={(e) => {
                  setClientId(e.target.value);
                  setErr('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </Field>
            <button className="genesys-button btn-block" onClick={submit} disabled={busy}>
              {busy ? (
                <>
                  <Spinner /> Signing in…
                </>
              ) : (
                <>
                  <Icon name="external" size={16} /> Sign in with Genesys
                </>
              )}
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
