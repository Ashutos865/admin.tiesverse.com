import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Plus, Edit2, Trash2, BookOpen, Bold, Italic, List, ListOrdered,
  ListChecks, Quote, Code, Link2, Heading1, Heading2, CornerDownRight,
  Globe, Lock, Users,
} from 'lucide-react';
import { usePermissions } from '../../context/PermissionContext';
import { getDocsTree, getDocPage, createDocPage, updateDocPage, deleteDocPage, searchDocs, getHRDepartments } from '../../apiClient';
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
    // checkbox / task item: - [ ] or - [x]
    if (/^\s*[-*] \[[ xX]\] /.test(line)) {
      if (listType !== 'ul') { closeList(); out.push('<ul class="docs-tasks">'); listType = 'ul'; }
      const checked = /\[[xX]\]/.test(line);
      const txt = line.replace(/^\s*[-*] \[[ xX]\]\s?/, '');
      out.push(`<li class="docs-task ${checked ? 'is-done' : ''}"><span class="docs-cbx">${checked ? '✓' : ''}</span><span>${linkFix(inlineNoLink(txt))}</span></li>`);
      i++; continue;
    }
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

/* Convert pasted rich text (HTML from Notion / Google Docs / the web) into clean
   Markdown, so pasting keeps headings, bold, bullets and checkboxes automatically.
   Built in-house (no library); handles the common semantic tags + inline styles. */
function htmlToMarkdown(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const inline = (node) => {
    let s = '';
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) { s += n.textContent.replace(/\s+/g, ' '); return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName.toLowerCase();
      const style = (n.getAttribute && n.getAttribute('style')) || '';
      const bold = tag === 'strong' || tag === 'b' || /font-weight\s*:\s*(bold|[6-9]\d\d)/.test(style);
      const ital = tag === 'em' || tag === 'i' || /font-style\s*:\s*italic/.test(style);
      let inner = inline(n);
      if (tag === 'br') { s += '\n'; return; }
      if (tag === 'code') { s += `\`${inner.trim()}\``; return; }
      if (tag === 'a') { const href = n.getAttribute('href') || ''; s += href ? `[${inner}](${href})` : inner; return; }
      if (bold) inner = `**${inner.trim()}**`;
      if (ital) inner = `*${inner.trim()}*`;
      s += inner;
    });
    return s;
  };

  const out = [];
  const block = (node, indent = '') => {
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) { const t = n.textContent.trim(); if (t) out.push(indent + t); return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) { const lvl = Math.min(3, parseInt(tag[1], 10)); out.push(''); out.push('#'.repeat(lvl) + ' ' + inline(n).trim()); out.push(''); return; }
      if (tag === 'p') { const t = inline(n).trim(); if (t) { out.push(indent + t); out.push(''); } return; }
      if (tag === 'blockquote') { out.push('> ' + inline(n).trim()); out.push(''); return; }
      if (tag === 'pre') { out.push('```'); out.push(n.textContent.replace(/\n+$/, '')); out.push('```'); out.push(''); return; }
      if (tag === 'ul' || tag === 'ol') {
        let idx = 1;
        n.childNodes.forEach((li) => {
          if (li.nodeType !== 1 || li.tagName.toLowerCase() !== 'li') return;
          const cb = li.querySelector('input[type="checkbox"]');
          const marker = cb ? (cb.checked ? '- [x]' : '- [ ]') : (tag === 'ol' ? `${idx++}.` : '-');
          // text of this li excluding nested lists
          const clone = li.cloneNode(true);
          clone.querySelectorAll('ul,ol').forEach((sub) => sub.remove());
          clone.querySelectorAll('input').forEach((inp) => inp.remove());
          const txt = inline(clone).trim();
          if (txt) out.push(`${indent}${marker} ${txt}`);
          // recurse into nested lists with deeper indent
          li.querySelectorAll(':scope > ul, :scope > ol').forEach((sub) => block({ childNodes: [sub] }, indent + '  '));
        });
        out.push('');
        return;
      }
      if (tag === 'br') { out.push(''); return; }
      // containers (div, span, section, li fallback): recurse
      block(n, indent);
    });
  };

  block(doc.body);
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const EMPTY_PAGE = { title: '', body: '', space: '', parent: null, slug: '', visibility: 'public', allowed_teams: [] };

export default function TiesDocs() {
  const { hasPermission, isSuperuser } = usePermissions();
  const canEdit = isSuperuser || hasPermission('add_docpage') || hasPermission('change_docpage');

  const [tree, setTree] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [page, setPage] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [editing, setEditing] = useState(null);      // page object being edited or a fresh page for new
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [departments, setDepartments] = useState([]);
  const taRef = useRef(null);

  const show = (m) => { setToast(m); window.setTimeout(() => setToast(''), 2600); };
  const toggleTeam = (teamId) => setEditing((e) => {
    const teams = e.allowed_teams || [];
    return { ...e, allowed_teams: teams.includes(teamId) ? teams.filter((t) => t !== teamId) : [...teams, teamId] };
  });
  const loadTree = () => getDocsTree().then((t) => {
    const arr = Array.isArray(t) ? t : [];
    setTree(arr);
    if (!activeId) { const first = arr.find((s) => s.pages.length)?.pages[0]; if (first) setActiveId(first.id); }
  });
  useEffect(() => { loadTree(); getHRDepartments().then((d) => setDepartments(Array.isArray(d) ? d : [])); }, []);
  useEffect(() => { if (activeId) getDocPage(activeId).then((p) => setPage(p && !p.error ? p : null)); }, [activeId]);

  const runSearch = (q) => { setQuery(q); if (!q.trim()) { setResults(null); return; } searchDocs(q).then((r) => setResults(Array.isArray(r) ? r : [])); };

  const spaces = useMemo(() => tree.map((t) => t.space), [tree]);
  const setBody = (v) => setEditing((e) => ({ ...e, body: v }));

  const openNew = (parent = null, spaceId = null) => setEditing({ ...EMPTY_PAGE, space: spaceId || spaces[0]?.id || '', parent });
  const openEdit = () => page && setEditing({ id: page.id, title: page.title, body: page.body, space: page.space, parent: page.parent, slug: page.slug, visibility: page.visibility || 'public', allowed_teams: page.allowed_teams || [] });

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

  // ── editor helpers ──────────────────────────────────────────────────────────
  const withSel = (fn) => {
    const ta = taRef.current; if (!ta) return;
    const { selectionStart: a, selectionEnd: b, value } = ta;
    const r = fn(value, a, b);
    setBody(r.value);
    requestAnimationFrame(() => { ta.focus(); ta.selectionStart = r.selStart; ta.selectionEnd = r.selEnd; });
  };
  const wrap = (mark) => withSel((v, a, b) => {
    const sel = v.slice(a, b) || 'text';
    return { value: v.slice(0, a) + mark + sel + mark + v.slice(b), selStart: a + mark.length, selEnd: a + mark.length + sel.length };
  });
  const prefixLines = (mk) => withSel((v, a, b) => {
    const ls = v.lastIndexOf('\n', a - 1) + 1;
    const le = v.indexOf('\n', b); const end = le < 0 ? v.length : le;
    const block = v.slice(ls, end).split('\n').map((ln, i) => {
      const m = typeof mk === 'function' ? mk(i) : mk;
      return ln.replace(/^(\s*)([-*] \[[ xX]\] |[-*] |\d+\. |#+ |> )?/, `$1${m}`);
    }).join('\n');
    return { value: v.slice(0, ls) + block + v.slice(end), selStart: ls, selEnd: ls + block.length };
  });
  const insertLink = () => withSel((v, a, b) => {
    const sel = v.slice(a, b) || 'link text';
    const snippet = `[${sel}](https://)`;
    return { value: v.slice(0, a) + snippet + v.slice(b), selStart: a + snippet.length - 1, selEnd: a + snippet.length - 1 };
  });

  const onKeyDown = (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    const ta = e.target; const pos = ta.selectionStart; const val = ta.value;
    const ls = val.lastIndexOf('\n', pos - 1) + 1;
    const line = val.slice(ls, pos);
    const m = line.match(/^(\s*)([-*] \[[ xX]\]|[-*]|\d+\.)\s+(.*)$/);
    if (!m) return;
    const [, indent, marker, content] = m;
    e.preventDefault();
    if (!content.trim()) { // empty item -> exit the list
      const nv = val.slice(0, ls) + val.slice(pos);
      setBody(nv); requestAnimationFrame(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = ls; });
      return;
    }
    let next = marker;
    if (/^\d+\.$/.test(marker)) next = (parseInt(marker, 10) + 1) + '.';
    else if (/\[[ xX]\]/.test(marker)) next = marker.replace(/\[[xX]\]/, '[ ]');
    const ins = `\n${indent}${next} `;
    const nv = val.slice(0, pos) + ins + val.slice(pos);
    setBody(nv); const np = pos + ins.length;
    requestAnimationFrame(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = np; });
  };

  const onPaste = (e) => {
    const html = e.clipboardData?.getData('text/html');
    if (!html || !/[<]/.test(html)) return; // let plain text paste normally
    const md = htmlToMarkdown(html);
    if (!md) return;
    e.preventDefault();
    const ta = e.target; const { selectionStart: a, selectionEnd: b, value } = ta;
    const nv = value.slice(0, a) + md + value.slice(b);
    setBody(nv); const np = a + md.length;
    requestAnimationFrame(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = np; });
    show('Pasted & auto-formatted');
  };

  const TOOLS = [
    { ic: Heading1, t: 'Heading', fn: () => prefixLines('# ') },
    { ic: Heading2, t: 'Subheading', fn: () => prefixLines('## ') },
    { ic: Bold, t: 'Bold', fn: () => wrap('**') },
    { ic: Italic, t: 'Italic', fn: () => wrap('*') },
    { ic: List, t: 'Bullet list', fn: () => prefixLines('- ') },
    { ic: ListOrdered, t: 'Numbered list', fn: () => prefixLines((i) => `${i + 1}. `) },
    { ic: ListChecks, t: 'Checklist', fn: () => prefixLines('- [ ] ') },
    { ic: Quote, t: 'Quote', fn: () => prefixLines('> ') },
    { ic: Code, t: 'Inline code', fn: () => wrap('`') },
    { ic: Link2, t: 'Link', fn: insertLink },
  ];

  // ── sidebar tree (nested by parent) ─────────────────────────────────────────
  const renderNodes = (pages, parent, depth = 0) => pages
    .filter((p) => (p.parent || null) === parent)
    .map((p) => (
      <div key={p.id}>
        <button type="button" className={`docs-link ${p.id === activeId ? 'is-active' : ''}`} style={{ paddingLeft: 10 + depth * 16 }} onClick={() => setActiveId(p.id)}>
          {depth > 0 && <CornerDownRight size={12} style={{ opacity: 0.5, marginRight: 4, verticalAlign: '-2px' }} />}{p.title}
          {p.visibility === 'encrypted' && <span className="docs-link-badge encrypted" title="Encrypted (Internal)"><Lock size={10} /></span>}
        </button>
        {renderNodes(pages, p.id, depth + 1)}
      </div>
    ));

  const parentTitle = editing?.parent ? (tree.flatMap((t) => t.pages).find((p) => p.id === editing.parent)?.title) : null;

  return (
    <div className="learn-page" style={{ maxWidth: 1400 }}>
      {toast && <div className="learn-toast">{toast}</div>}
      <header className="learn-heading" style={{ marginBottom: 8 }}>
        <div>
          <span className="learn-eyebrow">Knowledge base</span>
          <h1>TIES Docs</h1>
          <p>Documentation, SOPs, processes, and directories in one place. A strong documentation culture for an agile operating model.</p>
        </div>
        {canEdit && <div className="learn-heading-actions"><button type="button" className="learn-primary-button" onClick={() => openNew()}><Plus size={18} /> New page</button></div>}
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
              {t.pages.length ? renderNodes(t.pages, null) : <span style={{ fontSize: 12, color: 'var(--text-muted)', paddingLeft: 10 }}>No pages yet</span>}
            </div>
          ))}
          {!tree.length && <div className="learn-state" style={{ padding: 24 }}><BookOpen size={28} /><strong>No spaces yet</strong></div>}
        </aside>

        <main className="docs-main">
          {editing ? (
            <div className="docs-editor">
              <div className="learn-heading" style={{ marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  {parentTitle && <div className="docs-subpage-note"><CornerDownRight size={13} /> Sub-page of <b>{parentTitle}</b></div>}
                  <input className="docs-title-input" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Page title"
                    style={{ width: '100%', fontFamily: "'Hanken Grotesk','Inter',sans-serif", fontSize: 26, fontWeight: 700, border: 0, background: 'transparent', color: 'var(--text-main)', outline: 'none' }} />
                </div>
                <div className="docs-actions">
                  <select value={editing.space} onChange={(e) => setEditing({ ...editing, space: Number(e.target.value) })} style={{ padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface-hover)', color: 'var(--text-main)' }}>
                    {spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <select value={editing.visibility} onChange={(e) => setEditing({ ...editing, visibility: e.target.value, allowed_teams: e.target.value === 'public' ? [] : editing.allowed_teams })} style={{ padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface-hover)', color: 'var(--text-main)' }}>
                    <option value="public">Public</option>
                    <option value="encrypted">Encrypted (Internal)</option>
                  </select>
                  <button type="button" className="learn-ghost-button" onClick={() => setEditing(null)}>Cancel</button>
                  <button type="button" className="learn-primary-button" disabled={saving} onClick={save}>{saving ? 'Saving' : 'Save page'}</button>
                </div>
              </div>

              {editing.visibility === 'encrypted' && (
                <div className="docs-teams-selector">
                  <div className="docs-teams-label"><Lock size={14} /> Visible to teams:</div>
                  <div className="docs-teams-grid">
                    {departments.map((dept) => {
                      const selected = (editing.allowed_teams || []).includes(dept.id);
                      return (
                        <button type="button" key={dept.id} className={`docs-team-chip ${selected ? 'is-selected' : ''}`} onClick={() => toggleTeam(dept.id)}>
                          {selected && <Users size={12} />} {dept.name}
                        </button>
                      );
                    })}
                  </div>
                  {!departments.length && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No teams found. Create teams in HR Portal first.</span>}
                </div>
              )}

              <div className="docs-toolbar">
                {TOOLS.map((tool, i) => {
                  const Ic = tool.ic;
                  return <button type="button" key={i} className="docs-tool" title={tool.t} onMouseDown={(e) => { e.preventDefault(); tool.fn(); }}><Ic size={16} /></button>;
                })}
                <span className="docs-toolbar-hint">Paste from Notion / Docs / web — it auto-formats</span>
              </div>

              <div className="docs-edit-split">
                <textarea ref={taRef} value={editing.body} onChange={(e) => setBody(e.target.value)} onKeyDown={onKeyDown} onPaste={onPaste}
                  placeholder={'Write here. Use the toolbar, or type Markdown:\n\n# Heading\n- bullet (Enter continues the list)\n- [ ] checkbox task\n\n**bold**, *italic*, `code`, [links](https://example.com)'} />
                <div className="docs-preview">
                  <div className="docs-preview-label">Preview</div>
                  <div className="docs-body" dangerouslySetInnerHTML={{ __html: mdToHtml(editing.body) || '<p style="color:var(--text-muted)">Nothing to preview yet.</p>' }} />
                </div>
              </div>
            </div>
          ) : page ? (
            <>
              <div className="docs-breadcrumb">
                TIES Docs <span>/</span> <b>{spaces.find((s) => s.id === page.space)?.name || 'Space'}</b> <span>/</span> {page.title}
                {page.visibility === 'encrypted' && <span className="docs-visibility-badge encrypted"><Lock size={11} /> Encrypted</span>}
                {page.visibility === 'public' && <span className="docs-visibility-badge public"><Globe size={11} /> Public</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <h1 className="docs-article" style={{ flex: 1 }}>{page.title}</h1>
                {canEdit && (
                  <div className="docs-actions">
                    <button type="button" className="learn-ghost-button" onClick={() => openNew(page.id, page.space)} title="Add a sub-page under this page"><Plus size={15} /> Sub-page</button>
                    <button type="button" className="learn-icon-button" title="Edit" onClick={openEdit}><Edit2 size={17} /></button>
                    <button type="button" className="learn-icon-button is-danger" title="Delete" onClick={remove}><Trash2 size={17} /></button>
                  </div>
                )}
              </div>
              <div className="docs-meta">
                {page.updated_by_name ? `Last updated by ${page.updated_by_name}` : 'Reference document'}
                {page.visibility === 'encrypted' && page.allowed_team_names && page.allowed_team_names.length > 0 && (
                  <span className="docs-team-tags">
                    <Users size={12} /> {page.allowed_team_names.join(', ')}
                  </span>
                )}
              </div>
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
