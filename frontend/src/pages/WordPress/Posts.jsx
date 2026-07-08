import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { wpGet, wpCreate, wpUpdate, wpDelete, qs, stripHtml } from './wpApi';
import { Plus, Search, Edit2, Trash2, ExternalLink, Loader2, X, Save, Send, Image as ImageIcon, Eye, Code2, Type, Maximize2, Minimize2, Sparkles } from 'lucide-react';
import RichTextEditor from './RichTextEditor.jsx';

// One-click starting layouts so writers don't face a blank page.
const TEMPLATES = {
  interview: '<h2>Introduction</h2><p>Set the scene — who is this and why does it matter?</p><h3>The conversation</h3><p><strong>Q:</strong> Your question…</p><p><strong>A:</strong> Their answer…</p><h3>Key takeaways</h3><ul><li>First takeaway</li><li>Second takeaway</li></ul>',
  report: '<h2>Summary</h2><p>The one-paragraph version.</p><h2>Background</h2><p>Context and why this report exists.</p><h2>Findings</h2><ul><li>Finding one</li><li>Finding two</li></ul><h2>Conclusion</h2><p>What it all means.</p>',
  news: '<p><strong>[City] —</strong> The lead paragraph with the key facts: who, what, when, where.</p><h3>What happened</h3><p>Details…</p><h3>Why it matters</h3><p>The significance…</p>',
};

const field = { width: '100%', padding: '10px 12px', borderRadius: 8, background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', color: 'var(--text-main)', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' };
const btn = (bg, fg) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8, border: bg ? 'none' : '1px solid var(--outline-variant)', background: bg || 'var(--surface-container-low)', color: fg || 'var(--text-main)', cursor: 'pointer', fontSize: 13.5, fontWeight: 600 });
const STATUS_STYLE = { publish: ['#dcfce7', '#166534'], draft: ['#fef3c7', '#92400e'], pending: ['#dbeafe', '#1e40af'], future: ['#ede9fe', '#5b21b6'], private: ['#f3f4f6', '#374151'] };

// This module handles both Posts and Pages (WordPress treats them almost identically).
export default function Posts({ type = 'posts', label = 'Posts' }) {
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState(null);   // the post object being edited (or {} for new)
  const [toast, setToast] = useState(null);
  const [params, setParams] = useSearchParams();

  const showToast = (m, err) => { setToast({ m, err }); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await wpGet(`/${type}${qs({ per_page: 100, status: status || 'publish,draft,pending,future,private', search, orderby: 'modified', _embed: 1 })}`);
      setItems(data || []);
    } catch (e) { showToast(e.message, true); }
    setLoading(false);
  }, [type, status, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (type === 'posts') wpGet(`/categories${qs({ per_page: 100 })}`).then(r => setCats(r.data || [])).catch(() => {}); }, [type]);

  // deep-link ?edit=<id>
  useEffect(() => {
    const id = params.get('edit');
    if (id && !editing) wpGet(`/${type}/${id}${qs({ context: 'edit' })}`).then(r => setEditing(r.data)).catch(() => {});
  }, [params]); // eslint-disable-line

  const openNew = () => setEditing({ title: '', content: '', status: 'draft', excerpt: '', categories: [], tags: [], _tagNames: '' });
  const openEdit = async (it) => {
    try {
      const { data } = await wpGet(`/${type}/${it.id}${qs({ context: 'edit' })}`);
      let tagNames = '';
      if (type === 'posts' && data.tags?.length) {
        const { data: t } = await wpGet(`/tags${qs({ include: data.tags.join(','), per_page: 100 })}`);
        tagNames = (t || []).map(x => x.name).join(', ');
      }
      setEditing({ ...data, title: data.title?.raw ?? stripHtml(data.title?.rendered), content: data.content?.raw ?? data.content?.rendered ?? '', excerpt: data.excerpt?.raw ?? '', _tagNames: tagNames });
    } catch (e) { showToast(e.message, true); }
  };
  const closeEdit = () => { setEditing(null); if (params.get('edit')) { params.delete('edit'); setParams(params, { replace: true }); } };

  const remove = async (it) => {
    if (!window.confirm(`Move "${stripHtml(it.title?.rendered) || 'this item'}" to Trash?`)) return;
    try { await wpDelete(`/${type}/${it.id}${qs({ force: false })}`); showToast('Moved to Trash.'); load(); }
    catch (e) { showToast(e.message, true); }
  };

  return (
    <div style={{ padding: '26px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 21, color: 'var(--text-main)' }}>{label}</h1>
        <button onClick={openNew} style={btn('var(--primary)', '#fff')}><Plus size={15} /> New {label.replace(/s$/, '')}</button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--text-muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${label.toLowerCase()}…`} style={{ ...field, paddingLeft: 34 }} />
        </div>
        <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...field, width: 'auto', cursor: 'pointer' }}>
          <option value="">All statuses</option>
          <option value="publish">Published</option>
          <option value="draft">Draft</option>
          <option value="pending">Pending</option>
          <option value="future">Scheduled</option>
          <option value="private">Private</option>
        </select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', padding: 24 }}><Loader2 size={18} className="ma-spin" /> Loading…</div>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', padding: 20 }}>No {label.toLowerCase()} found.</p>
      ) : (
        <div style={{ border: '1px solid var(--outline-variant)', borderRadius: 10, overflow: 'hidden' }}>
          {items.map((it, i) => {
            const [bg, fg] = STATUS_STYLE[it.status] || STATUS_STYLE.private;
            return (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: i ? '1px solid var(--outline-variant)' : 'none', background: 'var(--surface-container-low)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stripHtml(it.title?.rendered) || '(no title)'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{new Date(it.modified).toLocaleDateString()} · <span style={{ padding: '1px 7px', borderRadius: 999, background: bg, color: fg }}>{it.status}</span></div>
                </div>
                <a href={it.link} target="_blank" rel="noreferrer" title="View" style={btn()}><Eye size={14} /></a>
                <button onClick={() => openEdit(it)} title="Edit" style={btn()}><Edit2 size={14} /></button>
                <button onClick={() => remove(it)} title="Trash" style={{ ...btn(), color: '#dc2626' }}><Trash2 size={14} /></button>
              </div>
            );
          })}
        </div>
      )}

      {editing && <Editor type={type} label={label} post={editing} cats={cats} onClose={closeEdit} onSaved={(msg) => { showToast(msg); load(); }} />}
      {toast && <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', background: toast.err ? '#dc2626' : '#16a34a', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13.5, zIndex: 1000, boxShadow: '0 8px 24px rgba(0,0,0,.2)' }}>{toast.m}</div>}
    </div>
  );
}

function Editor({ type, label, post, cats, onClose, onSaved }) {
  const [f, setF] = useState(post);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState('visual');   // 'visual' | 'html'
  const [picker, setPicker] = useState(false);
  const [full, setFull] = useState(false);      // distraction-free full screen
  const [newCat, setNewCat] = useState('');
  const [localCats, setLocalCats] = useState(cats);
  const [featuredUrl, setFeaturedUrl] = useState(post._featuredUrl || '');
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const isNew = !post.id;

  useEffect(() => {
    const fm = post.featured_media || post._embedded?.['wp:featuredmedia']?.[0]?.id;
    if (fm) wpGet(`/media/${fm}${qs({ _fields: 'source_url' })}`).then(r => setFeaturedUrl(r.data?.source_url || '')).catch(() => {});
  }, []); // eslint-disable-line

  const save = async (publish) => {
    setSaving(true);
    try {
      const autoExcerpt = (f.excerpt || '').trim() || stripHtml(f.content || '').replace(/\s+/g, ' ').trim().slice(0, 220);
      const body = {
        title: f.title, content: f.content, excerpt: autoExcerpt,
        status: publish === true ? 'publish' : publish === false ? 'draft' : f.status,
      };
      if (type === 'posts') {
        body.categories = f.categories || [];
        // resolve tag names -> ids (creating missing tags)
        const names = (f._tagNames || '').split(',').map(s => s.trim()).filter(Boolean);
        const ids = [];
        for (const name of names) {
          const { data: found } = await wpGet(`/tags${qs({ search: name, per_page: 1 })}`);
          if (found?.[0] && found[0].name.toLowerCase() === name.toLowerCase()) ids.push(found[0].id);
          else { const { data: created } = await wpCreate('/tags', { name }); if (created?.id) ids.push(created.id); }
        }
        body.tags = ids;
      }
      if (f.featured_media !== undefined) body.featured_media = f.featured_media || 0;
      const saved = isNew ? await wpCreate(`/${type}`, body) : await wpUpdate(`/${type}/${post.id}`, body);
      onSaved(isNew ? `${label.replace(/s$/, '')} created.` : 'Saved.');
      onClose();
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 900, display: 'flex', justifyContent: 'center', overflowY: 'auto', padding: full ? 0 : '24px 16px' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: full ? 0 : 14, width: '100%', maxWidth: full ? '100%' : 860, height: full ? '100%' : 'fit-content', maxHeight: full ? '100%' : 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column', border: '1px solid var(--outline-variant)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--outline-variant)' }}>
          <h2 style={{ margin: 0, fontSize: 16, color: 'var(--text-main)' }}>{isNew ? `New ${label.replace(/s$/, '')}` : `Edit ${label.replace(/s$/, '')}`}</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setFull(v => !v)} title={full ? 'Exit full screen' : 'Full screen'} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>{full ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
          </div>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <input value={f.title} onChange={e => set('title', e.target.value)} placeholder="Title" style={{ ...field, fontSize: 18, fontWeight: 700 }} />

          {isNew && !((f.content || '').trim()) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Sparkles size={14} /> Start from a template:</span>
              {[['interview', 'Interview'], ['report', 'Report'], ['news', 'News']].map(([k, lbl]) => (
                <button key={k} onClick={() => set('content', TEMPLATES[k])} style={{ ...btn(), padding: '5px 11px', fontSize: 12.5 }}>{lbl}</button>
              ))}
            </div>
          )}

          {type === 'pages' && post.id && (
            <a href={`https://ties.tiesverse.com/wp-admin/post.php?post=${post.id}&action=elementor`} target="_blank" rel="noreferrer" style={{ ...btn(), alignSelf: 'flex-start', color: '#a855f7' }}><ExternalLink size={14} /> Edit layout in Elementor</a>
          )}

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600 }}>Content</label>
              <div style={{ display: 'inline-flex', border: '1px solid var(--outline-variant)', borderRadius: 8, overflow: 'hidden' }}>
                <button onClick={() => setMode('visual')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: mode === 'visual' ? 'var(--primary)' : 'transparent', color: mode === 'visual' ? '#fff' : 'var(--text-muted)' }}><Type size={13} /> Visual</button>
                <button onClick={() => setMode('html')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: mode === 'html' ? 'var(--primary)' : 'transparent', color: mode === 'html' ? '#fff' : 'var(--text-muted)' }}><Code2 size={13} /> HTML</button>
              </div>
            </div>
            {mode === 'visual'
              ? <RichTextEditor value={f.content} onChange={(html) => set('content', html)} />
              : <textarea value={f.content} onChange={e => set('content', e.target.value)} rows={14} placeholder="Raw HTML…" style={{ ...field, fontFamily: 'ui-monospace, monospace', fontSize: 13, resize: 'vertical' }} />}
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '6px 2px 0' }}>Write normally — use the toolbar for headings, lists, links and images. No HTML needed.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 6 }}>Status</label>
              <select value={f.status} onChange={e => set('status', e.target.value)} style={{ ...field, cursor: 'pointer' }}>
                <option value="draft">Draft</option><option value="publish">Published</option>
                <option value="pending">Pending review</option><option value="private">Private</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 6 }}>Featured image</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {featuredUrl ? <img src={featuredUrl} alt="" style={{ width: 42, height: 42, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--outline-variant)' }} /> : <div style={{ width: 42, height: 42, borderRadius: 6, background: 'var(--surface-container-low)', border: '1px dashed var(--outline-variant)', display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}><ImageIcon size={16} /></div>}
                <button onClick={() => setPicker(true)} style={btn()}>Choose</button>
                {featuredUrl && <button onClick={() => { set('featured_media', 0); setFeaturedUrl(''); }} style={{ ...btn(), color: '#dc2626' }}>Remove</button>}
              </div>
            </div>
          </div>

          {type === 'posts' && (
            <>
              <div>
                <label style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 6 }}>Categories — tap to select</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 130, overflowY: 'auto', padding: 4 }}>
                  {localCats.map(c => {
                    const on = (f.categories || []).includes(c.id);
                    return <button key={c.id} onClick={() => set('categories', on ? f.categories.filter(x => x !== c.id) : [...(f.categories || []), c.id])} style={{ ...btn(on ? 'var(--primary)' : '', on ? '#fff' : ''), padding: '5px 11px', fontSize: 12.5 }}>{c.name}</button>;
                  })}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <input value={newCat} onChange={e => setNewCat(e.target.value)} onKeyDown={async e => {
                    if (e.key === 'Enter' && newCat.trim()) {
                      const name = newCat.trim();
                      try { const { data } = await wpCreate('/categories', { name }); if (data?.id) { setLocalCats(cs => [...cs, data]); set('categories', [...(f.categories || []), data.id]); } } catch (err) { alert(err.message); }
                      setNewCat('');
                    }
                  }} placeholder="+ New category (Enter to add)" style={{ ...field, fontSize: 12.5, padding: '7px 10px' }} />
                </div>
              </div>
              <TagChips value={f._tagNames || ''} onChange={v => set('_tagNames', v)} />
            </>
          )}

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600 }}>Excerpt (short summary)</label>
              <button onClick={() => set('excerpt', stripHtml(f.content || '').replace(/\s+/g, ' ').trim().slice(0, 220))} style={{ fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Sparkles size={12} /> Auto from content</button>
            </div>
            <textarea value={f.excerpt} onChange={e => set('excerpt', e.target.value)} rows={2} placeholder="Leave blank to auto-generate from the content." style={{ ...field, resize: 'vertical' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--outline-variant)', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={onClose} style={btn()}>Cancel</button>
          <button onClick={() => save(false)} disabled={saving} style={btn()}><Save size={14} /> Save draft</button>
          <button onClick={() => save(true)} disabled={saving} style={btn('var(--primary)', '#fff')}>{saving ? <Loader2 size={14} className="ma-spin" /> : <Send size={14} />} {f.status === 'publish' ? 'Update' : 'Publish'}</button>
        </div>
      </div>

      {picker && <MediaPicker onClose={() => setPicker(false)} onPick={(m) => { set('featured_media', m.id); setFeaturedUrl(m.source_url); setPicker(false); }} />}
    </div>
  );
}

function TagChips({ value, onChange }) {
  const [input, setInput] = useState('');
  const tags = (value || '').split(',').map(s => s.trim()).filter(Boolean);
  const add = (t) => { const name = t.trim(); if (name && !tags.includes(name)) onChange([...tags, name].join(', ')); setInput(''); };
  const remove = (t) => onChange(tags.filter(x => x !== t).join(', '));
  return (
    <div>
      <label style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 6 }}>Tags</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: '6px 8px', border: '1px solid var(--outline-variant)', borderRadius: 8, background: 'var(--surface-container-low)' }}>
        {tags.map(t => (
          <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, background: 'var(--surface)', border: '1px solid var(--outline-variant)', borderRadius: 14, padding: '3px 6px 3px 10px' }}>
            {t}<button onClick={() => remove(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'inline-flex', padding: 0 }}><X size={12} /></button>
          </span>
        ))}
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if ((e.key === 'Enter' || e.key === ',') && input.trim()) { e.preventDefault(); add(input); } else if (e.key === 'Backspace' && !input && tags.length) { remove(tags[tags.length - 1]); } }} placeholder={tags.length ? '' : 'Type a tag, press Enter'} style={{ flex: 1, minWidth: 120, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-main)', fontSize: 13.5, padding: '4px 2px' }} />
      </div>
    </div>
  );
}

function MediaPicker({ onClose, onPick }) {
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { wpGet(`/media${qs({ per_page: 40, media_type: 'image', _fields: 'id,source_url,alt_text,title' })}`).then(r => setMedia(r.data || [])).finally(() => setLoading(false)); }, []);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 950, display: 'grid', placeItems: 'center', padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 12, width: '100%', maxWidth: 720, maxHeight: '80vh', display: 'flex', flexDirection: 'column', border: '1px solid var(--outline-variant)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--outline-variant)' }}>
          <h3 style={{ margin: 0, fontSize: 15, color: 'var(--text-main)' }}>Choose an image</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <div style={{ padding: 14, overflowY: 'auto' }}>
          {loading ? <div style={{ color: 'var(--text-muted)', padding: 20, textAlign: 'center' }}><Loader2 size={18} className="ma-spin" /></div> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 }}>
              {media.map(m => <button key={m.id} onClick={() => onPick(m)} style={{ padding: 0, border: '1px solid var(--outline-variant)', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', aspectRatio: '1', background: 'var(--surface-container-low)' }}><img src={m.source_url} alt={m.alt_text} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></button>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
