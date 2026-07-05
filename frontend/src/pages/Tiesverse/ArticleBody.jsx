import { useRef, useState } from 'react';
import { Eye, Code } from 'lucide-react';

// Quick-insert snippets — write real article content without hand-typing tags.
const SNIPPETS = [
    { label: 'H2', html: '\n<h2>Section heading</h2>\n' },
    { label: 'Paragraph', html: '\n<p>Write a paragraph here…</p>\n' },
    { label: 'Bold', html: '<strong>bold text</strong>' },
    { label: 'Italic', html: '<em>italic text</em>' },
    { label: 'Quote', html: '\n<blockquote>A pull quote that captures the point.</blockquote>\n' },
    { label: 'List', html: '\n<ul>\n  <li>First point</li>\n  <li>Second point</li>\n</ul>\n' },
    { label: 'Link', html: '<a href="https://">link text</a>' },
    { label: 'Image', html: '\n<figure><img src="https://" alt="" /><figcaption>Caption</figcaption></figure>\n' },
    { label: 'Divider', html: '\n<hr />\n' },
];

export default function ArticleBody({ value, onChange }) {
    const ref = useRef(null);
    const [mode, setMode] = useState('write');

    const insert = (html) => {
        const el = ref.current;
        const v = value || '';
        const s = el ? el.selectionStart : v.length;
        const e = el ? el.selectionEnd : s;
        const nv = v.slice(0, s) + html + v.slice(e);
        onChange(nv);
        requestAnimationFrame(() => { if (el) { el.focus(); const p = s + html.length; try { el.setSelectionRange(p, p); } catch { /* noop */ } } });
    };

    return (
        <div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
                {SNIPPETS.map((sn) => (
                    <button key={sn.label} type="button" onClick={() => insert(sn.html)} style={chip}>{sn.label}</button>
                ))}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    <button type="button" onClick={() => setMode('write')} style={tab(mode === 'write')}><Code size={12} style={{ verticalAlign: -1 }} /> Write</button>
                    <button type="button" onClick={() => setMode('preview')} style={tab(mode === 'preview')}><Eye size={12} style={{ verticalAlign: -1 }} /> Preview</button>
                </div>
            </div>
            {mode === 'write' ? (
                <textarea ref={ref} value={value || ''} onChange={(e) => onChange(e.target.value)} rows={16} spellCheck
                    placeholder="Write the article body. Use the buttons above to drop in headings, quotes, images…"
                    style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13.5, lineHeight: 1.6, fontFamily: 'ui-monospace, Menlo, Consolas, monospace', resize: 'vertical', boxSizing: 'border-box' }} />
            ) : (
                <div className="article-preview" style={{ background: '#fff', color: '#1a1a1a', borderRadius: 8, padding: '26px 30px', maxHeight: 480, overflowY: 'auto', lineHeight: 1.7, fontSize: 16 }}
                    dangerouslySetInnerHTML={{ __html: value || '<p style="color:#999">Nothing written yet.</p>' }} />
            )}
            <style>{`
                .article-preview h2{font-size:24px;font-weight:700;margin:26px 0 12px;line-height:1.2}
                .article-preview p{margin:0 0 16px}
                .article-preview blockquote{border-left:3px solid #FE7A00;margin:20px 0;padding:4px 0 4px 18px;font-size:20px;font-style:italic;color:#444}
                .article-preview ul{margin:0 0 16px;padding-left:22px}
                .article-preview li{margin:6px 0}
                .article-preview a{color:#4338ca;text-decoration:underline}
                .article-preview img{max-width:100%;border-radius:10px;display:block;margin:10px 0}
                .article-preview figure{margin:20px 0}
                .article-preview figcaption{font-size:13px;color:#777;margin-top:6px}
                .article-preview hr{border:none;border-top:1px solid #e5e5e5;margin:28px 0}
            `}</style>
        </div>
    );
}

const chip = { fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.85)', cursor: 'pointer' };
const tab = (on) => ({ fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: 'none', background: on ? 'var(--primary, #4338ca)' : 'transparent', color: on ? '#fff' : 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 });
