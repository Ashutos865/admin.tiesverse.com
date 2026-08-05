/* A right-click menu.
 *
 * Opened with a point, not an element: `open({x, y, items})`. It keeps itself
 * on screen by measuring after mount and folding back from whichever edge it
 * would have crossed, so a right-click at the bottom of the list opens upward
 * instead of off the window.
 *
 * Everything a mouse can do here a keyboard can do too — the same menu opens on
 * the context-menu key, arrows move through it, Enter picks, Escape leaves.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export function useContextMenu() {
  const [menu, setMenu] = useState(null);
  const open = useCallback((event, items) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY, items });
  }, []);
  const close = useCallback(() => setMenu(null), []);
  return { menu, open, close };
}

export default function ContextMenu({ menu, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });
  const [active, setActive] = useState(-1);

  const items = menu?.items || [];
  const pickable = items.map((it, i) => (it.separator || it.disabled ? -1 : i))
    .filter((i) => i >= 0);

  // Measure once mounted, then place. Starting off-screen keeps the unplaced
  // first frame from flashing in the corner.
  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    const pad = 8;
    const left = menu.x + box.width + pad > window.innerWidth
      ? Math.max(pad, menu.x - box.width)
      : menu.x;
    const top = menu.y + box.height + pad > window.innerHeight
      ? Math.max(pad, menu.y - box.height)
      : menu.y;
    setPos({ left, top });
    setActive(-1);
  }, [menu]);

  useEffect(() => {
    if (!menu) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!pickable.length) return;
        const at = pickable.indexOf(active);
        const next = e.key === 'ArrowDown'
          ? pickable[(at + 1 + pickable.length) % pickable.length]
          : pickable[(at - 1 + pickable.length) % pickable.length];
        setActive(next);
        return;
      }
      if (e.key === 'Enter' && active >= 0) {
        e.preventDefault();
        const item = items[active];
        if (item && !item.disabled && !item.separator) { onClose(); item.onSelect?.(); }
      }
    };
    // Any click, scroll or resize elsewhere dismisses — a menu must never be
    // left hanging over content it no longer belongs to.
    const onAway = () => onClose();
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onAway);
    window.addEventListener('resize', onAway);
    window.addEventListener('scroll', onAway, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onAway);
      window.removeEventListener('resize', onAway);
      window.removeEventListener('scroll', onAway, true);
    };
  }, [menu, onClose, active, items, pickable]);

  if (!menu) return null;

  return (
    <div className="ctx-menu" role="menu" ref={ref} style={pos}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}>
      {items.map((item, i) => (
        item.separator
          ? <div key={`sep-${i}`} className="ctx-sep" role="separator" />
          : (
            <button key={item.key || i} type="button" role="menuitem"
              className={`ctx-item ${active === i ? 'active' : ''} ${item.danger ? 'danger' : ''}`}
              disabled={item.disabled}
              onMouseEnter={() => setActive(i)}
              onClick={() => { onClose(); item.onSelect?.(); }}>
              {item.icon}
              <span className="ctx-label">{item.label}</span>
              {item.hint && <span className="ctx-hint">{item.hint}</span>}
            </button>
          )
      ))}
    </div>
  );
}
