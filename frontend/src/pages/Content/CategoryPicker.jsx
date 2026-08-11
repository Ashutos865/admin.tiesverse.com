import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, X } from 'lucide-react';

/**
 * Notion-style category combobox.
 *
 * Type to filter; if nothing matches, the first row becomes "Create <name>"
 * so a project can be named without leaving the panel. That is the whole point
 * of this control: the old field was free text, so every typo silently became
 * a new "brand" and nothing could be grouped.
 */
const DOT_COLORS = ['#fe7a00', '#16a34a', '#0ea5e9', '#9b26ff', '#e0a400', '#ec4899', '#14b8a6'];
const colorFor = (name = '') => {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return DOT_COLORS[Math.abs(h) % DOT_COLORS.length];
};

export default function CategoryPicker({
  categories = [], value, onChange, onCreate, disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const selected = categories.find((c) => String(c.id) === String(value)) || null;

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    setTimeout(() => inputRef.current?.focus(), 30);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const needle = q.trim().toLowerCase();
  const matches = useMemo(
    () => categories.filter((c) => c.name.toLowerCase().includes(needle)),
    [categories, needle],
  );
  const exact = categories.some((c) => c.name.toLowerCase() === needle);
  const canCreate = needle.length > 0 && !exact && typeof onCreate === 'function';

  const pick = (cat) => { onChange(cat ? cat.id : null); setOpen(false); setQ(''); };

  const create = async () => {
    const name = q.trim();
    if (!name || busy) return;
    setBusy(true);
    const made = await onCreate(name);
    setBusy(false);
    if (made?.id) pick(made);
  };

  const rowBtn = {
    display: 'flex', alignItems: 'center', gap: 9, width: '100%', minHeight: 40,
    padding: '9px 11px', border: 'none', background: 'none', cursor: 'pointer',
    fontSize: 13.5, color: 'var(--text-main)', textAlign: 'left',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          width: '100%', minHeight: 42, padding: '9px 11px', borderRadius: 8,
          border: '1px solid var(--outline-variant)', background: 'var(--surface-container-lowest)',
          color: selected ? 'var(--text-main)' : 'var(--text-muted)', fontSize: 13,
          cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {selected && (
            <span style={{
              width: 9, height: 9, borderRadius: '50%', flex: 'none',
              background: selected.color || colorFor(selected.name),
            }}
            />
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selected ? selected.name : 'No category'}
          </span>
        </span>
        <ChevronDown size={15} style={{ flex: 'none', opacity: 0.6 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 40,
          background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)',
          borderRadius: 10, boxShadow: '0 12px 30px rgba(0,0,0,.16)', overflow: 'hidden',
        }}
        >
          <div style={{ padding: 8, borderBottom: '1px solid var(--outline-variant)' }}>
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (matches.length) pick(matches[0]);
                  else if (canCreate) create();
                }
              }}
              placeholder="Search or create…"
              style={{
                width: '100%', minHeight: 38, padding: '8px 10px', borderRadius: 7, fontSize: 13,
                border: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)',
                color: 'var(--text-main)', outline: 'none',
              }}
            />
          </div>

          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {canCreate && (
              <button type="button" onClick={create} disabled={busy} style={{ ...rowBtn, fontWeight: 700 }}>
                <Plus size={15} style={{ color: 'var(--primary)' }} />
                {busy ? 'Creating…' : <>Create <b>{q.trim()}</b></>}
              </button>
            )}

            {value != null && !needle && (
              <button type="button" onClick={() => pick(null)} style={{ ...rowBtn, color: 'var(--text-muted)' }}>
                <X size={14} /> Clear category
              </button>
            )}

            {matches.map((c) => (
              <button key={c.id} type="button" onClick={() => pick(c)} style={rowBtn}>
                <span style={{
                  width: 9, height: 9, borderRadius: '50%', flex: 'none',
                  background: c.color || colorFor(c.name),
                }}
                />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.name}
                </span>
                {typeof c.item_count === 'number' && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.item_count}</span>
                )}
                {String(c.id) === String(value) && <Check size={15} style={{ color: 'var(--primary)' }} />}
              </button>
            ))}

            {!matches.length && !canCreate && (
              <p style={{ padding: '14px 12px', margin: 0, fontSize: 12.5, color: 'var(--text-muted)' }}>
                No categories yet. Type a name to create one.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { colorFor };
