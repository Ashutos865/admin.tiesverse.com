import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Edit2, Trash2, BookOpen } from 'lucide-react';
import { usePermissions } from '../../context/PermissionContext';
import { getDocsTree, getDocPage, createDocPage, updateDocPage, deleteDocPage, searchDocs } from '../../apiClient';
import '../Learn/Learn.css';
import './Docs.css';

/* Minimal, safe markdown -> HTML. Content is escaped first, then a small set of
   block/inline rules is applied, so no raw HTML from the source is ever rendered. */
function mdToHtml(src = '') {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const linkFix = (s) => s.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0, listType = null;
  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      closeList(); const buf = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) { buf.push(esc(lines[i])); i++; }
      i++; out.push(`<pre><code>${buf.join('\n')}</code></pre>`); continue;
    }
    if (/^### /.test(line)) { closeList(); out.push(`<h3>${linkFix(inlineNoLink(line.slice(4)))}</h3>`); i++; continue; }
    if (/^## /.test(line)) { closeList(); out.push(`<h2>${linkFix(inlineNoLink(line.slice(3)))}</h2>`); i++; continue; }
    if (/^# /.test(line)) { closeList(); out.push(`<h2>${linkFix(inlineNoLink(line.slice(2)))}</h2>`); i++; continue; }
    if (/^> /.test(line)) { closeList(); out.push(`<blockquote>${linkFix(inlineNoLink(line.slice(2)))}</blockquote>`); i++; continue; }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { closeList(); out.push('<hr>'); i++; continue; }
    if (/^\s*[-*] /.test(line)) { if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; } out.push(`<li>${linkFix(inlineNoLink(line.replace(/^\s*[-*] /, '')))}</li>`); i++; continue; }
    if (/^\s*\d+\. /.test(line)) { if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; } out.push(`<li>${linkFix(inlineNoLink(line.replace(/^\s*\d+\. /, '')))}</li>`); i++; continue; }
    if (line.trim() === '') { closeList(); i++; continue; }
    closeList(); out.push(`<p>${linkFix(inlineNoLink(line))}</p>`); i++;
  }
  closeList();
  return out.join('\n');
  // inline formatting that does NOT touch links (links handled by linkFix after)
  function inlineNoLink(s) {
    return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
  }
}

const EMPTY_PAGE = { title: '', body: '', space: '', parent: null, slug: '' };

export default function TiesDocs() {
  const { hasPermission, isSuperuser } = usePermissions();
  const canEdit = isSuperuser || hasPermission('add_docpage') || hasPermission('change_docpage');

  const [tree, setTree] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [page, setPage] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [editing, setEditing] = useState(null);      // page object being edited or EMPTY_PAGE for new
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const show = (m) => { setToast(m); window.setTimeout(() => setToast(''), 2600); };
  const loadTree = () => getDocsTree().then((t) => {
    const arr = Array.isArray(t) ? t : [];
    setTree(arr);
    if (!activeId) { const first = arr.find((s) => s.pages.length)?.pages[0]; if (first) setActiveId(first.id); }
  });
  useEffect(() => { loadTree(); }, []);
  useEffect(() => { if (activeId) getDocPage(activeId).then((p) => setPage(p && !p.error ? p : null)); }, [activeId]);

  const runSearch = (q) => { setQuery(q); if (!q.trim()) { setResults(null); return; } searchDocs(q).then((r) => setResults(Array.isArray(r) ? r : [])); };

  const spaces = useMemo(() => tree.map((t) => t.space), [tree]);

  const openNew = () => setEditing({ ...EMPTY_PAGE, space: spaces[0]?.id || '' });
  const openEdit = () => page && setEditing({ id: page.id, title: page.title, body: page.body, space: page.space, parent: page.parent, slug: page.slug });
  const save = async () => {
    if (!editing.title.trim()) { show('Title is required'); return; }
    setSaving(true);
    const slug = editing.slug || editing.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const payload = { ...editing, slug };
    const res = editing.id ? await updateDocPage(editing.id, payload) : await createDocPage(payload);
    setSaving(false);
    if (res?.id) { setEditing(null); await loadTree(); setActiveId(res.id); getDocPage(res.id).then(setPage); show(editing.id ? 'Page saved' : 'Page created'); }
    else show(res?.error || 'Save failed');
  };
  const remove = async () => { if (!page || !window.confirm(`Delete "${page.title}"?`)) return; await deleteDocPage(page.id); setPage(null); setActiveId(null); loadTree(); show('Page deleted'); };

  return (
    <div className="learn-page" style={{ maxWidth: 1400 }}>
      {toast && <div className="learn-toast">{toast}</div>}
      <header className="learn-heading" style={{ marginBottom: 8 }}>
        <div>
          <span className="learn-eyebrow">Knowledge base</span>
          <h1>TIES Docs</h1>
          <p>Documentation, SOPs, processes, and directories in one place. A strong documentation culture for an agile operating model.</p>
        </div>
        {canEdit && <div className="learn-heading-actions"><button type="button" className="learn-primary-button" onClick={openNew}><Plus size={18} /> New page</button></div>}
      </header>

      <div className="docs-shell">
        <aside className="docs-nav">
          <div className="docs-search"><Search size={16} color="var(--text-muted)" /><input value={query} onChange={(e) => runSearch(e.target.value)} placeholder="Search docs" /></div>
          {results ? (
            <div className="docs-space">
              <div className="docs-space-title">{results.length} result{results.length === 1 ? '' : 's'}</div>
              {results.map((r) => <button type="button" key={r.id} className={`docs-link ${r.id === activeId ? 'is-active' : ''}`} onClick={() => { setActiveId(r.id); setResults(null); setQuery(''); }}>{r.title}</button>)}
            </div>
          ) : tree.map((t) => (
            <div className="docs-space" key={t.space.id}>
              <div className="docs-space-title"><BookOpen size={13} /> {t.space.name}</div>
              {t.pages.map((p) => (
                <button type="button" key={p.id} className={`docs-link ${p.parent ? 'is-child' : ''} ${p.id === activeId ? 'is-active' : ''}`} onClick={() => setActiveId(p.id)}>{p.title}</button>
              ))}
              {!t.pages.length && <span style={{ fontSize: 12, color: 'var(--text-muted)', paddingLeft: 10 }}>No pages yet</span>}
            </div>
          ))}
          {!tree.length && <div className="learn-state" style={{ padding: 24 }}><BookOpen size={28} /><strong>No spaces yet</strong></div>}
        </aside>

        <main className="docs-main">
          {editing ? (
            <div className="docs-editor">
              <div className="learn-heading" style={{ marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <input className="docs-title-input" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Page title"
                    style={{ width: '100%', fontFamily: "'Hanken Grotesk','Inter',sans-serif", fontSize: 26, fontWeight: 700, border: 0, background: 'transparent', color: 'var(--text-main)', outline: 'none' }} />
                </div>
                <div className="docs-actions">
                  <select value={editing.space} onChange={(e) => setEditing({ ...editing, space: Number(e.target.value) })} style={{ padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface-hover)', color: 'var(--text-main)' }}>
                    {spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button type="button" className="learn-ghost-button" onClick={() => setEditing(null)}>Cancel</button>
                  <button type="button" className="learn-primary-button" disabled={saving} onClick={save}>{saving ? 'Saving' : 'Save page'}</button>
                </div>
              </div>
              <textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} placeholder={'Write in Markdown...\n\n## Section\n- point one\n- point two\n\n`inline code`, **bold**, [links](https://example.com)'} />
            </div>
          ) : page ? (
            <>
              <div className="docs-breadcrumb">TIES Docs <span>/</span> <b>{spaces.find((s) => s.id === page.space)?.name || 'Space'}</b> <span>/</span> {page.title}</div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <h1 className="docs-article" style={{ flex: 1 }}>{page.title}</h1>
                {canEdit && (
                  <div className="docs-actions">
                    <button type="button" className="learn-icon-button" title="Edit" onClick={openEdit}><Edit2 size={17} /></button>
                    <button type="button" className="learn-icon-button is-danger" title="Delete" onClick={remove}><Trash2 size={17} /></button>
                  </div>
                )}
              </div>
              <div className="docs-meta">{page.updated_by_name ? `Last updated by ${page.updated_by_name}` : 'Reference document'}</div>
              <article className="docs-body" dangerouslySetInnerHTML={{ __html: mdToHtml(page.body) }} />
            </>
          ) : (
            <div className="learn-state"><BookOpen size={36} /><strong>Select a page</strong><span>Pick a document from the left, or create one.</span></div>
          )}
        </main>
      </div>
    </div>
  );
}
