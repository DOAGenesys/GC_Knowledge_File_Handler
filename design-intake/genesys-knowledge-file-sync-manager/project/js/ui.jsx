/* Shared UI primitives */
const { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } = React;

function Btn({ variant = 'default', size, children, icon, iconR, className = '', ...p }) {
  const sz = size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '';
  return (
    <button className={`btn btn-${variant} ${sz} ${className}`} {...p}>
      {icon && <Icon name={icon} size={size === 'sm' ? 15 : 16} />}
      {children}
      {iconR && <Icon name={iconR} size={size === 'sm' ? 15 : 16} />}
    </button>
  );
}

function IconBtn({ icon, size = 18, label, className = '', ...p }) {
  return (
    <button className={`iconbtn ${className}`} aria-label={label} {...p}>
      <Icon name={icon} size={size} />
    </button>
  );
}

function Card({ children, className = '', pad = false, ...p }) {
  return <div className={`card ${pad ? 'card-pad' : ''} ${className}`} {...p}>{children}</div>;
}

function Badge({ tone = 'neutral', icon, children }) {
  return <span className={`badge badge-${tone}`}>{icon && <Icon name={icon} size={12} />}{children}</span>;
}

/* status -> {tone, icon, label} map for run/file states */
const STATUS_META = {
  // file states
  Selected:    { tone: 'neutral', icon: 'file',        label: 'Selected' },
  Validated:   { tone: 'info',    icon: 'check',       label: 'Validated' },
  Hashing:     { tone: 'accent',  icon: 'fingerprint', label: 'Hashing' },
  Ready:       { tone: 'success', icon: 'check',       label: 'Ready' },
  Invalid:     { tone: 'danger',  icon: 'xCircle',     label: 'Invalid' },
  Warning:     { tone: 'warning', icon: 'alert',       label: 'Warning' },
  TicketRequested: { tone: 'info', icon: 'loader',     label: 'Requesting URL' },
  TicketIssued:    { tone: 'info', icon: 'link',       label: 'URL issued' },
  Uploading:   { tone: 'accent',  icon: 'uploadCloud', label: 'Uploading' },
  Uploaded:    { tone: 'success', icon: 'checkCircle', label: 'Uploaded' },
  UploadFailedRecoverable: { tone: 'warning', icon: 'alert', label: 'Failed — retryable' },
  UploadFailedFatal:       { tone: 'danger', icon: 'xCircle', label: 'Failed' },
  NeedsReselect: { tone: 'warning', icon: 'refresh',   label: 'Reselect file' },
  Skipped:     { tone: 'neutral', icon: 'x',           label: 'Skipped' },
  Cancelled:   { tone: 'neutral', icon: 'stop',        label: 'Cancelled' },
  UploadResultUnknown: { tone: 'warning', icon: 'help', label: 'Result unknown' },
  // run states
  Completed:    { tone: 'success', icon: 'checkCircle', label: 'Completed' },
  Running:      { tone: 'accent',  icon: 'activity',    label: 'Running' },
  NeedsUserAction: { tone: 'warning', icon: 'shieldAlert', label: 'Needs action' },
  CompletionUnknown: { tone: 'warning', icon: 'help',   label: 'Completion unknown' },
  CancellationUnknown: { tone: 'warning', icon: 'help', label: 'Cancel unknown' },
  FailedFatal:  { tone: 'danger',  icon: 'xCircle',     label: 'Failed' },
  Draft:        { tone: 'neutral', icon: 'edit',        label: 'Draft' },
};
function StatusBadge({ status }) {
  const m = STATUS_META[status] || { tone: 'neutral', icon: 'info', label: status };
  const spin = (status === 'Hashing' || status === 'TicketRequested') ? 'spin' : '';
  return (
    <span className={`badge badge-${m.tone}`}>
      <Icon name={m.icon} size={12} className={spin} />{m.label}
    </span>
  );
}

function Bar({ value, tone, striped, className = '' }) {
  const t = tone ? tone : '';
  return <div className={`bar ${t} ${striped ? 'striped' : ''} ${className}`}><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }}></span></div>;
}

function Ring({ value, size = 44, tone = 'var(--accent)' }) {
  const r = (size - 6) / 2, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="ring-prog">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--surface-3)" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={tone}
        strokeDasharray={c} strokeDashoffset={c - (value / 100) * c}
        style={{ transition: 'stroke-dashoffset .4s ease' }} />
    </svg>
  );
}

function Toggle({ checked, onChange, id }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} id={id} />
      <span className="track"><span className="thumb"></span></span>
    </label>
  );
}

function Segmented({ value, onChange, options, accent }) {
  return (
    <div className="seg" role="tablist">
      {options.map(o => (
        <button key={o.value} role="tab" aria-selected={value === o.value}
          className={`${value === o.value ? 'on' : ''} ${accent ? 'accent' : ''}`}
          onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

function Field({ label, hint, children, error }) {
  return (
    <div className="field">
      {label && <label className="label">{label}</label>}
      {children}
      {error ? <span className="hint" style={{ color: 'var(--danger)' }}>{error}</span> : hint && <span className="hint">{hint}</span>}
    </div>
  );
}

function Callout({ tone = 'info', icon, title, children }) {
  const di = { info: 'info', warning: 'alert', danger: 'alertCircle', accent: 'zap' }[tone];
  return (
    <div className={`callout callout-${tone}`}>
      <span className="co-ico"><Icon name={icon || di} size={17} /></span>
      <div>{title && <strong>{title}</strong>}{title && <br />}{children}</div>
    </div>
  );
}

function Modal({ open, onClose, children, wide }) {
  useEffect(() => {
    if (!open) return;
    const h = e => { if (e.key === 'Escape') onClose && onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose && onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">{children}</div>
    </div>
  );
}

function ConfirmModal({ open, onClose, onConfirm, tone = 'accent', icon, title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', confirmVariant }) {
  const iconBg = { accent: 'var(--accent-soft)', danger: 'var(--danger-soft)', warning: 'var(--warning-soft)' }[tone];
  const iconColor = { accent: 'var(--accent)', danger: 'var(--danger)', warning: 'var(--warning)' }[tone];
  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-body">
        <div className="modal-head">
          <div className="modal-icon" style={{ background: iconBg, color: iconColor }}><Icon name={icon || 'alert'} size={20} /></div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 16, marginBottom: 6 }}>{title}</h3>
            <div className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>{body}</div>
          </div>
        </div>
      </div>
      <div className="modal-foot">
        <Btn variant="ghost" onClick={onClose}>{cancelLabel}</Btn>
        <Btn variant={confirmVariant || (tone === 'danger' ? 'danger-solid' : 'primary')} onClick={onConfirm}>{confirmLabel}</Btn>
      </div>
    </Modal>
  );
}

/* copyable mono id */
function CopyId({ value, truncate, label, redact }) {
  const [done, setDone] = useState(false);
  const display = redact ? value.slice(0, 6) + '••••' + value.slice(-4)
    : truncate ? (value.length > truncate ? value.slice(0, truncate) + '…' : value) : value;
  return (
    <button className="row tag-mini" style={{ cursor: 'pointer', gap: 6 }} title={value}
      onClick={() => { navigator.clipboard && navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200); }}>
      {label && <span className="faint" style={{ fontFamily: 'var(--sans)' }}>{label}</span>}
      <span>{display}</span>
      <Icon name={done ? 'check' : 'copy'} size={11} style={{ color: done ? 'var(--success)' : 'var(--text-faint)' }} />
    </button>
  );
}

function Tip({ text, children }) {
  return <span className="tip">{children}<span className="tip-pop">{text}</span></span>;
}

function Empty({ icon, title, children }) {
  return (
    <div className="empty">
      <div className="e-ico"><Icon name={icon || 'inbox'} size={26} /></div>
      <div style={{ fontWeight: 650, color: 'var(--text)', fontSize: 14 }}>{title}</div>
      <div style={{ marginTop: 6, maxWidth: 360, margin: '6px auto 0' }}>{children}</div>
    </div>
  );
}

/* Spinner icon */
function Spinner({ size = 16 }) { return <Icon name="loader" size={size} className="spin" />; }

Object.assign(window, {
  Btn, IconBtn, Card, Badge, StatusBadge, STATUS_META, Bar, Ring, Toggle,
  Segmented, Field, Callout, Modal, ConfirmModal, CopyId, Tip, Empty, Spinner,
});
