import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, AtSign, MessageSquare, CheckCheck } from 'lucide-react';
import { getProjectNotifications, markProjectNotificationsRead } from '../../apiClient';

const fmt = (d) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function NotificationsBell() {
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const load = useCallback(async () => {
    const rows = await getProjectNotifications();
    setItems(Array.isArray(rows) ? rows : (rows?.results || []));
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 25000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const unread = items.filter((n) => !n.is_read).length;

  const openPanel = () => {
    setOpen((o) => !o);
  };
  const clickItem = async (n) => {
    setOpen(false);
    if (!n.is_read) { markProjectNotificationsRead([n.id]).catch(() => {}); setItems((it) => it.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))); }
    if (n.link) nav(n.link);
  };
  const markAll = async () => { await markProjectNotificationsRead(); setItems((it) => it.map((x) => ({ ...x, is_read: true }))); };

  const Icon = (k) => (k === 'mention' ? AtSign : k === 'dm' ? MessageSquare : Bell);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={openPanel} aria-label="Notifications" title="Notifications" style={{ position: 'relative' }}>
        <Bell size={19} />
        {unread > 0 && <span style={{ position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 9, background: '#dc2626', color: '#fff', fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center', lineHeight: 1 }}>{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 40, width: 340, maxHeight: 440, overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--outline-variant)', borderRadius: 12, boxShadow: '0 16px 44px rgba(0,0,0,.18)', zIndex: 1000 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid var(--outline-variant)' }}>
            <strong style={{ fontSize: 14, color: 'var(--text-main)' }}>Notifications</strong>
            {unread > 0 && <button onClick={markAll} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCheck size={13} /> Mark all read</button>}
          </div>
          {items.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>You’re all caught up.</div>
          ) : items.slice(0, 30).map((n) => {
            const I = Icon(n.kind);
            return (
              <button key={n.id} onClick={() => clickItem(n)} style={{ display: 'flex', gap: 10, width: '100%', textAlign: 'left', padding: '11px 14px', border: 'none', borderBottom: '1px solid var(--outline-variant)', background: n.is_read ? 'transparent' : 'var(--surface-container-low)', cursor: 'pointer' }}>
                <I size={16} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-main)', lineHeight: 1.35 }}>{n.text}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{n.project_title ? `${n.project_title} · ` : ''}{fmt(n.created_at)}</div>
                </div>
                {!n.is_read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0, marginLeft: 'auto', marginTop: 4 }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
