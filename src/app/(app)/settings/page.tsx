'use client';

/**
 * Settings screen — preferences, local-vault controls, endpoint feature
 * visibility, and read-only environment readiness. Everything is stored
 * encrypted in the browser; feature flags and readiness come from the
 * non-secret server payload and are never mutated from here. No secret value
 * is ever displayed — only presence / validity.
 */
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useApp } from '@/components/app-context';
import { Icon } from '@/components/icon';
import {
  Badge,
  Btn,
  Callout,
  Card,
  ConfirmModal,
  Field,
  Modal,
  Segmented,
  Toggle,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { FEATURE_META } from '@/lib/feature-flags';
import type { SyncType } from '@/lib/types';

const READINESS_ITEMS = [{ key: 'APP_SESSION_SECRET', label: 'Secure sign-in' }] as const;

function SettingRow({
  title,
  desc,
  children,
  danger,
  last,
}: {
  title: ReactNode;
  desc: ReactNode;
  children: ReactNode;
  danger?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className="between"
      style={{
        padding: '14px 0',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        gap: 18,
        alignItems: 'flex-start',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontWeight: 650,
            fontSize: 13.5,
            color: danger ? 'var(--danger)' : 'var(--text)',
          }}
        >
          {title}
        </div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.45 }}>
          {desc}
        </div>
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function EnvRow({ ok, label, value }: { ok: boolean; label: string; value: string }) {
  return (
    <div
      className="row"
      style={{
        gap: 10,
        padding: '9px 12px',
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-sm)',
      }}
    >
      <span style={{ color: ok ? 'var(--success)' : 'var(--danger)', display: 'inline-flex' }}>
        <Icon name={ok ? 'checkCircle' : 'xCircle'} size={15} />
      </span>
      <span style={{ fontSize: 11.5, fontWeight: 600 }}>{label}</span>
      <span className="faint" style={{ fontSize: 11.5, marginLeft: 'auto' }}>
        {value}
      </span>
    </div>
  );
}

export default function SettingsPage() {
  const {
    prefs,
    setPrefs,
    features,
    theme,
    setTheme,
    readiness,
    vaultState,
    lockVault,
    clearLocalData,
    exportVault,
    importVault,
    changePassphrase,
    toast,
  } = useApp();

  const [showPass, setShowPass] = useState(false);
  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passBusy, setPassBusy] = useState(false);

  const [clearConfirm, setClearConfirm] = useState(false);

  const [importBlob, setImportBlob] = useState<string | null>(null);
  const [importPass, setImportPass] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Vault actions that need a live in-memory key only work while unlocked.
  const sessionLive = vaultState === 'unlocked';
  const lockedHint =
    vaultState === 'ephemeral'
      ? 'Storage is unavailable, so these actions are disabled.'
      : 'Unlock your local data to use this action.';

  const closePassModal = () => {
    setShowPass(false);
    setCurPass('');
    setNewPass('');
    setConfirmPass('');
  };

  const passMismatch = confirmPass.length > 0 && newPass !== confirmPass;
  const passTooShort = newPass.length > 0 && newPass.length < 8;
  const passValid = newPass.length >= 8 && newPass === confirmPass;

  const onChangePass = async () => {
    if (!passValid) return;
    if (!curPass) {
      toast({ tone: 'warning', title: 'Enter your current passphrase' });
      return;
    }
    setPassBusy(true);
    try {
      await changePassphrase(curPass, newPass);
      closePassModal();
      toast({
        tone: 'success',
        title: 'Passphrase changed',
        body: 'Your local data now uses the new passphrase.',
      });
    } catch (err) {
      const wrong = err instanceof Error && err.name === 'WrongPassphraseError';
      toast({
        tone: 'danger',
        title: wrong ? 'Current passphrase incorrect' : 'Change failed',
        body: wrong
          ? 'Enter your existing passphrase to authorize the change.'
          : 'Could not change the passphrase. Try again.',
      });
    } finally {
      setPassBusy(false);
    }
  };

  const onExport = () => {
    try {
      const blob = exportVault();
      if (!blob) {
        toast({
          tone: 'warning',
          title: 'Nothing to export',
          body: 'Unlock your local data first.',
        });
        return;
      }
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/octet-stream' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'gkfsm-vault.enc';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ tone: 'success', title: 'Backup exported', body: 'Keep it with your passphrase.' });
    } catch {
      toast({ tone: 'danger', title: 'Export failed', body: 'Could not build the export file.' });
    }
  };

  const onPickImport = () => fileInputRef.current?.click();

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      setImportBlob(text);
      setImportPass('');
    } catch {
      toast({ tone: 'danger', title: 'Read failed', body: 'Could not read the selected file.' });
    }
  };

  const closeImportModal = () => {
    setImportBlob(null);
    setImportPass('');
  };

  const onImport = async () => {
    if (importBlob == null || importPass.length === 0) return;
    setImportBusy(true);
    try {
      await importVault(importBlob, importPass);
      closeImportModal();
      toast({
        tone: 'success',
        title: 'Backup imported',
        body: 'Your local data was restored.',
      });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Wrong passphrase or corrupt file.';
      toast({ tone: 'danger', title: 'Import failed', body: msg });
    } finally {
      setImportBusy(false);
    }
  };

  const onLock = () => {
    lockVault();
    toast({ tone: 'info', title: 'Vault locked' });
  };

  const onClear = () => {
    setClearConfirm(false);
    clearLocalData();
    toast({
      tone: 'info',
      title: 'Local data cleared',
      body: 'Any active syncs can still be cancelled from this browser session.',
    });
  };

  const setPref = <K extends keyof typeof prefs>(key: K, value: (typeof prefs)[K]) => {
    void setPrefs({ [key]: value } as Partial<typeof prefs>).catch((err) => {
      const msg = err instanceof ApiError ? err.message : 'Unlock the vault to change preferences.';
      toast({ tone: 'danger', title: 'Could not save preference', body: msg });
    });
  };

  const missing = readiness?.missing ?? [];

  return (
    <div className="page narrow">
      <div className="page-head">
        <div className="page-title">Settings</div>
        <div className="page-desc">
          Manage preferences, backups, and which capabilities are available in this deployment.
        </div>
      </div>

      <div className="grid" style={{ gap: 18 }}>
        {/* 1) Local storage ----------------------------------------------- */}
        <Card>
          <div className="card-head">
            <Icon name="lock" size={16} style={{ color: 'var(--accent)' } as CSSProperties} />
            <h3>Local data</h3>
            <span className="sub">Protected on this device</span>
          </div>
          <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {!sessionLive ? (
              <div style={{ marginBottom: 12 }}>
                <Callout tone="warning" icon="lock">
                  {lockedHint}
                </Callout>
              </div>
            ) : null}

            <SettingRow
              title="Lock local data now"
              desc="Locks saved sources and sync history until you enter your passphrase again."
            >
              <Btn variant="default" size="sm" icon="lock" onClick={onLock} disabled={!sessionLive}>
                Lock
              </Btn>
            </SettingRow>

            <SettingRow
              title="Change passphrase"
              desc="Use a new passphrase for saved sources and sync history."
            >
              <Btn
                variant="default"
                size="sm"
                icon="key"
                onClick={() => setShowPass(true)}
                disabled={!sessionLive}
              >
                Change
              </Btn>
            </SettingRow>

            <SettingRow
              title="Export backup"
              desc="Download a protected backup. Keep your passphrase separate."
            >
              <Btn
                variant="default"
                size="sm"
                icon="download"
                onClick={onExport}
                disabled={!sessionLive}
              >
                Export
              </Btn>
            </SettingRow>

            <SettingRow title="Import backup" desc="Restore from a previously exported backup.">
              <input
                ref={fileInputRef}
                type="file"
                accept=".enc,application/octet-stream,text/plain"
                style={{ display: 'none' }}
                onChange={onImportFile}
              />
              <Btn variant="default" size="sm" icon="upload" onClick={onPickImport}>
                Import
              </Btn>
            </SettingRow>

            <SettingRow
              title="Clear local data"
              desc="Removes saved sources, preferences, and run history from this browser."
              danger
              last
            >
              <Btn variant="danger" size="sm" icon="trash" onClick={() => setClearConfirm(true)}>
                Clear data
              </Btn>
            </SettingRow>
          </div>
        </Card>

        {/* 2) Capabilities ------------------------------------------------ */}
        <Card>
          <div className="card-head">
            <Icon name="layers" size={16} style={{ color: 'var(--text-muted)' } as CSSProperties} />
            <h3>Available capabilities</h3>
            <span className="sub">Controlled by deployment</span>
          </div>
          <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ marginBottom: 14 }}>
              <Callout tone="info" icon="shield" title="Capabilities are managed by your admin">
                This list shows what is enabled for the deployment. Changes must be made by an
                administrator.
              </Callout>
            </div>

            {FEATURE_META.map((f, i) => {
              const on = features[f.key] === true;
              return (
                <div
                  key={f.key}
                  className="between"
                  style={{
                    padding: '13px 0',
                    borderBottom: i < FEATURE_META.length - 1 ? '1px solid var(--border)' : 'none',
                    gap: 16,
                    alignItems: 'flex-start',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontWeight: 650,
                          fontSize: 13.5,
                          color: f.danger ? 'var(--danger)' : 'var(--text)',
                        }}
                      >
                        {f.label}
                      </span>
                      {f.danger ? (
                        <Badge tone="danger" icon="alert">
                          Danger
                        </Badge>
                      ) : null}
                      {f.read ? <Badge tone="neutral">Read-only</Badge> : null}
                    </div>
                    <div
                      className="faint"
                      style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.45 }}
                    >
                      {f.desc}
                    </div>
                  </div>
                  <div
                    className="row"
                    style={{
                      gap: 10,
                      flexShrink: 0,
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                    }}
                  >
                    <Badge tone={on ? 'success' : 'neutral'} icon={on ? 'check' : 'x'}>
                      {on ? 'Enabled' : 'Disabled'}
                    </Badge>
                    <Toggle
                      checked={on}
                      onChange={() => undefined}
                      label={`${f.label} (${on ? 'enabled' : 'disabled'})`}
                    />
                    <span className="faint" style={{ fontSize: 11 }}>
                      Managed by admin
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* 3) Sync defaults --------------------------------------------- */}
        <Card>
          <div className="card-head">
            <Icon name="sync" size={16} style={{ color: 'var(--text-muted)' } as CSSProperties} />
            <h3>Sync defaults</h3>
          </div>
          <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <SettingRow
              title="Default sync type"
              desc="Full syncs always require an extra confirmation."
            >
              <Segmented<SyncType>
                value={prefs.defaultSyncType}
                onChange={(v) => setPref('defaultSyncType', v)}
                options={[
                  { value: 'Incremental', label: 'Incremental' },
                  { value: 'Full', label: 'Full' },
                ]}
              />
            </SettingRow>

            <SettingRow
              title="Upload path"
              desc="Direct upload is preferred. Use fallback only if uploads have trouble."
            >
              <Segmented<'direct' | 'proxy'>
                value={prefs.uploadMode}
                onChange={(v) => setPref('uploadMode', v)}
                options={[
                  { value: 'direct', label: 'Direct' },
                  { value: 'proxy', label: 'Proxy fallback' },
                ]}
              />
            </SettingRow>

            <SettingRow
              title="Auto-suggest safe renames"
              desc="Offer safer file names when a selected file name is not accepted."
            >
              <Toggle
                checked={prefs.autoRename}
                onChange={(v) => setPref('autoRename', v)}
                label="Auto-suggest safe renames"
              />
            </SettingRow>

            <SettingRow
              title="Large-file warning threshold"
              desc={`Warn before uploading files larger than ${prefs.sizeWarnMb} MB.`}
              last
            >
              <div className="row" style={{ gap: 12, width: 220 }}>
                <input
                  type="range"
                  min={10}
                  max={200}
                  step={10}
                  value={prefs.sizeWarnMb}
                  onChange={(e) => setPref('sizeWarnMb', Number(e.target.value))}
                  aria-label="Large-file warning threshold in megabytes"
                  style={{ flex: 1, accentColor: 'var(--accent)' }}
                />
                <span
                  className="mono tnum"
                  style={{ fontSize: 12.5, width: 52, textAlign: 'right' }}
                >
                  {prefs.sizeWarnMb} MB
                </span>
              </div>
            </SettingRow>
          </div>
        </Card>

        {/* 4) Appearance & privacy -------------------------------------- */}
        <Card>
          <div className="card-head">
            <Icon
              name="settings"
              size={16}
              style={{ color: 'var(--text-muted)' } as CSSProperties}
            />
            <h3>Appearance &amp; privacy</h3>
          </div>
          <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <SettingRow title="Theme" desc="Light or dark — your choice is remembered locally.">
              <Segmented<'light' | 'dark'>
                value={theme}
                onChange={(v) => setTheme(v)}
                options={[
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
            </SettingRow>

            <SettingRow
              title="Private diagnostics"
              desc="Exclude file names from diagnostics and support bundles."
              last
            >
              <Toggle
                checked={prefs.redactNames}
                onChange={(v) => setPref('redactNames', v)}
                label="Private diagnostics"
              />
            </SettingRow>
          </div>
        </Card>

        {/* 5) Readiness --------------------------------------------------- */}
        <Card pad>
          <div className="row" style={{ gap: 8, marginBottom: 14 }}>
            <Icon name="server" size={16} style={{ color: 'var(--text-muted)' } as CSSProperties} />
            <span style={{ fontWeight: 700, fontSize: 14.5 }}>Connection readiness</span>
          </div>

          {readiness ? (
            <>
              <div className="grid g2" style={{ gap: 10 }}>
                {READINESS_ITEMS.map((item) => {
                  const present = !missing.includes(item.key);
                  return (
                    <EnvRow
                      key={item.key}
                      ok={present}
                      label={item.label}
                      value={present ? 'Ready' : 'Missing'}
                    />
                  );
                })}
                <EnvRow
                  ok={readiness.genesysConfigured}
                  label="Genesys sign-in"
                  value={readiness.genesysConfigured ? 'Ready' : 'Sign in required'}
                />
                <EnvRow ok label="Environment" value={readiness.environmentLabel || '—'} />
                <EnvRow ok label="App version" value={readiness.appVersion || '—'} />
              </div>
              <div style={{ marginTop: 14 }}>
                <Callout tone="info" icon="shield">
                  Sensitive values are never displayed here. Run full checks in Diagnostics.
                </Callout>
              </div>
            </>
          ) : (
            <Callout tone="warning" icon="alert">
              Connection readiness is unavailable. Try refreshing or run Diagnostics.
            </Callout>
          )}
        </Card>
      </div>

      {/* Clear-data confirm ---------------------------------------------- */}
      <ConfirmModal
        open={clearConfirm}
        onClose={() => setClearConfirm(false)}
        onConfirm={onClear}
        tone="danger"
        icon="trash"
        title="Clear all local data?"
        body={
          <>
            This permanently removes saved sources, preferences, and run history from this browser.{' '}
            <strong>Export first</strong> if you want a backup. Genesys sources are unaffected.
          </>
        }
        confirmLabel="Clear everything"
      />

      {/* Change-passphrase modal ----------------------------------------- */}
      <Modal open={showPass} onClose={closePassModal}>
        <div className="modal-body">
          <h3 style={{ fontSize: 16, marginBottom: 16 }}>Change passphrase</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Current passphrase">
              <input
                className="input mono"
                type="password"
                placeholder="••••••••"
                autoFocus
                autoComplete="current-password"
                value={curPass}
                onChange={(e) => setCurPass(e.target.value)}
              />
            </Field>
            <Field
              label="New passphrase"
              hint="Use a long, unique passphrase (at least 8 characters)"
              error={passTooShort ? 'Passphrase must be at least 8 characters.' : undefined}
            >
              <input
                className="input mono"
                type="password"
                placeholder="••••••••"
                autoComplete="new-password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
              />
            </Field>
            <Field
              label="Confirm new passphrase"
              error={passMismatch ? 'Passphrases do not match.' : undefined}
            >
              <input
                className="input mono"
                type="password"
                placeholder="••••••••"
                autoComplete="new-password"
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && passValid && !passBusy) void onChangePass();
                }}
              />
            </Field>
          </div>
        </div>
        <div className="modal-foot">
          <Btn variant="ghost" onClick={closePassModal}>
            Cancel
          </Btn>
          <Btn
            variant="primary"
            icon="key"
            onClick={onChangePass}
            disabled={!passValid || passBusy}
          >
            {passBusy ? 'Changing…' : 'Change passphrase'}
          </Btn>
        </div>
      </Modal>

      {/* Import-passphrase modal ----------------------------------------- */}
      <Modal open={importBlob != null} onClose={closeImportModal}>
        <div className="modal-body">
          <h3 style={{ fontSize: 16, marginBottom: 16 }}>Import backup</h3>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 14 }}>
            Importing replaces local data in this browser. Enter the passphrase used when the backup
            was exported.
          </div>
          <Field label="Backup passphrase">
            <input
              className="input mono"
              type="password"
              placeholder="••••••••"
              autoFocus
              autoComplete="off"
              value={importPass}
              onChange={(e) => setImportPass(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && importPass.length > 0 && !importBusy) void onImport();
              }}
            />
          </Field>
        </div>
        <div className="modal-foot">
          <Btn variant="ghost" onClick={closeImportModal}>
            Cancel
          </Btn>
          <Btn
            variant="primary"
            icon="upload"
            onClick={onImport}
            disabled={importPass.length === 0 || importBusy}
          >
            {importBusy ? 'Importing…' : 'Import backup'}
          </Btn>
        </div>
      </Modal>
    </div>
  );
}
