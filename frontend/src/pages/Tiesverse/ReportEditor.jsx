import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ArrowLeft, Bold, ChevronDown, ChevronUp, Heading1, Heading2, Image as ImageIcon,
    Italic, Plus, Quote, Save, Trash2, Type, Upload,
} from 'lucide-react';
import { getResearchReport, updateResearchReport, uploadImage } from '../../apiClient';

/**
 * Block editor for one research report.
 *
 * A report is an ordered list of blocks, exactly as the reader renders them,
 * so what is arranged here is what a reader sees — no hidden transformation in
 * between. Section headings (H2) double as the contents index on the website,
 * which is why they are labelled as such rather than as "big text".
 *
 * Emphasis is written as **bold** and *italic* inside a paragraph. The toolbar
 * wraps the current selection so nobody has to know that, but the stored text
 * stays readable and diffable rather than becoming HTML.
 */

const card = { background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 12, padding: 16, marginBottom: 12 };
const input = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface)', color: 'var(--text-main)', fontSize: 14, fontFamily: 'inherit', outline: 'none' };
const btn = (bg, fg) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: bg ? 'none' : '1px solid var(--outline-variant)', background: bg || 'transparent', color: fg || 'var(--text-main)', fontWeight: 700, fontSize: 13, cursor: 'pointer' });
const iconBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, border: '1px solid var(--outline-variant)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer' };

const BLOCK_LABEL = {
    lead: 'Standfirst', p: 'Paragraph', h2: 'Section heading', h3: 'Sub-heading',
    img: 'Image', table: 'Table', ref: 'Reference', quote: 'Pull quote', pull: 'Pull quote',
};

const NEW_BLOCK = {
    h2: { type: 'h2', text: 'New section' },
    h3: { type: 'h3', text: 'New sub-heading' },
    p: { type: 'p', text: '' },
    quote: { type: 'quote', text: '' },
    img: { type: 'img', src: '', caption: '' },
};

export default function ReportEditor({ reportId, onBack }) {
    const [report, setReport] = useState(null);
    const [blocks, setBlocks] = useState([]);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState('');
    const [uploadingAt, setUploadingAt] = useState(null);
    const fileRef = useRef(null);
    const insertAt = useRef(null);
    const areaRefs = useRef({});

    const flash = (m) => { setToast(m); window.setTimeout(() => setToast(''), 3000); };

    const load = useCallback(async () => {
        const res = await getResearchReport(reportId);
        if (res?.error) return flash(res.error);
        setReport(res);
        setBlocks(Array.isArray(res.blocks) ? res.blocks : []);
        setDirty(false);
    }, [reportId]);
    useEffect(() => { load(); }, [load]);

    // Losing a rearranged report to a stray click would be infuriating.
    useEffect(() => {
        if (!dirty) return undefined;
        const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    const edit = (fn) => { setBlocks(fn); setDirty(true); };
    const patch = (i, part) => edit((bs) => bs.map((b, x) => (x === i ? { ...b, ...part } : b)));
    const remove = (i) => {
        if (!window.confirm('Remove this block?')) return;
        edit((bs) => bs.filter((_, x) => x !== i));
    };
    const move = (i, d) => {
        const j = i + d;
        edit((bs) => {
            if (j < 0 || j >= bs.length) return bs;
            const next = [...bs];
            [next[i], next[j]] = [next[j], next[i]];
            return next;
        });
    };
    const insert = (i, kind) => edit((bs) => {
        const next = [...bs];
        next.splice(i + 1, 0, { ...NEW_BLOCK[kind] });
        return next;
    });

    /** Wrap the selected text in a paragraph with ** or *. */
    const wrap = (i, marker) => {
        const el = areaRefs.current[i];
        if (!el) return;
        const { selectionStart: s, selectionEnd: e, value } = el;
        if (s === e) return flash('Select the words to format first.');
        const chosen = value.slice(s, e);
        const next = `${value.slice(0, s)}${marker}${chosen}${marker}${value.slice(e)}`;
        patch(i, { text: next });
        window.requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(s + marker.length, e + marker.length);
        });
    };

    const pickImage = (i) => { insertAt.current = i; fileRef.current?.click(); };
    const onFile = async (ev) => {
        const file = ev.target.files?.[0];
        if (!file) return;
        const at = insertAt.current;
        setUploadingAt(at);
        const res = await uploadImage(file);
        setUploadingAt(null);
        if (ev.target) ev.target.value = '';
        if (!res?.secure_url) return flash(res?.error || 'Upload failed.');
        edit((bs) => {
            const next = [...bs];
            next.splice(at + 1, 0, { type: 'img', src: res.secure_url, caption: '' });
            return next;
        });
        flash('Image added.');
    };

    const save = async () => {
        setSaving(true);
        const res = await updateResearchReport(reportId, { blocks });
        setSaving(false);
        if (res?.error) return flash(res.error);
        setDirty(false);
        flash('Saved. The website updates within two minutes.');
    };

    if (!report) return <div style={{ padding: 28, color: 'var(--text-muted)' }}>Loading report…</div>;

    const sections = blocks.filter((b) => b.type === 'h2');

    return (
        <div style={{ maxWidth: 940, margin: '0 auto', padding: '20px 18px 90px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                <button style={btn()} onClick={() => {
                    if (dirty && !window.confirm('You have unsaved changes. Leave anyway?')) return;
                    onBack();
                }}><ArrowLeft size={15} /> Back</button>
                <h1 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: 'var(--text-main)', flex: 1, minWidth: 200 }}>{report.title}</h1>
                <button style={btn('var(--primary, #fe7a00)', '#fff')} disabled={saving || !dirty} onClick={save}>
                    <Save size={15} /> {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
                </button>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 16px', lineHeight: 1.55 }}>
                {blocks.length} blocks · {sections.length} sections. Section headings become the contents
                menu on the left of the published report. Select words in a paragraph to make them
                <strong> bold</strong> or <em>italic</em>.
            </p>

            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />

            {blocks.map((b, i) => (
                <div key={i} style={{ ...card, borderLeft: b.type === 'h2' ? '3px solid var(--primary, #fe7a00)' : card.border }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                            {BLOCK_LABEL[b.type] || b.type}
                        </span>
                        {(b.type === 'p' || b.type === 'lead') && (
                            <>
                                <button style={iconBtn} title="Bold the selected words" onClick={() => wrap(i, '**')}><Bold size={14} /></button>
                                <button style={iconBtn} title="Italicise the selected words" onClick={() => wrap(i, '*')}><Italic size={14} /></button>
                            </>
                        )}
                        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                            <button style={iconBtn} title="Move up" onClick={() => move(i, -1)}><ChevronUp size={15} /></button>
                            <button style={iconBtn} title="Move down" onClick={() => move(i, 1)}><ChevronDown size={15} /></button>
                            <button style={{ ...iconBtn, color: '#dc2626' }} title="Remove" onClick={() => remove(i)}><Trash2 size={14} /></button>
                        </span>
                    </div>

                    {b.type === 'img' ? (
                        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                            {b.src && <img src={b.src} alt="" style={{ width: 190, borderRadius: 9, border: '1px solid var(--outline-variant)' }} />}
                            <div style={{ flex: 1, minWidth: 220 }}>
                                <input style={input} value={b.caption || ''} onChange={(e) => patch(i, { caption: e.target.value })} placeholder="Caption (optional)" />
                                <input style={{ ...input, marginTop: 8, fontSize: 12 }} value={b.src || ''} onChange={(e) => patch(i, { src: e.target.value })} placeholder="Image URL" />
                            </div>
                        </div>
                    ) : b.type === 'table' ? (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ borderCollapse: 'collapse', fontSize: 12.5, width: '100%' }}>
                                <tbody>
                                    {(b.rows || []).map((row, ri) => (
                                        <tr key={ri}>
                                            {row.map((cell, ci) => (
                                                <td key={ci} style={{ border: '1px solid var(--outline-variant)', padding: 0 }}>
                                                    <input
                                                        style={{ ...input, border: 0, borderRadius: 0, fontSize: 12.5, fontWeight: ri === 0 ? 700 : 400 }}
                                                        value={cell}
                                                        onChange={(e) => {
                                                            const rows = (b.rows || []).map((r, x) => (x === ri ? r.map((c, y) => (y === ci ? e.target.value : c)) : r));
                                                            patch(i, { rows });
                                                        }}
                                                    />
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '6px 0 0' }}>The first row is the table header on the website.</p>
                        </div>
                    ) : (
                        <textarea
                            ref={(el) => { areaRefs.current[i] = el; }}
                            style={{
                                ...input, minHeight: b.type === 'h2' || b.type === 'h3' ? 44 : 96, resize: 'vertical', lineHeight: 1.55,
                                fontWeight: b.type === 'h2' ? 700 : 400,
                                fontSize: b.type === 'h2' ? 16 : b.type === 'h3' ? 14.5 : 14,
                            }}
                            value={b.text || ''}
                            onChange={(e) => patch(i, { text: e.target.value })}
                            placeholder={b.type === 'h2' ? 'Section heading' : b.type === 'h3' ? 'Sub-heading' : 'Write here…'}
                        />
                    )}

                    <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>Insert after:</span>
                        <button style={{ ...btn(), padding: '5px 10px', fontSize: 11.5 }} onClick={() => insert(i, 'p')}><Type size={12} /> Paragraph</button>
                        <button style={{ ...btn(), padding: '5px 10px', fontSize: 11.5 }} onClick={() => insert(i, 'h2')}><Heading1 size={12} /> Section</button>
                        <button style={{ ...btn(), padding: '5px 10px', fontSize: 11.5 }} onClick={() => insert(i, 'h3')}><Heading2 size={12} /> Sub-heading</button>
                        <button style={{ ...btn(), padding: '5px 10px', fontSize: 11.5 }} onClick={() => insert(i, 'quote')}><Quote size={12} /> Quote</button>
                        <button style={{ ...btn(), padding: '5px 10px', fontSize: 11.5 }} disabled={uploadingAt === i} onClick={() => pickImage(i)}>
                            <ImageIcon size={12} /> {uploadingAt === i ? 'Uploading…' : 'Image'}
                        </button>
                    </div>
                </div>
            ))}

            {blocks.length === 0 && (
                <div style={card}>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 10px' }}>This report has no content yet.</p>
                    <button style={btn()} onClick={() => edit(() => [{ type: 'p', text: '' }])}><Plus size={14} /> Add the first paragraph</button>
                </div>
            )}

            {toast && (
                <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', background: 'var(--text-main)', color: 'var(--surface)', padding: '11px 20px', borderRadius: 10, fontSize: 13.5, fontWeight: 600, zIndex: 60, boxShadow: '0 8px 24px rgba(0,0,0,.25)' }}>
                    {toast}
                </div>
            )}
        </div>
    );
}
