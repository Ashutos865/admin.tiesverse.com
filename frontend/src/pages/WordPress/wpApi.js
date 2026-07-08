// WordPress REST helper — talks to the Django proxy (/api/wordpress/...), which
// injects the Application Password server-side. Never sends WP creds from here.
import { API_URL, getApiToken } from '../../apiClient';

const WP = `${API_URL}/api/wordpress/wp-json/wp/v2`;
const WP_ROOT = `${API_URL}/api/wordpress/wp-json`;   // for non-wp/v2 namespaces (e.g. tiesverse/v1)

async function req(path, { method = 'GET', body, file, base = WP } = {}) {
  const headers = { Authorization: `Bearer ${getApiToken()}` };
  let payload;
  if (file) {
    // Raw binary media upload — WP reads Content-Disposition for the filename.
    headers['Content-Type'] = file.type || 'application/octet-stream';
    headers['Content-Disposition'] = `attachment; filename="${file.name}"`;
    payload = file;
  } else if (body != null) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${base}${path}`, { method, headers, body: payload });
  if (res.status === 401) { window.location.href = '/login'; throw new Error('Session expired'); }
  const total = parseInt(res.headers.get('X-WP-Total') || '0', 10);
  const totalPages = parseInt(res.headers.get('X-WP-TotalPages') || '0', 10);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) throw new Error((data && (data.message || data.detail)) || `Request failed (${res.status})`);
  return { data, total, totalPages };
}

// Build a query string from an object.
export const qs = (o = {}) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return p.length ? '?' + p.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&') : '';
};

export const wpGet = (path) => req(path);
export const wpCreate = (path, body) => req(path, { method: 'POST', body });
export const wpUpdate = (path, body) => req(path, { method: 'POST', body });   // WP accepts POST on item route
export const wpDelete = (path) => req(path, { method: 'DELETE' });
export const wpUploadMedia = (file) => req('/media', { method: 'POST', file });

// Custom Tiesverse Menu API namespace (mu-plugin: /wp-json/tiesverse/v1/...).
export const wpMenuGet  = (path) => req(path, { base: WP_ROOT });
export const wpMenuPost = (path, body) => req(path, { method: 'POST', body, base: WP_ROOT });

// Strip HTML tags for compact previews.
export const stripHtml = (html = '') => html.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').trim();
