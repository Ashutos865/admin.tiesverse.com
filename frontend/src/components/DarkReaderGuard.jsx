import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { stripDarkReader, addLock } from '../lib/darkReaderGuard';

/**
 * Always-on Dark Reader guard. Mounts once near the app root. When Dark Reader
 * touches the page, it strips the changes, locks the extension out, and pops a
 * cheeky top-right toast for 3 seconds.
 */
export default function DarkReaderGuard() {
  const [toast, setToast] = useState(false);

  useEffect(() => {
    let shown = false;

    const notify = () => {
      if (shown) return;
      shown = true;
      setToast(true);
      setTimeout(() => setToast(false), 7000);
    };

    const handle = () => {
      if (stripDarkReader()) { notify(); addLock(); }
    };

    const looksLikeDR = (muts) => {
      for (const m of muts) {
        if (m.type === 'attributes' && (m.attributeName || '').startsWith('data-darkreader')) return true;
        if (m.type === 'childList') {
          for (const n of m.addedNodes) {
            if (n.nodeType === 1 &&
              (n.classList?.contains('darkreader') ||
               (n.tagName === 'META' && n.getAttribute('name') === 'darkreader'))) return true;
          }
        }
      }
      return false;
    };

    handle(); // catch Dark Reader if it already painted before we mounted

    const obs = new MutationObserver((muts) => { if (looksLikeDR(muts)) handle(); });
    if (document.head) obs.observe(document.head, { childList: true });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-darkreader-mode', 'data-darkreader-scheme', 'data-darkreader-proxy-injected'],
    });

    return () => obs.disconnect();
  }, []);

  if (!toast) return null;

  return (
    <div style={S.wrap} role="status">
      <div style={S.icon}><ShieldCheck size={18} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={S.title}>Nice try, Dark Reader 😜</div>
        <div style={S.body}>This page dresses itself, thanks. Extension shown the door.</div>
      </div>
    </div>
  );
}

const S = {
  wrap: {
    position: 'fixed', right: 20, top: 20, zIndex: 100000, width: 320, maxWidth: 'calc(100vw - 40px)',
    display: 'flex', gap: 12, alignItems: 'center', padding: '13px 16px',
    background: 'var(--lg-glass-strong, rgba(255,255,255,.94))', color: 'var(--text-main,#111827)',
    border: '1px solid var(--lg-border, rgba(0,0,0,.08))', borderRadius: 16,
    boxShadow: '0 24px 60px -20px rgba(0,0,0,.4)', backdropFilter: 'blur(24px) saturate(160%)',
    WebkitBackdropFilter: 'blur(24px) saturate(160%)',
    animation: 'drg-in .3s cubic-bezier(.2,.9,.2,1)',
  },
  icon: { flex: 'none', width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(180deg,#ff9a3d,#fe7a00)', color: '#fff' },
  title: { fontSize: 14.5, fontWeight: 800, marginBottom: 2 },
  body: { fontSize: 12.5, lineHeight: 1.45, color: 'var(--text-muted,#6b7280)' },
};
