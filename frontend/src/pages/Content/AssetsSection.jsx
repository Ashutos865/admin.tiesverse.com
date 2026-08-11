import { useRef, useState } from 'react';
import { Upload, X, Send, ExternalLink, GripVertical } from 'lucide-react';
import { uploadImage } from '../../apiClient';

/**
 * Delivered work: the images a finished piece produced, and the button that
 * puts them on the public Media page.
 *
 * Publishing is a button rather than something a status change triggers, so
 * marking an item Done can never push it to the public site by accident.
 */
export default function AssetsSection({
  assets = [], onChange, disabled, isDone, mediaPostId, postingUrl, onPublish,
}) {
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef(null);
  const dragFrom = useRef(null);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3500); };

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    const added = [];
    for (const file of files) {
      const res = await uploadImage(file);
      if (res?.secure_url) added.push(res.secure_url);
      else flash(res?.error || `Upload failed for ${file.name}`);
    }
    if (added.length) onChange([...assets, ...added]);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeAt = (i) => onChange(assets.filter((_, x) => x !== i));

  const reorder = (to) => {
    const from = dragFrom.current;
    if (from == null || from === to) return;
    const next = [...assets];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
    dragFrom.current = null;
  };

  const publish = async () => {
    if (!assets.length) return flash('Add at least one image first.');
    setPublishing(true);
    const res = await onPublish();
    setPublishing(false);
    flash(res?.error ? res.error : (res?.created ? 'Published to the Media page.' : 'Media post updated.'));
  };

  const box = {
    marginTop: 6, padding: 14, borderRadius: 10,
    border: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)',
  };

  return (
    <div style={box}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-main)' }}>
          Delivered work {assets.length > 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>({assets.length})</span>}
        </span>
        {mediaPostId && (
          <a href="https://tiesverse.com/media" target="_blank" rel="noreferrer"
            style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            On Media page <ExternalLink size={12} />
          </a>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {assets.map((url, i) => (
          <div
            key={url + i}
            draggable={!disabled}
            onDragStart={() => { dragFrom.current = i; }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => reorder(i)}
            style={{
              position: 'relative', width: 84, height: 62, borderRadius: 8, overflow: 'hidden',
              border: '1px solid var(--outline-variant)', cursor: disabled ? 'default' : 'grab',
            }}
          >
            <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {!disabled && (
              <>
                <span style={{ position: 'absolute', left: 3, top: 3, color: '#fff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.8))' }}>
                  <GripVertical size={11} />
                </span>
                <button
                  type="button" onClick={() => removeAt(i)} aria-label="Remove image"
                  style={{
                    position: 'absolute', right: 3, top: 3, width: 19, height: 19, borderRadius: 5,
                    border: 'none', background: 'rgba(0,0,0,.62)', color: '#fff', cursor: 'pointer',
                    display: 'grid', placeItems: 'center',
                  }}
                >
                  <X size={11} />
                </button>
              </>
            )}
          </div>
        ))}

        {!disabled && (
          <button
            type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            style={{
              width: 84, height: 62, borderRadius: 8, border: '2px dashed var(--outline-variant)',
              background: 'none', color: 'var(--text-muted)', cursor: 'pointer',
              display: 'grid', placeItems: 'center', fontSize: 10.5, fontWeight: 700,
            }}
          >
            <span style={{ display: 'grid', placeItems: 'center', gap: 2 }}>
              <Upload size={14} />
              {uploading ? 'Uploading…' : 'Add'}
            </span>
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
      </div>

      {assets.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button
            type="button" onClick={publish} disabled={disabled || publishing || !isDone}
            title={isDone ? '' : 'Mark the item Published or Done first'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px',
              borderRadius: 8, border: 'none', fontSize: 12.5, fontWeight: 800,
              background: isDone ? 'var(--primary)' : 'var(--surface-container-high)',
              color: isDone ? '#fff' : 'var(--text-muted)',
              cursor: isDone && !disabled ? 'pointer' : 'not-allowed',
            }}
          >
            <Send size={13} />
            {publishing ? 'Publishing…' : mediaPostId ? 'Update Media page' : 'Publish to Media page'}
          </button>
          {!isDone && (
            <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--text-muted)' }}>
              Available once the item is Published or Done.
            </p>
          )}
          {!postingUrl && isDone && (
            <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--text-muted)' }}>
              Tip: set the posting URL above and the Media row will link to it.
            </p>
          )}
        </div>
      )}

      {msg && <p style={{ margin: '8px 0 0', fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>{msg}</p>}
    </div>
  );
}
