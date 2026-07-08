import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, CornerDownLeft } from 'lucide-react';

/**
 * Generic command palette (⌘K / Ctrl+K).
 * Adapted from the Ripple pattern, re-skinned to the TIES admin tokens and made
 * theme-aware via CSS vars. Consumers pass a flat `commands` array:
 *   { id, label, hint, icon: LucideComponent, run: () => void, keywords?: string }
 */
export default function CommandPalette({ commands, onClose }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return commands;
    return commands.filter((c) => {
      const hay = `${c.label} ${c.hint || ''} ${c.keywords || ''}`.toLowerCase();
      return term.split(/\s+/).every((w) => hay.includes(w));
    });
  }, [q, commands]);

  // Reset highlight to the top whenever the filtered set changes.
  useEffect(() => { setActive(0); }, [q]);

  // Autofocus the input on open.
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Keep the highlighted row scrolled into view.
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, results]);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = results[active];
      if (cmd) { cmd.run(); onClose(); }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div style={S.backdrop} onMouseDown={onClose} role="presentation">
      <div style={S.palette} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Command palette">
        <div style={S.inputRow}>
          <Search size={18} style={{ color: 'var(--text-muted,#9ca3af)', flex: 'none' }} />
          <input
            ref={inputRef}
            style={S.input}
            placeholder="Search pages and actions…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd style={S.esc}>Esc</kbd>
        </div>

        <div ref={listRef} style={S.list} className="custom-scrollbar">
          {results.length === 0 ? (
            <div style={S.empty}>No matches for “{q}”.</div>
          ) : (
            results.map((c, i) => {
              const Icon = c.icon;
              const on = i === active;
              return (
                <button
                  key={c.id}
                  type="button"
                  data-active={on}
                  style={{ ...S.item, ...(on ? S.itemActive : null) }}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => { c.run(); onClose(); }}
                >
                  {Icon ? <Icon size={16} strokeWidth={1.9} style={{ flex: 'none', color: on ? '#FE7A00' : 'var(--text-muted,#9ca3af)' }} /> : null}
                  <span style={S.itemLabel}>{c.label}</span>
                  {c.hint ? <span style={S.itemHint}>{c.hint}</span> : null}
                  {on ? <CornerDownLeft size={14} style={{ flex: 'none', color: '#FE7A00' }} /> : null}
                </button>
              );
            })
          )}
        </div>

        <div style={S.footer}>
          <span><kbd style={S.k}>↑</kbd><kbd style={S.k}>↓</kbd> navigate</span>
          <span><kbd style={S.k}>↵</kbd> open</span>
          <span><kbd style={S.k}>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

const S = {
  backdrop: {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(22,15,8,.42)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    padding: '12vh 16px 16px',
  },
  palette: {
    width: '100%', maxWidth: 560,
    background: 'var(--lg-glass-strong)', color: 'var(--text-main,#111827)',
    backdropFilter: 'blur(30px) saturate(175%)', WebkitBackdropFilter: 'blur(30px) saturate(175%)',
    border: '1px solid var(--lg-border)', borderRadius: 22,
    boxShadow: 'inset 0 1px 0 var(--lg-highlight), 0 34px 74px -20px rgba(0,0,0,.4)', overflow: 'hidden',
    display: 'flex', flexDirection: 'column', maxHeight: '68vh',
  },
  inputRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '14px 16px', borderBottom: '1px solid var(--border,#e5e7eb)',
  },
  input: {
    flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
    fontSize: 16, color: 'var(--text,#111827)',
  },
  esc: {
    flex: 'none', fontSize: 11, fontWeight: 600, color: 'var(--text-muted,#9ca3af)',
    border: '1px solid var(--border,#e5e7eb)', borderRadius: 6, padding: '2px 6px',
  },
  list: { overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 2 },
  item: {
    display: 'flex', alignItems: 'center', gap: 12, width: '100%',
    padding: '10px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
    background: 'transparent', textAlign: 'left', color: 'var(--text,#111827)',
  },
  itemActive: { background: '#FE7A0014' },
  itemLabel: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  itemHint: { flex: 'none', fontSize: 12, color: 'var(--text-muted,#9ca3af)' },
  empty: { padding: '28px 16px', textAlign: 'center', color: 'var(--text-muted,#9ca3af)', fontSize: 14 },
  footer: {
    display: 'flex', gap: 16, padding: '10px 16px', borderTop: '1px solid var(--border,#e5e7eb)',
    fontSize: 12, color: 'var(--text-muted,#9ca3af)',
  },
  k: {
    display: 'inline-block', minWidth: 18, textAlign: 'center', marginRight: 3,
    fontSize: 11, border: '1px solid var(--border,#e5e7eb)', borderRadius: 5, padding: '1px 5px',
  },
};
