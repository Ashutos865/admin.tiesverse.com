import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Check, X, ChevronDown, Users } from 'lucide-react';

/**
 * Searchable, multi-select interviewer picker.
 *
 * Props:
 *   options  : [{ name, email, role }]
 *   emails   : comma-separated string of selected emails (the stored value)
 *   names    : comma-separated string of selected names (kept in sync)
 *   onChange : ({ emails, names }) => void
 */
export default function InterviewerPicker({ options = [], emails = '', names = '', onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const selectedEmails = useMemo(
    () => (emails || '').split(',').map((e) => e.trim()).filter(Boolean),
    [emails]);
  const selectedNames = useMemo(
    () => (names || '').split(',').map((n) => n.trim()).filter(Boolean),
    [names]);

  // Any selected email not in `options` (e.g. a legacy free-text interviewer) is
  // still shown as a chip using its stored name.
  const chips = useMemo(() => selectedEmails.map((em, i) => {
    const o = options.find((x) => x.email === em);
    return { email: em, name: o?.name || selectedNames[i] || em };
  }), [selectedEmails, selectedNames, options]);

  useEffect(() => {
    const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => `${o.name} ${o.email} ${o.role || ''}`.toLowerCase().includes(q));
  }, [options, query]);

  const toggle = (o) => {
    const has = selectedEmails.includes(o.email);
    let nextEmails, nextNames;
    if (has) {
      const idx = selectedEmails.indexOf(o.email);
      nextEmails = selectedEmails.filter((_, i) => i !== idx);
      nextNames = chips.filter((_, i) => i !== idx).map((c) => c.name);
    } else {
      nextEmails = [...selectedEmails, o.email];
      nextNames = [...chips.map((c) => c.name), o.name];
    }
    onChange && onChange({ emails: nextEmails.join(', '), names: nextNames.join(', ') });
  };

  const removeChip = (email) => {
    const idx = selectedEmails.indexOf(email);
    if (idx < 0) return;
    const nextEmails = selectedEmails.filter((_, i) => i !== idx);
    const nextNames = chips.filter((_, i) => i !== idx).map((c) => c.name);
    onChange && onChange({ emails: nextEmails.join(', '), names: nextNames.join(', ') });
  };

  const fieldBg = 'var(--surface-container-low, #f4f4f6)';
  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      {/* Trigger — shows selected chips */}
      <div
        onClick={() => setOpen((o) => !o)}
        style={{ minHeight: 40, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--outline-variant, #d1d5db)', background: fieldBg, cursor: 'pointer' }}
      >
        {chips.length === 0 && <span style={{ color: 'var(--text-muted, #6b7280)', fontSize: 14 }}>Select interviewer(s)…</span>}
        {chips.map((c) => (
          <span key={c.email} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'color-mix(in srgb, var(--primary, #fe7a00) 12%, transparent)', color: 'var(--text-main, #161616)', borderRadius: 999, padding: '3px 8px 3px 10px', fontSize: 12.5, fontWeight: 600 }}>
            {c.name}
            <X size={12} style={{ cursor: 'pointer', color: 'var(--text-muted, #6b7280)' }} onClick={(e) => { e.stopPropagation(); removeChip(c.email); }} />
          </span>
        ))}
        <ChevronDown size={15} style={{ marginLeft: 'auto', flex: 'none', color: 'var(--text-muted, #6b7280)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </div>

      {open && (
        <div style={{ position: 'absolute', zIndex: 10050, top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--surface-container-lowest, #fff)', border: '1px solid var(--outline-variant, #e5e7eb)', borderRadius: 12, boxShadow: '0 20px 50px -20px rgba(0,0,0,.35)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: '1px solid var(--outline-variant, #eee)' }}>
            <Search size={15} style={{ color: 'var(--text-muted, #6b7280)', flex: 'none' }} />
            <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people…" style={{ flex: 1, border: 0, outline: 'none', background: 'transparent', fontSize: 14, color: 'var(--text-main, #161616)' }} />
            {chips.length > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted, #6b7280)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Users size={12} /> {chips.length}</span>}
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto', padding: 4 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '14px 12px', fontSize: 13, color: 'var(--text-muted, #6b7280)', textAlign: 'center' }}>No match</div>
            ) : filtered.map((o) => {
              const sel = selectedEmails.includes(o.email);
              return (
                <button key={o.email} type="button" onClick={() => toggle(o)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: 0, cursor: 'pointer', background: sel ? 'color-mix(in srgb, var(--primary, #fe7a00) 10%, transparent)' : 'transparent', color: 'var(--text-main, #161616)', fontSize: 13.5, fontFamily: 'inherit' }}>
                  <span style={{ width: 16, height: 16, flex: 'none', borderRadius: 4, border: `1.5px solid ${sel ? 'var(--primary, #fe7a00)' : 'var(--outline-variant, #cbd5e1)'}`, background: sel ? 'var(--primary, #fe7a00)' : 'transparent', display: 'grid', placeItems: 'center' }}>
                    {sel && <Check size={12} style={{ color: '#fff' }} />}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 600 }}>{o.name}</span>
                    {o.role ? <span style={{ color: 'var(--text-muted, #6b7280)', marginLeft: 6, fontWeight: 400, fontSize: 12 }}>· {String(o.role).replace('_', ' ')}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
