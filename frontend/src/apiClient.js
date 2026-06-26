const API_URL = 'http://127.0.0.1:8000'; // Django backend

const getToken = () => {
    const authTokens = localStorage.getItem('authTokens');
    if (authTokens) {
        try {
            return JSON.parse(authTokens).access;
        } catch (e) {
            return null;
        }
    }
    return null;
};

const publicFetch = async (path) => {
    // Django viewsets usually require a trailing slash
    const fetchPath = path.endsWith('/') ? path : `${path}/`;
    const res = await fetch(`${API_URL}${fetchPath}`);
    if (!res.ok) return { error: res.statusText };
    return res.json();
};

const adminFetch = async (path, method = 'GET', body = null) => {
    const fetchPath = path.endsWith('/') ? path : `${path}/`;
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken()}`,
        },
    };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(`${API_URL}${fetchPath}`, options);

    if (res.status === 401) {
        localStorage.removeItem('authTokens');
        window.location.href = '/login';
        return { error: 'Session expired. Please log in again.' };
    }

    // For DELETE or 204 No Content
    if (res.status === 204) return { success: true };

    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch {
        return { error: `Server error (${res.status}). Response: ${text.slice(0, 120)}` };
    }
};

// MEDIA (Cloudinary image upload) — multipart, so no JSON Content-Type.
export const uploadImage = async (file) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_URL}/api/media/upload/`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` },
        body: form,
    });
    if (res.status === 401) {
        localStorage.removeItem('authTokens');
        window.location.href = '/login';
        return { error: 'Session expired. Please log in again.' };
    }
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch {
        return { error: `Upload failed (${res.status}).` };
    }
};
export const listCloudinaryImages = () =>
    adminFetch('/api/media/images').catch(() => ({ images: [] }));

export const downloadFile = async (path, filename) => {
    const fetchPath = path.startsWith('http') ? path : `${API_URL}${path}`;
    const res = await fetch(fetchPath, {
        headers: {
            'Authorization': `Bearer ${getToken()}`
        }
    });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
};

// EVENTS 
export const getEvents = () => adminFetch('/api/landing/events');
export const createEvent = (data) => adminFetch('/api/landing/events', 'POST', data);
export const updateEvent = (id, data) => adminFetch(`/api/landing/events/${id}`, 'PATCH', data);
export const deleteEvent = (id) => adminFetch(`/api/landing/events/${id}`, 'DELETE');

// DEPARTMENTS
export const getDepartments = () => adminFetch('/api/landing/departments');
export const createDepartment = (data) => adminFetch('/api/landing/departments', 'POST', data);
export const updateDepartment = (id, data) => adminFetch(`/api/landing/departments/${id}`, 'PATCH', data);
export const deleteDepartment = (id) => adminFetch(`/api/landing/departments/${id}`, 'DELETE');

// TEAM MEMBERS
export const getTeamMembers = () => adminFetch('/api/landing/team_members');
export const createTeamMember = (data) => adminFetch('/api/landing/team_members', 'POST', data);
export const updateTeamMember = (id, data) => adminFetch(`/api/landing/team_members/${id}`, 'PATCH', data);
export const deleteTeamMember = (id) => adminFetch(`/api/landing/team_members/${id}`, 'DELETE');

// EVENT SPEAKERS
export const getEventSpeakers = () => adminFetch('/api/landing/event_speakers');
export const createEventSpeaker = (data) => adminFetch('/api/landing/event_speakers', 'POST', data);
export const updateEventSpeaker = (id, data) => adminFetch(`/api/landing/event_speakers/${id}`, 'PATCH', data);
export const deleteEventSpeaker = (id) => adminFetch(`/api/landing/event_speakers/${id}`, 'DELETE');

// EVENT REGISTRATIONS
export const getEventRegistrations = () => adminFetch('/api/landing/event_registrations');
export const createEventRegistration = (data) => adminFetch('/api/landing/event_registrations', 'POST', data);
export const updateEventRegistration = (id, data) => adminFetch(`/api/landing/event_registrations/${id}`, 'PATCH', data);
export const deleteEventRegistration = (id) => adminFetch(`/api/landing/event_registrations/${id}`, 'DELETE');

// CAREER (Portal) — candidates sourced from Cloudflare D1
export const getPositions = () => adminFetch('/api/career/positions').catch(() => []);
export const createPosition = (data) => adminFetch('/api/career/positions', 'POST', data);
export const updatePosition = (id, data) => adminFetch(`/api/career/positions/${id}`, 'PATCH', data);
export const deletePosition = (id) => adminFetch(`/api/career/positions/${id}`, 'DELETE');
// getCandidates → EnrollmentViewSet (returns plain array from D1)
export const getCandidates = () => adminFetch('/api/career/enrollments').catch(() => []);
export const getEnrollments = getCandidates;
export const updateCandidateStatus = (id, data) => adminFetch(`/api/career/enrollments/${id}/update_status`, 'PATCH', data);
export const updateEnrollment = updateCandidateStatus;
export const deleteEnrollment = (id) => adminFetch(`/api/career/enrollments/${id}`, 'DELETE');

export const getOfferLetters = () => adminFetch('/api/career/offer-letters').catch(() => []);
export const createOfferLetter = (data) => adminFetch('/api/career/offer-letters/generate/', 'POST', data);
export const updateOfferLetter = (id, data) => adminFetch(`/api/career/offer-letters/${id}`, 'PATCH', data);
export const deleteOfferLetter = (id) => adminFetch(`/api/career/offer-letters/${id}`, 'DELETE');

export const getCandidatesDetail = () => adminFetch('/api/career/candidates').catch(() => ({ data: [] }));
export const updateCandidate = (id, data) => adminFetch(`/api/career/candidates/${id}`, 'PUT', data);

export const getFormGates = () => adminFetch('/api/career/form-gates').catch(() => ({ gates: {} }));
export const updateFormGates = (data) => adminFetch('/api/career/form-gates', 'POST', data);

// WEBINAR (Portal) — registrations sourced from Turso
export const getWebinarEvents = () => adminFetch('/api/webinar/events').catch(() => []);
export const createWebinarEvent = (data) => adminFetch('/api/webinar/events', 'POST', data);
export const getWebinarRegistrations = () =>
  adminFetch('/api/webinar/registrations')
    .then(r => (r && r.rows) ? r.rows : (Array.isArray(r) ? r : []))
    .catch(() => []);

// SITE SETTINGS
export const getSettings = () => adminFetch('/api/settings').catch(() => []);
export const updateSetting = (key, data) => adminFetch(`/api/settings/${key}`, 'PATCH', data).catch(() => ({}));

// PROFILE SETTINGS
export const getProfile = () => adminFetch('/api/accounts/profile');
export const updateProfile = (data) => adminFetch('/api/accounts/profile', 'PUT', data);

// Career page aliases used by older pages
export const getApplicants = getCandidates;
export const updateApplicant = updateCandidateStatus;
export const getOffers = getOfferLetters;
export const createOffer = createOfferLetter;
export const updateOffer = (id, data) => updateOfferLetter(id, data);
// Email an offer-letter PDF (base64) to a candidate. Sending is stubbed
// server-side until careers@tiesverse.com is SES-verified.
export const sendOffer = (payload) => adminFetch('/api/career/send-offer', 'POST', payload);

// Team member aliases
export const getTeam = getTeamMembers;
export const createMember = createTeamMember;
export const updateMember = (id, data) => updateTeamMember(id, data);
export const deleteMember = (id) => deleteTeamMember(id);

// OLD-NAME ALIASES — keep pages that reference previous model names working
// Articles = Departments
export const getArticles = getDepartments;
export const createArticle = createDepartment;
export const updateArticle = (id, data) => updateDepartment(id, data);
export const deleteArticle = (id) => deleteDepartment(id);
// YouTube Videos = TeamMemberSocials
export const getYoutubeVideos = () => adminFetch('/api/landing/team_member_socials');
export const createYoutubeVideo = (data) => adminFetch('/api/landing/team_member_socials', 'POST', data);
export const updateYoutubeVideo = (id, data) => adminFetch(`/api/landing/team_member_socials/${id}`, 'PATCH', data);
export const deleteYoutubeVideo = (id) => adminFetch(`/api/landing/team_member_socials/${id}`, 'DELETE');
// Workshops = EventRegistrations
export const getWorkshops = getEventRegistrations;
export const createWorkshop = createEventRegistration;
export const updateWorkshop = (id, data) => updateEventRegistration(id, data);
export const deleteWorkshop = (id) => deleteEventRegistration(id);
// Guests = EventSpeakers
export const getGuests = getEventSpeakers;
export const createGuest = createEventSpeaker;
export const updateGuest = (id, data) => updateEventSpeaker(id, data);
export const deleteGuest = (id) => deleteEventSpeaker(id);
// Webinar Events = Webinar listings
export const getWebinarListings = () => adminFetch('/api/landing/webinars').catch(() => []);
export const updateWebinarEvent = (id, data) => adminFetch(`/api/landing/webinars/${id}`, 'PATCH', data);
export const deleteWebinarEvent = (id) => adminFetch(`/api/landing/webinars/${id}`, 'DELETE');
