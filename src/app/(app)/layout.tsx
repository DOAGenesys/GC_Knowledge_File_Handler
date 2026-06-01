'use client';

import { AppProvider, useApp } from '@/components/app-context';
import { AppShell } from '@/components/app-shell';
import { Toasts } from '@/components/toasts';
import { VaultGate } from '@/components/vault-gate';
import { Spinner } from '@/components/ui';

function Gate({ children }: { children: React.ReactNode }) {
  const { vaultState } = useApp();
  if (vaultState === 'loading') {
    return (
      <div className="auth-screen">
        <div className="row faint" style={{ gap: 10 }}>
          <Spinner size={20} /> Loading…
        </div>
      </div>
    );
  }
  if (vaultState === 'locked' || vaultState === 'absent' || vaultState === 'corrupt') {
    return <VaultGate />;
  }
  return <AppShell>{children}</AppShell>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <div className="app-root">
        <Gate>{children}</Gate>
        <Toasts />
      </div>
    </AppProvider>
  );
}
