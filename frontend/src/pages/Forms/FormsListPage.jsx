import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileSpreadsheet, Plus, Pencil, Trash2, BarChart3, Link2, Globe, Lock, Copy, Check,
} from 'lucide-react';
import { getForms, createForm, deleteForm } from '../../apiClient';
import { blankForm, PUBLIC_FORMS_ORIGIN } from './formConfig';
import { useMe } from '../../context/MeContext';

export default function FormsListPage() {
  const { scope } = useMe();
  const navigate = useNavigate();
  const canManage = scope === 'all';

  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getForms().catch(() => []);
    setForms(Array.isArray(res) ? res : (res?.results || []));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setCreating(true);
    const res = await createForm(blankForm()).catch(() => ({ error: 'Failed' }));
    setCreating(false);
    if (res?.id) navigate(`/hr/forms/${res.id}/edit`);
    else alert(res?.error || 'Could not create the form.');
  };

  const remove = async (f) => {
    if (!window.confirm(`Delete "${f.title}" and all its responses? This cannot be undone.`)) return;
    await deleteForm(f.id).catch(() => {});
    load();
  };

  const shareLink = (f) => {
    return f.visibility === 'public' ? `${PUBLIC_FORMS_ORIGIN}/f/${f.token}` : `${window.location.origin}/forms/${f.id}`;
  };
  const copyLink = (f) => {
    navigator.clipboard?.writeText(shareLink(f));
    setCopiedId(f.id);
    setTimeout(() => setCopiedId(null), 1600);
    if (!f.is_published) {
      alert('Heads up: “' + (f.title || 'This form') + '” is still a Draft, so the link won’t open until you Publish it. Open the form and flip the Draft toggle to Published.');
    }
  };

  if (!canManage) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted,#9ca3af)' }}>
      Forms are managed by HR &amp; Advisory.
    </div>;
  }

  const q = query.trim().toLowerCase();
  const shown = forms.filter(f => !q || (f.title || '').toLowerCase().includes(q));

  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <div>
          <h1 style={S.title}>
            <FileSpreadsheet size={22} style={{ verticalAlign: -4, marginRight: 8, color: '#fe7a00' }} />Forms
          </h1>
          <p style={S.sub}>Build custom forms &amp; surveys — share internally or by public link, and collect responses.</p>
        </div>
        <button style={S.primary} disabled={creating} onClick={create}>
          <Plus size={15} style={{ verticalAlign: -3, marginRight: 6 }} />{creating ? 'Creating…' : 'New form'}
        </button>
      </div>

      <input style={S.search} placeholder="Search forms…" value={query} onChange={e => setQuery(e.target.value)} />

      {loading ? <div style={S.muted}>Loading…</div>
        : shown.length === 0 ? (
          <div style={S.empty}>
            {q ? 'No forms match your search.' : 'No forms yet — create your first one.'}
          </div>
        ) : (
          <div style={S.grid}>
            {shown.map(f => {
              const accent = f.theme?.accent || '#fe7a00';
              const count = f.response_count || 0;
              const fieldCount = Array.isArray(f.schema) ? f.schema.length : 0;
              const pages = f.settings?.multi_page ? (f.settings.pages || []).length : 1;
              return (
                <div key={f.id} className="form-card" style={S.card}>
                  <div style={{ ...S.accentBar, background: accent }} />
                  <div style={S.cardInner}>
                    <div style={S.cardTop}>
                      <span style={{ ...S.badge, ...(f.is_published ? S.live : S.draft) }}>
                        {f.is_published ? 'Published' : 'Draft'}
                      </span>
                      <span style={S.badgeSoft}>
                        {f.visibility === 'public'
                          ? <><Globe size={11} style={{ verticalAlign: -1, marginRight: 4 }} />Public</>
                          : <><Lock size={11} style={{ verticalAlign: -1, marginRight: 4 }} />Internal</>}
                      </span>
                    </div>

                    <div style={S.cardTitle} onClick={() => navigate(`/hr/forms/${f.id}/edit`)} title={f.title}>
                      {f.title || 'Untitled form'}
                    </div>

                    <div style={S.statRow}>
                      <span style={S.stat}><strong style={{ color: accent }}>{count}</strong> response{count === 1 ? '' : 's'}</span>
                      <span style={S.dot}>·</span>
                      <span style={S.stat}>{fieldCount} field{fieldCount === 1 ? '' : 's'}</span>
                      {pages > 1 && <><span style={S.dot}>·</span><span style={S.stat}>{pages} pages</span></>}
                    </div>
                    {f.updated_at && <div style={S.updated}>Updated {new Date(f.updated_at).toLocaleDateString()}</div>}

                    <div style={S.divider} />

                    <div style={S.actions}>
                      <button className="fc-act" style={S.act} onClick={() => navigate(`/hr/forms/${f.id}/edit`)}><Pencil size={14} />Edit</button>
                      <button className="fc-act" style={S.act} onClick={() => navigate(`/hr/forms/${f.id}/responses`)}><BarChart3 size={14} />Responses</button>
                      <button className="fc-act" style={S.act} title="Copy share link" onClick={() => copyLink(f)}>
                        {copiedId === f.id ? <><Check size={14} color="#10b981" />Copied</> : <><Link2 size={14} />Share</>}
                      </button>
                      <button className="fc-act" style={{ ...S.actIcon, marginLeft: 'auto' }} title="Delete" onClick={() => remove(f)}><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      <style>{`
        .form-card { transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease; }
        .form-card:hover { transform: translateY(-3px); box-shadow: 0 18px 40px -20px rgba(0,0,0,.28); border-color: rgba(254,122,0,.35); }
        .form-card .fc-act:hover { background: var(--surface-hover,#f3f4f6); }
      `}</style>
    </div>
  );
}

const S = {
  wrap: { padding: 24, maxWidth: 1040, margin: '0 auto' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: 800, margin: 0, color: 'var(--text-main,#111827)' },
  sub: { color: 'var(--text-muted,#6b7280)', fontSize: 14, marginTop: 4, maxWidth: 560 },
  search: { width: '100%', padding: '11px 16px', borderRadius: 999, border: '1px solid var(--border,#e5e7eb)', background: 'var(--surface,#fff)', fontSize: 14, marginBottom: 18, boxSizing: 'border-box' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 18 },
  card: { background: 'var(--surface,#fff)', border: '1px solid var(--border,#e5e7eb)', borderRadius: 18, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  accentBar: { height: 5, width: '100%', flex: 'none' },
  cardInner: { padding: '18px 20px 16px', display: 'flex', flexDirection: 'column', gap: 10 },
  cardTop: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cardTitle: { fontSize: 18, fontWeight: 800, color: 'var(--text-main,#111827)', cursor: 'pointer', lineHeight: 1.25, letterSpacing: '-.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  statRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-main,#4b5563)', flexWrap: 'wrap' },
  stat: { display: 'inline-flex', alignItems: 'baseline', gap: 4 },
  dot: { color: 'var(--text-muted,#cbd0d8)' },
  updated: { fontSize: 12, color: 'var(--text-muted,#9ca3af)', marginTop: -4 },
  divider: { height: 1, background: 'var(--border,#eef0f3)', margin: '4px 0 2px' },
  actions: { display: 'flex', alignItems: 'center', gap: 6 },
  act: { display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid var(--border,#e5e7eb)', background: 'transparent', color: 'var(--text-main,#374151)', borderRadius: 9, padding: '7px 11px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' },
  actIcon: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border,#e5e7eb)', background: 'transparent', color: '#ef4444', borderRadius: 9, padding: 7, cursor: 'pointer' },
  badge: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', padding: '4px 10px', borderRadius: 999 },
  badgeSoft: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted,#6b7280)', background: 'var(--surface-hover,#f3f4f6)', padding: '4px 10px', borderRadius: 999 },
  live: { color: '#047857', background: '#d1fae5' },
  draft: { color: '#b45309', background: '#fef3c7' },
  primary: { padding: '9px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(180deg,#ff9a3d,#fe7a00 58%,#ef6f00)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, flex: 'none' },
  muted: { color: 'var(--text-muted,#9ca3af)' },
  empty: { textAlign: 'center', color: 'var(--text-muted,#9ca3af)', padding: 44, background: 'var(--surface,#fff)', borderRadius: 16, border: '1px solid var(--border,#e5e7eb)' },
};
