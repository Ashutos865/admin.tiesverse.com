import { useCallback, useEffect, useRef, useState } from 'react';
import {
    BookOpen, Plus, Upload, X, Trash2, ChevronUp, ChevronDown, Eye, EyeOff, Save,
    FileText, Link2, ExternalLink, Pencil,
} from 'lucide-react';
import {
    getResearchPage, saveResearchPage, uploadImage,
    getResearchReports, importResearchReport, updateResearchReport, deleteResearchReport,
} from '../../apiClient';
import ReportEditor from './ReportEditor';

/**
 * Content manager for tiesverse.com/research.
 *
 * The page is one document: hero copy, the photo-and-statement block,
 * "What we research" areas and "What we published" entries. Everything here
 * is optional — the website ships default copy and only overrides fields the
 * admin has filled in, so a blank document still renders a complete page.
 */

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

/** Full reports imported from Google Docs — each becomes /research/<slug>. */
function ReportsCard({ flash, onEdit }) {
    const [reports, setReports] = useState(null);
    const [url, setUrl] = useState('');
    const [date, setDate] = useState('');
    const [dek, setDek] = useState('');
    const [importing, setImporting] = useState(false);

    const load = useCallback(async () => {
        const res = await getResearchReports();
        setReports(Array.isArray(res?.reports) ? res.reports : []);
    }, []);
    useEffect(() => { load(); }, [load]);

    const doImport = async () => {
        if (!url.trim()) return flash('Paste a Google Doc link first.');
        setImporting(true);
        const res = await importResearchReport({ url: url.trim(), date: date.trim(), dek: dek.trim() });
        setImporting(false);
        if (res?.slug) {
            flash(`Imported "${res.title}" (${res.blocks_count} blocks). Live within two minutes.`);
            setUrl(''); setDate(''); setDek('');
            load();
        } else flash(res?.error || 'Import failed.');
    };

    const toggle = async (r) => {
        const res = await updateResearchReport(r.id, { is_active: !r.is_active });
        if (res?.error) flash(res.error); else load();
    };

    const remove = async (r) => {
        if (!window.confirm(`Delete "${r.title}"? Its page on the website goes away.`)) return;
        const res = await deleteResearchReport(r.id);
        if (res?.error) flash(res.error); else { flash('Report deleted.'); load(); }
    };

    return (
        <div style={card}>
            <h2 style={h2}>Research reports</h2>
            <p style={hint}>
                Paste a Google Doc link and it becomes a full report page at tiesverse.com/research/… —
                sections, tables and images included. The doc must be shared as “anyone with the link can view”.
                Imported reports also appear automatically under “What we published”.
            </p>
            <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
                <input style={input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/document/d/…" />
                <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10 }}>
                    <input style={input} value={date} onChange={(e) => setDate(e.target.value)} placeholder="August 2026" />
                    <input style={input} value={dek} onChange={(e) => setDek(e.target.value)} placeholder="One-line standfirst shown under the title (optional)" />
                </div>
                <button style={{ ...btn('var(--primary, #fe7a00)', '#fff'), justifyContent: 'center' }} disabled={importing} onClick={doImport}>
                    <Link2 size={15} /> {importing ? 'Importing… (fetching the doc)' : 'Import from Google Doc'}
                </button>
            </div>

            {reports === null && <p style={{ ...hint, margin: 0 }}>Loading reports…</p>}
            {Array.isArray(reports) && reports.length === 0 && <p style={{ ...hint, margin: 0 }}>No reports yet.</p>}
            {Array.isArray(reports) && reports.map((r) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--outline-variant)', borderRadius: 10, padding: '10px 12px', marginBottom: 8, background: 'var(--surface)', opacity: r.is_active ? 1 : 0.55 }}>
                    <FileText size={16} style={{ flex: 'none', color: 'var(--text-muted)' }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{r.kind}{r.date ? ` · ${r.date}` : ''} · {r.blocks_count} blocks</div>
                    </div>
                    <button style={iconBtn} title="Edit the report's contents" onClick={() => onEdit(r.id)}><Pencil size={14} /></button>
                    <a href={`https://www.tiesverse.com/research/${r.slug}`} target="_blank" rel="noreferrer" style={{ ...iconBtn, textDecoration: 'none' }} title="Open on the website"><ExternalLink size={14} /></a>
                    <button style={iconBtn} title={r.is_active ? 'Shown on the site — click to hide' : 'Hidden — click to show'} onClick={() => toggle(r)}>
                        {r.is_active ? <Eye size={15} /> : <EyeOff size={15} />}
                    </button>
                    <button style={{ ...iconBtn, color: '#dc2626' }} title="Delete" onClick={() => remove(r)}><Trash2 size={15} /></button>
                </div>
            ))}
        </div>
    );
}

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
    // When set, the editor takes over the page instead of the settings form.
    const [editingId, setEditingId] = useState(null);
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

    if (editingId) return <ReportEditor reportId={editingId} onBack={() => setEditingId(null)} />;

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
                <h2 style={h2}>Desk photo</h2>
                <p style={hint}>A wide photo shown under the headline. Optional — leave it empty and the page goes straight from the headline to the publications.</p>
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
            </div>

            <ReportsCard flash={flash} onEdit={setEditingId} />

            <ItemList
                title="What we published"
                hintText="Extra hand-curated rows shown alongside the imported reports (a PDF, an external article). Imported reports list themselves automatically — no need to repeat them here."
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
