'use client';

/**
 * Central client state provider. The encrypted vault is the source of truth for
 * local data (sources, runs, prefs); the server provides the authenticated
 * identity and non-secret feature/readiness flags. The vault's decryption key
 * lives only inside the in-memory VaultSession held here and is dropped on lock
 * or refresh.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { STORAGE_KEYS } from '@/lib/constants';
import { FEATURE_DEFAULTS, type FeatureFlags } from '@/lib/feature-flags';
import { api } from '@/lib/api-client';
import { uuid } from '@/lib/ids';
import {
  DEFAULT_PREFERENCES,
  type Preferences,
  type SourceRecord,
  type SyncRunRecord,
  type VaultData,
} from '@/lib/types';
import {
  VaultSession,
  WrongPassphraseError,
  clearLocalData as clearVaultStorage,
  hasVault,
  isStorageAvailable,
} from '@/lib/vault';
import type { ActiveRunState } from './run-types';

export type VaultState = 'loading' | 'absent' | 'locked' | 'unlocked' | 'corrupt' | 'ephemeral';

export interface Toast {
  id: string;
  tone: 'success' | 'info' | 'warning' | 'danger';
  title: string;
  body?: string;
}

interface AppContextValue {
  username: string | null;
  readiness: ReadinessLike | null;
  features: FeatureFlags;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;

  vaultState: VaultState;
  sources: SourceRecord[];
  syncRuns: SyncRunRecord[];
  prefs: Preferences;

  /** In-memory live run (holds File handles); null when idle. */
  activeRun: ActiveRunState | null;
  setActiveRun: React.Dispatch<React.SetStateAction<ActiveRunState | null>>;

  createVault: (passphrase: string) => Promise<void>;
  unlockVault: (passphrase: string) => Promise<void>;
  lockVault: () => void;
  clearLocalData: () => void;
  updateVault: (mutator: (draft: VaultData) => void) => Promise<void>;
  setPrefs: (patch: Partial<Preferences>) => Promise<void>;
  exportVault: () => string;
  importVault: (blob: string, passphrase: string) => Promise<void>;
  changePassphrase: (currentPassphrase: string, newPassphrase: string) => Promise<void>;
  logout: () => Promise<void>;

  toast: (t: Omit<Toast, 'id'>) => void;
  toasts: Toast[];
}

export interface ReadinessLike {
  genesysConfigured: boolean;
  authConfigured: boolean;
  missing: string[];
  regionHostValid: boolean;
  features: FeatureFlags;
  environmentLabel: string;
  appVersion: string;
  limits: {
    maxFileWarnMb: number;
    maxSelectedFiles: number;
    proxyUploadMaxBytes: number;
    uploadWaitSeconds: number;
  };
  directUploadConnectSrcConfigured: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within <AppProvider>');
  return ctx;
}

function applyThemeAttr(theme: 'light' | 'dark') {
  if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', theme);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const sessionRef = useRef<VaultSession | null>(null);
  const [vaultState, setVaultState] = useState<VaultState>('loading');
  const [vaultData, setVaultData] = useState<VaultData | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<ReadinessLike | null>(null);
  const [features, setFeatures] = useState<FeatureFlags>({ ...FEATURE_DEFAULTS });
  const [theme, setThemeState] = useState<'light' | 'dark'>('light');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [activeRun, setActiveRun] = useState<ActiveRunState | null>(null);

  // Initial bootstrap: identity, features, theme, vault presence.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEYS.theme);
        if (stored === 'dark' || stored === 'light') {
          setThemeState(stored);
          applyThemeAttr(stored);
        }
      } catch {
        /* storage may be unavailable */
      }

      try {
        const s = await api.get<{ username: string }>('/api/auth/session');
        if (active) setUsername(s.username);
      } catch {
        /* middleware gates; ignore */
      }
      try {
        const r = await api.get<ReadinessLike>('/api/features');
        if (active) {
          setReadiness(r);
          setFeatures(r.features);
        }
      } catch {
        /* leave defaults */
      }

      if (!isStorageAvailable()) {
        if (active) setVaultState('ephemeral');
        return;
      }
      if (active) setVaultState(hasVault() ? 'locked' : 'absent');
    })();
    return () => {
      active = false;
    };
  }, []);

  const refreshFromSession = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    const data = session.snapshot();
    setVaultData(data);
    const t = data.preferences.theme;
    setThemeState(t);
    applyThemeAttr(t);
  }, []);

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = uuid();
    setToasts((prev) => [...prev, { id, ...t }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4200);
  }, []);

  const setTheme = useCallback(
    (next: 'light' | 'dark') => {
      setThemeState(next);
      applyThemeAttr(next);
      try {
        localStorage.setItem(STORAGE_KEYS.theme, next);
      } catch {
        /* ignore */
      }
      const session = sessionRef.current;
      if (session)
        void session.update((d) => (d.preferences.theme = next)).then(refreshFromSession);
    },
    [refreshFromSession],
  );

  const createVault = useCallback(
    async (passphrase: string) => {
      sessionRef.current = await VaultSession.create(passphrase);
      setVaultState('unlocked');
      refreshFromSession();
    },
    [refreshFromSession],
  );

  const unlockVault = useCallback(
    async (passphrase: string) => {
      try {
        sessionRef.current = await VaultSession.unlock(passphrase);
        setVaultState('unlocked');
        refreshFromSession();
      } catch (err) {
        if (err instanceof Error && err.name === 'CorruptVaultError') setVaultState('corrupt');
        throw err;
      }
    },
    [refreshFromSession],
  );

  const lockVault = useCallback(() => {
    sessionRef.current = null;
    setVaultData(null);
    setVaultState(hasVault() ? 'locked' : 'absent');
  }, []);

  const clearLocalData = useCallback(() => {
    clearVaultStorage();
    sessionRef.current = null;
    setVaultData(null);
    setVaultState('absent');
  }, []);

  const updateVault = useCallback(
    async (mutator: (draft: VaultData) => void) => {
      const session = sessionRef.current;
      if (!session) throw new Error('vault is locked');
      await session.update(mutator);
      refreshFromSession();
    },
    [refreshFromSession],
  );

  const setPrefs = useCallback(
    async (patch: Partial<Preferences>) => {
      await updateVault((d) => Object.assign(d.preferences, patch));
      if (patch.theme) setTheme(patch.theme);
    },
    [updateVault, setTheme],
  );

  const exportVault = useCallback(() => sessionRef.current?.export() ?? '', []);

  const importVault = useCallback(
    async (blob: string, passphrase: string) => {
      sessionRef.current = await VaultSession.import(blob, passphrase);
      setVaultState('unlocked');
      refreshFromSession();
    },
    [refreshFromSession],
  );

  const changePassphrase = useCallback(async (current: string, next: string) => {
    const session = sessionRef.current;
    if (!session) throw new Error('vault is locked');
    if (!(await session.verifyPassphrase(current))) throw new WrongPassphraseError();
    await session.changePassphrase(next);
  }, []);

  const logout = useCallback(async () => {
    sessionRef.current = null;
    setVaultData(null);
    try {
      await api.post('/api/auth/logout');
    } finally {
      window.location.href = '/login';
    }
  }, []);

  const prefs = useMemo(
    () => vaultData?.preferences ?? { ...DEFAULT_PREFERENCES, theme },
    [vaultData, theme],
  );
  const sources = useMemo(() => vaultData?.sourceRegistry ?? [], [vaultData]);
  const syncRuns = useMemo(() => vaultData?.syncRuns ?? [], [vaultData]);

  const value = useMemo<AppContextValue>(
    () => ({
      username,
      readiness,
      features,
      theme,
      setTheme,
      vaultState,
      sources,
      syncRuns,
      prefs,
      activeRun,
      setActiveRun,
      createVault,
      unlockVault,
      lockVault,
      clearLocalData,
      updateVault,
      setPrefs,
      exportVault,
      importVault,
      changePassphrase,
      logout,
      toast,
      toasts,
    }),
    [
      vaultState,
      username,
      readiness,
      features,
      theme,
      setTheme,
      sources,
      syncRuns,
      prefs,
      activeRun,
      createVault,
      unlockVault,
      lockVault,
      clearLocalData,
      updateVault,
      setPrefs,
      exportVault,
      importVault,
      changePassphrase,
      logout,
      toast,
      toasts,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
