import { useEffect, useRef, useState } from 'react';
import { useMe } from '../../context/MeContext';
import { mailSsoTicket } from '../../apiClient';

// Standalone webmail. Overridable so a dev build can point at a local instance.
const MAIL_SITE_URL = import.meta.env.VITE_MAIL_URL || 'https://mail.tiesverse.com';

/* The floating mail button.
 *
 * Pressing it grows the icon into a full-bleed wash of its own orange, then
 * hands off to mail.tiesverse.com — so the jump reads as this button opening
 * rather than the page being replaced. The wash is what covers the moment the
 * SSO ticket is being fetched, which is otherwise a blank pause on a slow line.
 *
 * It navigates in the SAME tab, deliberately: a full-screen transition that
 * ends with the page you were already on still sitting there is a lie about
 * what happened.
 */
export default function MailFab() {
  const { mailAccess } = useMe();
  const hasMail = mailAccess === 'admin' || mailAccess === 'user';
  const [going, setGoing] = useState(false);
  const busy = useRef(false);
  const left = useRef(false);   // the handoff has actually been triggered

  /* Coming BACK from mail must land on the dashboard, not on a frozen orange
     screen.
     Browsers keep the whole page — DOM, JS state and all — in the
     back/forward cache when you navigate away, and restore it verbatim on
     Back. That restore includes the wash mid-expansion, so without this the
     dashboard sits hidden underneath it and looks broken.
     `pageshow` fires on that restore with persisted=true, which is the only
     reliable signal; React never re-mounts, so no effect or state reset would
     otherwise run. Clearing both flags puts the button back as it was. */
  useEffect(() => {
    const reset = () => {
      busy.current = false;
      left.current = false;
      setGoing(false);
    };
    // pageshow is the bfcache signal. visibilitychange is the belt-and-braces
    // one: a browser that restores without firing pageshow, or a user who
    // switches tabs away mid-transition and comes back, still gets a clean
    // button rather than a stuck orange screen.
    const onShow = () => reset();
    // Only once we are actually back — `left` is set when the handoff starts,
    // so a tab-switch during the 620ms run-up cannot cancel the animation
    // before the navigation it belongs to has happened.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && left.current) reset();
    };
    window.addEventListener('pageshow', onShow);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('pageshow', onShow);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!hasMail) return null;   // only people who hold a mailbox

  const open = async () => {
    if (busy.current) return;  // a second press must not start a second handoff
    busy.current = true;
    setGoing(true);

    // Fetch the ticket while the wash plays, so the two overlap instead of
    // queueing. A failed ticket is not an error worth showing — mail's own
    // login page is the right destination in that case.
    const res = await mailSsoTicket().catch(() => null);
    const url = res?.code
      ? `${MAIL_SITE_URL}/#sso=${encodeURIComponent(res.code)}`
      : MAIL_SITE_URL;

    // Let the animation land before leaving. Matches the CSS duration; the
    // ticket call has almost always finished well inside it.
    const wait = new Promise((r) => setTimeout(r, 620));
    await wait;
    left.current = true;
    window.location.href = url;
  };

  return (
    <>
      <button
        type="button"
        className={`mail-fab ${going ? 'is-going' : ''}`}
        onClick={open}
        aria-label="Open TIES Mail"
        title="Open TIES Mail"
      >
        <img src="/mail-icon.png" alt="" width="176" height="176" />
      </button>
      {/* The wash and the icon are siblings, not nested: a child of a scaled
          element inherits that scale, and counter-scaling it back is arithmetic
          that breaks at the first odd viewport. Each is animated on its own. */}
      <div className={`mail-fab-wash ${going ? 'is-going' : ''}`} aria-hidden="true" />
      <img src="/mail-icon.png" alt=""
        className={`mail-fab-hero ${going ? 'is-going' : ''}`} aria-hidden="true" />
    </>
  );
}
