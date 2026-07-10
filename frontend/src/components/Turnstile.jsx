import { useEffect, useRef } from 'react';

// Cloudflare Turnstile widget. Renders only when VITE_TURNSTILE_SITE_KEY is set,
// so login is unchanged until you configure the key. onToken(token) fires with a
// fresh token on success, and '' when it expires/errors (so the form re-requires it).
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
export const TURNSTILE_ENABLED = Boolean(SITE_KEY);

const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

export default function Turnstile({ onToken, resetKey = 0 }) {
  const boxRef = useRef(null);
  const widgetId = useRef(null);
  const cb = useRef(onToken);
  cb.current = onToken;

  // Re-issue a fresh token when the parent bumps resetKey (e.g. after a failed
  // login, since Turnstile tokens are single-use once verified server-side).
  useEffect(() => {
    if (resetKey && window.turnstile && widgetId.current != null) {
      window.turnstile.reset(widgetId.current);
    }
  }, [resetKey]);

  useEffect(() => {
    if (!SITE_KEY) return undefined;
    let cancelled = false;

    const render = () => {
      if (cancelled || !window.turnstile || !boxRef.current || widgetId.current != null) return;
      widgetId.current = window.turnstile.render(boxRef.current, {
        sitekey: SITE_KEY,
        theme: 'auto',
        callback: (t) => cb.current && cb.current(t),
        'expired-callback': () => cb.current && cb.current(''),
        'error-callback': () => cb.current && cb.current(''),
      });
    };

    if (window.turnstile) {
      render();
      return () => { cancelled = true; };
    }
    if (!document.getElementById(SCRIPT_ID)) {
      const s = document.createElement('script');
      s.id = SCRIPT_ID;
      s.src = SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }
    const timer = setInterval(() => {
      if (window.turnstile) { clearInterval(timer); render(); }
    }, 150);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  if (!SITE_KEY) return null;
  return <div ref={boxRef} style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 14px' }} />;
}
