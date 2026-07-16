import { useEffect, useState } from 'react';
import { getBrands, createBrand, updateBrand, deleteBrand, uploadImage } from '../../apiClient';
import { Plus, Trash2, Edit2, Upload, X } from 'lucide-react';
import RectCropper from '../../components/RectCropper.jsx';

const EMPTY = { name: '', description: '', image_url: '', url: '/', domain: '', color: '#FE7A00', order: 0, is_active: true };

const card = { background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 12, padding: 16 };
const input = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface)', color: 'var(--text-main)', fontSize: 14, fontFamily: 'inherit', outline: 'none' };
const label = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 };
const btn = (bg, fg) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, border: bg ? 'none' : '1px solid var(--outline-variant)', background: bg || 'transparent', color: fg || 'var(--text-main)', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' });

export default function Brands() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);   // 'new' | item object | null
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState('');
  const [cropFile, setCropFile] = useState(null);

  const load = () => { setLoading(true); getBrands().then((r) => setItems(Array.isArray(r) ? r : [])).finally(() => setLoading(false)); };
  useEffect(load, []);

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 3000); };
  const openNew = () => { setForm({ ...EMPTY, order: items.length }); setModal('new'); };
  const openEdit = (it) => { setForm({ ...it }); setModal(it); };

  const pickImage = (e) => {
    const f = e.target.files?.[0]; if (!f) return; e.target.value = '';
    setCropFile(f);
  };
  const onCropped = async (croppedFile) => {
    setCropFile(null);
    setUploading(true);
    const res = await uploadImage(croppedFile);
    if (res?.secure_url) setForm((fm) => ({ ...fm, image_url: res.secure_url }));
    else showToast(res?.error || 'Image upload failed');
    setUploading(false);
  };

  const save = async () => {
    if (!form.name.trim()) return showToast('Name is required');
    setSaving(true);
    const payload = { ...form, order: Number(form.order) || 0 };
    const res = modal === 'new' ? await createBrand(payload) : await updateBrand(modal.id, payload);
    setSaving(false);
    if (res?.id) { setModal(null); load(); showToast('Saved'); } else showToast(res?.error || 'Save failed');
  };
  const remove = async (id) => { if (!window.confirm('Delete this brand?')) return; await deleteBrand(id); load(); };

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      {toast && <div style={{ position: 'fixed', top: 70, right: 24, background: 'var(--primary)', color: '#fff', padding: '10px 16px', borderRadius: 8, zIndex: 1000, fontSize: 13, fontWeight: 600 }}>{toast}</div>}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text-main)' }}>Brands / Mastheads</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>The "One house, N mastheads" list on the website home page.</p>
        </div>
        <button onClick={openNew} style={btn('var(--primary)', '#fff')}><Plus size={16} /> Add brand</button>
      </div>

      {loading ? <p style={{ color: 'var(--text-muted)' }}>Loading…</p> : items.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>No brands yet. Click <strong>Add brand</strong>.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {items.map((it) => (
            <div key={it.id} style={card}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', background: 'var(--surface-hover)', flexShrink: 0, display: 'grid', placeItems: 'center', border: '1px solid var(--outline-variant)' }}>
                  {it.image_url ? <img src={it.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Upload size={18} style={{ color: 'var(--text-muted)' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <strong style={{ color: 'var(--text-main)', fontSize: 15 }}>{it.name}</strong>
                    {!it.is_active && <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 700 }}>HIDDEN</span>}
                  </div>
                  {it.domain && <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>{it.domain}</div>}
                  <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '4px 0 0', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{it.description}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                <button onClick={() => openEdit(it)} style={{ ...btn(), padding: '5px 12px', fontSize: 12 }}><Edit2 size={13} /> Edit</button>
                <button onClick={() => remove(it.id)} style={{ ...btn(), padding: '5px 12px', fontSize: 12, color: '#dc2626' }}><Trash2 size={13} /> Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 999, display: 'grid', placeItems: 'center', padding: 16 }} onClick={() => setModal(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface-container-low)', borderRadius: 14, padding: 24, width: 'min(520px, 96vw)', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--outline-variant)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-main)' }}>{modal === 'new' ? 'Add brand' : 'Edit brand'}</h3>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', background: 'var(--surface-hover)', flexShrink: 0, display: 'grid', placeItems: 'center', border: '1px solid var(--outline-variant)' }}>
                  {form.image_url ? <img src={form.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Upload size={22} style={{ color: 'var(--text-muted)' }} />}
                </div>
                <label style={{ ...btn(), cursor: uploading ? 'wait' : 'pointer' }}>
                  <Upload size={14} /> {uploading ? 'Uploading…' : (form.image_url ? 'Change logo' : 'Upload logo')}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={pickImage} disabled={uploading} />
                </label>
              </div>
              <div><label style={label}>Name *</label><input style={input} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Foreign Policy India" /></div>
              <div><label style={label}>Description</label><textarea rows={3} style={{ ...input, resize: 'vertical' }} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Short blurb shown next to the brand" /></div>
              <div><label style={label}>URL</label><input style={input} value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://… or /path" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12 }}>
                <div><label style={label}>Domain tag</label><input style={input} value={form.domain} onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))} placeholder="e.g. Geopolitics" /></div>
                <div><label style={label}>Accent</label>
                  <input type="color" value={form.color || '#FE7A00'} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} style={{ width: 52, height: 40, padding: 2, borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface)', cursor: 'pointer' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
                <div><label style={label}>Order</label><input type="number" style={input} value={form.order} onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))} /></div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--text-main)', cursor: 'pointer', paddingBottom: 8 }}>
                  <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} /> Show on website
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button onClick={() => setModal(null)} style={btn()}>Cancel</button>
              <button onClick={save} disabled={saving || uploading} style={btn('var(--primary)', '#fff')}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {cropFile && (
        <RectCropper
          file={cropFile}
          aspect={1}
          label="Crop logo (square)"
          onCancel={() => setCropFile(null)}
          onCrop={onCropped}
        />
      )}
    </div>
  );
}
