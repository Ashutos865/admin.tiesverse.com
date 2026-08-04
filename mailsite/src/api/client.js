/* The one place that talks to the server.
 *
 * `request` never throws. Every failure — network, 4xx, 5xx, malformed JSON —
 * resolves to `{ error, status }`, so call sites read as `if (res.error)` and a
 * dropped connection cannot take a screen down with it. Error strings are
 * written to be shown to a person.
 */
import { getAccess, getSharedToken, refreshAccess, signOut } from '../auth.js';

export const API_BASE =
  import.meta.env.VITE_API_URL || 'https://admin.tiesverse.com';

const withSlash = (p) => (p.endsWith('/') || p.includes('?') ? p : `${p}/`);

function authHeaders() {
  // A shared-mailbox token wins when present: that session is scoped to one
  // box and must not borrow a portal identity that happens to be in storage.
  const shared = getSharedToken();
  if (shared) return { 'X-Mail-Token': shared };
  const access = getAccess();
  return access ? { Authorization: `Bearer ${access}` } : {};
}

async function raw(path, { method = 'GET', body, isForm = false } = {}) {
  const headers = { ...authHeaders() };
  if (!isForm) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_BASE}${withSlash(path)}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  return res;
}

export async function request(path, opts = {}) {
  let res;
  try {
    res = await raw(path, opts);
  } catch {
    return { error: 'Could not reach the server. Check your connection.', status: 0 };
  }

  // One silent renewal before giving up. Without this a session simply died at
  // the 24-hour mark even though a valid refresh token was sitting unused.
  if (res.status === 401 && !getSharedToken() && !opts._retried) {
    const renewed = await refreshAccess();
    if (renewed) return request(path, { ...opts, _retried: true });
    signOut();
    return { error: 'Your session has ended. Please sign in again.', status: 401 };
  }

  if (res.status === 204) return { ok: true };

  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    if (res.ok) return { ok: true, response: res };
    return { error: `Something went wrong (${res.status}).`, status: res.status };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return { error: 'The server sent back something unreadable.', status: res.status };
  }
  if (!res.ok) {
    return {
      error: data?.error || data?.detail || `Something went wrong (${res.status}).`,
      status: res.status,
      data,
    };
  }
  return data;
}

export const get = (path) => request(path);
export const post = (path, body) => request(path, { method: 'POST', body });
export const patch = (path, body) => request(path, { method: 'PATCH', body });
export const del = (path) => request(path, { method: 'DELETE' });

/* Multipart upload — same error convention, no Content-Type (the browser must
   set its own boundary). */
export async function upload(path, formData) {
  return request(path, { method: 'POST', body: formData, isForm: true });
}

/* A download has to carry auth headers, so it cannot be a plain <a href>.
   Fetch it, hand the browser a blob, and revoke the object URL after. */
export async function downloadFile(path, filename) {
  let res;
  try {
    res = await raw(path);
  } catch {
    return { error: 'Could not reach the server. Check your connection.' };
  }
  if (!res.ok) return { error: 'That file could not be downloaded.' };
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'attachment';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { ok: true };
}
