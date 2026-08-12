import { useCallback, useEffect, useRef, useState } from 'react';
import {
    BookOpen, Plus, Upload, X, Trash2, ChevronUp, ChevronDown, Eye, EyeOff, Save,
} from 'lucide-react';
import { getResearchPage, saveResearchPage, uploadImage } from '../../apiClient';

/**
 * Content manager for tiesverse.com/research.
 *
 * The page is one document: hero copy, the photo-and-statement block,
 * "What we research" areas and "What we published" entries. Everything here
 * is optional — the website ships default copy and only overrides fields the
 * admin has filled in, so a blank document still renders a complete page.
 */

const EMPTY_AREA = { tag: '', title: '', desc: '', is_active: '1' };
const EMPTY_PUB = { kind: 'Report', title: '', dek: '', date: '', link: '', is_active: '1' };
const PUB_KINDS = ['Report', 'Brief', 'Deep dive', 'Paper', 'Explainer'];

const card = { background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 12, padding: 18, marginBottom: 16 };
const input = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface)', color: 'var(--text-main)', fontSize: 14, fontFamily: 'inherit', outline: 'none' };
const area = { ...input, minHeight: 74, resize: 'vertical', lineHeight: 1.5 };
const label = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 };
const h2 = { fontSize: 15, fontWeight: 800, color: 'var(--text-main)', margin: '0 0 4px' };
const hint = { fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.5 };
const btn = (bg, fg) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, border: bg ? 'none' : '1px solid var(--outline-variant)', background: bg || 'transparent', color: fg || 'var(--text-main)', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' });
const iconBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, border: '1px solid var(--outline-variant)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer' };

const Field = ({ l, children }) => (
    <div style={{ marginBottom: 12 }}>
        <label style={label}>{l}</label>
        {children}
    </div>
);

function ItemList({ title, hintText, items, setItems, empty, render }) {
    const move = (i, d) => {
        const j = i + d;
        if (j < 0 || j >= items.length) return;
        const next = [...items];
        [next[i], next[j]] = [next[j], next[i]];
        setItems(next);
    };
    const patch = (i, part) => setItems(items.map((it, x) => (x === i ? { ...it, ...part } : it)));
    const remove = (i) => setItems(items.filter((_, x) => x !== i));
    const toggle = (i) => patch(i, { is_active: items[i].is_active === '0' ? '1' : '0' });

    return (
        <div style={card}>
            <h2 style={h2}>{title}</h2>
            <p style={hint}>{hintText}</p>
            {items.map((it, i) => (
                <div key={i} style={{ border: '1px solid var(--outline-variant)', borderRadius: 10, padding: 14, marginBottom: 10, background: 'var(--surface)', opacity: it.is_active === '0' ? 0.55 : 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 10 }}>
                        <button style={iconBtn} title="Move up" onClick={() => move(i, -1)}><ChevronUp size={15} /></button>
                        <button style={iconBtn} title="Move down" onClick={() => move(i, 1)}><ChevronDown size={15} /></button>
                        <button style={iconBtn} title={it.is_active === '0' ? 'Hidden on the site — click to show' : 'Shown on the site — click to hide'} onClick={() => toggle(i)}>
                            {it.is_active === '0' ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                        <button style={{ ...iconBtn, color: '#dc2626' }} title="Remove" onClick={() => remove(i)}><Trash2 size={15} /></button>
                    </div>
                    {render(it, (part) => patch(i, part))}
                </div>
            ))}
            <button style={btn()} onClick={() => setItems([...items, { ...empty }])}><Plus size={15} /> Add {title.toLowerCase().includes('publish') ? 'publication' : 'area'}</button>
        </div>
    );
}

export default function ResearchPage() {
    const [doc, setDoc] = useState(null);      // null = loading
    const [busy, setBusy] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [toast, setToast] = useState('');
    const fileRef = useRef(null);

    const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 3500); };

    const load = useCallback(async () => {
        const res = await getResearchPage();
        const d = res?.data || {};
        setDoc({
            hero_ghost: d.hero_ghost || '',
            hero_note: d.hero_note || '',
            photo_url: d.photo_url || '',
            photo_caption: d.photo_caption || '',
            statement: d.statement || '',
            statement_soft: d.statement_soft || '',
            about_heading: d.about_heading || '',
            about_body_1: d.about_body_1 || '',
            about_body_2: d.about_body_2 || '',
            about_body_3: d.about_body_3 || '',
            areas: Array.isArray(d.areas) ? d.areas : [],
            publications: Array.isArray(d.publications) ? d.publications : [],
        });
    }, []);
    useEffect(() => { load(); }, [load]);

    const set = (part) => setDoc((d) => ({ ...d, ...part }));

    const onPhoto = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        const res = await uploadImage(file);
        setUploading(false);
        if (res?.secure_url) set({ photo_url: res.secure_url });
        else flash(res?.error || 'Upload failed.');
        if (fileRef.current) fileRef.current.value = '';
    };

    const save = async () => {
        setBusy(true);
        const res = await saveResearchPage(doc);
        setBusy(false);
        if (res?.data) { flash('Saved. The site updates within two minutes.'); }
        else flash(res?.error || 'Save failed.');
    };

    if (doc === null) return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Loading…</div>;

    return (
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px 80px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <BookOpen size={22} />
                    <div>
                        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>Research Page</h1>
                        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>Controls tiesverse.com/research. Empty fields fall back to the site's built-in copy.</p>
                    </div>
                </div>
                <button style={btn('var(--primary, #fe7a00)', '#fff')} disabled={busy} onClick={save}>
                    <Save size={15} /> {busy ? 'Saving…' : 'Save page'}
                </button>
            </div>

            <div style={card}>
                <h2 style={h2}>Hero</h2>
                <p style={hint}>The heading always reads “Research”. The ghost line is the soft second line beneath it; the note is the short right-aligned sentence.</p>
                <Field l="Ghost line (soft second heading)">
                    <input style={input} value={doc.hero_ghost} onChange={(e) => set({ hero_ghost: e.target.value })} placeholder="that reads the world." />
                </Field>
                <Field l="Hero note">
                    <input style={input} value={doc.hero_note} onChange={(e) => set({ hero_note: e.target.value })} placeholder="At TIES, we read the systems shaping Bharat's future." />
                </Field>
            </div>

            <div style={card}>
                <h2 style={h2}>Statement</h2>
                <p style={hint}>The big centre statement. The soft ending renders in a lighter colour at the end of the sentence.</p>
                <Field l="Statement">
                    <textarea style={area} value={doc.statement} onChange={(e) => set({ statement: e.target.value })} placeholder="At TIES, we advance rigorous research at the intersection of geopolitics, markets and technology…" />
                </Field>
                <Field l="Soft ending (rendered lighter)">
                    <input style={input} value={doc.statement_soft} onChange={(e) => set({ statement_soft: e.target.value })} placeholder="Bharat's next decade." />
                </Field>
            </div>

            <div style={card}>
                <h2 style={h2}>Photo &amp; details</h2>
                <p style={hint}>The desk photo beside the “what we research” story. Landscape works best; it is shown about 720×640 on desktop.</p>
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 12 }}>
                    {doc.photo_url ? (
                        <div style={{ position: 'relative' }}>
                            <img src={doc.photo_url} alt="Research desk" style={{ width: 220, height: 150, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--outline-variant)' }} />
                            <button style={{ ...iconBtn, position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none' }} title="Remove photo" onClick={() => set({ photo_url: '' })}><X size={14} /></button>
                        </div>
                    ) : (
                        <div style={{ width: 220, height: 150, borderRadius: 10, border: '1px dashed var(--outline-variant)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12.5 }}>No photo yet</div>
                    )}
                    <div>
                        <button style={btn()} disabled={uploading} onClick={() => fileRef.current?.click()}>
                            <Upload size={15} /> {uploading ? 'Uploading…' : 'Upload photo'}
                        </button>
                        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPhoto} />
                    </div>
                </div>
                <Field l="Photo caption (optional)">
                    <input style={input} value={doc.photo_caption} onChange={(e) => set({ photo_caption: e.target.value })} placeholder="The research desk at work" />
                </Field>
                <Field l="Details heading">
                    <textarea style={{ ...area, minHeight: 56 }} value={doc.about_heading} onChange={(e) => set({ about_heading: e.target.value })} placeholder="Rigorous research to decode geopolitics, markets and technology for Bharat." />
                </Field>
                <Field l="Details — column one">
                    <textarea style={area} value={doc.about_body_1} onChange={(e) => set({ about_body_1: e.target.value })} placeholder="What the desk does and how it works…" />
                </Field>
                <Field l="Details — column two, first paragraph">
                    <textarea style={area} value={doc.about_body_2} onChange={(e) => set({ about_body_2: e.target.value })} placeholder="Where the work has appeared, what it has achieved…" />
                </Field>
                <Field l="Details — column two, second paragraph">
                    <textarea style={area} value={doc.about_body_3} onChange={(e) => set({ about_body_3: e.target.value })} placeholder="The mission, stated plainly…" />
                </Field>
            </div>

            <ItemList
                title="What we research"
                hintText="Focus-area cards. The tag is a small uppercase chip (e.g. GEOPOLITICS); order here is the order on the site."
                items={doc.areas}
                setItems={(areas) => set({ areas })}
                empty={EMPTY_AREA}
                render={(it, patch) => (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 10, marginBottom: 10 }}>
                            <input style={input} value={it.tag || ''} onChange={(e) => patch({ tag: e.target.value.toUpperCase() })} placeholder="TAG" />
                            <input style={input} value={it.title || ''} onChange={(e) => patch({ title: e.target.value })} placeholder="Area title" />
                        </div>
                        <textarea style={{ ...area, minHeight: 56 }} value={it.desc || ''} onChange={(e) => patch({ desc: e.target.value })} placeholder="One or two sentences on what this area covers." />
                    </>
                )}
            />

            <ItemList
                title="What we published"
                hintText="Selected publications. A link makes the row clickable (a report page, PDF or article); leave it blank to list without a link."
                items={doc.publications}
                setItems={(publications) => set({ publications })}
                empty={EMPTY_PUB}
                render={(it, patch) => (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 130px', gap: 10, marginBottom: 10 }}>
                            <select style={input} value={it.kind || 'Report'} onChange={(e) => patch({ kind: e.target.value })}>
                                {PUB_KINDS.map((k) => <option key={k}>{k}</option>)}
                            </select>
                            <input style={input} value={it.title || ''} onChange={(e) => patch({ title: e.target.value })} placeholder="Publication title" />
                            <input style={input} value={it.date || ''} onChange={(e) => patch({ date: e.target.value })} placeholder="May 2026" />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <input style={input} value={it.dek || ''} onChange={(e) => patch({ dek: e.target.value })} placeholder="One-line description (optional)" />
                            <input style={input} value={it.link || ''} onChange={(e) => patch({ link: e.target.value })} placeholder="https://… (optional link)" />
                        </div>
                    </>
                )}
            />

            <button style={{ ...btn('var(--primary, #fe7a00)', '#fff'), width: '100%', justifyContent: 'center', padding: '13px 0' }} disabled={busy} onClick={save}>
                <Save size={16} /> {busy ? 'Saving…' : 'Save page'}
            </button>

            {toast && (
                <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--text-main)', color: 'var(--surface)', padding: '11px 20px', borderRadius: 10, fontSize: 13.5, fontWeight: 600, zIndex: 60, boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>
                    {toast}
                </div>
            )}
        </div>
    );
}
