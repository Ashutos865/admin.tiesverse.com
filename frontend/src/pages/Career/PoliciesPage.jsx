import { useEffect, useState, useCallback } from 'react';
import { FileText, Plus, Pencil, Trash2, X, ChevronDown } from 'lucide-react';
import { getPolicies, createPolicy, updatePolicy, deletePolicy } from '../../apiClient';
import { useMe } from '../../context/MeContext';

const EMPTY = { title: '', category: 'General', summary: '', body: '', is_published: true, order: 0 };

export default function PoliciesPage() {
  const { scope } = useMe();
  const canManage = scope === 'all';

  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);      // expanded policy
  const [editing, setEditing] = useState(null);    // {…policy} or EMPTY when creating
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getPolicies().catch(() => []);
    setPolicies(Array.isArray(res) ? res : []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing.title.trim()) return;
    setSaving(true);
    const res = editing.id
      ? await updatePolicy(editing.id, editing).catch(() => ({ error: 'Failed' }))
      : await createPolicy(editing).catch(() => ({ error: 'Failed' }));
    setSaving(false);
    if (res?.id) { setEditing(null); load(); }
    else alert(res?.error || 'Could not save the policy.');
  };

  const remove = async (p) => {
    if (!window.confirm(`Delete the policy "${p.title}"? This cannot be undone.`)) return;
    await deletePolicy(p.id).catch(() => {});
    load();
  };

  const q = query.trim().toLowerCase();
  const shown = policies.filter(p => !q
    || `${p.title} ${p.category} ${p.summary} ${p.body}`.toLowerCase().includes(q));

  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <div>
          <h1 style={S.title}><FileText size={22} style={{ verticalAlign: -4, marginRight: 8, color: '#fe7a00' }} />Policies</h1>
          <p style={S.sub}>{canManage
            ? 'Publish company policies here — every member can read them.'
            : 'Company policies published by HR. Please read them.'}</p>
        </div>
        {canManage && (
          <button style={S.primary} onClick={() => setEditing({ ...EMPTY })}>
            <Plus size={15} style={{ verticalAlign: -3, marginRight: 6 }} />New policy
          </button>
        )}
      </div>

      <input style={S.search} placeholder="Search policies…" value={query} onChange={e => setQuery(e.target.value)} />

      {loading ? <div style={S.muted}>Loading…</div>
        : shown.length === 0 ? <div style={S.empty}>{q ? 'No policies match your search.' : 'No policies yet.'}</div>
        : (
          <div style={S.list}>
            {shown.map(p => {
              const open = openId === p.id;
              return (
                <div key={p.id} style={S.card}>
                  <div style={S.cardHead} onClick={() => setOpenId(open ? null : p.id)}>
                    <div style={{ minWidth: 0 }}>
                      <div style={S.rowTop}>
                        <span style={S.badge}>{p.category || 'General'}</span>
                        {canManage && !p.is_published && <span style={{ ...S.badge, ...S.draft }}>Draft</span>}
                      </div>
                      <div style={S.cardTitle}>{p.title}</div>
                      {p.summary && <div style={S.summary}>{p.summary}</div>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {canManage && (
                        <>
                          <button style={S.icon} title="Edit" onClick={e => { e.stopPropagation(); setEditing({ ...p }); }}><Pencil size={15} /></button>
                          <button style={{ ...S.icon, color: '#ef4444' }} title="Delete" onClick={e => { e.stopPropagation(); remove(p); }}><Trash2 size={15} /></button>
                        </>
                      )}
                      <ChevronDown size={18} style={{ color: 'var(--text-muted,#9ca3af)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                    </div>
                  </div>
                  {open && (
                    <div style={S.body}>{p.body || <span style={S.muted}>No details.</span>}
                      {p.created_by_name && <div style={S.meta}>Published by {p.created_by_name}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      {editing && (
        <div style={S.overlay} onMouseDown={() => setEditing(null)}>
          <div style={S.modal} onMouseDown={e => e.stopPropagation()}>
            <div style={S.modalHead}>
              <strong style={{ fontSize: 16 }}>{editing.id ? 'Edit policy' : 'New policy'}</strong>
              <button style={S.icon} onClick={() => setEditing(null)}><X size={18} /></button>
            </div>
            <label style={S.lbl}>Title
              <input style={S.input} value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="e.g. Leave & Time-off Policy" />
            </label>
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={{ ...S.lbl, flex: 1 }}>Category
                <input style={S.input} value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value })} placeholder="General" />
              </label>
              <label style={{ ...S.lbl, width: 130 }}>Order
                <input type="number" style={S.input} value={editing.order} onChange={e => setEditing({ ...editing, order: Number(e.target.value) })} />
              </label>
            </div>
            <label style={S.lbl}>Short summary
              <input style={S.input} value={editing.summary} onChange={e => setEditing({ ...editing, summary: e.target.value })} placeholder="One line shown in the list" />
            </label>
            <label style={S.lbl}>Policy details
              <textarea style={{ ...S.input, minHeight: 200, resize: 'vertical', lineHeight: 1.6 }} value={editing.body} onChange={e => setEditing({ ...editing, body: e.target.value })} placeholder="Write the full policy here…" />
            </label>
            <label style={S.check}>
              <input type="checkbox" checked={editing.is_published} onChange={e => setEditing({ ...editing, is_published: e.target.checked })} />
              Published (visible to all members)
            </label>
            <div style={S.modalFoot}>
              <button style={S.ghost} onClick={() => setEditing(null)}>Cancel</button>
              <button style={S.primary} disabled={saving || !editing.title.trim()} onClick={save}>{saving ? 'Saving…' : 'Save policy'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  wrap: { padding: 24, maxWidth: 920, margin: '0 auto' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: 800, margin: 0, color: 'var(--text-main,#111827)' },
  sub: { color: 'var(--text-muted,#6b7280)', fontSize: 14, marginTop: 4, maxWidth: 560 },
  search: { width: '100%', padding: '11px 16px', borderRadius: 999, border: '1px solid var(--border,#e5e7eb)', background: 'var(--surface,#fff)', fontSize: 14, marginBottom: 16, boxSizing: 'border-box' },
  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  card: { background: 'var(--surface,#fff)', border: '1px solid var(--border,#e5e7eb)', borderRadius: 16, overflow: 'hidden' },
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '16px 18px', cursor: 'pointer' },
  rowTop: { display: 'flex', gap: 6, marginBottom: 6 },
  cardTitle: { fontSize: 16, fontWeight: 700, color: 'var(--text-main,#111827)' },
  summary: { fontSize: 13, color: 'var(--text-muted,#6b7280)', marginTop: 3 },
  badge: { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: '#c2410c', background: '#fe7a0018', padding: '3px 9px', borderRadius: 999 },
  draft: { color: '#b45309', background: '#fef3c7' },
  body: { padding: '4px 18px 18px', fontSize: 14, color: 'var(--text-main,#374151)', whiteSpace: 'pre-wrap', lineHeight: 1.65, borderTop: '1px solid var(--border,#eef0f3)' },
  meta: { marginTop: 14, fontSize: 12, color: 'var(--text-muted,#9ca3af)' },
  icon: { border: 'none', background: 'transparent', color: 'var(--text-muted,#6b7280)', cursor: 'pointer', display: 'inline-flex', padding: 4, borderRadius: 8 },
  primary: { padding: '9px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(180deg,#ff9a3d,#fe7a00 58%,#ef6f00)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, flex: 'none' },
  ghost: { padding: '9px 16px', borderRadius: 10, border: '1px solid var(--border,#e5e7eb)', background: 'transparent', color: 'var(--text-muted,#6b7280)', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  muted: { color: 'var(--text-muted,#9ca3af)' },
  empty: { textAlign: 'center', color: 'var(--text-muted,#9ca3af)', padding: 44, background: 'var(--surface,#fff)', borderRadius: 16, border: '1px solid var(--border,#e5e7eb)' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(20,12,4,.4)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '8vh 16px', zIndex: 1000 },
  modal: { width: '100%', maxWidth: 560, background: 'var(--surface,#fff)', borderRadius: 18, padding: 22, boxShadow: '0 24px 60px rgba(0,0,0,.25)', maxHeight: '84vh', overflowY: 'auto' },
  modalHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  lbl: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted,#6b7280)', marginBottom: 12 },
  input: { padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border,#e5e7eb)', fontSize: 14, background: 'var(--surface,#fff)', color: 'var(--text-main,#111827)', boxSizing: 'border-box', width: '100%' },
  check: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-main,#374151)', marginBottom: 16 },
  modalFoot: { display: 'flex', justifyContent: 'flex-end', gap: 10 },
};
