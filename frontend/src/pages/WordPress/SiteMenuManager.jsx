import { useState, useEffect, useMemo } from 'react';
import { wpGet, qs, wpMenuGet, wpMenuPost } from './wpApi';
import {
  Plus, Trash2, ChevronUp, ChevronDown, ChevronRight, ChevronLeft,
  Loader2, Save, RefreshCw, Menu as MenuIcon, Link2, AlertTriangle,
} from 'lucide-react';

const field = { padding: '7px 10px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--outline-variant)', color: 'var(--text-main)', fontSize: 13, outline: 'none', fontFamily: 'inherit' };
const btn = (bg, fg) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 8, border: bg ? 'none' : '1px solid var(--outline-variant)', background: bg || 'var(--surface-container-low)', color: fg || 'var(--text-main)', cursor: 'pointer', fontSize: 13, fontWeight: 600 });
const miniBtn = { display: 'grid', placeItems: 'center', width: 26, height: 22, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)', color: 'var(--text-main)', cursor: 'pointer', borderRadius: 6 };
const MAX_DEPTH = 2;

let tempSeq = 1;
const newKey = () => `new-${tempSeq++}`;

// Flatten the WP menu tree (items carry parent + order) into an ordered list with depth.
function buildFlat(items) {
  const byParent = {};
  (items || []).forEach((it) => { (byParent[it.parent || 0] = byParent[it.parent || 0] || []).push(it); });
  Object.values(byParent).forEach((a) => a.sort((x, y) => x.order - y.order));
  const flat = [];
  const walk = (pid, depth) => {
    (byParent[pid] || []).forEach((it) => {
      flat.push({ key: String(it.id), id: it.id, title: it.title, type: it.type, object: it.object, object_id: it.object_id, url: it.url, depth });
      walk(it.id, depth + 1);
    });
  };
  walk(0, 0);
  return flat;
}

// Number of contiguous following rows that are descendants of row i (deeper depth).
function blockSize(rows, i) {
  let n = 1;
  while (i + n < rows.length && rows[i + n].depth > rows[i].depth) n++;
  return n;
}

// Move the row at i (with its subtree) up/down past the neighbouring block.
function moveBlock(rows, i, dir) {
  const size = blockSize(rows, i);
  const block = rows.slice(i, i + size);
  const rest = [...rows.slice(0, i), ...rows.slice(i + size)];
  if (dir < 0) {
    if (i === 0) return rows;
    let prevStart = i - 1;
    while (prevStart > 0 && rows[prevStart].depth > rows[i].depth) prevStart--;
    return [...rest.slice(0, prevStart), ...block, ...rest.slice(prevStart)];
  }
  if (i + size >= rows.length) return rows;
  const nextSize = blockSize(rows, i + size);
  const insertAt = i + nextSize;
  return [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)];
}

// Build the save payload: parent is derived from depth + the last item seen at the shallower depth.
function toPayload(rows) {
  const items = [];
  const lastKeyAtDepth = {};
  rows.forEach((r) => {
    const parent = r.depth > 0 ? (lastKeyAtDepth[r.depth - 1] ?? 0) : 0;
    const idOut = r.id != null ? r.id : r.key;
    const item = { id: idOut, title: r.title, type: r.type, parent };
    if (r.type === 'taxonomy') { item.object = r.object || 'category'; item.object_id = r.object_id; }
    else if (r.type === 'post_type') { item.object = r.object || 'page'; item.object_id = r.object_id; }
    else { item.url = r.url || '#'; }
    items.push(item);
    lastKeyAtDepth[r.depth] = idOut;
    Object.keys(lastKeyAtDepth).forEach((d) => { if (Number(d) > r.depth) delete lastKeyAtDepth[d]; });
  });
  return items;
}

export default function SiteMenuManager() {
  const [menus, setMenus] = useState([]);
  const [menuId, setMenuId] = useState(null);
  const [cats, setCats] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addCat, setAddCat] = useState('');
  const [toast, setToast] = useState(null);
  const showToast = (m, err) => { setToast({ m, err }); setTimeout(() => setToast(null), err ? 6000 : 3000); };

  const catName = useMemo(() => Object.fromEntries(cats.map((c) => [c.id, c.name])), [cats]);

  // Load menus + categories once.
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [{ data: menuList }, { data: catList }] = await Promise.all([
          wpMenuGet('/tiesverse/v1/menus'),
          wpGet(`/categories${qs({ per_page: 100, orderby: 'name', order: 'asc' })}`),
        ]);
        setCats(catList || []);
        const ms = Array.isArray(menuList) ? menuList : [];
        setMenus(ms);
        const primary = ms.find((m) => (m.locations || []).includes('primary')) || ms[0];
        if (primary) setMenuId(primary.id);
        else { setLoading(false); showToast('No menus found. Is the Tiesverse Menu API plugin installed on the blog?', true); }
      } catch (e) {
        setLoading(false);
        showToast(pluginHint(e.message), true);
      }
    })();
  }, []);

  // Load items whenever the selected menu changes.
  const loadItems = async (id) => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await wpMenuGet(`/tiesverse/v1/menu${qs({ menu: id })}`);
      setRows(buildFlat(data?.items || []));
    } catch (e) { showToast(pluginHint(e.message), true); }
    setLoading(false);
  };
  useEffect(() => { if (menuId) loadItems(menuId); }, [menuId]);

  const usedCatIds = new Set(rows.filter((r) => r.type === 'taxonomy').map((r) => r.object_id));

  const setRow = (i, patch) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const move = (i, dir) => setRows((rs) => moveBlock(rs, i, dir));
  const indent = (i, delta) => setRows((rs) => {
    const size = blockSize(rs, i);
    const newDepth = rs[i].depth + delta;
    if (newDepth < 0 || newDepth > MAX_DEPTH) return rs;
    if (delta > 0) { if (i === 0 || newDepth > rs[i - 1].depth + 1) return rs; }
    return rs.map((r, idx) => (idx >= i && idx < i + size ? { ...r, depth: r.depth + delta } : r));
  });
  const removeBlock = (i) => setRows((rs) => { const size = blockSize(rs, i); return [...rs.slice(0, i), ...rs.slice(i + size)]; });

  const addCategory = () => {
    const c = cats.find((x) => String(x.id) === String(addCat));
    if (!c) return;
    setRows((rs) => [...rs, { key: newKey(), id: null, title: c.name, type: 'taxonomy', object: 'category', object_id: c.id, url: '', depth: 0 }]);
    setAddCat('');
  };
  const addHeading = () => setRows((rs) => [...rs, { key: newKey(), id: null, title: 'New heading', type: 'custom', object: 'custom', object_id: 0, url: '#', depth: 0 }]);

  const save = async () => {
    if (!menuId) return;
    // guard: every non-top row must have a valid parent above it
    setSaving(true);
    try {
      await wpMenuPost(`/tiesverse/v1/menu${qs({ menu: menuId })}`, { items: toPayload(rows) });
      showToast('Blog navigation saved. Live within a moment.');
      loadItems(menuId);
    } catch (e) { showToast(pluginHint(e.message), true); }
    setSaving(false);
  };

  const linkLabel = (r) => {
    if (r.type === 'taxonomy') return catName[r.object_id] ? `Category: ${catName[r.object_id]}` : `Category #${r.object_id}`;
    if (r.type === 'post_type') return `Page${r.url ? ` · ${r.url.replace(/^https?:\/\/[^/]+/, '') || '/'}` : ''}`;
    return r.url && r.url !== '#' ? `Link: ${r.url}` : 'Heading (no link)';
  };

  return (
    <div style={{ padding: '26px 24px', maxWidth: 980 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 21, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 10 }}><MenuIcon size={20} /> Blog Navigation</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => loadItems(menuId)} disabled={loading || saving} style={btn()}><RefreshCw size={15} /> Reload</button>
          <button onClick={save} disabled={saving || loading || !menuId} style={btn('var(--primary)', '#fff')}>{saving ? <Loader2 size={15} className="ma-spin" /> : <Save size={15} />} Save & publish</button>
        </div>
      </div>
      <p style={{ margin: '0 0 18px', color: 'var(--text-muted)', fontSize: 13.5 }}>
        Manage the navigation bar on <strong>ties.tiesverse.com</strong> (the blog). Reorder, rename, re-point categories, add or remove items, then <strong>Save &amp; publish</strong>. Changes go live on the blog.
      </p>

      {menus.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Menu:</span>
          <select value={menuId || ''} onChange={(e) => setMenuId(Number(e.target.value))} style={{ ...field, minWidth: 220 }}>
            {menus.map((m) => <option key={m.id} value={m.id}>{m.name}{m.locations?.length ? ` (${m.locations.join(', ')})` : ''}</option>)}
          </select>
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-muted)', padding: 20, display: 'flex', gap: 8 }}><Loader2 size={18} className="ma-spin" /> Loading…</div>
      ) : (
        <>
          <div style={{ background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 12, padding: 14 }}>
            {rows.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 8 }}>This menu is empty. Add a category or heading below.</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {rows.map((r, i) => (
                  <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--surface)', border: '1px solid var(--outline-variant)', borderRadius: 9, marginLeft: r.depth * 26 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <input value={r.title} onChange={(e) => setRow(i, { title: e.target.value })} placeholder="Label shown in the menu" style={{ ...field, width: '100%', boxSizing: 'border-box' }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                        {r.type === 'taxonomy' ? (
                          <select value={r.object_id} onChange={(e) => setRow(i, { object_id: Number(e.target.value), object: 'category' })} style={{ ...field, padding: '4px 8px', fontSize: 12 }}>
                            {!catName[r.object_id] && <option value={r.object_id}>Category #{r.object_id}</option>}
                            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}{c.count ? ` (${c.count})` : ''}</option>)}
                          </select>
                        ) : (
                          <span style={{ fontSize: 11.5, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Link2 size={12} /> {linkLabel(r)}</span>
                        )}
                        {r.depth > 0 && <span style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>submenu</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }} title="Reorder">
                      <button onClick={() => move(i, -1)} disabled={i === 0} style={{ ...miniBtn, opacity: i === 0 ? 0.35 : 1 }}><ChevronUp size={14} /></button>
                      <button onClick={() => move(i, 1)} style={miniBtn}><ChevronDown size={14} /></button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }} title="Make submenu / promote">
                      <button onClick={() => indent(i, 1)} disabled={i === 0 || r.depth >= MAX_DEPTH} style={{ ...miniBtn, opacity: (i === 0 || r.depth >= MAX_DEPTH) ? 0.35 : 1 }}><ChevronRight size={14} /></button>
                      <button onClick={() => indent(i, -1)} disabled={r.depth === 0} style={{ ...miniBtn, opacity: r.depth === 0 ? 0.35 : 1 }}><ChevronLeft size={14} /></button>
                    </div>
                    <button onClick={() => removeBlock(i)} title="Remove (and its submenu)" style={{ ...miniBtn, color: '#dc2626', height: 30 }}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <select value={addCat} onChange={(e) => setAddCat(e.target.value)} style={{ ...field, minWidth: 220 }}>
              <option value="">Add a category…</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}{c.count ? ` (${c.count})` : ''}{usedCatIds.has(c.id) ? ' • already used' : ''}</option>)}
            </select>
            <button onClick={addCategory} disabled={!addCat} style={btn()}><Plus size={14} /> Add category</button>
            <button onClick={addHeading} style={btn()}><Plus size={14} /> Add heading</button>
          </div>
          <p style={{ margin: '14px 2px 0', color: 'var(--text-muted)', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={13} /> Use ▸ to turn an item into a submenu of the one above it, and ◂ to promote it back. Reordering carries a heading’s submenu items with it.
          </p>
        </>
      )}

      {toast && <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', maxWidth: 520, background: toast.err ? '#dc2626' : '#16a34a', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13.5, zIndex: 1000, textAlign: 'center' }}>{toast.m}</div>}
    </div>
  );
}

// Turn a raw error into a helpful hint about the missing plugin / blocked write.
function pluginHint(msg = '') {
  if (/no route|rest_no_route|404/i.test(msg)) return 'Menu endpoint not found — the Tiesverse Menu API plugin isn’t installed on the blog yet.';
  if (/expired|nonce|403/i.test(msg)) return 'The blog blocked the write. Make sure the latest Tiesverse Menu API plugin file is installed.';
  return msg || 'Something went wrong.';
}
