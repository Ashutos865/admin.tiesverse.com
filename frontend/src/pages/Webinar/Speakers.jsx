import './WebinarsWorkshops.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Edit2, Mic2, Plus, Star, Trash2, Upload, X } from 'lucide-react';
import {
  getEventSpeakers, createEventSpeaker, updateEventSpeaker,
  deleteEventSpeaker, uploadImage,
} from '../../apiClient';

const EMPTY = { name: '', role: '', org: '', photo_url: '', quote: '', featured: false };

const Speakers = () => {
  const [speakers, setSpeakers] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(null);   // null | { mode, speaker? }
  const [form, setForm]         = useState({ ...EMPTY });
  const [saving, setSaving]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast]       = useState({ msg: '', type: '' });
  const [search, setSearch]     = useState('');
  const fileRef = useRef(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    window.setTimeout(() => setToast({ msg: '', type: '' }), 3200);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getEventSpeakers();
    setSpeakers(Array.isArray(res) ? res : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setForm({ ...EMPTY }); setModal({ mode: 'create' }); };
  const openEdit   = (s) => { setForm({ ...s });     setModal({ mode: 'edit', speaker: s }); };

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const res = await uploadImage(file);
    if (res?.secure_url) setForm(f => ({ ...f, photo_url: res.secure_url }));
    else showToast(res?.error || 'Upload failed', 'error');
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const save = async () => {
    if (!form.name.trim() || !form.role.trim()) {
      return showToast('Name and Role are required.', 'error');
    }
    setSaving(true);
    let res;
    if (modal.mode === 'create') {
      res = await createEventSpeaker(form);
    } else {
      res = await updateEventSpeaker(modal.speaker.id, form);
    }
    if (res?.id) {
      setModal(null);
      load();
      showToast(modal.mode === 'create'
        ? `"${res.name}" added — now live on the website.`
        : 'Speaker updated.');
    } else {
      showToast(res?.error || 'Save failed.', 'error');
    }
    setSaving(false);
  };

  const confirmDelete = async () => {
    await deleteEventSpeaker(deleteTarget.id);
    setDeleteTarget(null);
    load();
    showToast('Speaker removed.');
  };

  const toggleFeatured = async (s) => {
    await updateEventSpeaker(s.id, { ...s, featured: !s.featured });
    load();
  };

  const visible = speakers.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.org || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.role || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Toast */}
      {toast.msg && (
        <div className={`ww-toast ${toast.type === 'error' ? 'ww-toast-error' : 'ww-toast-ok'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="ww-page-header">
        <div>
          <h2>Guest Speakers</h2>
          <p>Manage event speakers and guests. They appear live on the website via Supabase sync.</p>
        </div>
        <button className="ww-btn ww-btn-primary" onClick={openCreate}>
          <Plus size={15}/> Add Speaker
        </button>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 18 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, organization, or role…"
          style={{
            width: '100%', maxWidth: 400, padding: '9px 14px',
            border: '1px solid var(--outline-variant)', borderRadius: 9,
            background: 'var(--surface-container-low)', color: 'var(--text-main)',
            fontSize: 13, outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Grid */}
      {loading ? (
        <p className="ww-loading">Loading speakers…</p>
      ) : visible.length === 0 ? (
        <div className="ww-empty">
          <Mic2 size={44} strokeWidth={1.2}/>
          <p>{search ? 'No speakers match your search.' : 'No speakers yet. Add your first guest speaker.'}</p>
        </div>
      ) : (
        <div className="spk-grid">
          {visible.map(s => (
            <div key={s.id} className="spk-card">
              <div className="spk-photo-wrap">
                {s.photo_url
                  ? <img src={s.photo_url} alt={s.name} className="spk-photo" />
                  : <div className="spk-initials">{s.name?.[0]?.toUpperCase()}</div>
                }
                <button
                  className={`spk-star ${s.featured ? 'is-featured' : ''}`}
                  onClick={() => toggleFeatured(s)}
                  title={s.featured ? 'Remove from featured' : 'Feature on homepage'}
                >
                  <Star size={14} fill={s.featured ? 'currentColor' : 'none'}/>
                </button>
              </div>
              <div className="spk-body">
                <h3 className="spk-name">{s.name}</h3>
                <p className="spk-role">{s.role}{s.org ? ` · ${s.org}` : ''}</p>
                {s.quote && <p className="spk-quote">"{s.quote}"</p>}
              </div>
              <div className="spk-actions">
                <button onClick={() => openEdit(s)} title="Edit"><Edit2 size={14}/></button>
                <button onClick={() => setDeleteTarget(s)} title="Delete" className="ww-btn-danger-icon">
                  <Trash2 size={14}/>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats bar */}
      {speakers.length > 0 && (
        <div className="spk-stats">
          <span>{speakers.length} total</span>
          <span>·</span>
          <span>{speakers.filter(s => s.featured).length} featured</span>
        </div>
      )}

      {/* Create / Edit modal */}
      {modal && (
        <div className="ww-overlay" onClick={() => setModal(null)}>
          <div className="ww-modal" onClick={e => e.stopPropagation()}>
            <div className="ww-modal-head">
              <h3>{modal.mode === 'create' ? 'Add Guest Speaker' : 'Edit Speaker'}</h3>
              <button onClick={() => setModal(null)}><X size={18}/></button>
            </div>
            <div className="ww-modal-body">
              {/* Photo */}
              <div className="spk-upload-row">
                {form.photo_url
                  ? <img src={form.photo_url} alt="preview" className="spk-upload-preview" />
                  : <div className="spk-upload-placeholder"><Mic2 size={32}/></div>
                }
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button className="ww-btn ww-btn-ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    <Upload size={14}/> {uploading ? 'Uploading…' : 'Upload Photo'}
                  </button>
                  {form.photo_url && (
                    <button className="ww-btn-danger-sm" onClick={() => setForm(f => ({...f, photo_url: ''}))}>
                      <X size={12}/> Remove
                    </button>
                  )}
                  <small style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>JPG, PNG, WebP · max 5 MB</small>
                </div>
                <input type="file" ref={fileRef} accept="image/*" style={{ display: 'none' }} onChange={pickPhoto} />
              </div>

              <div className="ww-two-col">
                <label>Name <span>*</span>
                  <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Full name" />
                </label>
                <label>Title / Role <span>*</span>
                  <input value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))} placeholder="e.g. Founder, CEO" />
                </label>
              </div>
              <label>Organization
                <input value={form.org} onChange={e => setForm(f => ({...f, org: e.target.value}))} placeholder="Company or institution" />
              </label>
              <label>Bio / Quote
                <textarea rows={3} value={form.quote} onChange={e => setForm(f => ({...f, quote: e.target.value}))} placeholder="Short bio or memorable quote" />
              </label>
              <label className="ww-checkbox-label">
                <input type="checkbox" checked={form.featured} onChange={e => setForm(f => ({...f, featured: e.target.checked}))} />
                Feature this speaker on the homepage
              </label>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                Saving this speaker syncs to Supabase instantly — they appear live on the Tiesverse website.
              </p>
            </div>
            <div className="ww-modal-foot">
              <button className="ww-btn ww-btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="ww-btn ww-btn-primary" onClick={save} disabled={saving || uploading}>
                {saving ? 'Saving…' : modal.mode === 'create' ? 'Add to Website' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="ww-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="ww-modal ww-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="ww-modal-head">
              <h3>Remove "{deleteTarget.name}"?</h3>
              <button onClick={() => setDeleteTarget(null)}><X size={18}/></button>
            </div>
            <div className="ww-modal-body">
              <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: 0 }}>
                This will remove the speaker from both the admin and the live Tiesverse website.
              </p>
            </div>
            <div className="ww-modal-foot">
              <button className="ww-btn ww-btn-ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="ww-btn ww-btn-danger" onClick={confirmDelete}>Remove</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .spk-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 14px;
          margin-bottom: 16px;
        }
        .spk-card {
          position: relative;
          border: 1px solid var(--outline-variant);
          border-radius: 14px;
          background: var(--surface-container-lowest);
          padding: 18px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 12px;
          transition: border-color 160ms, box-shadow 160ms;
        }
        .spk-card:hover {
          border-color: var(--primary);
          box-shadow: 0 4px 18px color-mix(in srgb, var(--primary) 12%, transparent);
        }
        .spk-photo-wrap { position: relative; }
        .spk-photo { width: 72px; height: 72px; border-radius: 50%; object-fit: cover; border: 2px solid var(--outline-variant); }
        .spk-initials { width: 72px; height: 72px; border-radius: 50%; background: var(--primary-fixed); color: var(--primary); display: grid; place-items: center; font-size: 24px; font-weight: 800; border: 2px solid var(--outline-variant); }
        .spk-star {
          position: absolute; bottom: -2px; right: -2px;
          width: 24px; height: 24px; border-radius: 50%;
          border: 0; background: var(--surface-container-low);
          color: var(--text-muted); cursor: pointer;
          display: grid; place-items: center;
          border: 1px solid var(--outline-variant);
          transition: all 140ms;
        }
        .spk-star:hover, .spk-star.is-featured { color: #f59e0b; }
        .spk-body { display: flex; flex-direction: column; gap: 4px; }
        .spk-name { font-size: 14px; font-weight: 700; margin: 0; }
        .spk-role { font-size: 12px; color: var(--text-muted); margin: 0; }
        .spk-quote { font-size: 12px; color: var(--text-muted); font-style: italic; margin: 0; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .spk-actions { display: flex; gap: 6px; }
        .spk-actions button { width: 32px; height: 32px; border: 1px solid var(--outline-variant); border-radius: 8px; background: transparent; color: var(--text-muted); cursor: pointer; display: grid; place-items: center; transition: all 140ms; }
        .spk-actions button:hover { background: var(--surface-container-high); color: var(--text-main); }
        .spk-stats { font-size: 12px; color: var(--text-muted); display: flex; gap: 8px; align-items: center; }
        .spk-upload-row { display: flex; align-items: center; gap: 16px; }
        .spk-upload-preview { width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 2px solid var(--primary); flex-shrink: 0; }
        .spk-upload-placeholder { width: 80px; height: 80px; border-radius: 50%; background: var(--surface-container-low); border: 2px dashed var(--outline-variant); display: grid; place-items: center; color: var(--text-muted); flex-shrink: 0; }
      `}</style>
    </div>
  );
};

export default Speakers;
