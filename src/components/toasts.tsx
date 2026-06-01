'use client';

import { Icon } from './icon';
import { useApp } from './app-context';

const TONE_META = {
  success: { icon: 'checkCircle', color: 'var(--success)' },
  info: { icon: 'info', color: 'var(--info)' },
  warning: { icon: 'alert', color: 'var(--warning)' },
  danger: { icon: 'alertCircle', color: 'var(--danger)' },
} as const;

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="toasts" role="status" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => {
        const meta = TONE_META[t.tone];
        return (
          <div className="toast" key={t.id}>
            <span className="tIcon" style={{ color: meta.color }}>
              <Icon name={meta.icon} size={18} />
            </span>
            <div style={{ flex: 1 }}>
              <div className="tTitle">{t.title}</div>
              {t.body ? <div className="tBody">{t.body}</div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
