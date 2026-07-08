/**
 * Dark Reader guard — always on, no opt-out.
 *
 * Dark Reader repaints a page by injecting `<style class="darkreader…">` into
 * <head>, stamping `data-darkreader-*` attributes on <html>, and (Filter mode)
 * applying a CSS filter on the root. That mangles our Liquid-Glass palette.
 *
 * We let it act for a split second so we can DETECT it (and pop a cheeky
 * toast), then strip its artifacts and drop `<meta name="darkreader-lock">` —
 * Dark Reader's own opt-out — so it backs off and can't come back this session.
 */

/** Remove Dark Reader's injected artifacts. Returns true if anything was found. */
export function stripDarkReader() {
  let found = false;
  try {
    document.querySelectorAll('style.darkreader').forEach(el => { el.remove(); found = true; });
    document.querySelectorAll('meta[name="darkreader"]').forEach(el => { el.remove(); found = true; });
    const de = document.documentElement;
    ['data-darkreader-mode', 'data-darkreader-scheme', 'data-darkreader-proxy-injected'].forEach(a => {
      if (de.hasAttribute(a)) { de.removeAttribute(a); found = true; }
    });
  } catch {
    /* never throw — this must not break the app */
  }
  return found;
}

/** Drop Dark Reader's official opt-out so it stops re-injecting after detection. */
export function addLock() {
  if (document.querySelector('meta[name="darkreader-lock"]')) return;
  const m = document.createElement('meta');
  m.name = 'darkreader-lock';
  (document.head || document.documentElement).appendChild(m);
}
