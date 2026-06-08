'use client';

/**
 * Shared UI primitives ported from the design prototype, typed and with
 * accessibility hardening (focus trap, labels, live regions where relevant).
 * All text is rendered as text — never via dangerouslySetInnerHTML — so file
 * names and remote messages cannot inject markup (PRODUCT.md §17.3).
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Icon } from './icon';

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

type ButtonVariant = 'primary' | 'default' | 'ghost' | 'danger' | 'danger-solid';

export interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'lg';
  icon?: string;
  iconR?: string;
}

export function Btn({
  variant = 'default',
  size,
  icon,
  iconR,
  className = '',
  children,
  ...rest
}: BtnProps) {
  const sz = size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '';
  const iconSize = size === 'sm' ? 15 : 16;
  return (
    <button className={`btn btn-${variant} ${sz} ${className}`} {...rest}>
      {icon ? <Icon name={icon} size={iconSize} /> : null}
      {children}
      {iconR ? <Icon name={iconR} size={iconSize} /> : null}
    </button>
  );
}

export function IconBtn({
  icon,
  size = 18,
  label,
  className = '',
  ...rest
}: { icon: string; size?: number; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`iconbtn ${className}`} aria-label={label} {...rest}>
      <Icon name={icon} size={size} />
    </button>
  );
}

export function Card({
  children,
  className = '',
  pad = false,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  pad?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`card ${pad ? 'card-pad' : ''} ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function Badge({
  tone = 'neutral',
  icon,
  children,
}: {
  tone?: Tone;
  icon?: string;
  children: ReactNode;
}) {
  return (
    <span className={`badge badge-${tone}`}>
      {icon ? <Icon name={icon} size={12} /> : null}
      {children}
    </span>
  );
}

interface StatusMeta {
  tone: Tone;
  icon: string;
  label: string;
}

export const STATUS_META: Record<string, StatusMeta> = {
  Selected: { tone: 'neutral', icon: 'file', label: 'Selected' },
  Validated: { tone: 'info', icon: 'check', label: 'Validated' },
  Hashing: { tone: 'accent', icon: 'fingerprint', label: 'Hashing' },
  Ready: { tone: 'success', icon: 'check', label: 'Ready' },
  Invalid: { tone: 'danger', icon: 'xCircle', label: 'Invalid' },
  Warning: { tone: 'warning', icon: 'alert', label: 'Warning' },
  TicketRequested: { tone: 'info', icon: 'loader', label: 'Requesting URL' },
  ticketed: { tone: 'info', icon: 'link', label: 'URL issued' },
  TicketIssued: { tone: 'info', icon: 'link', label: 'URL issued' },
  Uploading: { tone: 'accent', icon: 'uploadCloud', label: 'Uploading' },
  Uploaded: { tone: 'success', icon: 'checkCircle', label: 'Uploaded' },
  uploaded: { tone: 'success', icon: 'checkCircle', label: 'Uploaded' },
  UploadFailedRecoverable: { tone: 'warning', icon: 'alert', label: 'Failed — retryable' },
  failed_recoverable: { tone: 'warning', icon: 'alert', label: 'Failed — retryable' },
  UploadFailedFatal: { tone: 'danger', icon: 'xCircle', label: 'Failed' },
  NeedsReselect: { tone: 'warning', icon: 'refresh', label: 'Reselect file' },
  needs_reselect: { tone: 'warning', icon: 'refresh', label: 'Reselect file' },
  Skipped: { tone: 'neutral', icon: 'x', label: 'Skipped' },
  Cancelled: { tone: 'neutral', icon: 'stop', label: 'Cancelled' },
  UploadResultUnknown: { tone: 'warning', icon: 'help', label: 'Result unknown' },
  result_unknown: { tone: 'warning', icon: 'help', label: 'Result unknown' },
  queued: { tone: 'neutral', icon: 'clock', label: 'Queued' },
  Completed: { tone: 'success', icon: 'checkCircle', label: 'Completed' },
  Running: { tone: 'accent', icon: 'activity', label: 'Running' },
  NeedsUserAction: { tone: 'warning', icon: 'shieldAlert', label: 'Needs action' },
  CompletionUnknown: { tone: 'warning', icon: 'help', label: 'Completion unknown' },
  CancellationUnknown: { tone: 'warning', icon: 'help', label: 'Cancel unknown' },
  SourceCreateUnknown: { tone: 'warning', icon: 'help', label: 'Create unknown' },
  SyncStartUnknown: { tone: 'warning', icon: 'help', label: 'Start unknown' },
  FailedFatal: { tone: 'danger', icon: 'xCircle', label: 'Failed' },
  Draft: { tone: 'neutral', icon: 'edit', label: 'Draft' },
};

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { tone: 'neutral' as Tone, icon: 'info', label: status };
  const spin = status === 'Hashing' || status === 'TicketRequested' ? 'spin' : '';
  return (
    <span className={`badge badge-${meta.tone}`}>
      <Icon name={meta.icon} size={12} className={spin} />
      {meta.label}
    </span>
  );
}

export function Bar({
  value,
  tone,
  striped,
  className = '',
}: {
  value: number;
  tone?: 'success' | 'warning' | 'danger';
  striped?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`bar ${tone ?? ''} ${striped ? 'striped' : ''} ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Ring({
  value,
  size = 44,
  tone = 'var(--accent)',
}: {
  value: number;
  size?: number;
  tone?: string;
}) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="ring-prog" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--surface-3)" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={tone}
        strokeDasharray={c}
        strokeDashoffset={c - (value / 100) * c}
        style={{ transition: 'stroke-dashoffset .4s ease' }}
      />
    </svg>
  );
}

export function Toggle({
  checked,
  onChange,
  id,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  id?: string;
  label?: string;
}) {
  const auto = useId();
  return (
    <label className="switch">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        id={id ?? auto}
        aria-label={label}
      />
      <span className="track">
        <span className="thumb" />
      </span>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  accent,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  accent?: boolean;
}) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          className={`${value === o.value ? 'on' : ''} ${accent ? 'accent' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  const LabelTag = typeof label === 'string' ? 'label' : 'div';
  return (
    <div className="field">
      {label ? <LabelTag className="label">{label}</LabelTag> : null}
      {children}
      {error ? (
        <span className="hint" style={{ color: 'var(--danger)' }} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="hint">{hint}</span>
      ) : null}
    </div>
  );
}

export function Callout({
  tone = 'info',
  icon,
  title,
  children,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'accent';
  icon?: string;
  title?: ReactNode;
  children?: ReactNode;
}) {
  const defaultIcon = { info: 'info', warning: 'alert', danger: 'alertCircle', accent: 'zap' }[
    tone
  ];
  return (
    <div className={`callout callout-${tone}`}>
      <span className="co-ico">
        <Icon name={icon ?? defaultIcon} size={17} />
      </span>
      <div>
        {title ? <strong>{title}</strong> : null}
        {title ? <br /> : null}
        {children}
      </div>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  children,
  wide,
  labelledBy,
}: {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  wide?: boolean;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () =>
      node
        ? Array.from(
            node.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
            ),
          )
        : [];
    focusables()[0]?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.();
      } else if (e.key === 'Tab') {
        const items = focusables();
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      prevFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        {children}
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  tone = 'accent',
  icon,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant,
  confirmDisabled,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  tone?: 'accent' | 'danger' | 'warning';
  icon?: string;
  title: ReactNode;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ButtonVariant;
  confirmDisabled?: boolean;
}) {
  const iconBg = {
    accent: 'var(--accent-soft)',
    danger: 'var(--danger-soft)',
    warning: 'var(--warning-soft)',
  }[tone];
  const iconColor = { accent: 'var(--accent)', danger: 'var(--danger)', warning: 'var(--warning)' }[
    tone
  ];
  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-body">
        <div className="modal-head">
          <div className="modal-icon" style={{ background: iconBg, color: iconColor }}>
            <Icon name={icon ?? 'alert'} size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 16, marginBottom: 6 }}>{title}</h3>
            <div className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
              {body}
            </div>
          </div>
        </div>
      </div>
      <div className="modal-foot">
        <Btn variant="ghost" onClick={onClose}>
          {cancelLabel}
        </Btn>
        <Btn
          variant={confirmVariant ?? (tone === 'danger' ? 'danger-solid' : 'primary')}
          onClick={onConfirm}
          disabled={confirmDisabled}
        >
          {confirmLabel}
        </Btn>
      </div>
    </Modal>
  );
}

export function CopyId({
  value,
  truncate,
  label,
  redact,
}: {
  value: string;
  truncate?: number;
  label?: string;
  redact?: boolean;
}) {
  const [done, setDone] = useState(false);
  const display = redact
    ? `${value.slice(0, 6)}••••${value.slice(-4)}`
    : truncate && value.length > truncate
      ? `${value.slice(0, truncate)}…`
      : value;
  return (
    <button
      className="row tag-mini"
      style={{ cursor: 'pointer', gap: 6 }}
      title={value}
      aria-label={`Copy ${label ?? 'value'}`}
      onClick={() => {
        navigator.clipboard?.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
    >
      {label ? (
        <span className="faint" style={{ fontFamily: 'var(--sans)' }}>
          {label}
        </span>
      ) : null}
      <span>{display}</span>
      <Icon
        name={done ? 'check' : 'copy'}
        size={11}
        style={{ color: done ? 'var(--success)' : 'var(--text-faint)' }}
      />
    </button>
  );
}

export function Tip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="tip">
      {children}
      <span className="tip-pop" role="tooltip">
        {text}
      </span>
    </span>
  );
}

/** Hover/focus popover for field labels — supports rich content such as copy actions. */
export function HelpTip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="tip tip-rich">
      <button type="button" className="help-tip-trigger" aria-label={label}>
        <Icon name="help" size={14} />
      </button>
      <span className="tip-pop tip-pop-rich" role="tooltip">
        {children}
      </span>
    </span>
  );
}

export function Empty({
  icon,
  title,
  children,
}: {
  icon?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="e-ico">
        <Icon name={icon ?? 'inbox'} size={26} />
      </div>
      <div style={{ fontWeight: 650, color: 'var(--text)', fontSize: 14 }}>{title}</div>
      <div style={{ marginTop: 6, maxWidth: 360, margin: '6px auto 0' }}>{children}</div>
    </div>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <Icon name="loader" size={size} className="spin" />;
}

export function DetailField({ label, value }: { label: ReactNode; value: ReactNode }) {
  const style: CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    marginBottom: 6,
  };
  return (
    <div>
      <div className="faint" style={style}>
        {label}
      </div>
      <div style={{ fontSize: 13.5 }}>{value}</div>
    </div>
  );
}
