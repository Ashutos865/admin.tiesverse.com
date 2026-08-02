import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Mail, Inbox, Send, Trash2, RefreshCw, PenSquare, X, CornerUpLeft, Search, LogOut,
  Eye, EyeOff, Loader2, RotateCcw, Users, AlertTriangle, Camera, MailOpen,
  ChevronLeft,
} from 'lucide-react';
import {
  login, sharedLogin, getMyMailboxes, listMessages, getMessage, deleteMessage,
  restoreMessage, sendMessage, updateMailbox, uploadAvatar,
  readSharedToken, storeSharedToken, clearSharedToken,
} from './api';
import {
  readStoredTokens, storeTokens, clearStoredTokens, decodeJwt, isExpired,
} from './auth';

/* TIES Mail — the webmail at mail.tiesverse.com.
   A three-pane mail client (folders | message list | reading pane) in the TIES
   palette. Sign in with a portal account, or with a team mailbox's own password.
   Mail lives on @mail.tiesverse.com — a separate system from the Google
   Workspace that serves @tiesverse.com. */

const fmtDate = (v) => {
  if (!v) return '';
  const d = new Date(v);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  }
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: '2-digit' });
};

const fmtFull = (v) => (v ? new Date(v).toLocaleString([], {
  day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
}) : '');

const nameOf = (addr) => {
  if (!addr) return '';
  const local = String(addr).split('@')[0];
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

const initialsOf = (s) => (s || '?').trim().split(/[\s@._-]+/).filter(Boolean).slice(0, 2)
  .map((w) => w[0]?.toUpperCase() || '').join('') || '?';

function Avatar({ url, name, size = 38 }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {url ? <img src={url} alt="" /> : initialsOf(name)}
    </span>
  );
}

const Logo = () => (
  <span className="logo"><span className="logo-dot">.</span>ties<span style={{ color: 'var(--accent)' }}>mail</span></span>
);

export default function App() {
  const [tokens, setTokens] = useState(() => readStoredTokens());
  const [mailToken, setMailToken] = useState(() => readSharedToken());

  const portalUser = useMemo(() => {
    const u = decodeJwt(tokens?.access);
    return u && !isExpired(u) ? u : null;
  }, [tokens]);

  const auth = useMemo(
    () => (mailToken ? { mailToken } : { token: tokens?.access }),
    [mailToken, tokens],
  );
  const signedIn = Boolean(mailToken || portalUser);

  const [boxes, setBoxes] = useState(null);
  const [activeBox, setActiveBox] = useState(null);
  const [folder, setFolder] = useState('inbox');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [compose, setCompose] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);
  const [avatarOpen, setAvatarOpen] = useState(false);

  const say = (type, text) => { setFlash({ type, text }); setTimeout(() => setFlash(null), 4500); };

  const signOut = useCallback(() => {
    clearStoredTokens(); clearSharedToken();
    setTokens(null); setMailToken(null);
    setBoxes(null); setActiveBox(null); setData(null); setOpen(null); setOpenId(null);
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    getMyMailboxes(auth).then((res) => {
      if (!alive) return;
      if (res.error) { if (res.status === 401) signOut(); setBoxes([]); return; }
      setBoxes(res.mailboxes || []);
      setActiveBox((p) => p || (res.mailboxes || [])[0]?.id || null);
    });
    return () => { alive = false; };
  }, [signedIn, auth, signOut]);

  const load = useCallback(async (boxId, f, q) => {
    if (!boxId) return;
    setLoading(true);
    const res = await listMessages(auth, boxId, f, q);
    if (!res.error) setData(res); else say('error', res.error);
    setLoading(false);
  }, [auth]);

  useEffect(() => { if (activeBox) load(activeBox, folder, search); },
    [activeBox, folder, load]);

  const box = useMemo(() => (boxes || []).find((b) => b.id === activeBox) || null,
    [boxes, activeBox]);

  const openMsg = async (id) => {
    setOpenId(id);
    const res = await getMessage(auth, id);
    if (!res.error) { setOpen(res); load(activeBox, folder, search); }
    else say('error', res.error);
  };

  const doSend = async (e) => {
    e.preventDefault();
    setBusy(true);
    const res = await sendMessage(auth, {
      mailbox: activeBox, to: compose.to, cc: compose.cc || '',
      subject: compose.subject, body: compose.body || '',
      in_reply_to: compose.in_reply_to || '', thread_key: compose.thread_key || '',
    });
    setBusy(false);
    if (!res.error) {
      setCompose(null); say('ok', 'Message sent.');
      if (folder === 'sent') load(activeBox, folder, search);
    } else say('error', res.error);
  };

  const doDelete = async (id) => {
    if (!window.confirm('Move this message to Trash?')) return;
    const res = await deleteMessage(auth, id);
    if (!res.error) { setOpen(null); setOpenId(null); load(activeBox, folder, search); }
    else say('error', res.error);
  };

  const doRestore = async (id) => {
    const res = await restoreMessage(auth, id);
    if (!res.error) { setOpen(null); setOpenId(null); load(activeBox, folder, search); }
    else say('error', res.error);
  };

  if (!signedIn) {
    return <Login onPortal={(t) => { storeTokens(t); setTokens(t); }}
                  onShared={(t) => { storeSharedToken(t); setMailToken(t); }} />;
  }

  if (boxes !== null && boxes.length === 0) {
    return (
      <div className="login-wrap">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <MailOpen size={40} style={{ color: 'var(--accent)', marginBottom: 12 }} />
          <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 8 }}>No mailbox yet</div>
          <div className="login-sub" style={{ marginBottom: 20 }}>
            Your account doesn't have a TIES Mail address. Ask an admin or HR to
            create one — it appears here the moment they do.
          </div>
          <button className="btn" onClick={signOut} style={{ margin: '0 auto' }}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </div>
    );
  }

  const messages = data?.messages || [];
  const folders = [
    { k: 'inbox', n: 'Inbox', I: Inbox },
    { k: 'sent', n: 'Sent', I: Send },
    { k: 'trash', n: 'Trash', I: Trash2 },
  ];

  return (
    <div className="app">
      <header className="appbar">
        <Logo />
        <span className="logo-tag">Beta</span>
        <form className="searchbox" onSubmit={(e) => { e.preventDefault(); load(activeBox, folder, search); }}>
          <Search size={15} />
          <input value={search} placeholder="Search mail" onChange={(e) => setSearch(e.target.value)} />
          {search && (
            <button type="button" onClick={() => { setSearch(''); load(activeBox, folder, ''); }}
              style={{ color: 'var(--muted)', display: 'flex' }}><X size={14} /></button>
          )}
        </form>
        <div className="spacer" />
        <button className="iconbtn" title="Refresh" onClick={() => load(activeBox, folder, search)} disabled={loading}>
          <RefreshCw size={17} className={loading ? 'spin' : ''} />
        </button>
        {box && !mailToken && (
          <button className="iconbtn" title="Mailbox picture" onClick={() => setAvatarOpen(true)}>
            <Avatar url={box.avatar_url} name={box.display_name || box.address} size={28} />
          </button>
        )}
        <button className="iconbtn" title="Sign out" onClick={signOut}><LogOut size={17} /></button>
      </header>

      {flash && <div className={`alert alert-${flash.type === 'error' ? 'error' : 'ok'}`}>{flash.text}</div>}

      <div className="body">
        <aside className="sidebar">
          <button className="compose-btn" onClick={() => setCompose({ to: '', subject: '', body: '' })}>
            <PenSquare size={16} /> Compose
          </button>
          {folders.map(({ k, n, I }) => (
            <button key={k} className={`folder${folder === k ? ' on' : ''}`}
              onClick={() => { setFolder(k); setOpen(null); setOpenId(null); }}>
              <I size={16} /> {n}
              {k === 'inbox' && data?.unread > 0 && <span className="count">{data.unread}</span>}
            </button>
          ))}

          {(boxes || []).length > 0 && (
            <div className="mailbox-switch">
              <span className="label">Mailboxes</span>
              {(boxes || []).map((b) => (
                <button key={b.id} className={`mailbox-item${b.id === activeBox ? ' on' : ''}`}
                  onClick={() => { setActiveBox(b.id); setOpen(null); setOpenId(null); }}>
                  <span className="addr">{b.address}</span>
                  {b.kind === 'SHARED' && <span className="team-pill">TEAM</span>}
                </button>
              ))}
            </div>
          )}

          {box?.kind === 'SHARED' && (
            <div style={{ margin: '14px 12px 0', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5,
                          display: 'flex', gap: 6 }}>
              <Users size={13} style={{ flex: 'none', marginTop: 1 }} />
              <span>Shared mailbox — everyone with access sees this, and sends are recorded against your name.</span>
            </div>
          )}
        </aside>

        <section className="list-pane">
          <div className="list-head">
            <span className="list-title">{folder}</span>
            <span className="list-count">
              {loading ? '…' : `${messages.length}${data?.unread ? ` · ${data.unread} unread` : ''}`}
            </span>
          </div>
          {loading ? (
            <div className="empty-state"><Loader2 size={22} className="spin" />Loading…</div>
          ) : messages.length === 0 ? (
            <div className="empty-state"><Inbox size={34} />Nothing in {folder}</div>
          ) : messages.map((m) => {
            const who = m.direction === 'IN' ? m.peer : (m.to || [])[0];
            return (
              <button key={m.id}
                className={`mrow${m.is_read ? '' : ' unread'}${m.id === openId ? ' active' : ''}`}
                onClick={() => openMsg(m.id)}>
                {!m.is_read ? <span className="dot-unread" /> : <span style={{ width: 7, flex: 'none' }} />}
                <Avatar name={who} size={34} />
                <span className="mrow-body">
                  <span className="mrow-top">
                    <span className="mrow-from">
                      {m.direction === 'OUT' && 'To: '}{nameOf(who) || who || '(unknown)'}
                    </span>
                    <span className="mrow-time">{fmtDate(m.published_at || m.created_at)}</span>
                  </span>
                  <span className="mrow-subject">{m.subject || '(no subject)'}</span>
                  {m.snippet && <span className="mrow-snip">{m.snippet}</span>}
                  {m.status === 'failed' && (
                    <span style={{ fontSize: 11.5, color: 'var(--danger)', display: 'flex', gap: 4, marginTop: 3 }}>
                      <AlertTriangle size={12} /> Not delivered
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </section>

        {/* On a phone this pane becomes a full-screen sheet over the list, so a
            message is readable without a third column that would not fit. */}
        <section className={`reader-pane${open ? ' is-open' : ''}`}>
          {open ? (
            <Reader data={open} folder={folder}
              onClose={() => { setOpen(null); setOpenId(null); }}
              onDelete={doDelete} onRestore={doRestore}
              onReply={(m) => setCompose({
                to: m.direction === 'IN' ? m.peer : (m.to || [])[0] || '',
                subject: /^re:/i.test(m.subject || '') ? m.subject : `Re: ${m.subject || ''}`,
                body: '', in_reply_to: m.message_id || '', thread_key: m.thread_key || '',
              })} />
          ) : (
            <div className="empty-state">
              <MailOpen size={40} />
              <div>Select a message to read</div>
            </div>
          )}
        </section>
      </div>

      {/* Phone-only chrome: the sidebar is off-screen at this width, so folders
          move to a bottom bar and Compose becomes a floating action button. */}
      <nav className="mobile-nav">
        {folders.map(({ k, n, I }) => (
          <button key={k} className={`mnav-item${folder === k ? ' on' : ''}`}
            onClick={() => { setFolder(k); setOpen(null); setOpenId(null); }}>
            <span className="mnav-icon">
              <I size={19} />
              {k === 'inbox' && data?.unread > 0 && <span className="mnav-dot" />}
            </span>
            {n}
          </button>
        ))}
      </nav>
      <button className="compose-fab" onClick={() => setCompose({ to: '', subject: '', body: '' })}
        aria-label="Compose">
        <PenSquare size={22} />
      </button>

      {compose && <Compose value={compose} setValue={setCompose} onSubmit={doSend}
        busy={busy} from={box?.address} />}
      {avatarOpen && box && (
        <AvatarModal box={box} token={tokens?.access} auth={auth}
          onClose={() => setAvatarOpen(false)}
          onSaved={(u) => { setBoxes((bs) => (bs || []).map((b) => (b.id === u.id ? u : b)));
                            setAvatarOpen(false); say('ok', 'Mailbox picture updated.'); }}
          onError={(e) => say('error', e)} />
      )}
    </div>
  );
}

/* ── login ─────────────────────────────────────────────────────────────── */
function Login({ onPortal, onShared }) {
  const [tab, setTab] = useState('portal');
  const [username, setUsername] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const res = tab === 'portal'
      ? await login(username.trim(), password)
      : await sharedLogin(address.trim(), password);
    setBusy(false);
    if (res.error) {
      setError(tab === 'portal' ? 'Wrong email/Crew ID or password.'
                                : 'Wrong mailbox address or password.');
      return;
    }
    if (tab === 'portal') onPortal(res); else onShared(res.token);
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-badge"><Mail size={24} /></div>
        <div className="login-logo">
          <span className="logo-dot">.</span>ties<span style={{ color: 'var(--accent)' }}>mail</span>
        </div>
        <div className="login-sub">Sign in to your @mail.tiesverse.com mailbox</div>

        <div className="tabs">
          <button type="button" className={`tab${tab === 'portal' ? ' on' : ''}`}
            onClick={() => { setTab('portal'); setError(''); }}>My account</button>
          <button type="button" className={`tab${tab === 'shared' ? ' on' : ''}`}
            onClick={() => { setTab('shared'); setError(''); }}>Team mailbox</button>
        </div>

        {error && <div className="alert alert-error" style={{ margin: '0 0 14px' }}>{error}</div>}

        <div className="field">
          <label className="label">{tab === 'portal' ? 'Work email or Crew ID' : 'Mailbox address'}</label>
          {tab === 'portal' ? (
            <input className="input" value={username} autoFocus required
              placeholder="you@tiesverse.com or CRW-A-0007"
              onChange={(e) => setUsername(e.target.value)} />
          ) : (
            <input className="input" value={address} autoFocus required
              placeholder="nimble@mail.tiesverse.com"
              onChange={(e) => setAddress(e.target.value)} />
          )}
        </div>

        <div className="field">
          <label className="label">Password</label>
          <div className="pw-wrap">
            <input className="input" type={show ? 'text' : 'password'} value={password} required
              onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="pw-toggle" onClick={() => setShow((s) => !s)}>
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button className="btn btn-anchor" type="submit" disabled={busy} style={{ marginTop: 4 }}>
          {busy ? <><Loader2 size={15} className="spin" /> Signing in…</> : 'Sign in'}
        </button>

        <div className="login-note">
          {tab === 'portal'
            ? 'Same login as the TIES admin portal.'
            : 'For team mailboxes with their own password. Ask an admin if you need one.'}
        </div>
      </form>
    </div>
  );
}

/* ── reader ────────────────────────────────────────────────────────────── */
function Reader({ data, folder, onClose, onReply, onDelete, onRestore }) {
  const m = data.message;
  const thread = (data.thread && data.thread.length ? data.thread : [m]);
  return (
    <>
      <div className="reader-head">
        {/* Phone-only: the reader covers the list, so it needs a way back. */}
        <button className="iconbtn reader-back" onClick={onClose} aria-label="Back to list">
          <ChevronLeft size={20} />
        </button>
        <span className="reader-subject">{m.subject || '(no subject)'}</span>
        {folder === 'trash' ? (
          <button className="btn" onClick={() => onRestore(m.id)}><RotateCcw size={14} /> Restore</button>
        ) : (
          <>
            <button className="btn" onClick={() => onReply(m)}><CornerUpLeft size={14} /> Reply</button>
            <button className="btn btn-danger" onClick={() => onDelete(m.id)}><Trash2 size={14} /></button>
          </>
        )}
        <button className="iconbtn" onClick={onClose} title="Close"><X size={17} /></button>
      </div>
      <div className="reader-body">
        {thread.map((t) => {
          const who = t.direction === 'IN' ? t.peer : t.mailbox_address;
          return (
            <div className="thread-msg" key={t.id}>
              <Avatar name={who} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span className="tm-from">{nameOf(who)}</span>
                  <span className="tm-meta">&lt;{who}&gt;</span>
                  {t.direction === 'OUT' && t.sent_by_name && (
                    <span className="tm-meta">· sent by {t.sent_by_name}</span>
                  )}
                  <span className="tm-meta" style={{ marginLeft: 'auto' }}>
                    {fmtFull(t.published_at || t.created_at)}
                  </span>
                </div>
                <div className="tm-to">
                  to {(t.to || []).join(', ')}
                  {(t.cc || []).length ? ` · cc ${(t.cc || []).join(', ')}` : ''}
                </div>
                <div className="tm-text">{t.body_text || '(no content)'}</div>
                {t.status === 'failed' && (
                  <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--danger)' }}>
                    <AlertTriangle size={13} /> Not delivered: {t.error}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ── compose ───────────────────────────────────────────────────────────── */
/* Compose, following the reference layout rather than a labelled form:
   a pill header for the recipient fields, one large open writing area, and a
   floating toolbar whose send button is a circle. Inline labels sit inside the
   fields, so the eye goes to what you typed rather than to the form scaffolding. */
function Compose({ value, setValue, onSubmit, busy, from }) {
  const set = (k) => (e) => setValue({ ...value, [k]: e.target.value });
  const [showCc, setShowCc] = useState(Boolean(value.cc));
  const canSend = value.to.trim() && value.subject.trim() && !busy;

  return (
    <div className="overlay" onClick={() => !busy && setValue(null)}>
      <form className="compose" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <div className="compose-top">
          <button type="button" className="iconbtn" onClick={() => setValue(null)} disabled={busy}
            title="Discard"><X size={17} /></button>
          <span className="compose-title">Compose</span>
          <span className="compose-from" title={from}>{from}</span>
        </div>

        <div className="compose-head">
          <label className="compose-row">
            <span className="compose-key">To</span>
            <input value={value.to} onChange={set('to')} required autoFocus
              placeholder="someone@example.com" />
            {!showCc && (
              <button type="button" className="compose-cc" onClick={() => setShowCc(true)}>Cc</button>
            )}
          </label>
          {showCc && (
            <label className="compose-row">
              <span className="compose-key">Cc</span>
              <input value={value.cc || ''} onChange={set('cc')} placeholder="Optional" />
            </label>
          )}
          <label className="compose-row">
            <span className="compose-key">Subject</span>
            <input value={value.subject} onChange={set('subject')} required
              placeholder="What is this about?" />
          </label>
        </div>

        <textarea className="compose-body" value={value.body} onChange={set('body')}
          placeholder="Write your message…" />

        <div className="compose-foot">
          <span className="compose-hint">
            {value.in_reply_to ? 'Replying in thread' : 'New message'}
          </span>
          <div className="spacer" />
          <button type="button" className="btn" onClick={() => setValue(null)} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="send-fab" disabled={!canSend}
            title={canSend ? 'Send' : 'Add a recipient and subject first'}>
            {busy ? <Loader2 size={19} className="spin" /> : <Send size={19} />}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── mailbox picture ───────────────────────────────────────────────────── */
function AvatarModal({ box, token, auth, onClose, onSaved, onError }) {
  const [preview, setPreview] = useState(box.avatar_url || '');
  const [name, setName] = useState(box.display_name || '');
  const [busy, setBusy] = useState(false);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const res = await uploadAvatar(token, file);
    setBusy(false);
    if (res.error) { onError(res.error); return; }
    setPreview(res.secure_url || '');
  };

  const save = async () => {
    setBusy(true);
    const res = await updateMailbox(auth, box.id, { avatar_url: preview, display_name: name });
    setBusy(false);
    if (res.error) onError(res.error); else onSaved(res);
  };

  return (
    <div className="overlay" onClick={() => !busy && onClose()}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">Mailbox picture</div>
          <div className="spacer" />
          <button className="iconbtn" onClick={onClose} disabled={busy}><X size={16} /></button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
          <Avatar url={preview} name={name || box.address} size={64} />
          <label className="btn" style={{ cursor: 'pointer' }}>
            <Camera size={14} /> {preview ? 'Change' : 'Upload'}
            <input type="file" accept="image/*" hidden onChange={pick} disabled={busy} />
          </label>
          {preview && <button className="btn btn-danger" onClick={() => setPreview('')} disabled={busy}>Remove</button>}
        </div>
        <div className="field">
          <label className="label">Display name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Shown as the sender name" />
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55 }}>
          This belongs to the mailbox — separate from your portal profile photo.
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? <><Loader2 size={14} className="spin" /> Saving…</> : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
