import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlignCenter, AlignLeft, AlignRight, AtSign, Bold, Italic, Link2, List,
  ListOrdered, Palette, Strikethrough, Underline, X,
} from 'lucide-react';

/* The formatting toolbar and the editable body beneath it.
 *
 * Built on contentEditable + document.execCommand. That API is formally
 * deprecated, but it is the only thing every browser still implements for rich
 * text, and the alternative is shipping a 200KB editor library for bold and
 * bullets. Its output is cleaned server-side before it is ever emailed.
 */

const SWATCHES = [
  { name: 'Default', value: '#111827' },
  { name: 'Grey', value: '#6b7280' },
  { name: 'Orange', value: '#fe7a00' },
  { name: 'Red', value: '#c02626' },
  { name: 'Green', value: '#067a50' },
  { name: 'Blue', value: '#2563eb' },
  { name: 'Purple', value: '#7c3aed' },
];

export default function RichText({ value, onChange, placeholder, people = [], minHeight = 220 }) {
  const ref = useRef(null);
  const [showColors, setShowColors] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const savedRange = useRef(null);

  // The DOM owns the text while typing; writing `value` back on every keystroke
  // would move the caret to the end after each character.
  useEffect(() => {
    const el = ref.current;
    if (el && value !== el.innerHTML) el.innerHTML = value || '';
  }, [value]);

  const emit = useCallback(() => {
    onChange?.(ref.current?.innerHTML || '');
  }, [onChange]);

  const remember = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount) savedRange.current = sel.getRangeAt(0).cloneRange();
  };

  const restore = () => {
    const sel = window.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
  };

  /* Run a command against the selection. The editor must hold focus first, or
     the command applies to nothing and the click appears to do nothing. */
  const run = (command, arg) => {
    ref.current?.focus();
    restore();
    document.execCommand(command, false, arg);
    emit();
  };

  const insertLink = () => {
    const url = linkUrl.trim();
    setLinkOpen(false);
    setLinkUrl('');
    if (!url) return;
    const href = /^https?:\/\/|^mailto:/i.test(url) ? url : `https://${url}`;
    ref.current?.focus();
    restore();
    const sel = window.getSelection();
    if (sel && sel.isCollapsed) {
      // Nothing selected: insert the address itself as the link text, rather
      // than a link wrapped around nothing that nobody can see or click.
      document.execCommand('insertHTML', false,
        `<a href="${href.replace(/"/g, '&quot;')}">${href.replace(/</g, '&lt;')}</a>`);
    } else {
      document.execCommand('createLink', false, href);
    }
    emit();
  };

  const insertMention = (person) => {
    setMentionOpen(false);
    setMentionQuery('');
    ref.current?.focus();
    restore();
    const label = (person.name || person.email || '').replace(/</g, '&lt;');
    document.execCommand('insertHTML', false,
      `<a href="mailto:${person.email}" style="color:#fe7a00">@${label}</a>&nbsp;`);
    emit();
  };

  const onKeyDown = (e) => {
    // The shortcuts people expect. execCommand handles them natively in most
    // browsers, but binding explicitly keeps behaviour identical everywhere.
    if (!(e.metaKey || e.ctrlKey)) return;
    const map = { b: 'bold', i: 'italic', u: 'underline' };
    const command = map[e.key.toLowerCase()];
    if (command) { e.preventDefault(); run(command); }
  };

  /* Pasting from a document or a web page drags styling and markup with it.
     Take the plain text, so a pasted paragraph looks like the rest of the
     message rather than importing somebody else's design. */
  const onPaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
    emit();
  };

  const matches = people
    .filter((p) => {
      const q = mentionQuery.trim().toLowerCase();
      return !q || `${p.name || ''} ${p.email || ''}`.toLowerCase().includes(q);
    })
    .slice(0, 6);

  const Btn = ({ title, onClick, children, active }) => (
    <button type="button" className={`rt-btn ${active ? 'on' : ''}`} title={title}
      aria-label={title}
      onMouseDown={(e) => { e.preventDefault(); remember(); }}
      onClick={onClick}>
      {children}
    </button>
  );

  return (
    <div className="rt">
      <div className="rt-bar" role="toolbar" aria-label="Formatting">
        <Btn title="Bold (⌘B)" onClick={() => run('bold')}><Bold size={15} /></Btn>
        <Btn title="Italic (⌘I)" onClick={() => run('italic')}><Italic size={15} /></Btn>
        <Btn title="Underline (⌘U)" onClick={() => run('underline')}><Underline size={15} /></Btn>
        <Btn title="Strikethrough" onClick={() => run('strikeThrough')}>
          <Strikethrough size={15} />
        </Btn>

        <span className="rt-sep" />

        <span style={{ position: 'relative' }}>
          <Btn title="Text colour" onClick={() => setShowColors((v) => !v)}>
            <Palette size={15} />
          </Btn>
          {showColors && (
            <div className="rt-pop" role="menu">
              {SWATCHES.map((c) => (
                <button key={c.value} type="button" title={c.name} className="rt-swatch"
                  style={{ background: c.value }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { run('foreColor', c.value); setShowColors(false); }} />
              ))}
            </div>
          )}
        </span>

        <span className="rt-sep" />

        <Btn title="Align left" onClick={() => run('justifyLeft')}><AlignLeft size={15} /></Btn>
        <Btn title="Align centre" onClick={() => run('justifyCenter')}><AlignCenter size={15} /></Btn>
        <Btn title="Align right" onClick={() => run('justifyRight')}><AlignRight size={15} /></Btn>

        <span className="rt-sep" />

        <Btn title="Bulleted list" onClick={() => run('insertUnorderedList')}>
          <List size={15} />
        </Btn>
        <Btn title="Numbered list" onClick={() => run('insertOrderedList')}>
          <ListOrdered size={15} />
        </Btn>

        <span className="rt-sep" />

        <span style={{ position: 'relative' }}>
          <Btn title="Insert link" onClick={() => setLinkOpen((v) => !v)}>
            <Link2 size={15} />
          </Btn>
          {linkOpen && (
            <div className="rt-pop rt-pop-wide">
              <input className="field" autoFocus value={linkUrl} placeholder="https://example.com"
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); insertLink(); }
                  if (e.key === 'Escape') { setLinkOpen(false); setLinkUrl(''); }
                }} />
              <button type="button" className="btn btn-sm btn-primary" onClick={insertLink}>
                Add
              </button>
            </div>
          )}
        </span>

        {people.length > 0 && (
          <span style={{ position: 'relative' }}>
            <Btn title="Mention someone" onClick={() => setMentionOpen((v) => !v)}>
              <AtSign size={15} />
            </Btn>
            {mentionOpen && (
              <div className="rt-pop rt-pop-list">
                <input className="field" autoFocus value={mentionQuery}
                  placeholder="Search people…"
                  onChange={(e) => setMentionQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') setMentionOpen(false); }} />
                {matches.map((p) => (
                  <button key={p.email} type="button" className="rt-person"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertMention(p)}>
                    <strong>{p.name || p.email}</strong>
                    <span>{p.email}</span>
                  </button>
                ))}
                {!matches.length && (
                  <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>Nobody matches.</p>
                )}
              </div>
            )}
          </span>
        )}
      </div>

      <div ref={ref} className="rt-body" contentEditable role="textbox" aria-multiline="true"
        aria-label="Message body"
        data-placeholder={placeholder}
        style={{ minHeight }}
        onInput={emit}
        onBlur={() => { remember(); emit(); }}
        onKeyUp={remember}
        onMouseUp={remember}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        suppressContentEditableWarning
      />
    </div>
  );
}
