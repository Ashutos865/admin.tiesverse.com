import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Trash2, Save, Loader2, ExternalLink, History, ListChecks,
  Search, Check, ChevronDown, UserPlus,
  MessageCircle,
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
  priority: 'medium', effort: '', notes: '', notify_on_assign: true,
};

const initialsOf = (n) => (n || '?').trim().split(/\s+/).slice(0, 2)
  .map((w) => w[0]?.toUpperCase() || '').join('');

/* A person's profile picture, falling back to initials when they have none or
   the image fails to load. */
function Face({ person, size = 24, ring }) {
  const [broken, setBroken] = useState(false);
  const src = !broken ? (person.avatar_url || '') : '';
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', display: 'grid', placeItems: 'center',
      overflow: 'hidden', flex: 'none', fontSize: size * 0.4, fontWeight: 800,
      background: 'color-mix(in srgb, var(--primary) 18%, transparent)',
      color: 'var(--primary)',
      ...(ring ? { border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)' } : {}),
    }}>
      {src
        ? <img src={src} alt="" onError={() => setBroken(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : initialsOf(person.name)}
    </span>
  );
}

/* A compact, searchable multi-select for assignees.

   Rendering every member as an always-visible chip does not scale — with ~30
   people it buried the rest of the form, twice over. This shows only who is
   actually assigned, and opens a filtered list on demand. */
function AssigneePicker({ title, members, selected, disabled, onToggle, onClear }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const boxRef = useRef(null);

  const chosen = useMemo(
    () => members.filter((m) => selected.includes(m.id)),
    [members, selected],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => (m.name || '').toLowerCase().includes(q)
      || (m.email || '').toLowerCase().includes(q)
      || (m.crew_id || '').toLowerCase().includes(q));
  }, [members, query]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div style={field} ref={boxRef}>
      <label style={label}>{title}</label>

      {/* the control: selected people + an "add" affordance */}
      <div
        onClick={() => !disabled && setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          minHeight: 38, padding: '6px 9px', borderRadius: 8,
          border: `1px solid ${open ? 'var(--primary)' : 'var(--outline-variant)'}`,
          background: 'var(--surface-container-lowest)',
          cursor: disabled ? 'default' : 'pointer',
        }}>
        {chosen.length === 0 && (
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)', flex: 1 }}>
            {disabled ? 'Nobody assigned' : 'Click to assign…'}
          </span>
        )}
        {chosen.map((m) => (
          <span key={m.id} title={m.email} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 12, fontWeight: 700, padding: '3px 4px 3px 3px', borderRadius: 20,
            background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
            color: 'var(--primary)',
          }}>
            <Face person={m} size={19} />
            {m.name}
            {!disabled && (
              <span role="button" title="Remove"
                onClick={(e) => { e.stopPropagation(); onToggle(m.id); }}
                style={{ display: 'flex', padding: 2, cursor: 'pointer', opacity: .75 }}>
                <X size={11} />
              </span>
            )}
          </span>
        ))}
        {!disabled && (
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
                         color: 'var(--text-muted)' }}>
            {chosen.length > 0 && <UserPlus size={13} />}
            <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
          </span>
        )}
      </div>

      {open && !disabled && (
        <div style={{
          marginTop: 4, borderRadius: 9, overflow: 'hidden',
          border: '1px solid var(--outline-variant)',
          background: 'var(--surface-container-lowest)',
          boxShadow: '0 10px 28px rgba(0,0,0,.16)',
        }}>
          <div style={{ position: 'relative', padding: 8, borderBottom: '1px solid var(--outline-variant)' }}>
            <Search size={13} style={{ position: 'absolute', left: 17, top: 17, color: 'var(--text-muted)' }} />
            <input autoFocus value={query} placeholder="Search people…"
              onChange={(e) => setQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              style={{ ...input, paddingLeft: 30, fontSize: 12.5 }} />
          </div>

          <div style={{ maxHeight: 210, overflowY: 'auto' }}>
            {matches.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text-muted)' }}>
                {members.length === 0 ? 'No Content-department members found.' : 'No match.'}
              </div>
            ) : matches.map((m) => {
              const on = selected.includes(m.id);
              return (
                <button key={m.id} type="button" onClick={() => onToggle(m.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
                    padding: '8px 12px', border: 'none', cursor: 'pointer', fontSize: 13,
                    background: on ? 'color-mix(in srgb, var(--primary) 9%, transparent)' : 'transparent',
                    color: 'var(--text-main)',
                  }}>
                  <Face person={m} size={24} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden',
                                 textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.name}
                    {m.crew_id && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>
                        {m.crew_id}
                      </span>
                    )}
                  </span>
                  {on && <Check size={14} style={{ color: 'var(--primary)', flex: 'none' }} />}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 8, padding: 8, borderTop: '1px solid var(--outline-variant)' }}>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)', alignSelf: 'center' }}>
              {selected.length} selected
            </span>
            <div style={{ flex: 1 }} />
            {selected.length > 0 && (
              <button type="button" onClick={onClear}
                style={{ ...btn, padding: '5px 10px', fontSize: 12 }}>Clear</button>
            )}
            <button type="button" onClick={() => setOpen(false)}
              style={{ ...btnPrimary, padding: '5px 12px', fontSize: 12 }}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

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
      notify_on_assign: form.notify_on_assign !== false,
    };
    const res = await onSave(isNew ? null : item.id, payload);
    setSaving(false);
    // Close on success. Leaving the panel open made the row update behind it,
    // which read as "nothing happened"; and because saving clears `dirty` the
    // Save button then disabled itself, which read as "edit failed".
    if (res) {
      setDirty(false);
      onClose();
    }
  };

  const MemberChips = ({ k, title }) => (
    <AssigneePicker
      title={title}
      members={members}
      selected={form[k] || []}
      disabled={!canEdit}
      onToggle={(id) => toggleIn(k, id)}
      onClear={() => set(k, [])}
    />
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

        {/* WhatsApp notification switch. Meta bills per message, so notifying is
            a deliberate choice per item rather than something that always fires. */}
        <div style={{
          ...field, border: '1px solid var(--outline-variant)', borderRadius: 9,
          padding: '11px 13px', background: 'var(--surface-container-low)',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10,
                          cursor: canEdit ? 'pointer' : 'default' }}>
            <input type="checkbox" disabled={!canEdit}
              checked={form.notify_on_assign !== false}
              onChange={(e) => set('notify_on_assign', e.target.checked)}
              style={{ width: 17, height: 17, accentColor: 'var(--primary)', cursor: 'inherit' }} />
            <span style={{ flex: 1 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6,
                             fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>
                <MessageCircle size={14} style={{ color: '#25D366' }} />
                Notify assignees on WhatsApp
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Messages only people who added a number and opted in, and only when
                they are newly assigned — editing later never re-sends.
              </span>
            </span>
          </label>
        </div>

        {/* linked tasks — one per assignee, so everyone sees their own work */}
        {!isNew && Array.isArray(item?.task_detail) && item.task_detail.length > 0 && (
          <div style={{
            border: '1px solid var(--outline-variant)', borderRadius: 9, padding: 12,
            marginBottom: 14, background: 'var(--surface-container-low)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
              <ListChecks size={14} style={{ color: 'var(--primary)' }} />
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-main)' }}>
                Linked tasks ({item.task_detail.length})
              </span>
              <a href="/hr/tasks" style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--primary)' }}>
                Open in Tasks
              </a>
            </div>
            {item.task_detail.map((t) => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
                fontSize: 12.5, color: 'var(--text-muted)',
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                  background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                  color: 'var(--primary)',
                }}>{t.track || '—'}</span>
                <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>
                  {t.assigned_to_name || 'Unassigned'}
                </span>
                <span style={{ marginLeft: 'auto' }}>
                  #{t.id} · <b style={{ color: 'var(--text-main)' }}>{t.status}</b>
                </span>
              </div>
            ))}
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8,
                          paddingTop: 8, borderTop: '1px solid var(--outline-variant)' }}>
              Each assignee gets their own task. Publishing marks them all done; the item
              only auto-publishes once everyone has finished.
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
