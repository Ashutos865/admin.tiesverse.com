/* Turning an email into a task.
 *
 * The subject is almost always the right title, so it is filled in and the
 * field is focused with the text selected — accept it with Enter, or type over
 * it. Everything else has a sane default, which keeps the common case (this is
 * mine, I'll do it soon) to a single keystroke.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckSquare, Loader2 } from 'lucide-react';
import { createMessageTask, getAssignable } from '../api/mail.js';
import { ErrorNotice } from './common.jsx';

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

// Offered as one-tap choices because "when" is usually relative, not a date.
const WHENS = [
  { key: '', label: 'No date' },
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'week', label: 'Next week' },
];

function dateFor(key) {
  if (!key) return '';
  const d = new Date();
  if (key === 'tomorrow') d.setDate(d.getDate() + 1);
  if (key === 'week') d.setDate(d.getDate() + 7);
  // Local calendar date — toISOString would shift a late-evening "today" to
  // tomorrow for anyone east of UTC, which is everyone here.
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function TaskModal({ message, onClose, onCreated }) {
  const [title, setTitle] = useState(message?.subject || '');
  const [assignee, setAssignee] = useState('me');
  const [priority, setPriority] = useState('medium');
  const [when, setWhen] = useState('');
  const [customDate, setCustomDate] = useState('');
  const [note, setNote] = useState('');
  const [people, setPeople] = useState([]);
  const [canAssignOthers, setCanAssignOthers] = useState(false);
  const [meName, setMeName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef(null);

  useEffect(() => {
    let alive = true;
    getAssignable().then((res) => {
      if (!alive || res.error) return;
      // A lead's own team includes the lead; "me" is already the first option,
      // so drop the duplicate rather than listing the same person twice.
      const mine = res.me?.id;
      setPeople((res.people || []).filter((p) => p.id !== mine));
      setCanAssignOthers(Boolean(res.can_assign_others));
      setMeName(res.me?.name || '');
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => titleRef.current?.select(), 30);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const dueDate = useMemo(
    () => (when === 'custom' ? customDate : dateFor(when)),
    [when, customDate],
  );

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) { setError('Give the task a title.'); return; }
    setBusy(true);
    setError('');
    const res = await createMessageTask(message.id, {
      title: title.trim(),
      assigned_to: assignee,
      priority,
      due_date: dueDate || null,
      description: note.trim(),
    });
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    onCreated?.(res);
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal modal-sm" role="dialog" aria-modal="true"
        aria-label="Make this a task" onSubmit={submit}>
        <div className="modal-head"><CheckSquare size={16} /> Make this a task</div>

        <div className="modal-body">
          <label style={{ display: 'grid', gap: 6 }}>
            <span className="eyebrow">Task</span>
            <input ref={titleRef} className="field" value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs doing?" maxLength={500} />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span className="eyebrow">Assign to</span>
            {canAssignOthers ? (
              <select className="field" value={assignee}
                onChange={(e) => setAssignee(e.target.value)}>
                <option value="me">{meName ? `${meName} (me)` : 'Me'}</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.role ? ` — ${p.role}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <span className="task-self">{meName || 'Me'}</span>
            )}
          </label>

          <div style={{ display: 'grid', gap: 6 }}>
            <span className="eyebrow">Priority</span>
            <div className="seg">
              {PRIORITIES.map((p) => (
                <button key={p.value} type="button"
                  className={`seg-btn ${priority === p.value ? 'on' : ''}`}
                  onClick={() => setPriority(p.value)}>{p.label}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <span className="eyebrow">Due</span>
            <div className="seg">
              {WHENS.map((w) => (
                <button key={w.key} type="button"
                  className={`seg-btn ${when === w.key ? 'on' : ''}`}
                  onClick={() => setWhen(w.key)}>{w.label}</button>
              ))}
              <button type="button" className={`seg-btn ${when === 'custom' ? 'on' : ''}`}
                onClick={() => setWhen('custom')}>Pick…</button>
            </div>
            {when === 'custom' && (
              <input type="date" className="field" value={customDate}
                onChange={(e) => setCustomDate(e.target.value)} />
            )}
          </div>

          <label style={{ display: 'grid', gap: 6 }}>
            <span className="eyebrow">Note <span className="muted">(optional)</span></span>
            <textarea className="field" rows={2} value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything the email doesn't say" />
          </label>

          {/* The mail this came from is attached automatically — say so rather
              than making someone paste it into the note. */}
          <p className="task-src">
            The email “{message?.subject || '(no subject)'}”
            {message?.peer ? ` from ${message.peer}` : ''} is attached to the task.
          </p>

          <ErrorNotice>{error}</ErrorNotice>
        </div>

        <div className="modal-foot">
          <span style={{ flex: 1 }} />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()}>
            {busy ? <><Loader2 size={15} className="spin" /> Creating…</> : 'Create task'}
          </button>
        </div>
      </form>
    </div>
  );
}
