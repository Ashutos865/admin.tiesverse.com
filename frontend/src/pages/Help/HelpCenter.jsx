import { useMemo, useState } from 'react';
import { LifeBuoy, Search, ChevronDown } from 'lucide-react';
import { ARTICLES, CATEGORIES } from './helpContent';

// ── markdown-lite renderer (trusted, authored content) ──────────────────────
function renderInline(text) {
  // split on **bold**
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>);
}
function renderBody(body) {
  const blocks = body.trim().split(/\n\s*\n/);
  return blocks.map((block, bi) => {
    const lines = block.split('\n');
    if (lines[0].startsWith('## ')) {
      return <h4 key={bi} style={hs.h4}>{lines[0].slice(3)}</h4>;
    }
    if (lines.every(l => l.startsWith('- '))) {
      return <ul key={bi} style={hs.ul}>{lines.map((l, i) => <li key={i} style={hs.li}>{renderInline(l.slice(2))}</li>)}</ul>;
    }
    if (lines.every(l => /^\d+\.\s/.test(l))) {
      return <ol key={bi} style={hs.ul}>{lines.map((l, i) => <li key={i} style={hs.li}>{renderInline(l.replace(/^\d+\.\s/, ''))}</li>)}</ol>;
    }
    return <p key={bi} style={hs.p}>{lines.map((l, i) => <span key={i}>{renderInline(l)}{i < lines.length - 1 ? <br /> : null}</span>)}</p>;
  });
}

export default function HelpCenter() {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('All');
  const [openId, setOpenId] = useState(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ARTICLES.filter(a => {
      if (cat !== 'All' && a.category !== cat) return false;
      if (!q) return true;
      return q.split(/\s+/).every(w => `${a.title} ${a.category} ${a.keywords} ${a.body}`.toLowerCase().includes(w));
    });
  }, [query, cat]);

  return (
    <div style={hs.wrap}>
      <div style={hs.header}>
        <h1 style={hs.title}><LifeBuoy size={24} style={{ verticalAlign: -5, marginRight: 9, color: '#fe7a00' }} />Help Center</h1>
        <p style={hs.sub}>How to use every part of the Tiesverse admin. Search for anything, or browse by area.</p>
      </div>

      <div style={hs.searchBox}>
        <Search size={18} style={{ color: 'var(--text-muted,#9ca3af)', flex: 'none' }} />
        <input style={hs.searchInput} placeholder="Search help — e.g. attendance, certificate, password…" value={query} onChange={e => setQuery(e.target.value)} autoFocus />
      </div>

      <div style={hs.chips}>
        {['All', ...CATEGORIES].map(c => (
          <button key={c} onClick={() => setCat(c)} style={{ ...hs.chip, ...(cat === c ? hs.chipOn : null) }}>{c}</button>
        ))}
      </div>

      {results.length === 0 ? (
        <div style={hs.empty}>No help articles match “{query}”. Try a different word.</div>
      ) : (
        <div style={hs.list}>
          {results.map(a => {
            const open = openId === a.id;
            return (
              <div key={a.id} style={hs.card}>
                <button style={hs.cardHead} onClick={() => setOpenId(open ? null : a.id)}>
                  <div style={{ minWidth: 0, textAlign: 'left' }}>
                    <div style={hs.badge}>{a.category}</div>
                    <div style={hs.cardTitle}>{a.title}</div>
                  </div>
                  <ChevronDown size={18} style={{ color: 'var(--text-muted,#9ca3af)', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                </button>
                {open && <div style={hs.article}>{renderBody(a.body)}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const hs = {
  wrap: { padding: 24, maxWidth: 860, margin: '0 auto' },
  header: { marginBottom: 18 },
  title: { fontSize: 26, fontWeight: 800, margin: 0, color: 'var(--text-main,#111827)' },
  sub: { color: 'var(--text-muted,#6b7280)', fontSize: 14, marginTop: 6 },
  searchBox: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderRadius: 999, border: '1px solid var(--border,#e5e7eb)', background: 'var(--surface,#fff)', marginBottom: 14 },
  searchInput: { flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, color: 'var(--text-main,#111827)' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 18 },
  chip: { padding: '6px 13px', borderRadius: 999, border: '1px solid var(--border,#e5e7eb)', background: 'var(--surface,#fff)', color: 'var(--text-muted,#6b7280)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' },
  chipOn: { background: 'linear-gradient(180deg,#ff9a3d,#fe7a00)', color: '#fff', borderColor: 'transparent' },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: { background: 'var(--surface,#fff)', border: '1px solid var(--border,#e5e7eb)', borderRadius: 16, overflow: 'hidden' },
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, width: '100%', padding: '15px 18px', border: 'none', background: 'transparent', cursor: 'pointer' },
  badge: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#c2410c', marginBottom: 4 },
  cardTitle: { fontSize: 15.5, fontWeight: 700, color: 'var(--text-main,#111827)' },
  article: { padding: '2px 20px 20px', borderTop: '1px solid var(--border,#eef0f3)' },
  empty: { textAlign: 'center', color: 'var(--text-muted,#9ca3af)', padding: 48, background: 'var(--surface,#fff)', borderRadius: 16, border: '1px solid var(--border,#e5e7eb)' },
  h4: { fontSize: 14, fontWeight: 800, color: 'var(--text-main,#111827)', margin: '16px 0 8px' },
  p: { fontSize: 14, lineHeight: 1.65, color: 'var(--text-main,#374151)', margin: '10px 0' },
  ul: { margin: '10px 0', paddingLeft: 22 },
  li: { fontSize: 14, lineHeight: 1.6, color: 'var(--text-main,#374151)', marginBottom: 5 },
};
