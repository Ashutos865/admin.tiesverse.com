/* TIES Mail — API layer.
   Talks to the same admin backend as the portal. Two ways to authenticate:
     • a portal JWT (Authorization: Bearer …) — the person's normal login
     • a shared-mailbox token (X-Mail-Token) — team sign-in to ONE mailbox
   Requests never throw; they resolve to { error } so callers stay simple. */

export const API_URL = import.meta.env.VITE_API_URL || 'https://admin.tiesverse.com';

export const MAIL_TOKEN_KEY = 'tiesMailSharedToken';

export const readSharedToken = () => {
  try { return sessionStorage.getItem(MAIL_TOKEN_KEY) || null; } catch { return null; }
};
export const storeSharedToken = (t) => { try { sessionStorage.setItem(MAIL_TOKEN_KEY, t); } catch { /* ignore */ } };
export const clearSharedToken = () => { try { sessionStorage.removeItem(MAIL_TOKEN_KEY); } catch { /* ignore */ } };

async function request(path, { method = 'GET', body, token, mailToken } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (mailToken) headers['X-Mail-Token'] = mailToken;
  else if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { error: 'Could not reach the server. Check your connection.' };
  }

  if (res.status === 204) return { success: true };
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch { return { error: `Server error (${res.status}).` }; }

  if (!res.ok) {
    return { error: data.error || data.detail || `Request failed (${res.status}).`, status: res.status };
  }
  return data;
}

/* ── auth ── */
export const login = (username, password) =>
  request('/api/token/', { method: 'POST', body: { username, password } });

export const sharedLogin = (address, password) =>
  request('/api/mail/shared-login/', { method: 'POST', body: { address, password } });

/* ── mail ── */
export const getMyMailboxes = (auth) => request('/api/mail/me/', auth);

export const listMessages = (auth, mailbox, folder = 'inbox', search = '') =>
  request(`/api/mail/messages/?mailbox=${mailbox}&folder=${folder}` +
          (search ? `&search=${encodeURIComponent(search)}` : ''), auth);

export const getMessage = (auth, id) => request(`/api/mail/messages/${id}/`, auth);

export const deleteMessage = (auth, id) =>
  request(`/api/mail/messages/${id}/`, { ...auth, method: 'DELETE' });

export const restoreMessage = (auth, id) =>
  request(`/api/mail/messages/${id}/`, { ...auth, method: 'POST' });

export const sendMessage = (auth, payload) =>
  request('/api/mail/send/', { ...auth, method: 'POST', body: payload });

export const updateMailbox = (auth, id, payload) =>
  request(`/api/mail/mailboxes/${id}/avatar/`, { ...auth, method: 'PATCH', body: payload });

/* Cloudinary-backed image upload (multipart — no JSON content type). */
export async function uploadAvatar(token, file) {
  const form = new FormData();
  form.append('file', file);
  try {
    const res = await fetch(`${API_URL}/api/media/upload/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || 'Upload failed.' };
    return data;
  } catch {
    return { error: 'Upload failed.' };
  }
}
