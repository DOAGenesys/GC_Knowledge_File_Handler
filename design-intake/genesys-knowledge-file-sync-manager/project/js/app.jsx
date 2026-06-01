/* App shell: global store (context), theme, routing, sidebar, topbar */

const AppCtx = createContext(null);
const useApp = () => useContext(AppCtx);

const NAV = [
  { group: 'Overview', items: [{ key: 'dashboard', label: 'Dashboard', icon: 'dashboard' }] },
  { group: 'Manage', items: [
    { key: 'sources', label: 'Sources', icon: 'sources' },
    { key: 'new', label: 'New Sync', icon: 'sync' },
    { key: 'run', label: 'Active Run', icon: 'run' },
    { key: 'history', label: 'History', icon: 'history' },
  ] },
  { group: 'System', items: [
    { key: 'settings', label: 'Settings', icon: 'settings' },
    { key: 'diagnostics', label: 'Diagnostics', icon: 'diagnostics' },
  ] },
];

function AppProvider({ children }) {
  const [theme, setTheme] = useState('light');
  const [route, setRoute] = useState('dashboard');
  const [routeParam, setRouteParam] = useState(null);
  const [vault, setVault] = useState('unlocked'); // unlocked | locked | corrupt
  const [connection] = useState('connected');
  const [accessProtected] = useState(true);
  const [sources, setSources] = useState(() => seedSources());
  const [history, setHistory] = useState(() => seedHistory());
  const [activeRun, setActiveRun] = useState(null);
  const [draftPlan, setDraftPlan] = useState(null); // carried from New Sync -> Active Run
  const [toasts, setToasts] = useState([]);
  const [prefs, setPrefs] = useState({ defaultSyncType: 'Incremental', sizeWarnMb: 50, uploadMode: 'direct', autoRename: true, redactNames: false });
  const [features, setFeatures] = useState(() => ({ ...FEATURE_DEFAULTS }));
  const setFeature = useCallback((k, v) => setFeatures(f => ({ ...f, [k]: v })), []);

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  const toast = useCallback((t) => {
    const id = uuid();
    setToasts(ts => [...ts, { id, ...t }]);
    setTimeout(() => setToasts(ts => ts.filter(x => x.id !== id)), t.duration || 4200);
  }, []);

  const navigate = useCallback((key, param = null) => { setRoute(key); setRouteParam(param); document.querySelector('.content')?.scrollTo(0, 0); }, []);

  const value = {
    theme, setTheme, route, navigate, routeParam, vault, setVault, connection, accessProtected,
    sources, setSources, history, setHistory, activeRun, setActiveRun, draftPlan, setDraftPlan,
    toasts, toast, prefs, setPrefs, features, setFeatures, setFeature,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

function Sidebar() {
  const { route, navigate, activeRun } = useApp();
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><Icon name="layers" size={19} strokeWidth={2} /></div>
        <div>
          <div className="brand-name">Sync Manager</div>
          <div className="brand-sub">Genesys Knowledge Fabric</div>
        </div>
      </div>
      <div className="scroll" style={{ overflowY: 'auto', flex: 1, margin: '0 -4px', padding: '0 4px' }}>
        {NAV.map(g => (
          <div key={g.group}>
            <div className="nav-label">{g.group}</div>
            {g.items.map(it => {
              const live = it.key === 'run' && activeRun && activeRun.status === 'Running';
              return (
                <button key={it.key} className={`nav-item ${route === it.key ? 'active' : ''}`} onClick={() => navigate(it.key)}>
                  <span className="nav-ico"><Icon name={it.icon} size={18} /></span>
                  {it.label}
                  {live && <span className="nav-badge live"><span className="dot dot-pulse" style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--success)' }}></span>Live</span>}
                  {it.key === 'run' && activeRun && activeRun.status === 'NeedsUserAction' && <span className="nav-badge" style={{ background: 'var(--warning)' }}>!</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <VaultStatusChip />
    </aside>
  );
}

function VaultStatusChip() {
  const { vault, setVault, navigate, toast } = useApp();
  const meta = {
    unlocked: { icon: 'unlock', tone: 'var(--success)', label: 'Vault unlocked', sub: 'AES-GCM · in-memory key' },
    locked: { icon: 'lock', tone: 'var(--text-faint)', label: 'Vault locked', sub: 'Unlock to continue' },
    corrupt: { icon: 'alertCircle', tone: 'var(--danger)', label: 'Vault corrupt', sub: 'Restore or reset' },
  }[vault];
  return (
    <button className="card" style={{ padding: '11px 12px', display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', marginTop: 6 }}
      onClick={() => { if (vault === 'unlocked') { setVault('locked'); toast({ tone: 'info', title: 'Vault locked', body: 'In-memory key cleared.' }); } else navigate('settings'); }}>
      <span style={{ color: meta.tone }}><Icon name={meta.icon} size={17} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 650 }}>{meta.label}</div>
        <div className="faint" style={{ fontSize: 11 }}>{meta.sub}</div>
      </div>
      {vault === 'unlocked' && <Icon name="power" size={15} className="faint" />}
    </button>
  );
}

const ROUTE_META = {
  dashboard: { title: 'Dashboard', crumb: 'Overview' },
  sources: { title: 'Sources', crumb: 'Manage' },
  new: { title: 'New Sync', crumb: 'Manage' },
  run: { title: 'Active Run', crumb: 'Manage' },
  history: { title: 'History', crumb: 'Manage' },
  settings: { title: 'Settings', crumb: 'System' },
  diagnostics: { title: 'Diagnostics', crumb: 'System' },
};

function Topbar() {
  const { route, theme, setTheme, connection, accessProtected, navigate } = useApp();
  const m = ROUTE_META[route];
  const conn = {
    connected: { icon: 'shieldCheck', tone: 'var(--success)', label: 'Genesys connected' },
    degraded: { icon: 'alert', tone: 'var(--warning)', label: 'Degraded' },
    offline: { icon: 'cloudOff', tone: 'var(--danger)', label: 'Offline' },
  }[connection];
  return (
    <header className="topbar">
      <span className="crumb">{m.crumb}</span>
      <Icon name="chevR" size={14} className="faint" />
      <h1>{m.title}</h1>
      <div className="topbar-right">
        <div className="statuschip">
          <span className="dot dot-pulse" style={{ background: conn.tone, color: conn.tone }}></span>
          <span style={{ color: conn.tone }}><Icon name={conn.icon} size={14} /></span>
          {conn.label}
        </div>
        <Tip text={accessProtected ? 'Deployment protected' : 'Not protected'}>
          <div className="statuschip" style={{ width: 30, padding: 0, justifyContent: 'center', color: accessProtected ? 'var(--success)' : 'var(--warning)' }}>
            <Icon name="shield" size={15} />
          </div>
        </Tip>
        <IconBtn icon={theme === 'light' ? 'moon' : 'sun'} label="Toggle theme" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} />
        <Btn variant="primary" size="sm" icon="plus" onClick={() => navigate('new')}>New Sync</Btn>
      </div>
    </header>
  );
}

function Toasts() {
  const { toasts } = useApp();
  const tm = { success: { i: 'checkCircle', c: 'var(--success)' }, info: { i: 'info', c: 'var(--info)' }, warning: { i: 'alert', c: 'var(--warning)' }, danger: { i: 'alertCircle', c: 'var(--danger)' } };
  return (
    <div className="toasts">
      {toasts.map(t => {
        const m = tm[t.tone] || tm.info;
        return (
          <div className="toast" key={t.id}>
            <span className="tIcon" style={{ color: m.c }}><Icon name={m.i} size={18} /></span>
            <div style={{ flex: 1 }}><div className="tTitle">{t.title}</div>{t.body && <div className="tBody">{t.body}</div>}</div>
          </div>
        );
      })}
    </div>
  );
}

function Screen() {
  const { route } = useApp();
  const map = {
    dashboard: window.Dashboard, sources: window.SourcesScreen, new: window.NewSyncScreen,
    run: window.ActiveRunScreen, history: window.HistoryScreen, settings: window.SettingsScreen,
    diagnostics: window.DiagnosticsScreen,
  };
  const C = map[route] || window.Dashboard;
  return <div className="content scroll" key={route}><div className="fade-in"><C /></div></div>;
}

function App() {
  const { vault } = useApp();
  if (vault === 'locked' || vault === 'corrupt') return <><window.VaultLock /><Toasts /></>;
  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <Topbar />
        <Screen />
      </div>
      <Toasts />
    </div>
  );
}

function Root() { return <AppProvider><App /></AppProvider>; }

Object.assign(window, { AppCtx, useApp, Root });
