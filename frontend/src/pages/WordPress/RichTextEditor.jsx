import { useRef, useEffect, useState } from 'react';
import {
  Bold, Italic, Underline, Heading2, Heading3, List, ListOrdered,
  Link2, Quote, Image as ImageIcon, Undo2, Redo2, Eraser, Loader2, Pilcrow,
} from 'lucide-react';
import { wpUploadMedia } from './wpApi';

/**
 * Visual (WYSIWYG) editor for non-technical writers. Produces plain HTML that
 * WordPress stores directly — so no one has to hand-write tags. Bold/italic,
 * headings, lists, quotes, links, and inline image upload. A raw-HTML mode is
 * still available in the parent for technical users.
 */
// Strip messy formatting (Word/Docs/Sheets): keep meaningful tags, drop styles,
// classes, spans, mso junk — so pasted content stays clean.
function cleanHtml(html) {
  const root = document.createElement('div');
  root.innerHTML = html;
  root.querySelectorAll('style,script,meta,link,title').forEach((n) => n.remove());
  const allowed = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'A', 'BLOCKQUOTE', 'IMG']);
  const walk = (node) => {
    [...node.children].forEach((el) => {
      walk(el);
      [...el.attributes].forEach((a) => {
        const keep = (el.tagName === 'A' && a.name === 'href') || (el.tagName === 'IMG' && (a.name === 'src' || a.name === 'alt'));
        if (!keep) el.removeAttribute(a.name);
      });
      if (!allowed.has(el.tagName)) el.replaceWith(...el.childNodes);
    });
  };
  walk(root);
  return root.innerHTML;
}

export default function RichTextEditor({ value, onChange, placeholder = 'Start writing your article…' }) {
  const ref = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [empty, setEmpty] = useState(!value);
  const [words, setWords] = useState(0);

  // Load initial content / a different post — without clobbering the cursor while typing.
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== (value || '')) el.innerHTML = value || '';
    const txt = el ? el.textContent.trim() : '';
    setEmpty(!txt);
    setWords(txt ? txt.split(/\s+/).length : 0);
  }, [value]);

  const sync = () => {
    const el = ref.current;
    onChange(el.innerHTML);
    const txt = el.textContent.trim();
    setEmpty(!txt);
    setWords(txt ? txt.split(/\s+/).length : 0);
  };

  const onPaste = (e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    ref.current?.focus();
    if (html) document.execCommand('insertHTML', false, cleanHtml(html));
    else document.execCommand('insertText', false, text);
    sync();
  };
  const exec = (cmd, arg) => { ref.current?.focus(); document.execCommand(cmd, false, arg); sync(); };
  const block = (tag) => exec('formatBlock', tag);

  const addLink = () => {
    const url = window.prompt('Link URL (https://…)');
    if (url) exec('createLink', /^https?:\/\//i.test(url) ? url : `https://${url}`);
  };
  const addImage = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await wpUploadMedia(file);
      const url = res?.data?.source_url;
      if (url) exec('insertImage', url);
      else alert('Upload failed.');
    } catch (e) { alert('Image upload failed: ' + e.message); }
    setUploading(false);
  };

  const Btn = ({ icon: Icon, title, onClick, active }) => (
    <button type="button" title={title} onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      style={{ display: 'grid', placeItems: 'center', width: 32, height: 30, border: 'none', borderRadius: 7, cursor: 'pointer', background: active ? 'var(--surface-container-low)' : 'transparent', color: 'var(--text-main)' }}>
      <Icon size={16} />
    </button>
  );
  const Sep = () => <span style={{ width: 1, height: 20, background: 'var(--outline-variant)', margin: '0 3px' }} />;

  return (
    <div style={{ border: '1px solid var(--outline-variant)', borderRadius: 10, overflow: 'hidden', background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', padding: '5px 7px', borderBottom: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)' }}>
        <Btn icon={Bold} title="Bold (Ctrl+B)" onClick={() => exec('bold')} />
        <Btn icon={Italic} title="Italic (Ctrl+I)" onClick={() => exec('italic')} />
        <Btn icon={Underline} title="Underline" onClick={() => exec('underline')} />
        <Sep />
        <Btn icon={Heading2} title="Heading" onClick={() => block('<h2>')} />
        <Btn icon={Heading3} title="Sub-heading" onClick={() => block('<h3>')} />
        <Btn icon={Pilcrow} title="Normal text" onClick={() => block('<p>')} />
        <Sep />
        <Btn icon={List} title="Bullet list" onClick={() => exec('insertUnorderedList')} />
        <Btn icon={ListOrdered} title="Numbered list" onClick={() => exec('insertOrderedList')} />
        <Btn icon={Quote} title="Quote" onClick={() => block('<blockquote>')} />
        <Sep />
        <Btn icon={Link2} title="Add link" onClick={addLink} />
        <label title="Insert image" style={{ display: 'grid', placeItems: 'center', width: 32, height: 30, borderRadius: 7, cursor: 'pointer', color: 'var(--text-main)' }}>
          {uploading ? <Loader2 size={16} className="ma-spin" /> : <ImageIcon size={16} />}
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { addImage(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <Sep />
        <Btn icon={Eraser} title="Clear formatting" onClick={() => exec('removeFormat')} />
        <Btn icon={Undo2} title="Undo" onClick={() => exec('undo')} />
        <Btn icon={Redo2} title="Redo" onClick={() => exec('redo')} />
      </div>

      <div style={{ position: 'relative' }}>
        {empty && <div style={{ position: 'absolute', top: 16, left: 18, color: 'var(--text-muted)', pointerEvents: 'none', fontSize: 15 }}>{placeholder}</div>}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={sync}
          onBlur={sync}
          onPaste={onPaste}
          className="rte-body"
          style={{ minHeight: 300, maxHeight: '52vh', overflowY: 'auto', padding: '14px 18px', outline: 'none', fontSize: 15, lineHeight: 1.6, color: 'var(--text-main)' }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '5px 12px', borderTop: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)', fontSize: 11.5, color: 'var(--text-muted)' }}>
        <span>{words} word{words === 1 ? '' : 's'}</span>
        <span>·</span>
        <span>{Math.max(1, Math.ceil(words / 200))} min read</span>
      </div>
      <style>{`
        .rte-body h2{font-size:1.5em;font-weight:800;margin:.6em 0 .3em}
        .rte-body h3{font-size:1.2em;font-weight:700;margin:.6em 0 .3em}
        .rte-body p{margin:.5em 0}
        .rte-body ul,.rte-body ol{margin:.5em 0 .5em 1.4em}
        .rte-body blockquote{border-left:3px solid var(--primary);margin:.6em 0;padding:.2em 0 .2em 14px;color:var(--text-muted)}
        .rte-body a{color:var(--primary);text-decoration:underline}
        .rte-body img{max-width:100%;height:auto;border-radius:8px;margin:.5em 0}
      `}</style>
    </div>
  );
}
