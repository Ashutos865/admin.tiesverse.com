import { useState, useEffect, useCallback } from 'react';
import {
  Inbox, Loader2, Mail, Trash2, Check, RotateCcw, Search, AlertTriangle, Building2,
} from 'lucide-react';
import {
  getContactMessages, updateContactMessage, deleteContactMessage,
} from '../../apiClient';

const when = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

export default function ContactMessages() {
  const [messages, setMessages] = useState([]);
  const [newCount, setNewCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');      // '' | 'new' | 'handled'
  const [q, setQ] = useState('');
  const [toast, setToast] = useState('');

  const say = (m) => { setToast(m); setTimeout(() => setToast(''), 2600); };

  const load = useCallback(() => {
    const params = [];
    if (filter) params.push(`status=${filter}`);
    if (q.trim()) params.push(`q=${encodeURIComponent(q.trim())}`);
    return getContactMessages(params.length ? `?${params.join('&')}` : '')
      .then((r) => { setMessages(r?.messages || []); setNewCount(r?.new_count || 0); })
      .finally(() => setLoading(false));
  }, [filter, q]);

  // Debounced so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const setStatus = async (m, status) => {
    const res = await updateContactMessage(m.id, { status });
    if (res?.error) return say(res.error);
    say(status === 'handled' ? 'Marked handled.' : 'Moved back to new.');
    load();
  };

  const remove = async (m) => {
    if (!window.confirm(`Delete the message from ${m.name}? This cannot be undone.`)) return;
    const res = await deleteContactMessage(m.id);
    if (res?.error) return say(res.error);
    say('Message deleted.');
    load();
  };

  return (
    <div style={S.page}>
      {toast && <div style={S.toast}>{toast}</div>}

      <div style={S.head}>
        <div style={{ flex: 1 }}>
          <h1 style={S.h1}>
            <Inbox size={22} style={{ verticalAlign: -4, marginRight: 8, color: 'var(--primary)' }} />
            Messages
            {newCount > 0 && <span style={S.count}>{newCount} new</span>}
          </h1>
          <p style={S.sub}>
            Sent from the contact form on tiesverse.com. Each one is also emailed to
            hello@mail.tiesverse.com — replying there answers the sender directly.
          </p>
        </div>
      </div>

      <div style={S.bar}>
        {[['', 'All'], ['new', 'New'], ['handled', 'Handled']].map(([v, label]) => (
          <button key={v} onClick={() => setFilter(v)}
            style={{ ...S.tab, ...(filter === v ? S.tabOn : null) }}>{label}</button>
        ))}
        <div style={S.searchWrap}>
          <Search size={14} style={{ color: '#9ca3af', flex: 'none' }} />
          <input style={S.search} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, organisation or text" />
        </div>
      </div>

      {loading && <div style={{ padding: 30, color: '#6b7280' }}><Loader2 size={18} className="spin" /> Loading…</div>}

      {!loading && !messages.length && (
        <div style={S.empty}>
          <Inbox size={30} style={{ color: '#9ca3af' }} />
          <h3 style={{ margin: '12px 0 4px' }}>{q || filter ? 'Nothing matches' : 'No messages yet'}</h3>
          <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>
            {q || filter ? 'Try a different filter.' : 'Messages sent from the website contact form land here.'}
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {messages.map((m) => (
          <div key={m.id} style={{ ...S.card, ...(m.status === 'new' ? S.cardNew : null) }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 15 }}>{m.name}</strong>
                  {m.status === 'new' && <span style={S.pillNew}>New</span>}
                  {!m.emailed && (
                    <span style={S.pillWarn} title="The message was saved but the notification email did not send.">
                      <AlertTriangle size={11} /> not emailed
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 4 }}>
                  <a href={`mailto:${m.email}`} style={S.link}><Mail size={12} /> {m.email}</a>
                  {m.organisation && (
                    <span style={S.meta}><Building2 size={12} /> {m.organisation}</span>
                  )}
                  <span style={S.meta}>{when(m.created_at)}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <a href={`mailto:${m.email}?subject=${encodeURIComponent('Re: your message to Tiesverse')}`}
                  style={{ ...S.ghost, textDecoration: 'none' }}>
                  <Mail size={14} /> Reply
                </a>
                {m.status === 'new' ? (
                  <button style={S.primary} onClick={() => setStatus(m, 'handled')}>
                    <Check size={14} /> Handled
                  </button>
                ) : (
                  <button style={S.ghost} onClick={() => setStatus(m, 'new')}>
                    <RotateCcw size={14} /> Reopen
                  </button>
                )}
                <button style={S.del} onClick={() => remove(m)} title="Delete"><Trash2 size={14} /></button>
              </div>
            </div>

            <p style={S.body}>{m.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const S = {
  page: { padding: '26px 30px', maxWidth: 1000, margin: '0 auto' },
  head: { display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18 },
  h1: { fontSize: 24, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 },
  count: {
    fontSize: 12, fontWeight: 700, background: 'var(--primary,#fe7a00)', color: '#fff',
    borderRadius: 999, padding: '3px 10px',
  },
  sub: { color: '#6b7280', fontSize: 14, margin: '6px 0 0', maxWidth: 620 },
  bar: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' },
  tab: {
    padding: '6px 14px', borderRadius: 999, border: '1px solid #e5e7eb', background: '#fff',
    fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151',
  },
  tabOn: { background: '#111827', color: '#fff', borderColor: '#111827' },
  searchWrap: {
    display: 'flex', alignItems: 'center', gap: 7, marginLeft: 'auto',
    border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', background: '#fff',
    minWidth: 280,
  },
  search: { border: 0, outline: 'none', fontSize: 13, flex: 1, fontFamily: 'inherit' },
  card: { border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, background: '#fff' },
  cardNew: { borderColor: 'rgba(254,122,0,.35)', background: '#fffdf9' },
  pillNew: {
    fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em',
    background: 'rgba(254,122,0,.13)', color: '#c2410c', borderRadius: 999, padding: '2px 8px',
  },
  pillWarn: {
    display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700,
    background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a',
    borderRadius: 999, padding: '2px 8px',
  },
  link: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: '#374151', textDecoration: 'none' },
  meta: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: '#6b7280' },
  body: {
    margin: '12px 0 0', fontSize: 14, lineHeight: 1.6, color: '#111827',
    whiteSpace: 'pre-wrap', borderLeft: '3px solid #e5e7eb', paddingLeft: 12,
  },
  primary: {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px',
    background: 'var(--primary,#fe7a00)', color: '#fff', border: 0, borderRadius: 8,
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  ghost: {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
    fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151',
  },
  del: {
    width: 32, height: 32, display: 'grid', placeItems: 'center', background: '#fff',
    border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, cursor: 'pointer',
  },
  empty: {
    border: '1px dashed #e5e7eb', borderRadius: 12, padding: '40px 20px',
    textAlign: 'center', background: '#fafafa',
  },
  toast: {
    position: 'fixed', top: 70, right: 24, background: 'var(--primary,#fe7a00)',
    color: '#fff', padding: '10px 16px', borderRadius: 8, zIndex: 4000,
    fontSize: 13, fontWeight: 600,
  },
};
