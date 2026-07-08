import { useState, useEffect, useRef } from 'react';
import { wpGet, wpDelete, wpUploadMedia, qs } from './wpApi';
import { Upload, Trash2, Loader2, X, Copy, Check, Image as ImageIcon } from 'lucide-react';

export default function MediaLibrary() {
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState(null);
  const fileRef = useRef();

  const showToast = (m, err) => { setToast({ m, err }); setTimeout(() => setToast(null), 2800); };

  const load = async (p = 1) => {
    setLoading(true);
    try {
      const { data, totalPages } = await wpGet(`/media${qs({ per_page: 40, page: p, _fields: 'id,source_url,mime_type,title,date,media_type,alt_text' })}`);
      setMedia(data || []); setTotalPages(totalPages || 1); setPage(p);
    } catch (e) { showToast(e.message, true); }
    setLoading(false);
  };
  useEffect(() => { load(1); }, []);

  const upload = async (files) => {
    setUploading(true);
    let ok = 0;
    for (const file of files) {
      try { await wpUploadMedia(file); ok++; } catch (e) { showToast(`${file.name}: ${e.message}`, true); }
    }
    setUploading(false);
    if (ok) { showToast(`Uploaded ${ok} file${ok > 1 ? 's' : ''}.`); load(1); }
  };

  const remove = async (m) => {
    if (!window.confirm('Delete this media permanently? It cannot be undone.')) return;
    try { await wpDelete(`/media/${m.id}${qs({ force: true })}`); showToast('Deleted.'); setSelected(null); load(page); }
    catch (e) { showToast(e.message, true); }
  };

  return (
    <div style={{ padding: '26px 24px' }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files?.length) upload([...e.dataTransfer.files]); }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 21, color: 'var(--text-main)' }}>Media Library</h1>
        <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13.5 }}>
          {uploading ? <Loader2 size={15} className="ma-spin" /> : <Upload size={15} />} {uploading ? 'Uploading…' : 'Upload'}
        </button>
        <input ref={fileRef} type="file" multiple hidden onChange={e => { if (e.target.files?.length) upload([...e.target.files]); e.target.value = ''; }} />
      </div>
      <p style={{ margin: '-8px 0 16px', color: 'var(--text-muted)', fontSize: 12.5 }}>Drag &amp; drop files anywhere here to upload.</p>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', padding: 24, display: 'flex', gap: 8, alignItems: 'center' }}><Loader2 size={18} className="ma-spin" /> Loading…</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
            {media.map(m => (
              <button key={m.id} onClick={() => { setSelected(m); setCopied(false); }} style={{ padding: 0, border: '1px solid var(--outline-variant)', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', aspectRatio: '1', background: 'var(--surface-container-low)', position: 'relative' }}>
                {m.media_type === 'image'
                  ? <img src={m.source_url} alt={m.alt_text} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 11, padding: 6, textAlign: 'center' }}><ImageIcon size={20} /><span style={{ marginTop: 4, wordBreak: 'break-all' }}>{m.mime_type}</span></div>}
              </button>
            ))}
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 18 }}>
              <button disabled={page <= 1} onClick={() => load(page - 1)} style={pgBtn(page <= 1)}>‹ Prev</button>
              <span style={{ color: 'var(--text-muted)', fontSize: 13, alignSelf: 'center' }}>Page {page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => load(page + 1)} style={pgBtn(page >= totalPages)}>Next ›</button>
            </div>
          )}
        </>
      )}

      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 900, display: 'grid', placeItems: 'center', padding: 16 }} onClick={() => setSelected(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 12, width: '100%', maxWidth: 520, border: '1px solid var(--outline-variant)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--outline-variant)' }}>
              <h3 style={{ margin: 0, fontSize: 15, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} dangerouslySetInnerHTML={{ __html: selected.title?.rendered || 'Media' }} />
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ padding: 18 }}>
              {selected.media_type === 'image' && <img src={selected.source_url} alt="" style={{ width: '100%', borderRadius: 8, marginBottom: 12, maxHeight: 300, objectFit: 'contain', background: 'var(--surface-container-low)' }} />}
              <div style={{ display: 'flex', gap: 8 }}>
                <input readOnly value={selected.source_url} style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)', color: 'var(--text-main)', fontSize: 12.5 }} />
                <button onClick={() => { navigator.clipboard.writeText(selected.source_url); setCopied(true); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)', color: 'var(--text-main)', cursor: 'pointer', fontSize: 12.5 }}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy URL'}</button>
              </div>
              <button onClick={() => remove(selected)} style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', cursor: 'pointer', fontSize: 13 }}><Trash2 size={14} /> Delete permanently</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', background: toast.err ? '#dc2626' : '#16a34a', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13.5, zIndex: 1000 }}>{toast.m}</div>}
    </div>
  );
}
const pgBtn = (dis) => ({ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)', color: 'var(--text-main)', cursor: dis ? 'default' : 'pointer', opacity: dis ? 0.5 : 1, fontSize: 13 });
