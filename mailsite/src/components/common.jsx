/* Small pieces used across every screen. Kept in one file because each is a
   handful of lines and splitting them would cost more in imports than it saves. */
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Loader2, WifiOff, X } from 'lucide-react';
import { avatarColor, initials, nameOf } from '../lib/format.js';

/* The wordmark. Sized by width so it fills the column it sits in — matching
   the Compose button beneath it in the sidebar — with the height following the
   artwork's own proportions rather than being fixed independently. */
export function Brand({ width, className = '' }) {
  return (
    <img src="/logo.png" alt="TIES Mail" className={`brand-logo ${className}`}
      style={width ? { width } : undefined} width="1102" height="284" />
  );
}

export function Avatar({ name, email, url, size = 36 }) {
  const seed = email || name || '?';
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) };
  if (url) {
    return (
      <span className="avatar" style={style}>
        <img src={url} alt="" loading="lazy" />
      </span>
    );
  }
  return (
    <span className="avatar" style={{ ...style, background: avatarColor(seed) }} aria-hidden="true">
      {initials(name || email)}
    </span>
  );
}

export function Chip({ label, className = '' }) {
  if (!label) return null;
  return <span className={`chip ${className}`}>{label}</span>;
}

export function Spinner({ size = 16 }) {
  return <Loader2 size={size} className="spin" aria-hidden="true" />;
}

/* Skeletons appear only after a beat. A response that arrives in 80ms should
   never produce a flash of grey bars — that reads as slower, not faster. */
export function useDelayedFlag(active, delay = 250) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!active) { setShow(false); return undefined; }
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [active, delay]);
  return show;
}

export function ListSkeleton({ rows = 6 }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="msg-row" style={{ borderBottom: '1px solid var(--line-soft)' }}>
          <div className="skeleton" style={{ width: 36, height: 36, borderRadius: '50%' }} />
          <div style={{ display: 'grid', gap: 7, alignContent: 'start' }}>
            <div className="skeleton" style={{ width: '38%', height: 11 }} />
            <div className="skeleton" style={{ width: '72%', height: 11 }} />
            <div className="skeleton" style={{ width: '55%', height: 10 }} />
          </div>
          <div className="skeleton" style={{ width: 28, height: 10 }} />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }) {
  return (
    <div className="empty">
      {icon}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorNotice({ children, onRetry }) {
  if (!children) return null;
  return (
    <div className="notice notice-error" role="alert">
      <AlertCircle size={16} style={{ flex: 'none', marginTop: 1 }} />
      <span style={{ flex: 1 }}>{children}</span>
      {onRetry && <button className="btn btn-sm" onClick={onRetry}>Try again</button>}
    </div>
  );
}

/* The offline banner watches the browser's own signal. It is advisory: a laptop
   can be "online" and still unable to reach us, which is why request failures
   surface their own errors too. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  if (!offline) return null;
  return (
    <div className="banner" role="status">
      <WifiOff size={15} />
      <span>No connection — changes will sync when you are back online.</span>
    </div>
  );
}

/* Toasts. `undo` turns one into an action with a deadline: the label counts
   down so the window is visible rather than a guess. */
export function Toast({ message, onUndo, onDone, seconds = 6 }) {
  const [left, setLeft] = useState(seconds);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (!message) return undefined;
    setLeft(seconds);
    const tick = setInterval(() => setLeft((n) => n - 1), 1000);
    const end = setTimeout(() => doneRef.current?.(), seconds * 1000);
    return () => { clearInterval(tick); clearTimeout(end); };
  }, [message, seconds]);

  if (!message) return null;
  return (
    <div className="toast-wrap">
      <div className="toast" role="status" aria-live="polite">
        <span>{message}</span>
        {onUndo && (
          <button onClick={onUndo}>
            Undo{left > 0 ? ` (${left})` : ''}
          </button>
        )}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, children, confirmLabel = 'Confirm',
                                danger = false, onConfirm, onCancel }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onCancel?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel?.()}>
      <div className="modal modal-sm" role="dialog" aria-modal="true">
        <div className="modal-head">{title}</div>
        <div className="modal-body"><p style={{ margin: 0, color: 'var(--muted)' }}>{children}</p></div>
        <div className="modal-foot">
          <span style={{ flex: 1 }} />
          {/* Keeping what you wrote is the safe default, so it goes first. */}
          <button className="btn" onClick={onCancel}>Keep editing</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export { Check, X, nameOf };
