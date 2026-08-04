import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, Loader2, Paperclip, Send, X } from 'lucide-react';
import {
  createDraft, deleteAttachment, deleteDraft, sendMessage, updateDraft, uploadAttachment,
} from '../api/mail.js';
import { ConfirmDialog, ErrorNotice } from '../components/common.jsx';
import { addressOf, fileSize, nameOf } from '../lib/format.js';

const MAX_TOTAL = 25 * 1024 * 1024;
const AUTOSAVE_MS = 3000;

/* The composer. Opens for a new message, a reply, a forward, or to pick up a
   draft — all the same form, seeded differently. */
export default function Compose({ me, seed, onClose, onSent }) {
  const boxes = (me?.mailboxes || []).filter((b) => b.can_send !== false);
  const reply = seed?.reply;
  const forward = seed?.forward;
  const draft = seed?.draft;

  const [mailbox, setMailbox] = useState(
    draft?.mailbox || reply?.mailbox || forward?.mailbox || boxes[0]?.id || '',
  );
  const [to, setTo] = useState(() => {
    if (draft) return draft.to || [];
    if (reply) {
      const first = [addressOf(reply.peer)].filter(Boolean);
      if (seed.all) return [...new Set([...first, ...(reply.to || [])])];
      return first;
    }
    return [];
  });
  const [cc, setCc] = useState(draft?.cc || (seed?.all ? reply?.cc || [] : []));
  const [bcc, setBcc] = useState(draft?.bcc || []);
  const [showCc, setShowCc] = useState(Boolean((draft?.cc || []).length || (draft?.bcc || []).length));
  const [subject, setSubject] = useState(() => {
    if (draft) return draft.subject || '';
    if (reply) return reply.subject?.startsWith('Re:') ? reply.subject : `Re: ${reply.subject || ''}`;
    if (forward) return forward.subject?.startsWith('Fwd:') ? forward.subject : `Fwd: ${forward.subject || ''}`;
    return '';
  });
  const [body, setBody] = useState(() => {
    if (draft) return draft.body_text || '';
    if (forward) {
      return `\n\n---------- Forwarded message ----------\nFrom: ${forward.peer}\nSubject: ${forward.subject}\n\n${forward.body_text || ''}`;
    }
    return '';
  });
  const [attachments, setAttachments] = useState(draft?.attachments || []);
  const [draftId, setDraftId] = useState(draft?.id || null);
  const [sendAt, setSendAt] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fileRef = useRef(null);
  const dirty = useRef(false);
  const state = useRef({});
  state.current = { mailbox, to, cc, bcc, subject, body, draftId };

  const threadKey = reply?.thread_key || '';
  const inReplyTo = reply?.message_id || '';

  /* Autosave. One draft row is created on first save and PATCHed after that, so
     a long reply does not leave a trail of near-identical drafts behind. */
  const save = useCallback(async () => {
    const s = state.current;
    if (!s.mailbox) return null;
    const payload = {
      mailbox: s.mailbox, to: s.to, cc: s.cc, bcc: s.bcc,
      subject: s.subject, body_text: s.body,
      in_reply_to: inReplyTo, thread_key: threadKey,
    };
    const res = s.draftId ? await updateDraft(s.draftId, payload) : await createDraft(payload);
    if (res.error) return null;
    if (!s.draftId) setDraftId(res.id);
    setSavedAt(new Date());
    dirty.current = false;
    return res.id || s.draftId;
  }, [inReplyTo, threadKey]);

  useEffect(() => {
    if (!dirty.current) return undefined;
    const t = setTimeout(() => { if (dirty.current) save(); }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [to, cc, bcc, subject, body, save]);

  const touch = (fn) => (...args) => { dirty.current = true; fn(...args); };

  const addFiles = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    setError('');
    setUploading(true);
    // A draft has to exist before a file can hang off it.
    const id = draftId || (await save());
    for (const file of list) {
      const used = attachments.reduce((n, a) => n + (a.size || 0), 0);
      if (used + file.size > MAX_TOTAL) {
        setError(`Attachments can total ${MAX_TOTAL / 1024 / 1024} MB. "${file.name}" would go over.`);
        break;
      }
      const res = await uploadAttachment(file, id);
      if (res.error) { setError(res.error); break; }
      setAttachments((prev) => [...prev, res]);
    }
    setUploading(false);
  };

  const removeAttachment = async (att) => {
    setAttachments((prev) => prev.filter((a) => a.id !== att.id));
    await deleteAttachment(att.id);
  };

  const doSend = async () => {
    setError('');
    if (!to.length) { setError('Add at least one recipient.'); return; }
    if (!subject.trim()) { setError('Add a subject so it is findable later.'); return; }
    setBusy(true);
    const res = await sendMessage({
      mailbox, to, cc, bcc, subject, body,
      attachments: attachments.map((a) => a.id),
      in_reply_to: inReplyTo, thread_key: threadKey,
      draft: draftId || undefined,
      send_at: sendAt ? new Date(sendAt).toISOString() : undefined,
    });
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    onSent?.(res, Boolean(sendAt));
  };

  const discard = async () => {
    if (draftId) await deleteDraft(draftId);
    onClose?.();
  };

  const attemptClose = async () => {
    // Anything written is kept as a draft; only an empty composer closes silently.
    const hasContent = to.length || subject.trim() || body.trim() || attachments.length;
    if (!hasContent) { if (draftId) await deleteDraft(draftId); onClose?.(); return; }
    if (dirty.current) await save();
    onClose?.();
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') attemptClose();
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') doSend();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const totalSize = attachments.reduce((n, a) => n + (a.size || 0), 0);
  const activeBox = boxes.find((b) => String(b.id) === String(mailbox));

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && attemptClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Compose message"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}>
        <div className="modal-head">
          <span style={{ flex: 1 }}>
            {reply ? 'Reply' : forward ? 'Forward' : draft ? 'Draft' : 'New message'}
          </span>
          {savedAt && (
            <span style={{ fontSize: 11.5, color: 'var(--muted-2)', fontWeight: 400 }}>
              Saved {savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
          <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={attemptClose}
            aria-label="Close">
            <X size={17} />
          </button>
        </div>

        <div className="modal-body">
          {boxes.length > 1 && (
            <div className="compose-row">
              <label htmlFor="cmp-from">From</label>
              <select id="cmp-from" className="field" value={mailbox}
                onChange={(e) => setMailbox(e.target.value)}>
                {boxes.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.display_name ? `${b.display_name} <${b.address}>` : b.address}
                  </option>
                ))}
              </select>
            </div>
          )}
          {boxes.length === 1 && (
            <div className="compose-row">
              <label>From</label>
              <span style={{ fontSize: 13.5, color: 'var(--muted)' }}>{activeBox?.address}</span>
            </div>
          )}

          <RecipientField label="To" value={to} onChange={touch(setTo)}
            trailing={!showCc && (
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCc(true)}>Cc/Bcc</button>
            )} />
          {showCc && <RecipientField label="Cc" value={cc} onChange={touch(setCc)} />}
          {showCc && <RecipientField label="Bcc" value={bcc} onChange={touch(setBcc)} />}

          <div className="compose-row">
            <label htmlFor="cmp-subject">Subject</label>
            <input id="cmp-subject" className="field" value={subject}
              onChange={(e) => { dirty.current = true; setSubject(e.target.value); }}
              placeholder="What is this about?" />
          </div>

          <textarea className="field" rows={12} value={body}
            onChange={(e) => { dirty.current = true; setBody(e.target.value); }}
            placeholder="Write your message…"
            style={{ border: 'none', boxShadow: 'none', padding: '6px 0', resize: 'vertical' }} />

          {attachments.length > 0 && (
            <div>
              <div className="attach-row" style={{ padding: 0 }}>
                {attachments.map((a) => (
                  <span key={a.id} className="attach-chip">
                    <Paperclip size={13} style={{ color: 'var(--muted)' }} />
                    <span>{a.filename}</span>
                    <span className="size">{fileSize(a.size)}</span>
                    <button onClick={() => removeAttachment(a)} aria-label={`Remove ${a.filename}`}
                      style={{ color: 'var(--muted-2)', display: 'grid', placeItems: 'center' }}>
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--muted-2)' }}>
                {fileSize(totalSize)} of {MAX_TOTAL / 1024 / 1024} MB used
              </p>
            </div>
          )}

          {dragOver && <div className="dropzone over">Drop to attach</div>}
          {uploading && (
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>
              <Loader2 size={13} className="spin" /> Uploading…
            </p>
          )}

          {showSchedule && (
            <div className="compose-row" style={{ borderBottom: 'none' }}>
              <label htmlFor="cmp-when">Send at</label>
              <input id="cmp-when" className="field" type="datetime-local" value={sendAt}
                min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                onChange={(e) => setSendAt(e.target.value)} />
            </div>
          )}

          <ErrorNotice>{error}</ErrorNotice>
        </div>

        <div className="modal-foot">
          <button className="btn btn-primary" onClick={doSend} disabled={busy || uploading}>
            {busy ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
            {sendAt ? 'Schedule' : 'Send'}
          </button>
          <button className="icon-btn" onClick={() => fileRef.current?.click()} aria-label="Attach files"
            title="Attach files">
            <Paperclip size={17} />
          </button>
          <button className={`icon-btn ${showSchedule ? 'on' : ''}`} title="Schedule send"
            aria-label="Schedule send"
            onClick={() => { setShowSchedule((v) => !v); if (showSchedule) setSendAt(''); }}>
            <Clock size={17} />
          </button>
          <input ref={fileRef} type="file" multiple hidden
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          <span style={{ flex: 1 }} />
          <button className="btn btn-ghost" onClick={() => setConfirmDiscard(true)}>Discard</button>
        </div>
      </div>

      <ConfirmDialog open={confirmDiscard} title="Discard this draft?" danger
        confirmLabel="Discard" onCancel={() => setConfirmDiscard(false)} onConfirm={discard}>
        The message and its attachments will be removed. This cannot be undone.
      </ConfirmDialog>
    </div>
  );
}

/* Addresses as chips: typing commits on Enter, comma or blur, and Backspace on
   an empty field removes the last one — the behaviour every mail client shares,
   so nobody has to learn it here. */
function RecipientField({ label, value, onChange, trailing }) {
  const [text, setText] = useState('');

  const commit = (raw) => {
    const parts = String(raw || '').split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    parts.forEach((p) => { if (!next.includes(p)) next.push(p); });
    onChange(next);
    setText('');
  };

  return (
    <div className="compose-row">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div className="chips-field" style={{ flex: 1, border: 'none', boxShadow: 'none', padding: 0 }}>
          {value.map((addr) => (
            <span key={addr} className="recipient-chip">
              {nameOf(addr)}
              <button onClick={() => onChange(value.filter((a) => a !== addr))}
                aria-label={`Remove ${addr}`}>
                <X size={12} />
              </button>
            </span>
          ))}
          <input value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
                if (text.trim()) { e.preventDefault(); commit(text); }
              }
              if (e.key === 'Backspace' && !text && value.length) {
                onChange(value.slice(0, -1));
              }
            }}
            onBlur={() => commit(text)}
            placeholder={value.length ? '' : 'name@example.com'} />
        </div>
        {trailing}
      </div>
    </div>
  );
}
