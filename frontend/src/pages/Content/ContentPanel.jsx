import { useEffect, useState } from 'react';
import {
  X, Trash2, Save, Loader2, ExternalLink, Plus, History, ListChecks, Link2,
} from 'lucide-react';

/* The right-hand detail panel — the single place a content item is edited.

   Opens over the current view (table / board / calendar), so context is never
   lost. Shows every field, the linked task, and the item's history. */

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(20,12,0,.35)', zIndex: 200,
  display: 'flex', justifyContent: 'flex-end',
};
const panel = {
  width: 'min(520px, 100%)', height: '100%', overflowY: 'auto',
  background: 'var(--surface-container-lowest)',
  borderLeft: '1px solid var(--outline-variant)',
  boxShadow: '-8px 0 30px rgba(0,0,0,.14)', padding: 20,
};
const label = {
  display: 'block', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase',
  letterSpacing: '.05em', color: 'var(--text-muted)', marginBottom: 5,
};
const input = {
  width: '100%', padding: '9px 11px', borderRadius: 8, fontSize: 13,
  border: '1px solid var(--outline-variant)', background: 'var(--surface-container-lowest)',
  color: 'var(--text-main)', outline: 'none',
};
const btn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px',
  borderRadius: 8, border: '1px solid var(--outline-variant)',
  background: 'var(--surface-container-low)', color: 'var(--text-main)',
  fontSize: 13, fontWeight: 700, cursor: 'pointer',
};
const btnPrimary = { ...btn, background: 'var(--primary)', color: '#fff', border: 'none' };
const field = { marginBottom: 13 };

const EMPTY = {
  title: '', brand: '', content_type: 'other', status: 'idea',
  content_assignees: [], graphics_assignees: [], doc_url: '', extra_links: [],
  due_date: '', release_date: '', platforms: [], posting_url: '',
  priority: 'medium', effort: '', notes: '',
};

export default function ContentPanel({
  item, choices, members, canEdit, onClose, onSave, onDelete, loadActivity,
}) {
  const isNew = !item;
  const [form, setForm] = useState(() => (item ? { ...EMPTY, ...item } : EMPTY));
  const [saving, setSaving] = useState(false);
  const [activity, setActivity] = useState(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setForm(item ? { ...EMPTY, ...item } : EMPTY);
    setDirty(false);
    if (item?.id && loadActivity) {
      loadActivity(item.id).then((r) => setActivity(r?.activity || [])).catch(() => setActivity([]));
    } else setActivity(null);
  }, [item, loadActivity]);

  // Esc closes — matches the command palette idiom.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };

  const toggleIn = (k, id) => {
    const cur = form[k] || [];
    set(k, cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  };

  const save = async () => {
    setSaving(true);
    const payload = {
      title: form.title, brand: form.brand, content_type: form.content_type,
      status: form.status, content_assignees: form.content_assignees,
      graphics_assignees: form.graphics_assignees, doc_url: form.doc_url,
      extra_links: form.extra_links, platforms: form.platforms,
      posting_url: form.posting_url, priority: form.priority,
      effort: form.effort, notes: form.notes,
      due_date: form.due_date || null, release_date: form.release_date || null,
    };
    const res = await onSave(isNew ? null : item.id, payload);
    setSaving(false);
    if (res) setDirty(false);
  };

  const MemberChips = ({ k, title }) => (
    <div style={field}>
      <label style={label}>{title}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {members.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            No Content-department members found.
          </span>
        )}
        {members.map((m) => {
          const on = (form[k] || []).includes(m.id);
          return (
            <button key={m.id} type="button" disabled={!canEdit}
              onClick={() => toggleIn(k, m.id)}
              style={{
                fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 20,
                cursor: canEdit ? 'pointer' : 'default',
                border: `1px solid ${on ? 'var(--primary)' : 'var(--outline-variant)'}`,
                background: on ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent',
                color: on ? 'var(--primary)' : 'var(--text-muted)',
              }}>{m.name}</button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={panel} onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-main)' }}>
            {isNew ? 'New content' : 'Content details'}
          </div>
          <div style={{ flex: 1 }} />
          {!isNew && canEdit && (
            <button style={{ ...btn, color: '#b91c1c' }} onClick={() => onDelete(item.id)} title="Delete">
              <Trash2 size={14} />
            </button>
          )}
          <button style={btn} onClick={onClose}><X size={15} /></button>
        </div>

        <div style={field}>
          <label style={label}>Content name</label>
          <input style={input} value={form.title} disabled={!canEdit} autoFocus={isNew}
            placeholder="What is this piece?" onChange={(e) => set('title', e.target.value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={field}>
            <label style={label}>Brand / Project</label>
            <input style={input} list="content-brands" value={form.brand} disabled={!canEdit}
              onChange={(e) => set('brand', e.target.value)} placeholder="e.g. .TIES" />
            <datalist id="content-brands">
              {(choices.brands || []).map((b) => <option key={b} value={b} />)}
            </datalist>
          </div>
          <div style={field}>
            <label style={label}>Content type</label>
            <select style={input} value={form.content_type} disabled={!canEdit}
              onChange={(e) => set('content_type', e.target.value)}>
              {(choices.content_types || []).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={field}>
            <label style={label}>Stage</label>
            <select style={input} value={form.status} disabled={!canEdit}
              onChange={(e) => set('status', e.target.value)}>
              {(choices.statuses || []).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div style={field}>
            <label style={label}>Priority</label>
            <select style={input} value={form.priority} disabled={!canEdit}
              onChange={(e) => set('priority', e.target.value)}>
              {(choices.priorities || []).map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        </div>

        <MemberChips k="content_assignees" title="Assignee · Content (writer / editor)" />
        <MemberChips k="graphics_assignees" title="Assignee · Graphics" />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={field}>
            <label style={label}>Content due date</label>
            <input type="date" style={input} value={form.due_date || ''} disabled={!canEdit}
              onChange={(e) => set('due_date', e.target.value)} />
          </div>
          <div style={field}>
            <label style={label}>Planned release</label>
            <input type="date" style={input} value={form.release_date || ''} disabled={!canEdit}
              onChange={(e) => set('release_date', e.target.value)} />
          </div>
        </div>

        <div style={field}>
          <label style={label}>Platforms</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(choices.platforms || []).map((p) => {
              const on = (form.platforms || []).includes(p);
              return (
                <button key={p} type="button" disabled={!canEdit}
                  onClick={() => set('platforms', on
                    ? form.platforms.filter((x) => x !== p) : [...(form.platforms || []), p])}
                  style={{
                    fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 7,
                    cursor: canEdit ? 'pointer' : 'default',
                    border: `1px solid ${on ? 'var(--primary)' : 'var(--outline-variant)'}`,
                    background: on ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent',
                    color: on ? 'var(--primary)' : 'var(--text-muted)',
                  }}>{p}</button>
              );
            })}
          </div>
        </div>

        <div style={field}>
          <label style={label}>Doc / graphics link</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input style={input} value={form.doc_url} disabled={!canEdit} placeholder="https://docs.google.com/…"
              onChange={(e) => set('doc_url', e.target.value)} />
            {form.doc_url && (
              <a href={form.doc_url} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none' }}>
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>

        <div style={field}>
          <label style={label}>Posting URL (once live)</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input style={input} value={form.posting_url} disabled={!canEdit} placeholder="https://…"
              onChange={(e) => set('posting_url', e.target.value)} />
            {form.posting_url && (
              <a href={form.posting_url} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none' }}>
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>

        <div style={field}>
          <label style={label}>Notes</label>
          <textarea style={{ ...input, minHeight: 90, resize: 'vertical', lineHeight: 1.55 }}
            value={form.notes} disabled={!canEdit} onChange={(e) => set('notes', e.target.value)} />
        </div>

        {/* linked task */}
        {!isNew && item?.task_detail && (
          <div style={{
            border: '1px solid var(--outline-variant)', borderRadius: 9, padding: 12,
            marginBottom: 14, background: 'var(--surface-container-low)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
              <ListChecks size={14} style={{ color: 'var(--primary)' }} />
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-main)' }}>Linked task</span>
              <a href="/hr/tasks" style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--primary)' }}>
                Open in Tasks
              </a>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              #{item.task_detail.id} · <b style={{ color: 'var(--text-main)' }}>{item.task_detail.status}</b>
              {item.task_detail.assigned_to_name && <> · {item.task_detail.assigned_to_name}</>}
              {item.task_detail.due_date && <> · due {item.task_detail.due_date}</>}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>
              Moving this item to Published marks the task Done, and vice-versa.
            </div>
          </div>
        )}

        {canEdit && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 18 }}>
            <button style={btn} onClick={onClose}>Cancel</button>
            <button style={btnPrimary} onClick={save} disabled={saving || !form.title.trim() || (!isNew && !dirty)}>
              {saving ? <><Loader2 size={14} className="nm-spin" /> Saving…</>
                      : <><Save size={14} /> {isNew ? 'Create' : 'Save'}</>}
            </button>
          </div>
        )}

        {/* history */}
        {!isNew && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
              <History size={13} style={{ color: 'var(--text-muted)' }} />
              <span style={{ ...label, marginBottom: 0 }}>History</span>
            </div>
            {activity === null ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>
            ) : activity.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No changes recorded.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 220, overflowY: 'auto' }}>
                {activity.map((a) => (
                  <div key={a.id} style={{
                    fontSize: 12, color: 'var(--text-main)', paddingLeft: 9,
                    borderLeft: '2px solid var(--outline-variant)',
                  }}>
                    <div>{a.detail || a.verb}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                      {a.actor_name} · {new Date(a.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
