const API_URL = 'http://localhost:8000'; // Django backend

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

// EVENTS 
export const getEvents = () => adminFetch('/api/landing/events');
export const createEvent = (data) => adminFetch('/api/landing/events', 'POST', data);
export const updateEvent = (id, data) => adminFetch(`/api/landing/events/${id}`, 'PATCH', data);
export const deleteEvent = (id) => adminFetch(`/api/landing/events/${id}`, 'DELETE');

// ARTICLES 
export const getArticle = () => adminFetch('/api/landing/articles');
export const createArticle = (data) => adminFetch('/api/landing/articles', 'POST', data);
export const updateArticle = (id, data) => adminFetch(`/api/landing/articles/${id}`, 'PATCH', data);
export const deleteArticle = (id) => adminFetch(`/api/landing/articles/${id}`, 'DELETE');

// YOUTUBE VIDEOS
export const getYoutubeVideos = () => adminFetch('/api/landing/youtube_videos');
export const createYoutubeVideo = (data) => adminFetch('/api/landing/youtube_videos', 'POST', data);
export const updateYoutubeVideo = (id, data) => adminFetch(`/api/landing/youtube_videos/${id}`, 'PATCH', data);
export const deleteYoutubeVideo = (id) => adminFetch(`/api/landing/youtube_videos/${id}`, 'DELETE');

// WORKSHOPS
export const getWorkshops = () => adminFetch('/api/landing/workshops');
export const createWorkshop = (data) => adminFetch('/api/landing/workshops', 'POST', data);
export const updateWorkshop = (id, data) => adminFetch(`/api/landing/workshops/${id}`, 'PATCH', data);
export const deleteWorkshop = (id) => adminFetch(`/api/landing/workshops/${id}`, 'DELETE');

// TEAM MEMBERS
export const getTeam = () => adminFetch('/api/landing/team_members');
export const createMember = (data) => adminFetch('/api/landing/team_members', 'POST', data);
export const updateMember = (id, data) => adminFetch(`/api/landing/team_members/${id}`, 'PATCH', data);
export const deleteMember = (id) => adminFetch(`/api/landing/team_members/${id}`, 'DELETE');

// GUESTS
export const getGuests = () => adminFetch('/api/landing/guests');
export const createGuest = (data) => adminFetch('/api/landing/guests', 'POST', data);
export const updateGuest = (id, data) => adminFetch(`/api/landing/guests/${id}`, 'PATCH', data);
export const deleteGuest = (id) => adminFetch(`/api/landing/guests/${id}`, 'DELETE');

// WEBINAR LISTINGS (Tiesverse)
export const getWebinarListings = () => adminFetch('/api/landing/webinars');
export const createWebinarListing = (data) => adminFetch('/api/landing/webinars', 'POST', data);
export const updateWebinarListing = (id, data) => adminFetch(`/api/landing/webinars/${id}`, 'PATCH', data);
export const deleteWebinarListing = (id) => adminFetch(`/api/landing/webinars/${id}`, 'DELETE');

// CAREER (Portal)
export const getPositions = () => adminFetch('/api/career/positions').catch(() => []);
export const createPosition = (data) => adminFetch('/api/career/positions', 'POST', data);
export const getEnrollments = () => adminFetch('/api/career/enrollments').catch(() => []);
export const getOfferLetters = () => adminFetch('/api/career/offer-letters').catch(() => []);

// WEBINAR (Portal)
export const getWebinarEvents = () => adminFetch('/api/webinar/events').catch(() => []);
export const createWebinarEvent = (data) => adminFetch('/api/webinar/events', 'POST', data);
export const getWebinarRegistrations = () => adminFetch('/api/webinar/registrations').catch(() => []);

// SITE SETTINGS
export const getSettings = () => adminFetch('/api/settings').catch(() => []);
export const updateSetting = (key, data) => adminFetch(`/api/settings/${key}`, 'PATCH', data).catch(() => ({}));

// CLOUDINARY
export const getCloudinaryImages = () => adminFetch('/api/cloudinary/images').catch(() => []);
export const deleteCloudinaryImage = (public_id) => adminFetch('/api/cloudinary/delete', 'DELETE', { public_id }).catch(() => ({}));

// PROFILE SETTINGS
export const getProfile = () => adminFetch('/api/accounts/profile');
export const updateProfile = (data) => adminFetch('/api/accounts/profile', 'PUT', data);
