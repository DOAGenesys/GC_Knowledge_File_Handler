'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandHeader } from './brand-header';
import { Icon } from './icon';
import { IconBtn, Tip } from './ui';
import { useApp } from './app-context';

const NAV = [
  { group: 'Overview', items: [{ href: '/', label: 'Dashboard', icon: 'dashboard' }] },
  {
    group: 'Manage',
    items: [
      { href: '/sources', label: 'Sources', icon: 'sources' },
      { href: '/new', label: 'New Sync', icon: 'sync' },
      { href: '/run', label: 'Active Run', icon: 'run' },
      { href: '/history', label: 'History', icon: 'history' },
    ],
  },
  {
    group: 'System',
    items: [
      { href: '/settings', label: 'Settings', icon: 'settings' },
      { href: '/diagnostics', label: 'Diagnostics', icon: 'diagnostics' },
    ],
  },
];

const ROUTE_META: Record<string, { title: string; crumb: string }> = {
  '/': { title: 'Dashboard', crumb: 'Overview' },
  '/sources': { title: 'Sources', crumb: 'Manage' },
  '/new': { title: 'New Sync', crumb: 'Manage' },
  '/run': { title: 'Active Run', crumb: 'Manage' },
  '/history': { title: 'History', crumb: 'Manage' },
  '/settings': { title: 'Settings', crumb: 'System' },
  '/diagnostics': { title: 'Diagnostics', crumb: 'System' },
};

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

function Sidebar() {
  const pathname = usePathname();
  const { activeRun, vaultState, lockVault, toast } = useApp();
  return (
    <aside className="sidebar">
      <BrandHeader layout="sidebar" />
      <nav
        className="scroll"
        style={{ overflowY: 'auto', flex: 1, margin: '0 -4px', padding: '0 4px' }}
        aria-label="Primary"
      >
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="nav-label">{g.group}</div>
            {g.items.map((it) => {
              const active = isActive(pathname, it.href);
              const live = it.href === '/run' && activeRun?.status === 'Running';
              const needs = it.href === '/run' && activeRun?.status === 'NeedsUserAction';
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={`nav-item ${active ? 'active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className="nav-ico">
                    <Icon name={it.icon} size={18} />
                  </span>
                  {it.label}
                  {live ? (
                    <span className="nav-badge live">
                      <span
                        className="dot dot-pulse"
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 99,
                          background: 'var(--success)',
                        }}
                      />
                      Live
                    </span>
                  ) : null}
                  {needs ? (
                    <span className="nav-badge" style={{ background: 'var(--warning)' }}>
                      !
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <VaultChip
        vaultState={vaultState}
        onLock={() => {
          lockVault();
          toast({ tone: 'info', title: 'Local data locked' });
        }}
      />
    </aside>
  );
}

function VaultChip({ vaultState, onLock }: { vaultState: string; onLock: () => void }) {
  const meta =
    vaultState === 'unlocked'
      ? {
          icon: 'unlock',
          tone: 'var(--success)',
          label: 'Local data unlocked',
          sub: 'Click to lock',
        }
      : vaultState === 'ephemeral'
        ? {
            icon: 'alert',
            tone: 'var(--warning)',
            label: 'Session only',
            sub: 'Changes will not be saved',
          }
        : {
            icon: 'lock',
            tone: 'var(--text-faint)',
            label: 'Local data locked',
            sub: 'Unlock to continue',
          };
  return (
    <button
      className="vault-chip"
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        textAlign: 'left',
      }}
      onClick={() => vaultState === 'unlocked' && onLock()}
      aria-label={meta.label}
    >
      <span style={{ color: meta.tone }}>
        <Icon name={meta.icon} size={17} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 650 }}>{meta.label}</div>
        <div className="faint" style={{ fontSize: 11 }}>
          {meta.sub}
        </div>
      </div>
      {vaultState === 'unlocked' ? <Icon name="power" size={15} className="faint" /> : null}
    </button>
  );
}

function Topbar() {
  const pathname = usePathname();
  const { theme, setTheme, readiness, username, logout } = useApp();
  const meta = ROUTE_META[pathname] ?? { title: 'Sync Manager', crumb: '' };
  const connected = readiness?.genesysConfigured ?? false;
  const conn = connected
    ? { icon: 'shieldCheck', tone: 'var(--success)', label: 'Genesys connected' }
    : { icon: 'alert', tone: 'var(--warning)', label: 'Genesys not configured' };
  return (
    <header className="topbar">
      {meta.crumb ? <span className="crumb">{meta.crumb}</span> : null}
      {meta.crumb ? <Icon name="chevR" size={14} className="faint" /> : null}
      <h1>{meta.title}</h1>
      <div className="topbar-right">
        {readiness?.environmentLabel && readiness.environmentLabel !== 'production' ? (
          <span className="badge badge-neutral" style={{ textTransform: 'capitalize' }}>
            {readiness.environmentLabel}
          </span>
        ) : null}
        <div className="statuschip">
          <span className="dot dot-pulse" style={{ background: conn.tone, color: conn.tone }} />
          <span style={{ color: conn.tone }}>
            <Icon name={conn.icon} size={14} />
          </span>
          {conn.label}
        </div>
        <Tip text="Signed-in access is required">
          <div
            className="statuschip"
            style={{ width: 30, padding: 0, justifyContent: 'center', color: 'var(--success)' }}
          >
            <Icon name="shield" size={15} />
          </div>
        </Tip>
        <IconBtn
          icon={theme === 'light' ? 'moon' : 'sun'}
          label="Toggle theme"
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        />
        <Link href="/new" className="btn btn-primary btn-sm">
          <Icon name="plus" size={15} />
          New Sync
        </Link>
        <Tip text={username ? `Signed in as ${username} — sign out` : 'Sign out'}>
          <IconBtn icon="power" label="Sign out" onClick={() => void logout()} />
        </Tip>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <Topbar />
        <div className="content scroll">
          <div className="fade-in">{children}</div>
        </div>
      </div>
    </div>
  );
}
