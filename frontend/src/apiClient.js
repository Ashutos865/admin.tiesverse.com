// Calls the Node.js backend (tiesversewebsite/backend) which writes to Supabase.
// The Django backend handles auth & RBAC; this client handles content CRUD.

const NODE_API = import.meta.env.VITE_NODE_API_URL || 'http://localhost:5000';

const getToken = () => localStorage.getItem('node_token');

async function apiFetch(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  const token = getToken();
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${NODE_API}${path}`, opts);
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    if (!res.ok) return { error: data.error || `HTTP ${res.status}` };
    return data;
  } catch {
    return { error: `Server error (${res.status})` };
  }
}

// ── Auth (Node.js / Supabase) ─────────────────────────────────────────────────

export const nodeLogin = async (email, password) => {
  const res = await fetch(`${NODE_API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (data.token) localStorage.setItem('node_token', data.token);
  return data;
};

export const nodeLogout = () => {
  localStorage.removeItem('node_token');
};

// ── Events (Supabase) ─────────────────────────────────────────────────────────

export const getEvents = () => apiFetch('/api/events');
export const createEvent = (data) => apiFetch('/api/events', 'POST', data);
export const updateEvent = (id, data) => apiFetch(`/api/events/${id}`, 'PUT', data);
export const deleteEvent = (id) => apiFetch(`/api/events/${id}`, 'DELETE');

// ── Articles (Supabase) ───────────────────────────────────────────────────────

export const getArticles = () => apiFetch('/api/articles');
export const createArticle = (data) => apiFetch('/api/articles', 'POST', data);
export const updateArticle = (id, data) => apiFetch(`/api/articles/${id}`, 'PUT', data);
export const deleteArticle = (id) => apiFetch(`/api/articles/${id}`, 'DELETE');

// ── YouTube videos (Supabase) ─────────────────────────────────────────────────

export const getYoutubeVideos = () => apiFetch('/api/youtube-videos');
export const createYoutubeVideo = (data) => apiFetch('/api/youtube-videos', 'POST', data);
export const updateYoutubeVideo = (id, data) => apiFetch(`/api/youtube-videos/${id}`, 'PUT', data);
export const deleteYoutubeVideo = (id) => apiFetch(`/api/youtube-videos/${id}`, 'DELETE');

// ── Workshops (Supabase) ──────────────────────────────────────────────────────

export const getWorkshops = () => apiFetch('/api/workshops');
export const createWorkshop = (data) => apiFetch('/api/workshops', 'POST', data);
export const updateWorkshop = (id, data) => apiFetch(`/api/workshops/${id}`, 'PUT', data);
export const deleteWorkshop = (id) => apiFetch(`/api/workshops/${id}`, 'DELETE');

// ── Team (Supabase) ───────────────────────────────────────────────────────────

export const getTeam = () => apiFetch('/api/team');
export const createMember = (data) => apiFetch('/api/team', 'POST', data);
export const updateMember = (id, data) => apiFetch(`/api/team/${id}`, 'PUT', data);
export const deleteMember = (id) => apiFetch(`/api/team/${id}`, 'DELETE');

// ── Guests (Supabase) ─────────────────────────────────────────────────────────

export const getGuests = () => apiFetch('/api/guests');
export const createGuest = (data) => apiFetch('/api/guests', 'POST', data);
export const updateGuest = (id, data) => apiFetch(`/api/guests/${id}`, 'PUT', data);
export const deleteGuest = (id) => apiFetch(`/api/guests/${id}`, 'DELETE');

// ── Webinar events (Turso via webinar site proxy) ─────────────────────────────

export const getWebinarEvents = () => apiFetch('/api/webinar/events');
export const createWebinarEvent = (data) => apiFetch('/api/webinar/events', 'POST', data);
export const updateWebinarEvent = (id, data) => apiFetch(`/api/webinar/events/${id}`, 'PATCH', data);
export const deleteWebinarEvent = (id) => apiFetch(`/api/webinar/events/${id}`, 'DELETE');

// ── Career – positions (Supabase) ─────────────────────────────────────────────

export const getPositions = () => apiFetch('/api/career/positions');
export const createPosition = (data) => apiFetch('/api/career/positions', 'POST', data);
export const updatePosition = (id, data) => apiFetch(`/api/career/positions/${id}`, 'PATCH', data);
export const deletePosition = (id) => apiFetch(`/api/career/positions/${id}`, 'DELETE');

// ── Career – applicants (Supabase) ────────────────────────────────────────────

export const getApplicants = (positionId) =>
  apiFetch(`/api/career/positions/${positionId}/applicants`);
export const updateApplicant = (id, data) =>
  apiFetch(`/api/career/applicants/${id}`, 'PATCH', data);

// ── Career – offers (Supabase) ────────────────────────────────────────────────

export const getOffers = () => apiFetch('/api/career/offers');
export const createOffer = (data) => apiFetch('/api/career/offers', 'POST', data);
export const updateOffer = (id, data) => apiFetch(`/api/career/offers/${id}`, 'PATCH', data);
