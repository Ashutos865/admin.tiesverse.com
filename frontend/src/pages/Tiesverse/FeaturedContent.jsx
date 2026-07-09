import { useState, useEffect, useCallback } from 'react';
import { LayoutGrid, Plus, Pencil, Trash2, X, Upload, ExternalLink } from 'lucide-react';
import { getFeatured, createFeatured, updateFeatured, deleteFeatured, uploadImage } from '../../apiClient';

const SECTIONS = [
    { key: 'spotlight', label: 'Spotlight', hint: 'The rotating hero card on the homepage' },
    { key: 'insights', label: 'Latest in Insights', hint: 'Reports & analysis row' },
    { key: 'engagements', label: 'Latest in Engagements', hint: 'Events, webinars & guests row' },
];
const KINDS = ['report', 'insight', 'webinar', 'workshop', 'event', 'podcast'];
const blank = (section) => ({ section, kind: 'report', title: '', subtitle: '', image_url: '', link_url: '', cta_label: '', date_label: '', order: 0, is_active: true });

export function FeaturedCards() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(null);
    const [toast, setToast] = useState(null);

    const showToast = (msg, err = false) => { setToast({ msg, err }); setTimeout(() => setToast(null), 3000); };
    const load = useCallback(async () => {
        setLoading(true);
        const res = await getFeatured();
        setItems(Array.isArray(res) ? res : []);
        setLoading(false);
    }, []);
    useEffect(() => { load(); }, [load]);

    const save = async (draft) => {
        const res = draft.id ? await updateFeatured(draft.id, draft) : await createFeatured(draft);
        if (res?.id) { showToast('Saved'); setEditing(null); load(); }
        else showToast(res?.error || 'Save failed', true);
    };
    const remove = async (item) => {
        if (!window.confirm(`Delete "${item.title}"?`)) return;
        await deleteFeatured(item.id); showToast('Deleted'); load();
    };
    const toggle = async (item) => {
        const res = await updateFeatured(item.id, { is_active: !item.is_active });
        if (res?.id) setItems(its => its.map(i => i.id === res.id ? res : i));
    };

    return (
        <div>
            {toast && <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: toast.err ? '#ef4444' : 'var(--primary)', color: '#fff', borderRadius: 10, padding: '10px 18px', fontSize: 13, boxShadow: '0 4px 16px rgba(0,0,0,.2)' }}>{toast.msg}</div>}

            <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                <LayoutGrid size={18} color="var(--primary)" />
                <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-main)', margin: 0, letterSpacing: '-0.01em' }}>Featured cards</h2>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 24px', maxWidth: 560 }}>
                Curate the homepage Spotlight &amp; rows. Changes go live instantly — no redeploy.
            </p>

            {loading ? <p style={{ color: 'var(--text-muted)' }}>Loading…</p> : SECTIONS.map(sec => {
                const list = items.filter(i => i.section === sec.key).sort((a, b) => a.order - b.order);
                return (
                    <section key={sec.key} style={{ marginBottom: 40 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--outline-variant)' }}>
                            <div>
                                <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>{sec.label}</h2>
                                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>{sec.hint}</p>
                            </div>
                            <button onClick={() => setEditing(blank(sec.key))} style={ghostBtn}><Plus size={14} style={{ verticalAlign: -2, marginRight: 5 }} />Add card</button>
                        </div>
                        {list.length === 0 ? (
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '4px 0' }}>Nothing here yet.</p>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
                                {list.map(item => (
                                    <div key={item.id} style={{ border: '1px solid var(--outline-variant)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface-container-low)', opacity: item.is_active ? 1 : 0.55 }}>
                                        <div style={{ aspectRatio: '16/10', background: 'var(--surface-container)', overflow: 'hidden' }}>
                                            {item.image_url ? <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 12 }}>No image</div>}
                                        </div>
                                        <div style={{ padding: '11px 13px' }}>
                                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5 }}>
                                                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--primary)' }}>{item.kind}</span>
                                                {!item.is_active && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>· hidden</span>}
                                            </div>
                                            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-main)', lineHeight: 1.3 }}>{item.title}</div>
                                            {item.subtitle && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{item.subtitle}</div>}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10 }}>
                                                <MiniToggle on={item.is_active} onChange={() => toggle(item)} />
                                                <button onClick={() => setEditing(item)} style={iconBtn} title="Edit"><Pencil size={14} /></button>
                                                <button onClick={() => remove(item)} style={{ ...iconBtn, color: '#ef4444' }} title="Delete"><Trash2 size={14} /></button>
                                                {item.link_url && <a href={item.link_url} target="_blank" rel="noreferrer" style={{ ...iconBtn, marginLeft: 'auto', color: 'var(--text-muted)' }} title="Open link"><ExternalLink size={13} /></a>}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                );
            })}

            {editing && <EditModal draft={editing} onClose={() => setEditing(null)} onSave={save} showToast={showToast} />}
        </div>
    );
}

function EditModal({ draft: initial, onClose, onSave, showToast }) {
    const [d, setD] = useState(initial);
    const [uploading, setUploading] = useState(false);
    const set = (k, v) => setD(x => ({ ...x, [k]: v }));

    const upload = async (file) => {
        setUploading(true);
        const res = await uploadImage(file);
        setUploading(false);
        if (res?.secure_url) set('image_url', res.secure_url);
        else showToast(res?.error || 'Upload failed', true);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(15,20,25,.6)', display: 'grid', placeItems: 'center', padding: 24 }}>
            <div style={{ background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--outline-variant)' }}>
                    <strong style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)' }}>{d.id ? 'Edit card' : 'New card'}</strong>
                    <button onClick={onClose} style={{ ...iconBtn, color: 'var(--text-muted)' }}><X size={16} /></button>
                </div>
                <div style={{ padding: 20, display: 'grid', gap: 13 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Field label="Section"><select value={d.section} onChange={e => set('section', e.target.value)} style={input}>{SECTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
                        <Field label="Kind"><select value={d.kind} onChange={e => set('kind', e.target.value)} style={input}>{KINDS.map(k => <option key={k} value={k}>{k}</option>)}</select></Field>
                    </div>
                    <Field label="Title"><input value={d.title} onChange={e => set('title', e.target.value)} style={input} placeholder="AI Wars: a new Manhattan Project" /></Field>
                    <Field label="Subtitle / category"><input value={d.subtitle} onChange={e => set('subtitle', e.target.value)} style={input} placeholder="Technology · TIES Research" /></Field>

                    <Field label="Image">
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            {d.image_url && <img src={d.image_url} alt="" style={{ width: 52, height: 40, objectFit: 'cover', borderRadius: 7, border: '1px solid var(--outline-variant)' }} />}
                            <input value={d.image_url} onChange={e => set('image_url', e.target.value)} style={{ ...input, flex: 1 }} placeholder="Paste an image URL…" />
                            <label style={{ ...ghostBtn, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                <Upload size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{uploading ? '…' : 'Upload'}
                                <input type="file" accept="image/*" hidden onChange={e => e.target.files[0] && upload(e.target.files[0])} />
                            </label>
                        </div>
                    </Field>

                    <Field label="Link URL"><input value={d.link_url} onChange={e => set('link_url', e.target.value)} style={input} placeholder="/webinars/… or https://…" /></Field>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Field label="CTA label"><input value={d.cta_label} onChange={e => set('cta_label', e.target.value)} style={input} placeholder="Read the report" /></Field>
                        <Field label="Date label"><input value={d.date_label} onChange={e => set('date_label', e.target.value)} style={input} placeholder="Jun 04, 2026" /></Field>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 12, alignItems: 'end' }}>
                        <Field label="Order"><input type="number" value={d.order} onChange={e => set('order', Number(e.target.value))} style={input} /></Field>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)', paddingBottom: 9 }}>
                            <MiniToggle on={d.is_active} onChange={() => set('is_active', !d.is_active)} /> Visible on the site
                        </label>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '0 20px 20px' }}>
                    <button onClick={onClose} style={ghostBtn}>Cancel</button>
                    <button onClick={() => d.title.trim() ? onSave(d) : showToast('Title is required', true)} style={primaryBtn}>Save</button>
                </div>
            </div>
        </div>
    );
}

const Field = ({ label, children }) => <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 }}>{label}</label>{children}</div>;
function MiniToggle({ on, onChange }) {
    return <button type="button" onClick={onChange} style={{ width: 34, height: 19, borderRadius: 999, border: 'none', cursor: 'pointer', position: 'relative', background: on ? '#16a34a' : '#9ca3af', flexShrink: 0 }}><span style={{ position: 'absolute', top: 2, left: on ? 17 : 2, width: 15, height: 15, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} /></button>;
}

const input = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-lowest, #fff)', color: 'var(--text-main)', fontSize: 13, boxSizing: 'border-box' };
const primaryBtn = { padding: '9px 20px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const ghostBtn = { padding: '7px 13px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'transparent', color: 'var(--text-main)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' };
const iconBtn = { padding: 7, borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'inline-flex' };
