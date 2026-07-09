import { useEffect, useState } from 'react';
import { getSiteImages, setSiteImage, uploadSiteImage } from '../../apiClient';
import { Upload, Image as ImageIcon } from 'lucide-react';
import RectCropper from '../../components/RectCropper.jsx';
import { FeaturedCards } from './FeaturedContent.jsx';

const card = { background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 12, padding: 14 };

export default function WebsiteImages() {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [crop, setCrop] = useState(null);   // { key, aspect, label }
  const [toast, setToast] = useState('');

  const load = () => { setLoading(true); getSiteImages().then((r) => setSlots(r?.slots || [])).finally(() => setLoading(false)); };
  useEffect(load, []);
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const patch = (key, data) => setSlots((s) => s.map((x) => (x.key === key ? { ...x, ...data } : x)));

  const pick = (slot, e) => {
    const f = e.target.files?.[0]; if (!f) return; e.target.value = '';
    setCrop({ key: slot.key, aspect: slot.aspect || 1, label: `Crop “${slot.label}”` });
    setCrop((c) => ({ ...c, file: f }));
  };
  const onCropped = async (file) => {
    const { key } = crop; setCrop(null); setBusyKey(key);
    const up = await uploadSiteImage(key, file);   // → WebP → Cloudflare R2 → sets the slot
    if (up?.image_url) { patch(key, { image_url: up.image_url, mode: 'manual' }); showToast('Image updated'); }
    else showToast(up?.error || 'Upload failed');
    setBusyKey('');
  };
  const toggleMode = async (slot) => {
    const mode = slot.mode === 'auto' ? 'manual' : 'auto';
    patch(slot.key, { mode });
    await setSiteImage({ key: slot.key, mode }).catch(() => {});
  };
  const clearImage = async (slot) => {
    patch(slot.key, { image_url: '' });
    await setSiteImage({ key: slot.key, image_url: '' }).catch(() => {});
  };

  const groups = {};
  slots.forEach((s) => { (groups[s.group] = groups[s.group] || []).push(s); });

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      {toast && <div style={{ position: 'fixed', top: 70, right: 24, background: 'var(--primary)', color: '#fff', padding: '10px 16px', borderRadius: 8, zIndex: 4000, fontSize: 13, fontWeight: 600 }}>{toast}</div>}
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text-main)' }}>Website Content</h1>
      <p style={{ margin: '4px 0 28px', color: 'var(--text-muted)', fontSize: 14 }}>
        Curate the homepage cards and manage every image slot on tiesverse.com in one place.
      </p>

      <FeaturedCards />

      <div style={{ height: 1, background: 'var(--outline-variant)', margin: '8px 0 28px' }} />

      <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
        <ImageIcon size={18} color="var(--primary)" />
        <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-main)', margin: 0, letterSpacing: '-0.01em' }}>Image slots</h2>
      </div>
      <p style={{ margin: '0 0 22px', color: 'var(--text-muted)', fontSize: 13, maxWidth: 560 }}>
        Upload a replacement (auto-cropped &amp; converted to WebP), or set data-driven slots to Auto. Empty slots use the site's bundled default.
      </p>

      {loading ? <p style={{ color: 'var(--text-muted)' }}>Loading…</p> : Object.entries(groups).map(([group, its]) => (
        <div key={group} style={{ marginBottom: 26 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)', margin: '0 0 12px' }}>{group} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {its.length}</span></h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
            {its.map((slot) => (
              <div key={slot.key} style={card}>
                <div style={{ aspectRatio: String(slot.aspect || 1), borderRadius: 8, overflow: 'hidden', background: 'var(--surface-hover)', display: 'grid', placeItems: 'center', border: '1px solid var(--outline-variant)', marginBottom: 10 }}>
                  {slot.image_url
                    ? <img src={slot.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    : <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, padding: 8 }}><ImageIcon size={20} /><div style={{ marginTop: 4 }}>using default</div></div>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={slot.label}>{slot.label}</div>

                {slot.auto && (
                  <div style={{ display: 'inline-flex', borderRadius: 8, border: '1px solid var(--outline-variant)', overflow: 'hidden', marginBottom: 8 }}>
                    <button onClick={() => slot.mode === 'auto' && toggleMode(slot)} style={{ padding: '4px 10px', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: slot.mode !== 'auto' ? 'var(--primary)' : 'transparent', color: slot.mode !== 'auto' ? '#fff' : 'var(--text-muted)' }}>Manual</button>
                    <button onClick={() => slot.mode !== 'auto' && toggleMode(slot)} style={{ padding: '4px 10px', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: slot.mode === 'auto' ? '#16a34a' : 'transparent', color: slot.mode === 'auto' ? '#fff' : 'var(--text-muted)' }}>Auto (data)</button>
                  </div>
                )}

                {(!slot.auto || slot.mode !== 'auto') && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 8, border: '1px solid var(--outline-variant)', fontSize: 12, fontWeight: 600, cursor: busyKey === slot.key ? 'wait' : 'pointer', color: 'var(--text-main)' }}>
                      <Upload size={13} /> {busyKey === slot.key ? 'Uploading…' : (slot.image_url ? 'Replace' : 'Upload')}
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => pick(slot, e)} disabled={busyKey === slot.key} />
                    </label>
                    {slot.image_url && <button onClick={() => clearImage(slot)} style={{ padding: '5px 11px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'transparent', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Reset</button>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {crop?.file && (
        <RectCropper file={crop.file} aspect={crop.aspect} label={crop.label} onCancel={() => setCrop(null)} onCrop={onCropped} />
      )}
    </div>
  );
}
