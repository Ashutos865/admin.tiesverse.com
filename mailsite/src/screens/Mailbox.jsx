import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Clock, CornerUpLeft, CornerUpRight, Inbox, MoreHorizontal, PanelRight,
  Paperclip, Reply, RotateCcw, Search, Send, Star, Trash2,
} from 'lucide-react';
import {
  addNote, cancelSend, deleteDraft, downloadAttachment, getThread, listDrafts,
  listMessages, listNotes, restoreMessage, setFlags, trashMessage,
} from '../api/mail.js';
import {
  Avatar, Chip, EmptyState, ErrorNotice, ListSkeleton, useDelayedFlag,
} from '../components/common.jsx';
import {
  addressOf, categoryClass, fileSize, fullDate, nameOf, relative, shortDate,
} from '../lib/format.js';

const FOLDER_TITLES = {
  inbox: 'Inbox', starred: 'Starred', snoozed: 'Snoozed',
  drafts: 'Drafts', scheduled: 'Scheduled', sent: 'Sent', trash: 'Trash',
};

export default function Mailbox({ me, counts, refreshCounts, onCompose, onEditDraft }) {
  const { mailboxId, folder = 'inbox', messageId } = useParams();
  const navigate = useNavigate();

  const box = useMemo(
    () => (me?.mailboxes || []).find((b) => String(b.id) === String(mailboxId)),
    [me, mailboxId],
  );

  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [showContext, setShowContext] = useState(false);
  const showSkeleton = useDelayedFlag(loading);

  const load = useCallback(async () => {
    if (!mailboxId) return;
    setLoading(true);
    setError('');
    const res = folder === 'drafts'
      ? await listDrafts(mailboxId)
      : await listMessages({ mailbox: mailboxId, folder, search, filter: tab === 'unread' ? 'unread' : '' });
    if (res.error) { setError(res.error); setRows([]); }
    else setRows(folder === 'drafts' ? (res.drafts || []) : (res.messages || []));
    setLoading(false);
  }, [mailboxId, folder, search, tab]);

  useEffect(() => { load(); }, [load]);

  // A quiet poll keeps the list current without a refresh button being the only
  // way to see new mail. Paused while the tab is hidden.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') { load(); refreshCounts?.(); }
    }, 60000);
    return () => clearInterval(t);
  }, [load, refreshCounts]);

  const openRow = (row) => {
    if (folder === 'drafts') { onEditDraft?.(row); return; }
    navigate(`/m/${mailboxId}/${folder}/${row.id}`);
  };

  const onFlag = async (row, flags) => {
    // Optimistic: a star that waits for the network feels broken.
    setRows((prev) => prev?.map((r) => (r.id === row.id ? { ...r, ...flags } : r)));
    const res = await setFlags(row.id, flags);
    if (res.error) { load(); }
    else refreshCounts?.();
  };

  if (!box) {
    return (
      <EmptyState icon={<Inbox size={28} style={{ color: 'var(--muted-2)' }} />}
        title="No mailbox here"
        action={<button className="btn" onClick={() => navigate('/')}>Back to home</button>}>
        This mailbox is not one you can open.
      </EmptyState>
    );
  }

  return (
    <div className={`panes ${showContext ? 'show-context' : ''} ${messageId ? 'thread-open' : ''}`}>
      <section className="pane pane-list">
        <div className="pane-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 className="pane-title" style={{ flex: 1 }}>{FOLDER_TITLES[folder] || 'Mail'}</h1>
            <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>
              {rows?.length || 0} {rows?.length === 1 ? 'message' : 'messages'}
            </span>
          </div>
          <div className="search-field">
            <Search size={15} />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${(FOLDER_TITLES[folder] || 'mail').toLowerCase()}…`} />
          </div>
          {folder === 'inbox' && (
            <div className="tabs">
              <button className={`tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
                All
              </button>
              <button className={`tab ${tab === 'unread' ? 'active' : ''}`} onClick={() => setTab('unread')}>
                Unread
              </button>
            </div>
          )}
        </div>

        <div className="pane-body">
          {error && <div style={{ padding: 14 }}><ErrorNotice onRetry={load}>{error}</ErrorNotice></div>}
          {loading && !rows ? (showSkeleton ? <ListSkeleton /> : null)
            : !rows?.length ? (
              <EmptyState icon={<Inbox size={26} style={{ color: 'var(--muted-2)' }} />}
                title={search ? 'Nothing matches that' : 'Nothing here'}
                action={search ? <button className="btn btn-sm" onClick={() => setSearch('')}>Clear search</button> : null}>
                {search ? 'Try a different search.' : `Your ${(FOLDER_TITLES[folder] || 'folder').toLowerCase()} is empty.`}
              </EmptyState>
            ) : (
              <ul>
                {rows.map((row) => (
                  <li key={row.id}>
                    <MessageRow row={row} folder={folder}
                      selected={String(row.id) === String(messageId)}
                      onOpen={() => openRow(row)}
                      onStar={(v) => onFlag(row, { starred: v })} />
                  </li>
                ))}
              </ul>
            )}
        </div>
      </section>

      <section className="pane pane-thread">
        {messageId ? (
          <Thread key={messageId} id={messageId} box={box} folder={folder}
            onBack={() => navigate(`/m/${mailboxId}/${folder}`)}
            onChanged={() => { load(); refreshCounts?.(); }}
            onCompose={onCompose}
            onToggleContext={() => setShowContext((v) => !v)}
            contextOpen={showContext} />
        ) : (
          <EmptyState icon={<Inbox size={30} style={{ color: 'var(--muted-2)' }} />}
            title="Nothing selected">
            Choose a message to read it here.
          </EmptyState>
        )}
      </section>

      <aside className="pane-context">
        {messageId
          ? <ContextPanel key={`ctx-${messageId}`} id={messageId} box={box} />
          : <div style={{ padding: 20, color: 'var(--muted)', fontSize: 13 }}>
              Details about a conversation appear here.
            </div>}
      </aside>
    </div>
  );
}

function MessageRow({ row, folder, selected, onOpen, onStar }) {
  const unread = folder === 'inbox' && !row.is_read;
  const who = folder === 'sent' || folder === 'scheduled' || folder === 'drafts'
    ? (row.to?.[0] || 'No recipient')
    : row.peer;
  // The whole row is the button. The star sits above it rather than inside,
  // because a button cannot legally contain another button.
  return (
    <div className={`msg-row ${unread ? 'unread' : ''} ${selected ? 'selected' : ''}`}
      role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      aria-label={`Open: ${row.subject || 'message'}`}>
      <Avatar name={nameOf(who)} email={addressOf(who)} size={36} />
      <span className="msg-main">
        <span className="msg-from truncate">
          {folder === 'sent' || folder === 'drafts' ? `To ${nameOf(who)}` : nameOf(who) || who}
        </span>
        <span className="msg-subject truncate">{row.subject || '(no subject)'}</span>
        <span className="msg-snippet truncate">{row.snippet || row.body_text?.slice(0, 90) || ''}</span>
        {(row.has_attachments || row.attachments?.length > 0) && (
          <span className="msg-chips">
            <span className="chip chip-default"><Paperclip size={11} /> Attachment</span>
          </span>
        )}
      </span>
      <span className="msg-side">
        <span className="msg-time">
          {folder === 'scheduled' ? shortDate(row.send_at) : shortDate(row.created_at || row.updated_at)}
        </span>
        {folder !== 'drafts' && (
          <button className={`star-btn ${row.starred ? 'on' : ''}`}
            aria-label={row.starred ? 'Remove star' : 'Star this message'}
            onClick={(e) => { e.stopPropagation(); onStar(!row.starred); }}>
            <Star size={15} fill={row.starred ? 'currentColor' : 'none'} />
          </button>
        )}
      </span>
    </div>
  );
}

function Thread({ id, box, folder, onBack, onChanged, onCompose, onToggleContext, contextOpen }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState([]);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const showSkeleton = useDelayedFlag(loading);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getThread(id);
    if (res.error) setError(res.error);
    else {
      setData(res);
      const key = res.message?.thread_key;
      if (key) {
        const n = await listNotes(box.id, key);
        if (!n.error) setNotes(n.notes || []);
      }
    }
    setLoading(false);
  }, [id, box.id]);

  useEffect(() => { load(); }, [load]);

  const message = data?.message;
  const thread = data?.thread?.length ? data.thread : message ? [message] : [];

  const postNote = async () => {
    const body = noteText.trim();
    if (!body || !message?.thread_key) return;
    setSavingNote(true);
    const res = await addNote(box.id, message.thread_key, body);
    setSavingNote(false);
    if (!res.error) { setNotes((n) => [...n, res]); setNoteText(''); }
  };

  const doTrash = async () => {
    const res = message?.is_deleted ? await restoreMessage(id) : await trashMessage(id);
    if (!res.error) { onChanged?.(); onBack(); }
  };

  const doCancel = async () => {
    const res = await cancelSend(id);
    if (!res.error) { onChanged?.(); onBack(); }
  };

  if (loading && !data) {
    return showSkeleton ? <div style={{ padding: 20 }}><ListSkeleton rows={3} /></div> : <div />;
  }
  if (error) return <div style={{ padding: 20 }}><ErrorNotice onRetry={load}>{error}</ErrorNotice></div>;
  if (!message) return null;

  return (
    <>
      <div className="thread-head">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <button className="icon-btn" onClick={onBack} aria-label="Back to list"
            style={{ marginLeft: -8 }}>
            <ArrowLeft size={18} />
          </button>
          <h1 className="pane-title" style={{ flex: 1, paddingTop: 6 }}>
            {message.subject || '(no subject)'}
          </h1>
        </div>
        <div className="thread-toolbar">
          <button className={`icon-btn ${message.starred ? 'on' : ''}`} aria-label="Star"
            onClick={async () => { await setFlags(id, { starred: !message.starred }); load(); onChanged?.(); }}>
            <Star size={17} fill={message.starred ? 'currentColor' : 'none'} />
          </button>
          <button className="icon-btn" aria-label="Snooze for a day"
            onClick={async () => {
              const when = new Date(Date.now() + 86400000).toISOString();
              await setFlags(id, { snoozed_until: when });
              onChanged?.(); onBack();
            }}>
            <Clock size={17} />
          </button>
          <button className="icon-btn" aria-label={message.is_deleted ? 'Restore' : 'Move to trash'}
            onClick={doTrash}>
            {message.is_deleted ? <RotateCcw size={17} /> : <Trash2 size={17} />}
          </button>
          {folder === 'scheduled' && message.status === 'queued' && (
            <button className="btn btn-sm" onClick={doCancel} style={{ marginLeft: 6 }}>
              Cancel send
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className={`icon-btn ${contextOpen ? 'on' : ''}`} onClick={onToggleContext}
            aria-label="Show details">
            <PanelRight size={17} />
          </button>
        </div>
      </div>

      <div className="pane-body">
        <div className="thread-body">
          {message.status === 'queued' && (
            <div className="notice notice-warn">
              <Clock size={15} style={{ flex: 'none', marginTop: 1 }} />
              <span>Scheduled to send {fullDate(message.send_at)}. You can still cancel it.</span>
            </div>
          )}
          {message.status === 'failed' && (
            <div className="notice notice-error">
              <span>This message could not be sent. {message.error}</span>
            </div>
          )}

          {thread.map((m) => <MessageCard key={m.id} m={m} />)}

          <div className="reply-actions" style={{ padding: 0 }}>
            <button className="btn" onClick={() => onCompose?.({ reply: message })}>
              <Reply size={15} /> Reply
            </button>
            <button className="btn" onClick={() => onCompose?.({ reply: message, all: true })}>
              <CornerUpLeft size={15} /> Reply all
            </button>
            <button className="btn" onClick={() => onCompose?.({ forward: message })}>
              <CornerUpRight size={15} /> Forward
            </button>
          </div>

          {/* Deliberately unlike the reply box above: this text is for the team
              and must never look like something that gets emailed. */}
          <div className="notes-rail">
            <span className="eyebrow">Internal comment · only your TIES team sees this</span>
            {notes.map((n) => (
              <div key={n.id} className="note">
                <span className="meta">{n.author_name} · {relative(n.created_at)}</span>
                <span className="text">{n.body}</span>
              </div>
            ))}
            <div style={{ display: 'grid', gap: 8 }}>
              <textarea className="field" rows={2} value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note for your team…" />
              <div>
                <button className="btn btn-sm btn-primary" onClick={postNote}
                  disabled={savingNote || !noteText.trim()}>
                  Post note
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function MessageCard({ m }) {
  const [showFull, setShowFull] = useState(false);
  return (
    <article className="msg-card">
      <header className="msg-card-head">
        <Avatar name={nameOf(m.peer)} email={addressOf(m.peer)} size={38} />
        <span className="who">
          <strong>{nameOf(m.direction === 'OUT' ? (m.to?.[0] || '') : m.peer) || m.peer}</strong>
          <span className="truncate">
            {m.direction === 'OUT' ? `to ${(m.to || []).join(', ')}` : addressOf(m.peer)}
          </span>
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted-2)', whiteSpace: 'nowrap' }}>
          {shortDate(m.published_at || m.created_at)}
        </span>
      </header>

      <div className="msg-card-body">
        {m.body_html
          ? <SandboxedHtml html={m.body_html} expanded={showFull} onExpand={() => setShowFull(true)} />
          : <pre>{m.body_text}</pre>}
      </div>

      {m.attachments?.length > 0 && (
        <div className="attach-row">
          {m.attachments.map((a) => (
            <button key={a.id} className="attach-chip"
              onClick={() => downloadAttachment(a.id, a.filename)}>
              <Paperclip size={14} style={{ color: 'var(--muted)' }} />
              <span>{a.filename}</span>
              <span className="size">{fileSize(a.size)}</span>
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

/* An email body is written by whoever sent it. It renders inside a sandboxed
   iframe with no script and no same-origin permission, so its JavaScript cannot
   run and its CSS cannot reach the rest of the page. */
function SandboxedHtml({ html }) {
  const ref = useRef(null);
  const [height, setHeight] = useState(120);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return undefined;
    const onLoad = () => {
      try {
        const doc = frame.contentDocument;
        const h = Math.min(4000, Math.max(80, doc.body.scrollHeight + 16));
        setHeight(h);
      } catch {
        setHeight(360);   // cross-origin guard tripped; give it a sane box
      }
    };
    frame.addEventListener('load', onLoad);
    return () => frame.removeEventListener('load', onLoad);
  }, [html]);

  const doc = `<!doctype html><html><head><meta charset="utf-8">
    <style>
      body{margin:0;font:14px/1.62 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#374151;word-wrap:break-word}
      img{max-width:100%;height:auto}
      a{color:#2563eb}
      table{max-width:100%}
    </style></head><body>${html}</body></html>`;

  return (
    <iframe ref={ref} className="msg-frame" title="Message content"
      sandbox="" srcDoc={doc} style={{ height }} />
  );
}

function ContextPanel({ id, box }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    getThread(id).then((res) => { if (alive && !res.error) setData(res); });
    return () => { alive = false; };
  }, [id]);

  if (!data?.message) return <div style={{ padding: 20 }} />;
  const m = data.message;
  const who = m.direction === 'OUT' ? (m.to?.[0] || '') : m.peer;
  const thread = data.thread?.length ? data.thread : [m];

  return (
    <>
      <div className="ctx-section ctx-contact">
        <Avatar name={nameOf(who)} email={addressOf(who)} size={56} />
        <div>
          <strong>{nameOf(who) || who}</strong>
          <span>{addressOf(who)}</span>
        </div>
        <button className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(addressOf(who))}>
          Copy address
        </button>
      </div>

      <div className="ctx-section">
        <div className="ctx-field">
          <span className="eyebrow">Mailbox</span>
          <span className="ctx-value">{box.display_name || box.address}</span>
        </div>
        <div className="ctx-field">
          <span className="eyebrow">Messages in thread</span>
          <span className="ctx-value">{thread.length}</span>
        </div>
        {m.has_attachments && (
          <div className="ctx-field">
            <span className="eyebrow">Attachments</span>
            <span className="ctx-value">{m.attachments?.length || 0} file(s)</span>
          </div>
        )}
      </div>

      <div className="ctx-section">
        <span className="eyebrow">Activity</span>
        <div className="activity">
          {thread.map((t) => (
            <div key={t.id} className="activity-item">
              <span className={`activity-dot ${t.direction === 'OUT' ? 'sent' : 'received'}`} />
              <span>
                <span className="activity-text">
                  {t.direction === 'OUT' ? 'Sent by us' : 'Received'}
                </span>
                <br />
                <span className="activity-time">{fullDate(t.published_at || t.created_at)}</span>
              </span>
            </div>
          ))}
          {m.read_at && (
            <div className="activity-item">
              <span className="activity-dot" />
              <span>
                <span className="activity-text">Opened</span><br />
                <span className="activity-time">{fullDate(m.read_at)}</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
