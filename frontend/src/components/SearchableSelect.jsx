import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, Check, X } from 'lucide-react';

/**
 * A drop-in replacement for a member/person <select> that adds a search box.
 * Works with big lists — type to filter by name (and the optional sub text).
 *
 * Props:
 *   options      : [{ value, label, sub? }]
 *   value        : the selected value (matched with String() so ids/strings both work)
 *   onChange     : (value) => void   (value is '' when cleared)
 *   placeholder  : trigger text when nothing is selected
 *   searchPlaceholder : text inside the search box
 *   clearable    : show an "All / clear" option at the top (value '')
 *   allLabel     : label for that clear option (e.g. "All members")
 *   disabled, style : passthrough
 */
export default function SearchableSelect({
  options = [],
  value = '',
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search name…',
  clearable = false,
  allLabel = 'All',
  disabled = false,
  style,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const selected = options.find((o) => String(o.value) === String(value));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? options.filter((o) => `${o.label} ${o.sub || ''}`.toLowerCase().includes(q))
      : options;
    return clearable ? [{ value: '', label: allLabel, _all: true }, ...base] : base;
  }, [options, query, clearable, allLabel]);

  useEffect(() => {
    const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) close(); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
    if (open) setActive(0);
  }, [open]);

  const close = () => { setOpen(false); setQuery(''); };
  const pick = (o) => { onChange && onChange(o.value); close(); };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[active]) pick(filtered[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };

  useEffect(() => {
    const el = listRef.current?.children[active];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const triggerText = selected ? selected.label : (clearable && !value ? allLabel : placeholder);

  return (
    <div ref={rootRef} style={{ position: 'relative', ...style }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border, #d1d5db)',
          background: 'var(--surface-hover, #fff)', color: 'var(--text-main, #161616)',
          fontSize: 14, fontFamily: 'inherit', cursor: disabled ? 'default' : 'pointer',
          textAlign: 'left', opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selected || (clearable && !value) ? 'var(--text-main, #161616)' : 'var(--text-muted, #6b7280)' }}>
          {triggerText}
        </span>
        <ChevronDown size={15} style={{ flex: 'none', color: 'var(--text-muted, #6b7280)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', zIndex: 10050, top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--surface-container-lowest, #fff)', border: '1px solid var(--outline-variant, #e5e7eb)',
          borderRadius: 12, boxShadow: '0 20px 50px -20px rgba(0,0,0,.35)', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: '1px solid var(--outline-variant, #eee)' }}>
            <Search size={15} style={{ color: 'var(--text-muted, #6b7280)', flex: 'none' }} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={onKey}
              placeholder={searchPlaceholder}
              style={{ flex: 1, border: 0, outline: 'none', background: 'transparent', fontSize: 14, color: 'var(--text-main, #161616)' }}
            />
            {query && <X size={14} style={{ cursor: 'pointer', color: 'var(--text-muted, #6b7280)' }} onClick={() => setQuery('')} />}
          </div>
          <div ref={listRef} style={{ maxHeight: 260, overflowY: 'auto', padding: 4 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '14px 12px', fontSize: 13, color: 'var(--text-muted, #6b7280)', textAlign: 'center' }}>No match</div>
            ) : filtered.map((o, i) => {
              const isSel = String(o.value) === String(value);
              const isActive = i === active;
              return (
                <button
                  key={`${o.value}-${i}`}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                    padding: '8px 10px', borderRadius: 8, border: 0, cursor: 'pointer',
                    background: isActive ? 'color-mix(in srgb, var(--primary, #fe7a00) 12%, transparent)' : 'transparent',
                    color: 'var(--text-main, #161616)', fontSize: 13.5, fontFamily: 'inherit',
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: o._all ? 700 : 600 }}>{o.label}</span>
                    {o.sub ? <span style={{ color: 'var(--text-muted, #6b7280)', marginLeft: 6, fontWeight: 400 }}>{o.sub}</span> : null}
                  </span>
                  {isSel && <Check size={15} style={{ flex: 'none', color: 'var(--primary, #fe7a00)' }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
