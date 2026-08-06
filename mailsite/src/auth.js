/* Session handling for TIES Mail.
 *
 * Two ways in:
 *   portal — work email or Crew ID + password, same account as the panel
 *   sso    — arriving from the admin panel already signed in
 *
 * There used to be a third: a team mailbox's own password. It is gone. A team
 * mailbox is now reached by granting it to someone's normal account, so a
 * password can neither leak nor hide who actually read or sent a message.
 *
 * Tokens live in sessionStorage rather than localStorage: mail is often read on
 * a shared or borrowed machine, and closing the tab should end the session.
 */
export const TOKENS_KEY = 'tiesverseAuthTokens';
// Retired. Kept only so signOut can clear a token left in an old session.
export const SHARED_KEY = 'tiesMailSharedToken';

const API_BASE = import.meta.env.VITE_API_URL || 'https://admin.tiesverse.com';

function read(key) {
  try {
    return JSON.parse(sessionStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

export function getTokens() {
  return read(TOKENS_KEY);
}
export function getAccess() {
  return getTokens()?.access || null;
}
/* Always null. The server no longer issues or honours a shared-mailbox token,
   so a stale one left in an old tab must not be treated as a session — it would
   look signed in and then have every request refused. */
export function getSharedToken() {
  return null;
}
export function setTokens(tokens) {
  sessionStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}
export function signOut() {
  sessionStorage.removeItem(TOKENS_KEY);
  sessionStorage.removeItem(SHARED_KEY);   // clear any retired token too
}
export function isSignedIn() {
  return Boolean(getAccess());
}

/* Decode a JWT payload without a library. Only used to read `exp` for a
   pre-emptive refresh; the server is what actually validates anything. */
export function decodeJwt(token) {
  try {
    const part = token.split('.')[1];
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(
      decodeURIComponent(
        [...json].map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
      ),
    );
  } catch {
    return null;
  }
}

export function accessExpiresSoon(withinSeconds = 60) {
  const exp = decodeJwt(getAccess() || '')?.exp;
  if (!exp) return false;
  return exp * 1000 - Date.now() < withinSeconds * 1000;
}

/* Trade the refresh token for a new access token. Returns true on success.
   Concurrent 401s share one in-flight call so a burst of requests does not
   fire a burst of refreshes. */
let refreshing = null;
export function refreshAccess() {
  const refresh = getTokens()?.refresh;
  if (!refresh) return Promise.resolve(false);
  if (refreshing) return refreshing;

  refreshing = fetch(`${API_BASE}/api/token/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data?.access) return false;
      setTokens({
        ...getTokens(),
        access: data.access,
        ...(data.refresh ? { refresh: data.refresh } : {}),
      });
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });

  return refreshing;
}

export async function signIn(username, password) {
  try {
    const res = await fetch(`${API_BASE}/api/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: data?.detail || 'That email or password was not recognised.' };
    }
    setTokens({ access: data.access, refresh: data.refresh });
    return { ok: true };
  } catch {
    return { error: 'Could not reach the server. Check your connection.' };
  }
}

/* signInShared is gone with the endpoint it called. A team mailbox is opened by
   signing in as yourself; if it has been granted to you it appears in your
   sidebar alongside your own. */

/* Arriving from the admin panel: the code rides in the URL fragment, which
   browsers never send to a server and proxies never log. It is redeemed before
   the app renders and wiped from the address bar immediately after, so it
   cannot be copied out of a URL or resurrected from history. */
export async function consumeSsoFromUrl() {
  const hash = window.location.hash || '';
  const match = hash.match(/[#&]sso=([^&]+)/);
  if (!match) return { ok: false, tried: false };

  const code = decodeURIComponent(match[1]);
  window.history.replaceState(null, '', window.location.pathname + window.location.search);

  try {
    const res = await fetch(`${API_BASE}/api/mail/sso-redeem/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.access) {
      return { ok: false, tried: true, error: data?.error || 'That sign-in link did not work.' };
    }
    setTokens({ access: data.access, refresh: data.refresh });
    return { ok: true, tried: true, user: data.user };
  } catch {
    return { ok: false, tried: true, error: 'Could not reach the server.' };
  }
}
