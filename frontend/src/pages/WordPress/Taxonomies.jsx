import { useState, useEffect } from 'react';
import { wpGet, wpCreate, wpUpdate, wpDelete, qs } from './wpApi';
import { Plus, Edit2, Trash2, Loader2, X, Check } from 'lucide-react';

const field = { width: '100%', padding: '9px 12px', borderRadius: 8, background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', color: 'var(--text-main)', fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' };

function Tax({ endpoint, label }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);   // { id?, name, description }
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (m, err) => { setToast({ m, err }); setTimeout(() => setToast(null), 2600); };

  const load = async () => {
    setLoading(true);
    try { const { data } = await wpGet(`/${endpoint}${qs({ per_page: 100, orderby: 'count', order: 'desc' })}`); setItems(data || []); }
    catch (e) { showToast(e.message, true); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const save = async () => {
    setBusy(true);
    try {
      const body = { name: form.name, description: form.description || '' };
      if (form.id) await wpUpdate(`/${endpoint}/${form.id}`, body);
      else await wpCreate(`/${endpoint}`, body);
      showToast('Saved.'); setForm(null); load();
    } catch (e) { showToast(e.message, true); }
    setBusy(false);
  };
  const remove = async (it) => {
    if (!window.confirm(`Delete "${it.name}"? Posts keep their content but lose this ${label.toLowerCase()}.`)) return;
    try { await wpDelete(`/${endpoint}/${it.id}${qs({ force: true })}`); showToast('Deleted.'); load(); }
    catch (e) { showToast(e.message, true); }
  };

  return (
    <div style={{ background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 15.5, color: 'var(--text-main)' }}>{label} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({items.length})</span></h2>
        <button onClick={() => setForm({ name: '', description: '' })} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}><Plus size={14} /> New</button>
      </div>
      {loading ? <div style={{ color: 'var(--text-muted)', padding: 14 }}><Loader2 size={16} className="ma-spin" /></div> : (
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          {items.map(it => (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 6px', borderBottom: '1px solid var(--outline-variant)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'var(--text-main)', fontSize: 13.5, fontWeight: 600 }}>{it.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>{it.count} post{it.count === 1 ? '' : 's'}</div>
              </div>
              <button onClick={() => setForm({ id: it.id, name: it.name, description: it.description })} style={iconBtn}><Edit2 size={13} /></button>
              <button onClick={() => remove(it)} style={{ ...iconBtn, color: '#dc2626' }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 900, display: 'grid', placeItems: 'center', padding: 16 }} onClick={() => setForm(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 12, width: '100%', maxWidth: 420, border: '1px solid var(--outline-variant)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--outline-variant)' }}>
              <h3 style={{ margin: 0, fontSize: 15, color: 'var(--text-main)' }}>{form.id ? 'Edit' : 'New'} {label.replace(/(ies|s)$/, m => m === 'ies' ? 'y' : '')}</h3>
              <button onClick={() => setForm(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div><label style={lbl}>Name</label><input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={field} /></div>
              <div><label style={lbl}>Description (optional)</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} style={{ ...field, resize: 'vertical' }} /></div>
            </div>
            <div style={{ display: 'flex', gap: 10, padding: '14px 18px', borderTop: '1px solid var(--outline-variant)', justifyContent: 'flex-end' }}>
              <button onClick={() => setForm(null)} style={iconBtnWide}>Cancel</button>
              <button onClick={save} disabled={busy || !form.name.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: (busy || !form.name.trim()) ? 0.6 : 1 }}>{busy ? <Loader2 size={14} className="ma-spin" /> : <Check size={14} />} Save</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', background: toast.err ? '#dc2626' : '#16a34a', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13.5, zIndex: 1000 }}>{toast.m}</div>}
    </div>
  );
}
const iconBtn = { display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 7, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)', color: 'var(--text-main)', cursor: 'pointer' };
const iconBtnWide = { padding: '8px 14px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)', color: 'var(--text-main)', cursor: 'pointer', fontSize: 13 };
const lbl = { fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 6 };

export default function Taxonomies() {
  return (
    <div style={{ padding: '26px 24px' }}>
      <h1 style={{ margin: '0 0 18px', fontSize: 21, color: 'var(--text-main)' }}>Categories &amp; Tags</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <Tax endpoint="categories" label="Categories" />
        <Tax endpoint="tags" label="Tags" />
      </div>
    </div>
  );
}
