import { useState, useEffect } from 'react';
import { wpGet, qs } from './wpApi';
import { getNavCategories, createNavCategory, updateNavCategory, deleteNavCategory } from '../../apiClient';
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2, Save, GripVertical, Globe } from 'lucide-react';

const field = { padding: '8px 11px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--outline-variant)', color: 'var(--text-main)', fontSize: 13.5, outline: 'none', fontFamily: 'inherit' };
const btn = (bg, fg) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 8, border: bg ? 'none' : '1px solid var(--outline-variant)', background: bg || 'var(--surface-container-low)', color: fg || 'var(--text-main)', cursor: 'pointer', fontSize: 13, fontWeight: 600 });

export default function SiteNavManager() {
  const [wpCats, setWpCats] = useState([]);
  const [nav, setNav] = useState([]);            // ordered list in the nav
  const [origIds, setOrigIds] = useState([]);    // SiteNavCategory ids present at load (to detect deletions)
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (m, err) => { setToast({ m, err }); setTimeout(() => setToast(null), 3000); };

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: cats }, saved] = await Promise.all([
        wpGet(`/categories${qs({ per_page: 100, orderby: 'count', order: 'desc' })}`),
        getNavCategories(),
      ]);
      setWpCats(cats || []);
      const rows = Array.isArray(saved) ? saved : (saved?.results || []);
      const ordered = rows.slice().sort((a, b) => a.order - b.order)
        .map(r => ({ id: r.id, wp_slug: r.wp_slug, wp_category_id: r.wp_category_id, label: r.label }));
      setNav(ordered);
      setOrigIds(ordered.map(r => r.id));
    } catch (e) { showToast(e.message, true); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const inNav = new Set(nav.map(n => n.wp_slug));
  const available = wpCats.filter(c => !inNav.has(c.slug));

  const add = (c) => setNav(n => [...n, { wp_slug: c.slug, wp_category_id: c.id, label: c.name }]);
  const removeAt = (i) => setNav(n => n.filter((_, idx) => idx !== i));
  const move = (i, dir) => setNav(n => { const a = [...n]; const j = i + dir; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const setLabel = (i, v) => setNav(n => n.map((x, idx) => idx === i ? { ...x, label: v } : x));

  const save = async () => {
    setSaving(true);
    try {
      // deletions: ids that were loaded but are no longer in nav
      const currentIds = new Set(nav.filter(x => x.id).map(x => x.id));
      const toDelete = origIds.filter(id => !currentIds.has(id));
      await Promise.all(toDelete.map(id => deleteNavCategory(id)));
      // create/update with order = index
      for (let i = 0; i < nav.length; i++) {
        const item = nav[i];
        const body = { wp_slug: item.wp_slug, wp_category_id: item.wp_category_id, label: item.label || item.wp_slug, order: i, is_active: true };
        if (item.id) await updateNavCategory(item.id, body);
        else await createNavCategory(body);
      }
      showToast('Website navigation saved.');
      load();
    } catch (e) { showToast(e.message, true); }
    setSaving(false);
  };

  return (
    <div style={{ padding: '26px 24px', maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 21, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 10 }}><Globe size={20} /> Website Navigation</h1>
        <button onClick={save} disabled={saving || loading} style={btn('var(--primary)', '#fff')}>{saving ? <Loader2 size={15} className="ma-spin" /> : <Save size={15} />} Save</button>
      </div>
      <p style={{ margin: '0 0 20px', color: 'var(--text-muted)', fontSize: 13.5 }}>
        Choose which WordPress categories appear in the <strong>tiesverse.com</strong> Insights nav, set their order and a friendly label. The website updates automatically.
      </p>

      {loading ? <div style={{ color: 'var(--text-muted)', padding: 20, display: 'flex', gap: 8 }}><Loader2 size={18} className="ma-spin" /> Loading…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
          {/* In the nav */}
          <div style={{ background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 12, padding: 16 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 15, color: 'var(--text-main)' }}>In the navigation ({nav.length})</h2>
            {nav.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nothing yet — add categories from the right.</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {nav.map((item, i) => (
                  <div key={item.wp_slug} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px 8px 6px', background: 'var(--surface)', border: '1px solid var(--outline-variant)', borderRadius: 9 }}>
                    <GripVertical size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <input value={item.label} onChange={e => setLabel(i, e.target.value)} style={{ ...field, width: '100%', boxSizing: 'border-box', padding: '6px 9px' }} />
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, paddingLeft: 2 }}>WP: {item.wp_slug}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <button onClick={() => move(i, -1)} disabled={i === 0} style={{ ...miniBtn, opacity: i === 0 ? 0.35 : 1 }}><ChevronUp size={14} /></button>
                      <button onClick={() => move(i, 1)} disabled={i === nav.length - 1} style={{ ...miniBtn, opacity: i === nav.length - 1 ? 0.35 : 1 }}><ChevronDown size={14} /></button>
                    </div>
                    <button onClick={() => removeAt(i)} style={{ ...miniBtn, color: '#dc2626', height: 30 }}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Available WP categories */}
          <div style={{ background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 12, padding: 16 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 15, color: 'var(--text-main)' }}>Available WordPress categories</h2>
            {available.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>All categories are in the nav.</p> : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {available.map(c => (
                  <button key={c.id} onClick={() => add(c)} style={{ ...btn(), padding: '6px 11px', fontSize: 12.5 }}>
                    <Plus size={13} /> {c.name} <span style={{ color: 'var(--text-muted)' }}>({c.count})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {toast && <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', background: toast.err ? '#dc2626' : '#16a34a', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13.5, zIndex: 1000 }}>{toast.m}</div>}
    </div>
  );
}
const miniBtn = { display: 'grid', placeItems: 'center', width: 26, height: 22, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)', color: 'var(--text-main)', cursor: 'pointer', borderRadius: 6 };
