export const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

// In-memory token store — set by AuthContext on login/logout.
// Never persisted to localStorage so the session ends on page refresh.
let _accessToken = null;
export const setApiToken = (token) => { _accessToken = token; };
const getToken = () => _accessToken;
export const getApiToken = getToken;

// Add trailing slash to path portion only — never to query string
const withSlash = (path) => {
    const qi = path.indexOf('?');
    if (qi >= 0) {
        const p = path.slice(0, qi);
        return (p.endsWith('/') ? p : `${p}/`) + path.slice(qi);
    }
    return path.endsWith('/') ? path : `${path}/`;
};

const publicFetch = async (path) => {
    const res = await fetch(`${API_URL}${withSlash(path)}`);
    if (!res.ok) return { error: res.statusText };
    return res.json();
};

// Unauthenticated POST (password reset, etc.) — no bearer token.
const publicPost = async (path, body = {}) => {
    try {
        const res = await fetch(`${API_URL}${withSlash(path)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const text = await res.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text.slice(0, 160) }; }
        if (!res.ok && !data.error) data.error = `Request failed (${res.status})`;
        return data;
    } catch {
        return { error: 'Network error. Please try again.' };
    }
};

// PASSWORD RESET (public)
export const requestPasswordReset = (identifier) =>
    publicPost('/api/accounts/password-reset/', { email: identifier });
export const confirmPasswordReset = ({ uid, token, password }) =>
    publicPost('/api/accounts/password-reset/confirm/', { uid, token, password });

const adminFetch = async (path, method = 'GET', body = null) => {
    const fetchPath = withSlash(path);
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
        setApiToken(null);
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
        setApiToken(null);
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

// Fetch an authenticated document (photo/aadhaar/etc.) as a blob URL. The API
// needs the JWT in a header, so a plain <a href> to it 401s — use this instead.
export const fetchDocBlobUrl = async (path) => {
    const url = path.startsWith('http') ? path : `${API_URL}${path}`;
    try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
        if (!res.ok) return null;
        const blob = await res.blob();
        return URL.createObjectURL(blob);
    } catch {
        return null;
    }
};

// Open an authenticated document in a new tab (fetches with the JWT first).
export const viewDoc = async (path) => {
    const blobUrl = await fetchDocBlobUrl(path);
    if (!blobUrl) return { error: 'Could not open document (are you still signed in?).' };
    window.open(blobUrl, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    return { ok: true };
};

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

// CAREER (Portal) — candidates sourced from the hosted ATS
export const getPositions = () => adminFetch('/api/career/positions').catch(() => []);
export const createPosition = (data) => adminFetch('/api/career/positions', 'POST', data);
export const updatePosition = (id, data) => adminFetch(`/api/career/positions/${id}`, 'PATCH', data);
export const deletePosition = (id) => adminFetch(`/api/career/positions/${id}`, 'DELETE');
// Applications are returned as a plain hosted-ATS array.
export const getCandidates = () => adminFetch('/api/career/enrollments').catch(() => []);
export const getEnrollments = getCandidates;
export const updateCandidateStatus = (id, data) => adminFetch(`/api/career/enrollments/${id}/update_status`, 'PATCH', data);
export const scheduleInterview = (id, data) => adminFetch(`/api/career/enrollments/${id}/schedule_interview`, 'POST', data);
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
    .then(r => (r?.error ? r : ((r && r.rows) ? r.rows : (Array.isArray(r) ? r : []))))
    .catch(error => ({ error: error.message || 'Unable to load registrations.' }));
export const getCoupons = () =>
  adminFetch('/api/webinar/coupons')
    .then(r => (r?.error ? r : (r?.rows || [])))
    .catch(error => ({ error: error.message || 'Unable to load coupons.' }));
export const createCoupon = (data) => adminFetch('/api/webinar/coupons', 'POST', data);
export const updateCoupon = (id, data) => adminFetch(`/api/webinar/coupons/${id}`, 'PATCH', data);
export const deleteCoupon = (id) => adminFetch(`/api/webinar/coupons/${id}`, 'DELETE');
export const validateCoupon = (data) => adminFetch('/api/webinar/validate-coupon', 'POST', data);

// WEBINAR — Registrations (extended, with attended column)
export const getWebinarRegistrationsFull = (event_key = '') =>
  adminFetch(`/api/webinar/registrations-full/${event_key ? `?event_key=${encodeURIComponent(event_key)}` : ''}`)
    .then(r => (r?.error ? r : (r?.rows || [])))
    .catch(() => []);

// WEBINAR — Attendee tracking
export const markAttended = (ids, attended) =>
  adminFetch('/api/webinar/mark-attended', 'POST', { ids, attended });

// WEBINAR — Form Questions (custom registration fields per event/webinar)
export const getFormQuestions = (event_key, event_type) =>
  adminFetch(`/api/webinar/form-questions/?event_key=${encodeURIComponent(event_key)}&event_type=${encodeURIComponent(event_type)}`)
    .then(r => (Array.isArray(r) ? r : []))
    .catch(() => []);
export const createFormQuestion = (data) => adminFetch('/api/webinar/form-questions', 'POST', data);
export const updateFormQuestion = (id, data) => adminFetch(`/api/webinar/form-questions/${id}`, 'PATCH', data);
export const deleteFormQuestion = (id) => adminFetch(`/api/webinar/form-questions/${id}`, 'DELETE');
export const reorderFormQuestions = (items) => adminFetch('/api/webinar/form-questions/reorder', 'POST', { items });

// WEBINAR — Certificate template assignment per event/webinar
export const getEventCertificateLink = (event_key, event_type) =>
  adminFetch(`/api/webinar/event-certificate/?event_key=${encodeURIComponent(event_key)}&event_type=${encodeURIComponent(event_type)}`)
    .catch(() => ({ template_id: '', template_name: '' }));
export const saveEventCertificateLink = (data) => adminFetch('/api/webinar/event-certificate', 'POST', data);

// WEBINAR — Meeting (one Google Meet per event)
export const generateWebinarMeeting = (payload) => adminFetch('/api/webinar/generate-meeting/', 'POST', payload);
export const getWebinarMeetingGuests = (event_pk) =>
  adminFetch(`/api/webinar/meeting-guests/?event_pk=${encodeURIComponent(event_pk)}`)
    .catch(() => ({ attendees: [], guests_can_see_other_guests: false, has_meeting: false }));

// WEBINAR — Per-webinar mail automation (broadcast) + send analytics
export const webinarBroadcast = (payload) => adminFetch('/api/webinar/broadcast/', 'POST', payload);
export const getWebinarSendHistory = (event_key) =>
  adminFetch(`/api/webinar/send-history/?event_key=${encodeURIComponent(event_key)}`)
    .catch(() => ({ summary: {}, recipients: [], log: [] }));

// SITE SETTINGS
export const getSettings = () => adminFetch('/api/settings').catch(() => []);
export const updateSetting = (key, data) => adminFetch(`/api/settings/${key}`, 'PATCH', data).catch(() => ({}));

// PROFILE SETTINGS
export const getProfile = () => adminFetch('/api/accounts/profile');
export const updateProfile = (data) => adminFetch('/api/accounts/profile', 'PUT', data);

// DELEGATED PERMISSIONS (team leads + superusers)
export const getDelegatablePermissions = () =>
    adminFetch('/api/accounts/delegatable-permissions').catch(() => []);
export const getTeamMembersForDelegation = () =>
    adminFetch('/api/accounts/team-members-for-delegation').catch(() => []);
export const delegatePermissions = (userId, perms) =>
    adminFetch(`/api/accounts/users/${userId}/delegate`, 'PATCH', { permissions: perms });

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

// HR DEPARTMENTS
export const getHRDepartments = () => adminFetch('/api/career/hr-departments').catch(() => []);
export const createHRDepartment = (data) => adminFetch('/api/career/hr-departments', 'POST', data);
export const updateHRDepartment = (id, data) => adminFetch(`/api/career/hr-departments/${id}`, 'PATCH', data);
export const deleteHRDepartment = (id) => adminFetch(`/api/career/hr-departments/${id}`, 'DELETE');

// ONBOARDING
export const initiateOnboarding = (data) => adminFetch('/api/career/onboarding/initiate', 'POST', data);
export const getOnboardingList = () => adminFetch('/api/career/onboarding').catch(() => []);
export const getOnboardingDetail = (id) => adminFetch(`/api/career/onboarding/${id}`);
export const verifyOnboarding = (id, data) => adminFetch(`/api/career/onboarding/${id}/verify`, 'PATCH', data);
export const getOnboardingDocUrl = (id, docType) => `${API_URL}/api/career/onboarding/${id}/doc/${docType}/`;
export const addTeamMember = (data) => adminFetch('/api/career/onboarding/manual-add', 'POST', data);

// CURRENT MEMBER — who am I + my access scope (drives self-service + role-aware nav)
export const getMe = () => adminFetch('/api/career/me');

// Advisory oversight + weekly team-lead updates
export const getAdvisoryTaskOversight = () => adminFetch('/api/career/advisory/task-oversight/');
export const getAdvisoryDailyUpdates = () => adminFetch('/api/career/advisory/daily-updates/');
export const getWeeklyUpdates = () => adminFetch('/api/career/weekly-updates/');
export const submitWeeklyUpdate = (data) => adminFetch('/api/career/weekly-updates/', 'POST', data);
// MASTER DIRECTORY — unified people search across members, registrations, certificates
export const searchDirectory = (q) => adminFetch(`/api/career/directory?q=${encodeURIComponent(q || '')}`);

// EMAIL TEMPLATES (superuser) — manage every send point's design/subject/sender
export const getEmailTemplates = () => adminFetch('/api/accounts/email-templates');
export const createEmailTemplate = (data) => adminFetch('/api/accounts/email-templates', 'POST', data);
export const updateEmailTemplate = (id, data) => adminFetch(`/api/accounts/email-templates/${id}`, 'PATCH', data);
export const deleteEmailTemplate = (id) => adminFetch(`/api/accounts/email-templates/${id}`, 'DELETE');
export const testEmailTemplate = (id, to) => adminFetch(`/api/accounts/email-templates/${id}/test`, 'POST', { to });
// Bulk mail-merge campaigns
export const sendCampaign = (templateId, payload) => adminFetch(`/api/accounts/email-templates/${templateId}/send-campaign`, 'POST', payload);
export const getCampaigns = () => adminFetch('/api/accounts/email-campaigns');
export const getSESSenders = () => adminFetch('/api/accounts/ses-senders');

// FEATURED CONTENT — homepage cards shown on the public website
export const getFeatured = () => adminFetch('/api/accounts/featured');
export const createFeatured = (data) => adminFetch('/api/accounts/featured', 'POST', data);
export const updateFeatured = (id, data) => adminFetch(`/api/accounts/featured/${id}`, 'PATCH', data);
export const deleteFeatured = (id) => adminFetch(`/api/accounts/featured/${id}`, 'DELETE');

// CERTIFICATES & AUDIT LOG
export const issueCertificate = (memberId, data) =>
    adminFetch(`/api/career/onboarding/${memberId}/certificate`, 'PATCH', data);
export const sendCertificateEmail = (memberId, data) =>
    adminFetch(`/api/career/onboarding/${memberId}/send-certificate`, 'POST', data);
export const getDocumentAuditLog = (memberId) =>
    adminFetch(`/api/career/onboarding/${memberId}/audit-log`).catch(() => []);

// ATTENDANCE
export const getAttendanceList = (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return adminFetch(`/api/career/attendance${qs ? '?' + qs : ''}`).catch(() => []);
};
export const createAttendanceRecord = (data) => adminFetch('/api/career/attendance', 'POST', data);
export const getAttendanceDetail = (id) => adminFetch(`/api/career/attendance/${id}`);
export const updateAttendanceRecord = (id, data) => adminFetch(`/api/career/attendance/${id}`, 'PATCH', data);
export const checkIn = (memberId) => adminFetch(`/api/career/attendance/member/${memberId}/checkin`, 'POST');
export const checkOut = (memberId, data) => adminFetch(`/api/career/attendance/member/${memberId}/checkout`, 'PATCH', data);
export const approveAttendance = (id, data) => adminFetch(`/api/career/attendance/${id}/approve`, 'PATCH', data);

// LEAVE MANAGEMENT
export const getLeaveList = (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return adminFetch(`/api/career/leave${qs ? '?' + qs : ''}`).catch(() => []);
};
export const createLeaveRequest = (data) => adminFetch('/api/career/leave', 'POST', data);
export const getLeaveDetail = (id) => adminFetch(`/api/career/leave/${id}`);
export const updateLeaveRequest = (id, data) => adminFetch(`/api/career/leave/${id}`, 'PATCH', data);
export const reviewLeaveRequest = (id, data) => adminFetch(`/api/career/leave/${id}/review`, 'PATCH', data);

// OFFBOARDING
export const getOffboardingList = (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return adminFetch(`/api/career/offboarding${qs ? '?' + qs : ''}`).catch(() => []);
};
export const createOffboardingRequest = (data) => adminFetch('/api/career/offboarding', 'POST', data);
export const getOffboardingDetail = (id) => adminFetch(`/api/career/offboarding/${id}`);
export const updateOffboardingRequest = (id, data) => adminFetch(`/api/career/offboarding/${id}`, 'PATCH', data);
export const reviewOffboardingRequest = (id, data) => adminFetch(`/api/career/offboarding/${id}/review`, 'PATCH', data);
export const revokeOffboardingAccess = (id) => adminFetch(`/api/career/offboarding/${id}/revoke`, 'POST', {});
export const reactivateOffboardedMember = (id) => adminFetch(`/api/career/offboarding/${id}/reactivate`, 'POST', {});

// ASSET MANAGEMENT
export const getAssets = (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return adminFetch(`/api/career/assets${qs ? '?' + qs : ''}`).catch(() => []);
};
export const createAsset = (data) => adminFetch('/api/career/assets', 'POST', data);
export const getAssetDetail = (id) => adminFetch(`/api/career/assets/${id}`);
export const updateAsset = (id, data) => adminFetch(`/api/career/assets/${id}`, 'PATCH', data);
export const deleteAsset = (id) => adminFetch(`/api/career/assets/${id}`, 'DELETE');
export const assignAsset = (id, data) => adminFetch(`/api/career/assets/${id}/assign`, 'PATCH', data);

// TASK MANAGEMENT
export const getTasks = (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return adminFetch(`/api/career/tasks${qs ? '?' + qs : ''}`).catch(() => []);
};
export const createTask = (data) => adminFetch('/api/career/tasks', 'POST', data);
export const getTaskDetail = (id) => adminFetch(`/api/career/tasks/${id}`);
export const updateTask = (id, data) => adminFetch(`/api/career/tasks/${id}`, 'PATCH', data);
export const deleteTask = (id) => adminFetch(`/api/career/tasks/${id}`, 'DELETE');
