import { useCallback, useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Plus, Upload, X, GripVertical, Trash2, Edit2 } from 'lucide-react';
import {
    getMediaPosts, createMediaPost, updateMediaPost, deleteMediaPost, uploadImage,
} from '../../apiClient';

/**
 * Media showcase manager for tiesverse.com/media.
 *
 * A post is deliberately text-free: a title, a few tags, and 2-5 images the
 * public page lays out row by row. Images upload straight to Cloudinary via
 * the shared uploader; their order here is the order shown on the site.
 */
const SUGGESTED_TAGS = ['BRANDING', 'FILMS', 'REELS', 'PODCAST', 'REPORTING', 'CAMPAIGN', 'SOCIAL', 'DESIGN'];
const EMPTY = { title: '', tags: [], images: [], order: 0, is_active: true };

const card = { background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 12, padding: 18 };
const input = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface)', color: 'var(--text-main)', fontSize: 14, fontFamily: 'inherit', outline: 'none' };
const label = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 };
const btn = (bg, fg) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, border: bg ? 'none' : '1px solid var(--outline-variant)', background: bg || 'transparent', color: fg || 'var(--text-main)', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' });
const chip = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 6, background: 'var(--text-main)', color: 'var(--surface)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' };

export default function MediaPosts() {
    const [posts, setPosts] = useState([]);
    const [form, setForm] = useState(EMPTY);
    const [editingId, setEditingId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [toast, setToast] = useState('');
    const [tagInput, setTagInput] = useState('');
    const fileRef = useRef(null);
    const dragFrom = useRef(null);

    const load = useCallback(async () => {
        setLoading(true);
        const res = await getMediaPosts();
        setPosts(Array.isArray(res) ? res : (res?.results || []));
        setLoading(false);
    }, []);
    useEffect(() => { load(); }, [load]);

    const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 3500); };
    const reset = () => { setForm(EMPTY); setEditingId(null); setTagInput(''); };

    const startEdit = (p) => {
        setEditingId(p.id);
        setForm({ title: p.title || '', tags: p.tags || [], images: p.images || [], order: p.order || 0, is_active: p.is_active !== false });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const onFiles = async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        setUploading(true);
        for (const file of files) {
            const res = await uploadImage(file);
            if (res?.secure_url) setForm((f) => ({ ...f, images: [...f.images, res.secure_url] }));
            else flash(res?.error || `Upload failed for ${file.name}`);
        }
        setUploading(false);
        if (fileRef.current) fileRef.current.value = '';
    };

    const removeImage = (i) => setForm((f) => ({ ...f, images: f.images.filter((_, x) => x !== i) }));

    const reorder = (to) => {
        const from = dragFrom.current;
        if (from == null || from === to) return;
        setForm((f) => {
            const imgs = [...f.images];
            const [moved] = imgs.splice(from, 1);
            imgs.splice(to, 0, moved);
            return { ...f, images: imgs };
        });
        dragFrom.current = null;
    };

    const addTag = (raw) => {
        const t = String(raw || '').trim().toUpperCase();
        if (t && !form.tags.includes(t)) setForm((f) => ({ ...f, tags: [...f.tags, t] }));
        setTagInput('');
    };
    const removeTag = (t) => setForm((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) }));

    const save = async () => {
        if (!form.title.trim()) return flash('A title is required.');
        if (!form.images.length) return flash('Add at least one image.');
        setBusy(true);
        const payload = { ...form, order: Number(form.order) || 0 };
        const res = editingId ? await updateMediaPost(editingId, payload) : await createMediaPost(payload);
        setBusy(false);
        if (res?.id) { flash(editingId ? 'Post updated.' : 'Post added.'); reset(); load(); }
        else flash(res?.error || 'Save failed.');
    };

    const remove = async (p) => {
        if (!window.confirm(`Delete "${p.title}"? This removes it from the Media page.`)) return;
        const res = await deleteMediaPost(p.id);
        if (res?.error) flash(res.error);
        else { flash('Deleted.'); if (editingId === p.id) reset(); load(); }
    };

    return (
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <ImageIcon size={22} />
                <h1 style={{ margin: 0, fontSize: 22 }}>Media Showcase</h1>
            </div>
            <p style={{ margin: '0 0 22px', color: 'var(--text-muted)', fontSize: 14 }}>
                Image posts for tiesverse.com/media. Each post is a title, tags and its images. No text body by design.
            </p>

            {toast && (
                <div style={{ ...card, borderColor: 'var(--primary)', marginBottom: 16, padding: '10px 14px', fontWeight: 600, fontSize: 14 }}>
                    {toast}
                </div>
            )}

            {/* ── form ── */}
            <section style={{ ...card, marginBottom: 26 }}>
                <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>{editingId ? 'Edit post' : 'New post'}</h2>

                <label style={label}>Title *</label>
                <input style={input} value={form.title} placeholder="e.g. Operation Sindoor Explainer Series"
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />

                <label style={{ ...label, marginTop: 16 }}>Tags</label>
                {form.tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                        {form.tags.map((t) => (
                            <span key={t} style={chip}>
                                {t}
                                <button type="button" onClick={() => removeTag(t)} aria-label={`Remove ${t}`}
                                    style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 0 }}>
                                    <X size={12} />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                    <input style={input} value={tagInput} placeholder="Type a tag, press Enter"
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); } }} />
                    <button type="button" style={btn()} onClick={() => addTag(tagInput)}>Add</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {SUGGESTED_TAGS.filter((t) => !form.tags.includes(t)).map((t) => (
                        <button key={t} type="button" onClick={() => addTag(t)}
                            style={{ padding: '3px 9px', borderRadius: 6, border: '1px dashed var(--outline-variant)', background: 'none', color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                            + {t}
                        </button>
                    ))}
                </div>

                <label style={{ ...label, marginTop: 18 }}>
                    Images ({form.images.length}) <span style={{ fontWeight: 400 }}>— first is the row cover; drag to reorder</span>
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 6 }}>
                    {form.images.map((url, i) => (
                        <div key={url + i} draggable
                            onDragStart={() => { dragFrom.current = i; }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => reorder(i)}
                            style={{ position: 'relative', width: 118, height: 84, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--outline-variant)', cursor: 'grab' }}>
                            <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <span style={{ position: 'absolute', left: 4, top: 4, color: '#fff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.7))' }}>
                                <GripVertical size={13} />
                            </span>
                            <button type="button" onClick={() => removeImage(i)} aria-label="Remove image"
                                style={{ position: 'absolute', right: 4, top: 4, width: 22, height: 22, borderRadius: 6, border: 'none', background: 'rgba(0,0,0,.6)', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                                <X size={12} />
                            </button>
                        </div>
                    ))}
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                        style={{ width: 118, height: 84, borderRadius: 8, border: '2px dashed var(--outline-variant)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600 }}>
                        <span style={{ display: 'grid', placeItems: 'center', gap: 4 }}>
                            <Upload size={17} />
                            {uploading ? 'Uploading…' : 'Add images'}
                        </span>
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
                </div>

                <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', marginTop: 14, flexWrap: 'wrap' }}>
                    <div>
                        <label style={label}>Order (lower shows first)</label>
                        <input style={{ ...input, width: 100 }} type="number" value={form.order}
                            onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))} />
                    </div>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, paddingBottom: 9 }}>
                        <input type="checkbox" checked={form.is_active}
                            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
                        Show on the site
                    </label>
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                    <button type="button" style={btn('var(--primary)', '#fff')} onClick={save} disabled={busy || uploading}>
                        <Plus size={15} /> {busy ? 'Saving…' : editingId ? 'Save changes' : 'Add post'}
                    </button>
                    {editingId && <button type="button" style={btn()} onClick={reset}>Cancel</button>}
                </div>
            </section>

            {/* ── list ── */}
            <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>On the site ({posts.length})</h2>
            {loading ? (
                <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
            ) : posts.length === 0 ? (
                <div style={{ ...card, textAlign: 'center' }}>
                    <p style={{ fontWeight: 600, margin: '0 0 4px' }}>No media posts yet.</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>Add one above and it appears on tiesverse.com/media.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                    {posts.map((p) => (
                        <div key={p.id} style={{ ...card, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                    <strong style={{ fontSize: 15 }}>{p.title}</strong>
                                    {(p.tags || []).map((t) => <span key={t} style={{ ...chip, gap: 0 }}>{t}</span>)}
                                    {p.is_active === false && <span style={{ fontSize: 11, color: '#b45309', fontWeight: 700 }}>HIDDEN</span>}
                                </div>
                                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                                    {(p.images || []).slice(0, 6).map((u, i) => (
                                        <img key={u + i} src={u} alt="" style={{ width: 54, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--outline-variant)' }} />
                                    ))}
                                    {(p.images || []).length > 6 && (
                                        <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>+{p.images.length - 6}</span>
                                    )}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button type="button" style={btn()} onClick={() => startEdit(p)}><Edit2 size={14} /> Edit</button>
                                <button type="button" onClick={() => remove(p)} aria-label="Delete"
                                    style={{ ...btn(), color: '#dc2626', borderColor: '#fca5a5' }}>
                                    <Trash2 size={15} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
