import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, Ban, CheckCircle2, Loader2, Paperclip, Pause,
  Play, Plus, Send, Trash2, Upload, Users, X,
} from 'lucide-react';
import {
  bulkAction, createBulkJob, deleteBulkJob, getBulkJob, listBulkJobs, uploadAttachment,
} from '../api/mail.js';
import { ConfirmDialog, EmptyState, ErrorNotice, useDelayedFlag } from '../components/common.jsx';
import { fileSize, relative } from '../lib/format.js';

/* Bulk sending: the same message to many people, each addressed personally.
 *
 * Not one email to a crowd — every recipient gets their own, so a reply comes
 * back as an ordinary conversation and nobody sees who else was written to.
 */
export default function Automation({ me, mailboxId }) {
  const navigate = useNavigate();
  const boxes = (me?.mailboxes || []).filter((b) => b.can_send !== false);
  const [mailbox, setMailbox] = useState(mailboxId || boxes[0]?.id || '');
  const [jobs, setJobs] = useState(null);
  const [error, setError] = useState('');
  const [composing, setComposing] = useState(false);
  const [openJob, setOpenJob] = useState(null);
  const showSkeleton = useDelayedFlag(jobs === null);

  const load = useCallback(async () => {
    if (!mailbox) { setJobs([]); return; }
    const res = await listBulkJobs(mailbox);
    if (res.error) { setError(res.error); setJobs([]); return; }
    setError('');
    setJobs(res.jobs || []);
  }, [mailbox]);

  useEffect(() => { load(); }, [load]);

  // While something is running, keep the progress honest without a refresh button.
  const running = (jobs || []).some((j) => ['queued', 'running'].includes(j.status));
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [running, load]);

  if (!boxes.length) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 24 }}>
        <EmptyState title="Nothing to send from"
          action={<button className="btn" onClick={() => navigate('/')}>Back to mail</button>}>
          You need a mailbox you can send from before setting up a bulk send.
        </EmptyState>
      </div>
    );
  }

  return (
    <div style={{ overflowY: 'auto', padding: '22px 24px 40px' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-.02em' }}>
            Bulk send
          </h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--muted)' }}>
            One personal message each — not a single email with everybody in the To line.
          </p>
        </div>
        {boxes.length > 1 && (
          <select className="field" style={{ width: 'auto' }} value={mailbox}
            onChange={(e) => setMailbox(e.target.value)}>
            {boxes.map((b) => <option key={b.id} value={b.id}>{b.address}</option>)}
          </select>
        )}
        <button className="btn btn-primary" onClick={() => setComposing(true)}>
          <Plus size={15} /> New bulk send
        </button>
      </header>

      <ErrorNotice onRetry={load}>{error}</ErrorNotice>

      {jobs === null ? (showSkeleton ? <p className="muted">Loading…</p> : null)
        : !jobs.length ? (
          <EmptyState icon={<Users size={26} style={{ color: 'var(--muted-2)' }} />}
            title="No bulk sends yet"
            action={<button className="btn" onClick={() => setComposing(true)}>Create one</button>}>
            Write once, send to a list, and watch it go out.
          </EmptyState>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {jobs.map((j) => (
              <JobCard key={j.id} job={j} onOpen={() => setOpenJob(j)} onChanged={load} />
            ))}
          </div>
        )}

      {composing && (
        <BulkComposer mailbox={mailbox} onClose={() => setComposing(false)}
          onCreated={() => { setComposing(false); load(); }} />
      )}
      {openJob && (
        <JobDetail id={openJob.id} onClose={() => { setOpenJob(null); load(); }} />
      )}
    </div>
  );
}

const STATUS_LOOK = {
  draft: { label: 'Draft', cls: 'chip-default' },
  queued: { label: 'Queued', cls: 'chip-media' },
  running: { label: 'Sending', cls: 'chip-media' },
  paused: { label: 'Paused', cls: 'chip-support' },
  done: { label: 'Finished', cls: 'chip-careers' },
  canceled: { label: 'Cancelled', cls: 'chip-default' },
  failed: { label: 'Failed', cls: 'chip-support' },
};

function JobCard({ job, onOpen, onChanged }) {
  const [busy, setBusy] = useState(false);
  const look = STATUS_LOOK[job.status] || STATUS_LOOK.draft;
  const pct = job.total ? Math.round((job.cursor / job.total) * 100) : 0;

  const act = async (action) => {
    setBusy(true);
    await bulkAction(job.id, action);
    setBusy(false);
    onChanged();
  };

  return (
    <div className="card" style={{ padding: 14, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={onOpen} style={{ flex: 1, minWidth: 180, textAlign: 'left' }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>
            {job.name || job.subject}
          </span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>
            {job.total} recipient{job.total === 1 ? '' : 's'}
            {job.attachments?.length ? ` · ${job.attachments.length} file(s)` : ''}
            {` · ${relative(job.created_at)}`}
          </span>
        </button>
        <span className={`chip ${look.cls}`}>{look.label}</span>

        {['draft', 'paused', 'failed'].includes(job.status) && (
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => act('start')}>
            {busy ? <Loader2 size={13} className="spin" /> : <Play size={13} />}
            {job.status === 'draft' ? 'Send' : 'Resume'}
          </button>
        )}
        {['queued', 'running'].includes(job.status) && (
          <>
            <button className="btn btn-sm" disabled={busy} onClick={() => act('pause')}>
              <Pause size={13} /> Pause
            </button>
            <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => act('cancel')}>
              <Ban size={13} /> Stop
            </button>
          </>
        )}
      </div>

      {job.status !== 'draft' && (
        <div style={{ display: 'grid', gap: 5 }}>
          <span style={{ height: 5, borderRadius: 3, background: 'var(--line-soft)', display: 'block' }}>
            <span style={{
              display: 'block', height: '100%', width: `${pct}%`, borderRadius: 3,
              background: job.status === 'done' ? 'var(--ok)' : 'var(--accent)',
              transition: 'width var(--t-base)',
            }} />
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }} className="tabular">
            {job.cursor} of {job.total} handled · {job.sent_count} sent
            {job.failed_count > 0 && ` · ${job.failed_count} failed`}
          </span>
        </div>
      )}

      {job.last_error && (
        <div className="notice notice-warn" style={{ fontSize: 12 }}>
          <AlertTriangle size={14} style={{ flex: 'none', marginTop: 1 }} />
          <span>{job.last_error}</span>
        </div>
      )}
    </div>
  );
}

function BulkComposer({ mailbox, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [raw, setRaw] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  /* Recipients come in as either one address per line, or a CSV whose first row
     names the columns. The columns become {{tokens}}, which is what makes each
     message personal. */
  const parsed = useMemo(() => {
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return { rows: [], columns: [] };

    const header = lines[0].toLowerCase();
    const isCsv = header.includes(',') && header.includes('email');
    if (!isCsv) {
      return { rows: lines.map((email) => ({ email })), columns: ['email'] };
    }
    const cols = lines[0].split(',').map((c) => c.trim().toLowerCase());
    const rows = lines.slice(1).map((line) => {
      const cells = line.split(',').map((c) => c.trim());
      return Object.fromEntries(cols.map((c, i) => [c, cells[i] || '']));
    });
    return { rows, columns: cols };
  }, [raw]);

  const valid = parsed.rows.filter((r) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email || ''));
  const dropped = parsed.rows.length - valid.length;
  const sample = valid[0];

  const preview = (text) => (text || '').replace(/\{\{\s*(\w+)\s*\}\}/g,
    (_, k) => (sample?.[k.toLowerCase()] ?? ''));

  const addFiles = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    setUploading(true);
    for (const file of list) {
      const res = await uploadAttachment(file);
      if (res.error) { setError(res.error); break; }
      setAttachments((prev) => [...prev, res]);
    }
    setUploading(false);
  };

  const submit = async () => {
    setError('');
    if (!subject.trim()) { setError('Give the message a subject.'); return; }
    if (!valid.length) { setError('Add at least one valid email address.'); return; }
    setBusy(true);
    const res = await createBulkJob({
      mailbox, name: name.trim(), subject, body_text: body,
      recipients: valid, attachments: attachments.map((a) => a.id),
    });
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    onCreated();
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="New bulk send">
        <div className="modal-head">
          <span style={{ flex: 1 }}>New bulk send</span>
          <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={onClose}
            aria-label="Close">
            <X size={17} />
          </button>
        </div>

        <div className="modal-body">
          <label style={{ display: 'grid', gap: 6 }}>
            <span className="eyebrow">Name it (for your own reference)</span>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Partner outreach — August" />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span className="eyebrow">Recipients</span>
            <textarea className="field" rows={5} value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={'aarav@example.com\npriya@example.com\n\n…or paste a CSV:\nemail,name,org\naarav@example.com,Aarav,Vertex'} />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              One address per line, or a CSV whose first row names the columns.
              {valid.length > 0 && (
                <> <strong style={{ color: 'var(--ink)' }}>{valid.length} valid</strong>
                  {dropped > 0 && ` · ${dropped} skipped`}
                  {parsed.columns.length > 1 && ` · use ${parsed.columns
                    .filter((c) => c !== 'email').map((c) => `{{${c}}}`).join(', ')}`}
                </>
              )}
            </span>
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span className="eyebrow">Subject</span>
            <input className="field" value={subject} onChange={(e) => setSubject(e.target.value)}
              placeholder="Partnering with {{name}}" />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span className="eyebrow">Message</span>
            <textarea className="field" rows={7} value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={'Hello {{name}},\n\nWe would love to work with {{org}}.'} />
          </label>

          {sample && (subject.includes('{{') || body.includes('{{')) && (
            <div className="notice notice-info" style={{ display: 'grid', gap: 4 }}>
              <span className="eyebrow" style={{ color: 'inherit' }}>
                How it reads for {sample.email}
              </span>
              <strong style={{ fontSize: 13 }}>{preview(subject)}</strong>
              <span style={{ fontSize: 12.5, whiteSpace: 'pre-wrap' }}>{preview(body)}</span>
            </div>
          )}

          {attachments.length > 0 && (
            <div className="attach-row" style={{ padding: 0 }}>
              {attachments.map((a) => (
                <span key={a.id} className="attach-chip">
                  <Paperclip size={13} style={{ color: 'var(--muted)' }} />
                  {a.filename}
                  <span className="size">{fileSize(a.size)}</span>
                  <button onClick={() => setAttachments((p) => p.filter((x) => x.id !== a.id))}
                    aria-label={`Remove ${a.filename}`}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {uploading && (
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>
              <Loader2 size={13} className="spin" /> Uploading…
            </p>
          )}

          <ErrorNotice>{error}</ErrorNotice>
        </div>

        <div className="modal-foot">
          <button className="btn btn-primary" onClick={submit}
            disabled={busy || uploading || !valid.length || !subject.trim()}>
            {busy ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
            Create ({valid.length})
          </button>
          <button className="icon-btn" onClick={() => fileRef.current?.click()}
            title="Attach files to every message" aria-label="Attach files">
            <Paperclip size={17} />
          </button>
          <input ref={fileRef} type="file" multiple hidden
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          <span style={{ flex: 1 }} />
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function JobDetail({ id, onClose }) {
  const [job, setJob] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = () => getBulkJob(id).then((res) => { if (alive && !res.error) setJob(res); });
    tick();
    const t = setInterval(tick, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [id]);

  if (!job) return null;
  const look = STATUS_LOOK[job.status] || STATUS_LOOK.draft;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-sm" role="dialog" aria-modal="true">
        <div className="modal-head">
          <span style={{ flex: 1 }}>{job.name || job.subject}</span>
          <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={onClose}
            aria-label="Close">
            <X size={17} />
          </button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className={`chip ${look.cls}`}>{look.label}</span>
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }} className="tabular">
              {job.sent_count} sent · {job.failed_count} failed · {job.total} total
            </span>
          </div>
          <div>
            <span className="eyebrow">Subject</span>
            <p style={{ margin: '4px 0 0', fontSize: 13.5 }}>{job.subject}</p>
          </div>
          <div>
            <span className="eyebrow">Message</span>
            <p style={{ margin: '4px 0 0', fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--ink-2)' }}>
              {job.body_text}
            </p>
          </div>
          {job.recipient_preview?.length > 0 && (
            <div>
              <span className="eyebrow">Going to</span>
              <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--muted)' }}>
                {job.recipient_preview.join(', ')}
                {job.total > job.recipient_preview.length && ` and ${job.total - job.recipient_preview.length} more`}
              </p>
            </div>
          )}
          {job.attachments?.length > 0 && (
            <div className="attach-row" style={{ padding: 0 }}>
              {job.attachments.map((a) => (
                <span key={a.id} className="attach-chip">
                  <Paperclip size={13} /> {a.filename}
                  <span className="size">{fileSize(a.size)}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="modal-foot">
          <span style={{ flex: 1 }} />
          {job.status !== 'running' && (
            <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={14} /> Delete
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog open={confirmDelete} title="Delete this bulk send?" danger
        confirmLabel="Delete" onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => { await deleteBulkJob(job.id); onClose(); }}>
        Messages already sent are not affected — this only removes the record and its files.
      </ConfirmDialog>
    </div>
  );
}
