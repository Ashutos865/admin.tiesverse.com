import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Mail, Inbox, Send, Trash2, RefreshCw, Plus, X, CornerUpLeft, Search,
  AlertTriangle, Users, Loader2, RotateCcw,
} from 'lucide-react';
import {
  getMyMailboxes, listMailMessages, getMailMessage, sendMailMessage,
  deleteMailMessage, restoreMailMessage,
} from '../../apiClient';

/* TIES Mail — the mailbox screen.
   A mailbox is assigned by a superadmin; PERSONAL boxes belong to one member and
   SHARED boxes (e.g. nimble@) are granted to several. Mail lives on
   @mail.tiesverse.com, which is entirely separate from Google Workspace. */

const wrap = { padding: '28px 32px', maxWidth: 1240 };
const card = {
  border: '1px solid var(--outline-variant)', borderRadius: 12,
  background: 'var(--surface-container-lowest)',
};
const btn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
  borderRadius: 8, border: '1px solid var(--outline-variant)',
  background: 'var(--surface-container-low)', color: 'var(--text-main)',
  fontSize: 13, fontWeight: 700, cursor: 'pointer',
};
const btnPrimary = { ...btn, background: 'var(--primary)', color: '#fff', border: 'none' };
const input = {
  padding: '9px 12px', borderRadius: 8, border: '1px solid var(--outline-variant)',
  background: 'var(--surface-container-lowest)', color: 'var(--text-main)',
  fontSize: 13, width: '100%', boxSizing: 'border-box',
};
const label = {
  fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
  letterSpacing: '.04em', marginBottom: 5, display: 'block',
};

const FOLDERS = [
  { key: 'inbox', name: 'Inbox', icon: Inbox },
  { key: 'sent', name: 'Sent', icon: Send },
  { key: 'trash', name: 'Trash', icon: Trash2 },
];

function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function Avatar({ url, name, size = 34 }) {
  const initials = (name || '?').trim().split(/\s+/).slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '').join('') || '?';
  const base = {
    width: size, height: size, borderRadius: '50%', flex: 'none',
    display: 'grid', placeItems: 'center', overflow: 'hidden',
    fontSize: size * 0.36, fontWeight: 800,
    background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
    color: 'var(--primary)',
  };
  if (url) {
    return <span style={base}><img src={url} alt={name || ''}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></span>;
  }
  return <span style={base}>{initials}</span>;
}

export default function MailApp() {
  const [boxes, setBoxes] = useState(null);
  const [activeBox, setActiveBox] = useState(null);
  const [folder, setFolder] = useState('inbox');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);       // opened message + thread
  const [compose, setCompose] = useState(null); // {to, subject, body, in_reply_to, thread_key}
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 4500); };

  // Which mailboxes can I open?
  useEffect(() => {
    let alive = true;
    getMyMailboxes().then((res) => {
      if (!alive) return;
      if (res && !res.error) {
        setBoxes(res.mailboxes || []);
        setActiveBox((prev) => prev || (res.mailboxes || [])[0]?.id || null);
      } else {
        setBoxes([]);
        flash('error', res?.error || 'Could not load your mailboxes.');
      }
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const load = useCallback(async (boxId, f, q) => {
    if (!boxId) return;
    setLoading(true);
    const res = await listMailMessages(boxId, f, q);
    if (res && !res.error) setData(res);
    else flash('error', res?.error || 'Could not load messages.');
    setLoading(false);
  }, []);

  useEffect(() => { if (activeBox) load(activeBox, folder, search); },
    [activeBox, folder, load]);   // search runs via the form submit

  const box = useMemo(
    () => (boxes || []).find((b) => b.id === activeBox) || null,
    [boxes, activeBox],
  );

  const openMessage = async (id) => {
    const res = await getMailMessage(id);
    if (res && !res.error) {
      setOpen(res);
      load(activeBox, folder, search);   // refresh unread counts
    } else flash('error', res?.error || 'Could not open the message.');
  };

  const onSend = async (e) => {
    e.preventDefault();
    if (!compose?.to || !compose?.subject) {
      flash('error', 'Recipient and subject are required.');
      return;
    }
    setBusy(true);
    const res = await sendMailMessage({
      mailbox: activeBox, to: compose.to, cc: compose.cc || '',
      subject: compose.subject, body: compose.body || '',
      in_reply_to: compose.in_reply_to || '', thread_key: compose.thread_key || '',
    });
    setBusy(false);
    if (res && !res.error) {
      setCompose(null);
      flash('ok', 'Message sent.');
      if (folder === 'sent') load(activeBox, folder, search);
    } else flash('error', res?.error || 'Send failed.');
  };

  const onDelete = async (id) => {
    if (!window.confirm('Move this message to Trash?')) return;
    const res = await deleteMailMessage(id);
    if (res && !res.error) { setOpen(null); load(activeBox, folder, search); }
    else flash('error', res?.error || 'Could not delete.');
  };

  const onRestore = async (id) => {
    const res = await restoreMailMessage(id);
    if (res && !res.error) { setOpen(null); load(activeBox, folder, search); }
    else flash('error', res?.error || 'Could not restore.');
  };

  // No mailbox → tell them who to ask, never a blank screen.
  if (boxes !== null && boxes.length === 0) {
    return (
      <div style={wrap}>
        <div style={{ ...card, padding: 40, textAlign: 'center', maxWidth: 520, margin: '40px auto' }}>
          <Mail size={40} style={{ color: 'var(--text-muted)', marginBottom: 14 }} />
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-main)', marginBottom: 8 }}>
            No mailbox yet
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            You don't have a TIES Mail address yet. Ask an admin or HR to create one
            for you — once they do, your inbox appears here automatically.
          </div>
        </div>
      </div>
    );
  }

  const messages = data?.messages || [];

  return (
    <div style={wrap}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <Mail size={22} style={{ color: 'var(--primary)' }} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-main)' }}>TIES Mail</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            {box ? box.address : 'Loading…'}
          </div>
        </div>

        {/* mailbox switcher — personal + any shared boxes granted to me */}
        {(boxes || []).length > 1 && (
          <select value={activeBox || ''} onChange={(e) => { setActiveBox(Number(e.target.value)); setOpen(null); }}
            style={{ ...input, width: 'auto', minWidth: 220 }}>
            {(boxes || []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.address}{b.kind === 'SHARED' ? '  (team)' : ''}
              </option>
            ))}
          </select>
        )}
        <button style={btn} onClick={() => load(activeBox, folder, search)} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
        </button>
        <button style={btnPrimary} onClick={() => setCompose({ to: '', subject: '', body: '' })}>
          <Plus size={15} /> Compose
        </button>
      </div>

      {msg && (
        <div style={{
          marginBottom: 14, padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: msg.type === 'error' ? 'rgba(185,28,28,.1)' : 'rgba(6,122,80,.1)',
          color: msg.type === 'error' ? '#b91c1c' : '#067a50',
        }}>{msg.text}</div>
      )}

      {box?.kind === 'SHARED' && (
        <div style={{
          marginBottom: 14, padding: '9px 13px', borderRadius: 8, fontSize: 12.5,
          background: 'color-mix(in srgb, var(--primary) 7%, transparent)',
          border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)',
          color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Users size={14} /> This is a shared team mailbox — everyone with access sees
          the same messages, and sends are recorded against your name.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: 16, alignItems: 'start' }}>
        {/* folders */}
        <div style={{ ...card, padding: 8 }}>
          {FOLDERS.map((f) => {
            const Icon = f.icon;
            const active = folder === f.key;
            return (
              <button key={f.key} onClick={() => { setFolder(f.key); setOpen(null); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                  padding: '9px 11px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 13.5, fontWeight: active ? 800 : 600, textAlign: 'left',
                  background: active ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent',
                  color: active ? 'var(--primary)' : 'var(--text-main)',
                }}>
                <Icon size={15} /> {f.name}
                {f.key === 'inbox' && data?.unread > 0 && (
                  <span style={{
                    marginLeft: 'auto', fontSize: 11, fontWeight: 800, padding: '1px 7px',
                    borderRadius: 99, background: 'var(--primary)', color: '#fff',
                  }}>{data.unread}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* list + reader */}
        <div style={{ ...card, overflow: 'hidden' }}>
          <form onSubmit={(e) => { e.preventDefault(); load(activeBox, folder, search); }}
            style={{ display: 'flex', gap: 8, padding: 12, borderBottom: '1px solid var(--outline-variant)' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-muted)' }} />
              <input style={{ ...input, paddingLeft: 30 }} value={search} placeholder="Search subject or sender"
                onChange={(e) => setSearch(e.target.value)} />
            </div>
            <button type="submit" style={btn}>Search</button>
          </form>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              <Loader2 size={18} className="spin" /> Loading…
            </div>
          ) : open ? (
            <MessageReader
              data={open} onBack={() => setOpen(null)} folder={folder}
              onDelete={onDelete} onRestore={onRestore}
              onReply={(m) => setCompose({
                to: m.direction === 'IN' ? m.peer : (m.to || [])[0] || '',
                subject: m.subject?.toLowerCase().startsWith('re:') ? m.subject : `Re: ${m.subject}`,
                body: '', in_reply_to: m.message_id || '', thread_key: m.thread_key || '',
              })}
            />
          ) : messages.length === 0 ? (
            <div style={{ padding: 44, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13.5 }}>
              Nothing in {folder}.
            </div>
          ) : (
            messages.map((m) => (
              <button key={m.id} onClick={() => openMessage(m.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                  padding: '11px 14px', border: 'none', cursor: 'pointer',
                  borderBottom: '1px solid var(--surface-container-low)',
                  background: m.is_read ? 'transparent' : 'color-mix(in srgb, var(--primary) 5%, transparent)',
                }}>
                <Avatar name={m.peer} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: m.is_read ? 600 : 800, color: 'var(--text-main)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{m.subject || '(no subject)'}</div>
                  <div style={{
                    fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {m.direction === 'IN' ? m.peer : `To: ${(m.to || []).join(', ')}`}
                    {m.snippet ? ` — ${m.snippet}` : ''}
                  </div>
                </div>
                {m.status === 'failed' && (
                  <span title={m.error} style={{ color: '#b91c1c', display: 'flex' }}><AlertTriangle size={14} /></span>
                )}
                <span style={{ fontSize: 11.5, color: 'var(--text-muted)', flex: 'none' }}>
                  {fmtDate(m.published_at || m.created_at)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {compose && (
        <ComposeModal value={compose} setValue={setCompose} onSubmit={onSend}
          busy={busy} from={box?.address} />
      )}

      <style>{`.spin{animation:tm-spin 1s linear infinite}@keyframes tm-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function MessageReader({ data, onBack, onReply, onDelete, onRestore, folder }) {
  const m = data.message;
  const thread = data.thread || [];
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
        borderBottom: '1px solid var(--outline-variant)', flexWrap: 'wrap',
      }}>
        <button style={btn} onClick={onBack}><CornerUpLeft size={14} /> Back</button>
        <div style={{ flex: 1 }} />
        {folder === 'trash'
          ? <button style={btn} onClick={() => onRestore(m.id)}><RotateCcw size={14} /> Restore</button>
          : <>
              <button style={btn} onClick={() => onReply(m)}><CornerUpLeft size={14} /> Reply</button>
              <button style={{ ...btn, color: '#b91c1c' }} onClick={() => onDelete(m.id)}>
                <Trash2 size={14} /> Delete
              </button>
            </>}
      </div>

      <div style={{ padding: '16px 18px' }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-main)', marginBottom: 12 }}>
          {m.subject || '(no subject)'}
        </div>
        {(thread.length ? thread : [m]).map((t) => (
          <div key={t.id} style={{
            display: 'flex', gap: 12, padding: '12px 0',
            borderTop: '1px solid var(--surface-container-low)',
          }}>
            <Avatar name={t.direction === 'IN' ? t.peer : t.mailbox_address} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>
                  {t.direction === 'IN' ? t.peer : t.mailbox_address}
                </span>
                {t.sent_by_name && t.direction === 'OUT' && (
                  <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>sent by {t.sent_by_name}</span>
                )}
                <span style={{ fontSize: 11.5, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  {fmtDate(t.published_at || t.created_at)}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                To: {(t.to || []).join(', ')}{(t.cc || []).length ? ` · Cc: ${(t.cc || []).join(', ')}` : ''}
              </div>
              <div style={{
                fontSize: 13.5, color: 'var(--text-main)', lineHeight: 1.65, whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>{t.body_text || '(no content)'}</div>
              {t.status === 'failed' && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#b91c1c' }}>
                  <AlertTriangle size={12} /> Not delivered: {t.error}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComposeModal({ value, setValue, onSubmit, busy, from }) {
  const set = (k) => (e) => setValue({ ...value, [k]: e.target.value });
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 200,
      display: 'grid', placeItems: 'center', padding: 20,
    }} onClick={() => !busy && setValue(null)}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}
        style={{
          ...card, width: '100%', maxWidth: 640, padding: 20,
          background: 'var(--surface-container-lowest)', maxHeight: '90vh', overflowY: 'auto',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-main)' }}>New message</div>
          <div style={{ flex: 1 }} />
          <button type="button" style={{ ...btn, padding: 6 }} onClick={() => setValue(null)} disabled={busy}>
            <X size={15} />
          </button>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          From <b style={{ color: 'var(--text-main)' }}>{from}</b>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={label}>To</label>
          <input style={input} value={value.to} onChange={set('to')} required
            placeholder="someone@example.com, another@example.com" />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={label}>Cc (optional)</label>
          <input style={input} value={value.cc || ''} onChange={set('cc')} placeholder="cc@example.com" />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={label}>Subject</label>
          <input style={input} value={value.subject} onChange={set('subject')} required />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={label}>Message</label>
          <textarea style={{ ...input, minHeight: 170, resize: 'vertical', fontFamily: 'inherit' }}
            value={value.body} onChange={set('body')} />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" style={btn} onClick={() => setValue(null)} disabled={busy}>Cancel</button>
          <button type="submit" style={btnPrimary} disabled={busy}>
            {busy ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
            {busy ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
