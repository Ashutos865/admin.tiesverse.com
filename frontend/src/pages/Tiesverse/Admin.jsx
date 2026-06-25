import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import {
    getEvents, createEvent, updateEvent, deleteEvent,
    getArticle, createArticle, updateArticle, deleteArticle,
    getYoutubeVideos, createYoutubeVideo, updateYoutubeVideo, deleteYoutubeVideo,
    getWorkshops, createWorkshop, updateWorkshop, deleteWorkshop,
    getTeam, createMember, updateMember, deleteMember,
    getGuests, createGuest, updateGuest, deleteGuest,
    getWebinarListings, createWebinarListing, updateWebinarListing, deleteWebinarListing,
    getSettings, updateSetting, getCloudinaryImages, deleteCloudinaryImage
} from '../../apiClient';
import { Plus, Edit2, Trash2, X, Sparkles, BookOpen, PlaySquare, Users, Video, Calendar, ExternalLink, Image } from 'lucide-react';

// --- CLOUDINARY CONFIGURATION ---
const CLOUD_NAME = "dgmxkx5x8";
const UPLOAD_PRESET = "tiesverse_preset";
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

// ===== SHARED STYLES =====
const inputStyle = {
    width: '100%', padding: '12px 16px', borderRadius: '10px',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    color: '#fff', fontSize: '0.875rem', fontFamily: 'inherit',
    transition: 'all 0.2s', outline: 'none', boxSizing: 'border-box',
};
const selectStyle = { ...inputStyle, cursor: 'pointer', appearance: 'auto' };

const FieldLabel = ({ children }) => (
    <label style={{
        display: 'block', fontSize: '0.6875rem', fontWeight: 800,
        textTransform: 'uppercase', letterSpacing: '0.1em',
        color: 'rgba(255,255,255,0.35)', marginBottom: '8px',
    }}>{children}</label>
);

const FormField = ({ label, name, value, onChange, placeholder, required, type = 'text', disabled }) => (
    <div>
        <FieldLabel>{label}</FieldLabel>
        <input type={type} name={name} value={value || ''} onChange={onChange}
            placeholder={placeholder} required={required} disabled={disabled}
            style={{ ...inputStyle, opacity: disabled ? 0.5 : 1 }}
        onFocus={e => { e.target.style.borderColor = 'color-mix(in srgb, var(--primary) 40%, transparent)'; e.target.style.background = 'rgba(255,255,255,0.06)'; }}
            onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; e.target.style.background = 'rgba(255,255,255,0.04)'; }}
        />
    </div>
);

// ===== TAB CONFIGURATION =====
const TAB_CONFIG = {
    articles: {
        title: 'Articles & Content',
        subtitle: 'Manage research articles, policy analyses, and publications.',
        icon: <BookOpen size={20} />,
        itemLabel: 'Article',
        fetchFn: getArticle, createFn: createArticle, updateFn: updateArticle, deleteFn: deleteArticle,
        imageField: 'image_url', aspectRatio: '4/5',
        defaultForm: {},
    },
    youtube_videos: {
        title: 'YouTube Videos',
        subtitle: 'Manage video content and channel episodes.',
        icon: <PlaySquare size={20} />,
        itemLabel: 'Video',
        fetchFn: getYoutubeVideos, createFn: createYoutubeVideo, updateFn: updateYoutubeVideo, deleteFn: deleteYoutubeVideo,
        imageField: 'thumbnail_url', aspectRatio: '3/2',
        defaultForm: {},
    },
    workshops: {
        title: 'Workshops',
        subtitle: 'Manage workshops, seminars, and training sessions.',
        icon: <Users size={20} />,
        itemLabel: 'Workshop',
        fetchFn: getWorkshops, createFn: createWorkshop, updateFn: updateWorkshop, deleteFn: deleteWorkshop,
        imageField: 'image_url', aspectRatio: '3/2',
        defaultForm: { category: 'WEBINAR' },
    },
    team_members: {
        title: 'Team Members',
        subtitle: 'Manage the team directory and member profiles.',
        icon: <Users size={20} />,
        itemLabel: 'Member',
        fetchFn: getTeam, createFn: createMember, updateFn: updateMember, deleteFn: deleteMember,
        imageField: 'image_url', aspectRatio: '4/5',
        defaultForm: {},
    },
    guests: {
        title: 'Guests & Speakers',
        subtitle: 'Manage guest speakers and featured personalities.',
        icon: <Users size={20} />,
        itemLabel: 'Guest',
        fetchFn: getGuests, createFn: createGuest, updateFn: updateGuest, deleteFn: deleteGuest,
        imageField: 'image_url', aspectRatio: '4/5',
        defaultForm: {},
    },
    webinars: {
        title: 'Webinar Listings',
        subtitle: 'Manage webinar schedule and registrations.',
        icon: <Video size={20} />,
        itemLabel: 'Webinar',
        fetchFn: getWebinarListings, createFn: createWebinarListing, updateFn: updateWebinarListing, deleteFn: deleteWebinarListing,
        imageField: null, aspectRatio: null,
        defaultForm: { category: 'WEBINAR', status: 'upcoming' },
    },
};

const Admin = ({ tab = 'articles' }) => {
    const { user } = useContext(AuthContext);
    const config = TAB_CONFIG[tab];

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({});
    const [editingId, setEditingId] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [formModalOpen, setFormModalOpen] = useState(false);
    const [deleteModal, setDeleteModal] = useState({ open: false, id: null, title: '' });
    const [notification, setNotification] = useState(null);
    const [siteSettings, setSiteSettings] = useState({
        event_display_limit_pc: 2, event_display_limit_mobile: 1,
        article_display_limit_pc: 3, article_display_limit_mobile: 3,
        youtube_display_limit_pc: 3, youtube_display_limit_mobile: 2
    });
    const [cloudinaryPicker, setCloudinaryPicker] = useState({ open: false, images: [], loading: false });
    const [multiPickerSelected, setMultiPickerSelected] = useState([]);
    const [teamFileBatch, setTeamFileBatch] = useState([]);
    const [workshopFilter, setWorkshopFilter] = useState('ALL');
    const [sizeWarning, setSizeWarning] = useState({ open: false, file: null });

    const showNotice = (msg, type = 'success') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 4000);
    };

    const getPublicId = (url) => {
        if (!url || !url.includes('cloudinary.com')) return null;
        const afterUpload = url.split('/upload/')[1];
        if (!afterUpload) return null;
        const withoutTransforms = afterUpload.replace(/^(?:[a-z]+(?:_[^,/]+)?(?:,[a-z]+(?:_[^,/]+)?)*\/)+/, '');
        const withoutVersion = withoutTransforms.replace(/^v\d+\//, '');
        return withoutVersion.replace(/\.[^/.]+$/, '');
    };

    // ===== DATA FETCHING =====
    const fetchData = async () => {
        setLoading(true);
        setItems([]);
        try {
            const sData = await getSettings();
            if (sData && !sData.error) {
                const settingsMap = {};
                sData.forEach(s => { settingsMap[s.key] = Number(s.value); });
                setSiteSettings(prev => ({ ...prev, ...settingsMap }));
            }
            const data = await config.fetchFn();
            if (data && !data.error) setItems(data);
        } catch (err) { console.error('Fetch error:', err); }
        setLoading(false);
    };

    useEffect(() => {
        if (user) { fetchData(); resetForm(); }
    }, [tab, user]);

    // ===== FORM HANDLERS =====
    const resetForm = () => {
        setFormData({});
        setEditingId(null);
        setPreviewUrl(null);
        setSizeWarning({ open: false, file: null });
        setTeamFileBatch([]);
        setMultiPickerSelected([]);
    };

    const openCreateModal = () => {
        resetForm();
        setFormData({ ...config.defaultForm });
        setFormModalOpen(true);
    };

    const openEditModal = (item) => {
        setEditingId(item.id);
        const { imageFile, ...itemData } = item;
        setFormData(itemData);
        setPreviewUrl(item[config.imageField] || item.image_url || item.thumbnail_url || null);
        setFormModalOpen(true);
    };

    const closeFormModal = () => {
        setFormModalOpen(false);
        resetForm();
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // ===== IMAGE UPLOAD =====
    const uploadImage = async (file) => {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('upload_preset', UPLOAD_PRESET);
        fd.append('folder', 'admin_assets');
        const res = await fetch(CLOUDINARY_URL, { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || "Upload Failed");
        return data.secure_url.replace('/upload/', '/upload/f_auto,q_auto/');
    };

    const handleFileChange = (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        if (tab === 'team_members' && files.length > 1) {
            setTeamFileBatch(files);
            setPreviewUrl(null);
            return;
        }
        const file = files[0];
        if (file) {
            const img = new window.Image();
            img.src = URL.createObjectURL(file);
            img.onload = () => {
                let expectedRatio, ratioLabel;
                if (['articles', 'team_members', 'guests'].includes(tab)) {
                    expectedRatio = 4 / 5; ratioLabel = '4:5';
                } else {
                    expectedRatio = 3 / 2; ratioLabel = '3:2';
                }
                const actualRatio = img.width / img.height;
                if (Math.abs(actualRatio - expectedRatio) >= 0.02) {
                    setSizeWarning({ open: true, file, expectedRatio: ratioLabel, actualRatio: `${Math.round(actualRatio * 100) / 100}:1` });
                } else {
                    setFormData(prev => ({ ...prev, imageFile: file }));
                    setPreviewUrl(img.src);
                }
            };
        }
    };

    const proceedWithImage = () => {
        const { file } = sizeWarning;
        setFormData(prev => ({ ...prev, imageFile: file }));
        setPreviewUrl(URL.createObjectURL(file));
        setSizeWarning({ open: false, file: null });
    };

    // ===== CLOUDINARY PICKER =====
    const openCloudinaryPicker = async () => {
        setCloudinaryPicker({ open: true, images: [], loading: true });
        try {
            const images = await getCloudinaryImages();
            setCloudinaryPicker({ open: true, images: Array.isArray(images) ? images : [], loading: false });
        } catch {
            showNotice('Failed to load Cloudinary images', 'error');
            setCloudinaryPicker({ open: false, images: [], loading: false });
        }
    };

    const selectCloudinaryImage = (url) => {
        if (tab === 'team_members') {
            setMultiPickerSelected(prev => prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]);
            return;
        }
        const fieldName = tab === 'youtube_videos' ? 'thumbnail_url' : 'image_url';
        setFormData(prev => ({ ...prev, [fieldName]: url, imageFile: null }));
        setPreviewUrl(url);
        setCloudinaryPicker({ open: false, images: [], loading: false });
    };

    const confirmTeamPickerSelection = async () => {
        if (multiPickerSelected.length === 0) return;
        setLoading(true);
        let count = 0;
        for (const url of multiPickerSelected) {
            const res = await createMember({ image_url: url, name: 'New Member', role: '' });
            if (!res?.error) count++;
        }
        showNotice(`${count} member${count !== 1 ? 's' : ''} added — edit each to set name & role.`);
        setMultiPickerSelected([]);
        setCloudinaryPicker({ open: false, images: [], loading: false });
        fetchData();
        setLoading(false);
    };

    // ===== SETTINGS =====
    const handleUpdateSetting = async (key, value) => {
        const numValue = parseInt(value === undefined || value === null || value === '' ? (siteSettings[key] || 2) : value);
        if (isNaN(numValue)) { showNotice('Enter a valid number', 'error'); return; }
        setLoading(true);
        const res = await updateSetting(key, { value: String(numValue) });
        if (res?.error) showNotice('Update failed', 'error');
        else { showNotice('Settings updated!'); fetchData(); }
        setLoading(false);
    };

    // ===== SUBMIT =====
    const handleSubmit = async (e) => {
        if (e) e.preventDefault();

        // Batch file upload for team tab
        if (tab === 'team_members' && teamFileBatch.length > 0) {
            setLoading(true);
            let count = 0;
            for (const file of teamFileBatch) {
                try {
                    const url = await uploadImage(file);
                    const res = await createMember({ image_url: url, name: 'New Member', role: '' });
                    if (!res?.error) count++;
                } catch { /* skip */ }
            }
            showNotice(`${count} member${count !== 1 ? 's' : ''} added.`);
            setTeamFileBatch([]);
            closeFormModal();
            fetchData();
            setLoading(false);
            return;
        }

        setLoading(true);
        const { id, created_at, imageFile, ...sanitizedData } = formData;
        const dataToSave = { ...sanitizedData };

        try {
            if (formData.imageFile) {
                const publicUrl = await uploadImage(formData.imageFile);
                if (tab === 'youtube_videos') { dataToSave.thumbnail_url = publicUrl; delete dataToSave.image_url; }
                else dataToSave.image_url = publicUrl;
            }

            if (tab === 'workshops' && !dataToSave.category) dataToSave.category = 'WEBINAR';
            if (tab === 'webinars') dataToSave.category = 'WEBINAR';

            if (editingId) {
                const res = await config.updateFn(editingId, dataToSave);
                if (res?.error) showNotice('Error: ' + res.error, 'error');
                else { showNotice('Updated successfully!'); closeFormModal(); fetchData(); }
            } else {
                const res = await config.createFn(dataToSave);
                if (res?.error) showNotice('Error: ' + res.error, 'error');
                else { showNotice('Published successfully!'); closeFormModal(); fetchData(); }
            }
        } catch (err) { showNotice('Error: ' + err.message, 'error'); }
        setLoading(false);
    };

    // ===== DELETE =====
    const handleDelete = async () => {
        const { id } = deleteModal;
        setLoading(true);
        const item = items.find(i => i.id === id);
        const imageUrl = item?.image_url || item?.thumbnail_url;
        const res = await config.deleteFn(id);
        if (res?.error) showNotice('Error: ' + res.error, 'error');
        else {
            if (imageUrl) {
                const publicId = getPublicId(imageUrl);
                if (publicId) { try { await deleteCloudinaryImage(publicId); } catch {} }
            }
            showNotice('Removed successfully.');
            fetchData();
        }
        setLoading(false);
        setDeleteModal({ open: false, id: null, title: '' });
    };

    // ===== RENDER FORM FIELDS PER TAB =====
    const renderFormFields = () => {
        if (tab === 'articles') return (
            <>
                <FormField label="Article Title" name="title" value={formData.title} onChange={handleInputChange} placeholder="e.g. Policy Analysis on..." required />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <FormField label="Type" name="type" value={formData.type} onChange={handleInputChange} placeholder="e.g. POLICY ANALYSIS" />
                    <FormField label="Display ID" name="display_id" value={formData.display_id} onChange={handleInputChange} placeholder="e.g. 01" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <FormField label="Category" name="category" value={formData.category} onChange={handleInputChange} placeholder="e.g. DEFENSE" />
                    <FormField label="Date" name="date" value={formData.date} onChange={handleInputChange} placeholder="e.g. JAN 24, 2026" />
                </div>
                <div><FieldLabel>Excerpt / Summary</FieldLabel><textarea name="excerpt" value={formData.excerpt || ''} onChange={handleInputChange} style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} placeholder="Brief summary..." /></div>
                <FormField label="Redirect URL" name="redirect_url" value={formData.redirect_url} onChange={handleInputChange} placeholder="https://example.com/article" />
                {renderImageUpload('4:5')}
            </>
        );

        if (tab === 'youtube_videos') return (
            <>
                <FormField label="Video Title" name="title" value={formData.title} onChange={handleInputChange} placeholder="e.g. Episode 5: AI & Ethics" required />
                <FormField label="YouTube URL" name="video_url" value={formData.video_url} onChange={handleInputChange} placeholder="https://youtube.com/watch?v=..." required />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <FormField label="Category" name="category" value={formData.category} onChange={handleInputChange} placeholder="e.g. TALK SHOW" />
                    <FormField label="Episode ID" name="episode_id" value={formData.episode_id} onChange={handleInputChange} placeholder="e.g. EP05" />
                </div>
                {renderImageUpload('3:2')}
            </>
        );

        if (tab === 'workshops') return (
            <>
                <FormField label="Workshop Title" name="title" value={formData.title} onChange={handleInputChange} placeholder="e.g. AI Workshop" required />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                        <FieldLabel>Category</FieldLabel>
                        <select name="category" value={formData.category || 'WEBINAR'} onChange={handleInputChange} style={selectStyle}>
                            <option value="WEBINAR">WEBINAR</option>
                            <option value="VIRTUAL">VIRTUAL</option>
                            <option value="IN_PERSON">IN PERSON</option>
                        </select>
                    </div>
                    <FormField label="Date" name="date" value={formData.date} onChange={handleInputChange} placeholder="e.g. MAY 2025" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <FormField label="Time" name="time" value={formData.time} onChange={handleInputChange} placeholder="e.g. 15:00 IST" />
                    <FormField label="Location" name="location" value={formData.location} onChange={handleInputChange} placeholder="e.g. Virtual / Zoom" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <FormField label="Form Link" name="form_link" value={formData.form_link} onChange={handleInputChange} placeholder="https://..." />
                    <FormField label="Register Link" name="register_link" value={formData.register_link} onChange={handleInputChange} placeholder="https://..." />
                </div>
                <div><FieldLabel>Description</FieldLabel><textarea name="description" value={formData.description || ''} onChange={handleInputChange} style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} placeholder="Workshop description..." /></div>
                {renderImageUpload('3:2')}
            </>
        );

        if (tab === 'team_members') return (
            <>
                <div style={{ background: 'rgba(255,107,0,0.05)', border: '1px solid rgba(255,107,0,0.15)', borderRadius: '10px', padding: '14px' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 800, letterSpacing: '0.05em' }}>MULTI-SELECT ENABLED</p>
                    <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
                        Cloudinary picker: select multiple images → confirm. Batch adds as "New Member".
                    </p>
                </div>
                <FormField label="Member Name" name="name" value={formData.name} onChange={handleInputChange} placeholder="Full name" required={teamFileBatch.length === 0} disabled={teamFileBatch.length > 0} />
                <FormField label="Role / Designation" name="role" value={formData.role} onChange={handleInputChange} placeholder="e.g. Co-Founder" required={teamFileBatch.length === 0} disabled={teamFileBatch.length > 0} />
                {renderImageUpload('4:5', true)}
            </>
        );

        if (tab === 'guests') return (
            <>
                <FormField label="Guest Name" name="name" value={formData.name} onChange={handleInputChange} placeholder="Full name" required />
                <FormField label="Role / Organisation" name="role" value={formData.role} onChange={handleInputChange} placeholder="e.g. CEO, Company" />
                <div><FieldLabel>Short Description</FieldLabel><textarea name="description" value={formData.description || ''} onChange={handleInputChange} style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} placeholder="Brief bio..." /></div>
                {renderImageUpload('4:5')}
            </>
        );

        if (tab === 'webinars') return (
            <>
                <FormField label="Webinar Title" name="title" value={formData.title} onChange={handleInputChange} placeholder="e.g. Future of AI" required />
                <FormField label="Speaker" name="speaker" value={formData.speaker} onChange={handleInputChange} placeholder="e.g. Dr. Jane Doe" required />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <FormField label="Date & Time" name="date" type="datetime-local" value={formData.date ? formData.date.slice(0, 16) : ''} onChange={handleInputChange} required />
                    <div>
                        <FieldLabel>Status</FieldLabel>
                        <select name="status" value={formData.status || 'upcoming'} onChange={handleInputChange} style={selectStyle}>
                            <option value="upcoming">Upcoming</option>
                            <option value="past">Past</option>
                        </select>
                    </div>
                </div>
                <FormField label="Registration Link" name="registration_link" value={formData.registration_link} onChange={handleInputChange} placeholder="https://forms.google.com/..." />
            </>
        );

        return null;
    };

    // ===== IMAGE UPLOAD SECTION =====
    const renderImageUpload = (ratio, isMulti = false) => (
        <div>
            <FieldLabel style={{ color: 'var(--primary)' }}>Photo — {ratio} Aspect Ratio</FieldLabel>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
                {teamFileBatch.length > 0 ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '14px' }}>
                        <div style={{ textAlign: 'left' }}>
                            <p style={{ margin: 0, fontWeight: 800, fontSize: '0.875rem', color: '#fff' }}>{teamFileBatch.length} files selected</p>
                            <p style={{ margin: '2px 0 0', fontSize: '0.6875rem', color: 'rgba(255,255,255,0.3)' }}>Click save to upload all</p>
                        </div>
                        <button type="button" onClick={() => setTeamFileBatch([])} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.6875rem', fontWeight: 700 }}>CLEAR</button>
                    </div>
                ) : previewUrl ? (
                    <div style={{ width: ratio === '4/5' ? '160px' : '240px', aspectRatio: ratio.replace('/', '/'), margin: '0 auto 12px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <img src={previewUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                ) : null}
                <button type="button" onClick={openCloudinaryPicker} style={{
                    width: '100%', padding: '12px', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.5)',
                    border: '1px solid rgba(255,255,255,0.08)', fontFamily: 'inherit', fontWeight: 700, letterSpacing: '0.05em',
                    fontSize: '0.75rem', cursor: 'pointer', borderRadius: '8px', marginBottom: '8px', transition: 'all 0.2s',
                }}>
                    📂 BROWSE CLOUDINARY LIBRARY {isMulti ? '(multi-select)' : ''}
                </button>
                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '0.625rem', fontWeight: 800, margin: '8px 0', letterSpacing: '0.15em' }}>— OR UPLOAD NEW —</div>
                <input type="file" accept="image/*" multiple={isMulti} onChange={handleFileChange} style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }} />
            </div>
        </div>
    );

    // ===== RENDER ITEM CARD =====
    const renderItemCard = (item) => {
        const thumb = item[config.imageField] || item.image_url || item.thumbnail_url || null;
        const title = item.title || item.name || 'Untitled';
        const subtitle = item.category || item.role || item.type || '';
        const date = item.date || '';

        return (
            <div
                key={item.id}
                style={{
                    background: 'rgba(20,20,20,0.6)', backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px',
                    overflow: 'hidden', display: 'flex', flexDirection: 'column',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--primary) 25%, transparent)'; e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 16px 32px rgba(0,0,0,0.4), 0 0 20px color-mix(in srgb, var(--primary) 8%, transparent)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
            >
                {/* Thumbnail */}
                {thumb && (
                    <div style={{ width: '100%', height: '160px', overflow: 'hidden', background: '#0a0a0a' }}>
                        <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                )}

                {/* Content */}
                <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                        {subtitle && (
                            <span style={{
                                fontSize: '0.625rem', fontWeight: 800, letterSpacing: '0.1em',
                                padding: '3px 8px', borderRadius: '5px',
                                background: 'color-mix(in srgb, var(--primary) 10%, transparent)', color: 'var(--primary)',
                                border: '1px solid color-mix(in srgb, var(--primary) 15%, transparent)',
                                display: 'inline-block', marginBottom: '10px',
                            }}>
                                {subtitle}
                            </span>
                        )}
                        <h3 style={{
                            fontSize: '1rem', fontWeight: 700, color: '#fff', lineHeight: 1.4, margin: 0,
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }}>
                            {title}
                        </h3>
                        {date && <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', marginTop: '6px' }}>{date}</p>}
                        {item.excerpt && <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.3)', marginTop: '6px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>{item.excerpt}</p>}
                        {item.description && !item.excerpt && <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.3)', marginTop: '6px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>{item.description}</p>}
                    </div>

                    {/* Actions Bar */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        paddingTop: '14px', marginTop: '14px', borderTop: '1px solid rgba(255,255,255,0.06)',
                    }}>
                        {item.is_featured && (
                            <span style={{ fontSize: '0.625rem', fontWeight: 800, background: 'rgba(245,158,11,0.12)', color: '#F59E0B', padding: '3px 8px', borderRadius: '5px' }}>⭐ BANNER</span>
                        )}
                        {item.status && !item.is_featured && (
                            <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'rgba(255,255,255,0.3)' }}>{item.status}</span>
                        )}
                        {!item.status && !item.is_featured && <span />}

                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => openEditModal(item)} title="Edit"
                                style={{ padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex', transition: 'all 0.2s' }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--primary) 30%, transparent)'; e.currentTarget.style.color = 'var(--primary)'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
                            ><Edit2 size={14} /></button>
                            <button onClick={() => setDeleteModal({ open: true, id: item.id, title: title })} title="Delete"
                                style={{ padding: '8px', borderRadius: '8px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)', color: 'rgba(239,68,68,0.5)', cursor: 'pointer', display: 'flex', transition: 'all 0.2s' }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'; e.currentTarget.style.color = '#EF4444'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.12)'; e.currentTarget.style.color = 'rgba(239,68,68,0.5)'; }}
                            ><Trash2 size={14} /></button>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // ===== SETTINGS BAR =====
    const renderSettingsBar = () => {
        const settingsMap = {
            articles: [
                { key: 'article_display_limit_pc', label: 'PC Limit', val: siteSettings.article_display_limit_pc || 3 },
                { key: 'article_display_limit_mobile', label: 'Mobile Limit', val: siteSettings.article_display_limit_mobile || 3 },
            ],
            youtube_videos: [
                { key: 'youtube_display_limit_pc', label: 'PC Limit', val: siteSettings.youtube_display_limit_pc || 3 },
                { key: 'youtube_display_limit_mobile', label: 'Mobile Limit', val: siteSettings.youtube_display_limit_mobile || 2 },
            ],
        };
        const settings = settingsMap[tab];
        if (!settings) return null;

        return (
            <div style={{
                display: 'flex', gap: '24px', flexWrap: 'wrap', padding: '16px 20px',
                background: 'rgba(255,255,255,0.02)', borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.06)', marginBottom: '24px',
            }}>
                {settings.map(s => (
                    <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div>
                            <p style={{ margin: 0, fontSize: '0.625rem', fontWeight: 800, letterSpacing: '0.1em', color: 'var(--primary)' }}>{s.label.toUpperCase()}</p>
                            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>Show {s.val} items</span>
                        </div>
                        <input type="number" value={s.val} onChange={(e) => setSiteSettings(prev => ({ ...prev, [s.key]: e.target.value }))}
                            style={{ width: '50px', background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '6px 8px', borderRadius: '6px', fontSize: '0.75rem', textAlign: 'center' }}
                        />
                        <button onClick={() => handleUpdateSetting(s.key, siteSettings[s.key])}
                            style={{ background: '#fff', color: '#000', border: 'none', padding: '6px 14px', borderRadius: '6px', fontSize: '0.625rem', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.color = '#fff'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#000'; }}
                        >UPDATE</button>
                    </div>
                ))}
            </div>
        );
    };

    // ===== WORKSHOP FILTER =====
    const renderWorkshopFilter = () => {
        if (tab !== 'workshops') return null;
        const filters = ['ALL', 'WEBINAR', 'VIRTUAL', 'IN_PERSON'];
        return (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                {filters.map(f => (
                    <button key={f} onClick={() => setWorkshopFilter(f)}
                        style={{
                            padding: '8px 16px', borderRadius: '10px', border: 'none',
                            fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                            background: workshopFilter === f ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                            color: workshopFilter === f ? '#fff' : 'rgba(255,255,255,0.4)',
                            transition: 'all 0.2s',
                        }}
                    >
                        {f === 'IN_PERSON' ? 'IN-PERSON' : f}
                    </button>
                ))}
            </div>
        );
    };

    const filteredItems = tab === 'workshops' && workshopFilter !== 'ALL'
        ? items.filter(i => i.category === workshopFilter)
        : items;

    // ===== MAIN RENDER =====
    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {config.icon} {config.title}
                    </h1>
                    <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.4)', marginTop: '6px' }}>{config.subtitle}</p>
                </div>
                <button onClick={openCreateModal}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '12px 24px', background: 'var(--primary)',
                        color: '#fff', border: 'none', borderRadius: '12px', fontSize: '0.875rem',
                        fontWeight: 700, cursor: 'pointer', letterSpacing: '0.02em',
                        boxShadow: '0 8px 20px color-mix(in srgb, var(--primary) 30%, transparent)', transition: 'all 0.3s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 28px color-mix(in srgb, var(--primary) 40%, transparent)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 20px color-mix(in srgb, var(--primary) 30%, transparent)'; }}
                >
                    <Plus size={18} /> Add New {config.itemLabel}
                </button>
            </div>

            {/* Toast */}
            {notification && (
                <div style={{
                    marginBottom: '20px', padding: '14px 20px', borderRadius: '12px', fontSize: '0.875rem', fontWeight: 600,
                    background: notification.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                    border: `1px solid ${notification.type === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`,
                    color: notification.type === 'error' ? '#EF4444' : '#10B981',
                }}>
                    {notification.msg}
                </div>
            )}

            {/* Settings Bar */}
            {renderSettingsBar()}

            {/* Workshop Filter */}
            {renderWorkshopFilter()}

            {/* Content Grid */}
            {loading && items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '80px 0', color: 'rgba(255,255,255,0.3)' }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, letterSpacing: '0.1em' }}>LOADING...</div>
                </div>
            ) : filteredItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '80px 0', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    {config.icon && React.cloneElement(config.icon, { size: 40, style: { color: 'rgba(255,255,255,0.15)', marginBottom: '12px' } })}
                    <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem', fontWeight: 600 }}>No {config.itemLabel.toLowerCase()}s yet</p>
                    <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.8125rem', marginTop: '4px' }}>Click "Add New {config.itemLabel}" to get started.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                    {filteredItems.map(item => renderItemCard(item))}
                </div>
            )}

            {/* ===== CREATE / EDIT MODAL ===== */}
            {formModalOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}
                    onClick={(e) => { if (e.target === e.currentTarget) closeFormModal(); }}>
                    <div style={{
                        background: '#111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px',
                        width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', padding: '32px',
                        boxShadow: '0 40px 80px rgba(0,0,0,0.6)', animation: 'modalSlideUp 0.3s ease',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Sparkles size={20} style={{ color: 'var(--primary)' }} />
                                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                                    {editingId ? `Edit ${config.itemLabel}` : `New ${config.itemLabel}`}
                                </h2>
                            </div>
                            <button onClick={closeFormModal}
                                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '8px', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex', transition: 'all 0.2s' }}
                                onMouseEnter={e => { e.currentTarget.style.color = '#fff'; }}
                                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
                            ><X size={18} /></button>
                        </div>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {renderFormFields()}
                            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                                <button type="button" onClick={closeFormModal}
                                    style={{ flex: 1, padding: '14px', borderRadius: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer' }}
                                >Cancel</button>
                                <button type="submit" disabled={loading}
                                    style={{
                                        flex: 2, padding: '14px', borderRadius: '12px',
                                        background: 'var(--primary)', color: '#fff',
                                        border: 'none', fontSize: '0.875rem', fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer',
                                        boxShadow: '0 8px 20px color-mix(in srgb, var(--primary) 30%, transparent)', opacity: loading ? 0.7 : 1,
                                    }}
                                >{loading ? 'Saving...' : editingId ? 'Update' : 'Publish'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ===== DELETE MODAL ===== */}
            {deleteModal.open && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}
                    onClick={(e) => { if (e.target === e.currentTarget) setDeleteModal({ open: false, id: null, title: '' }); }}>
                    <div style={{ background: '#111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', maxWidth: '420px', width: '100%', padding: '32px', boxShadow: '0 40px 80px rgba(0,0,0,0.6)', animation: 'modalSlideUp 0.3s ease' }}>
                        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                            <div style={{ width: '56px', height: '56px', borderRadius: '16px', margin: '0 auto 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Trash2 size={24} style={{ color: '#EF4444' }} />
                            </div>
                            <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>Delete {config.itemLabel}?</h3>
                            <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                                Remove <strong style={{ color: 'rgba(255,255,255,0.7)' }}>"{deleteModal.title}"</strong>? This cannot be undone.
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={() => setDeleteModal({ open: false, id: null, title: '' })} style={{ flex: 1, padding: '14px', borderRadius: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleDelete} disabled={loading} style={{ flex: 1, padding: '14px', borderRadius: '12px', background: '#EF4444', color: '#fff', border: 'none', fontSize: '0.875rem', fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 20px rgba(239,68,68,0.3)' }}>{loading ? 'Deleting...' : 'Delete'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== SIZE WARNING MODAL ===== */}
            {sizeWarning.open && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
                    <div style={{ background: '#111', border: '1px solid rgba(255,107,0,0.3)', borderRadius: '20px', maxWidth: '420px', width: '100%', padding: '32px', boxShadow: '0 40px 80px rgba(0,0,0,0.6)' }}>
                        <h3 style={{ color: 'var(--primary)', fontWeight: 800, marginBottom: '16px', fontSize: '1rem' }}>⚠️ Aspect Ratio Mismatch</h3>
                        <div style={{ background: 'color-mix(in srgb, var(--primary) 6%, transparent)', borderRadius: '10px', padding: '14px', marginBottom: '16px', fontSize: '0.8125rem', lineHeight: 1.8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span style={{ color: 'rgba(255,255,255,0.5)' }}>Expected:</span><strong style={{ color: '#fff' }}>{sizeWarning.expectedRatio}</strong></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#EF4444' }}><span>Your Image:</span><strong>{sizeWarning.actualRatio}</strong></div>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', marginBottom: '20px', lineHeight: 1.5 }}>Non-standard ratios may cause images to look cropped on the website.</p>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={() => setSizeWarning({ open: false, file: null })} style={{ flex: 1, padding: '14px', borderRadius: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer' }}>Choose Another</button>
                            <button onClick={proceedWithImage} style={{ flex: 1, padding: '14px', borderRadius: '12px', background: 'var(--primary)', color: '#fff', border: 'none', fontSize: '0.875rem', fontWeight: 800, cursor: 'pointer' }}>Use Anyway</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== CLOUDINARY PICKER MODAL ===== */}
            {cloudinaryPicker.open && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
                    <div style={{ background: '#111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', maxWidth: '820px', width: '92vw', maxHeight: '82vh', display: 'flex', flexDirection: 'column', padding: '24px', boxShadow: '0 40px 80px rgba(0,0,0,0.6)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexShrink: 0 }}>
                            <div>
                                <h3 style={{ margin: 0, letterSpacing: '0.1em', fontSize: '0.8125rem', fontWeight: 800, color: '#fff' }}>CLOUDINARY LIBRARY</h3>
                                {tab === 'team_members' && <p style={{ margin: '4px 0 0', fontSize: '0.6875rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.05em' }}>Click images to select — {multiPickerSelected.length} selected</p>}
                            </div>
                            <button onClick={() => { setCloudinaryPicker({ open: false, images: [], loading: false }); setMultiPickerSelected([]); }}
                                style={{ background: 'transparent', color: 'rgba(255,255,255,0.4)', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
                        </div>
                        {cloudinaryPicker.loading ? (
                            <p style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', letterSpacing: '0.15em' }}>LOADING IMAGES...</p>
                        ) : cloudinaryPicker.images.length === 0 ? (
                            <p style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.2)', fontSize: '0.8125rem' }}>No images found. Upload images first.</p>
                        ) : (
                            <div style={{ overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', padding: '4px 2px', flex: 1 }}>
                                {cloudinaryPicker.images.map(img => {
                                    const isSelected = multiPickerSelected.includes(img.secure_url);
                                    return (
                                        <div key={img.public_id} onClick={() => selectCloudinaryImage(img.secure_url)}
                                            style={{ cursor: 'pointer', borderRadius: '8px', overflow: 'hidden', border: `2px solid ${isSelected ? 'var(--primary)' : 'rgba(255,255,255,0.08)'}`, transition: 'border-color 0.15s', position: 'relative' }}>
                                            <img src={img.secure_url} alt="" style={{ width: '100%', height: '110px', objectFit: 'cover', display: 'block' }} />
                                            {isSelected && (
                                                <div style={{ position: 'absolute', top: '6px', right: '6px', width: '22px', height: '22px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '900', color: '#000' }}>✓</div>
                                            )}
                                            <p style={{ fontSize: '0.5625rem', color: 'rgba(255,255,255,0.3)', padding: '5px 6px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {img.public_id.split('/').pop()}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {tab === 'team_members' && multiPickerSelected.length > 0 && (
                            <div style={{ flexShrink: 0, paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '12px' }}>
                                <button onClick={confirmTeamPickerSelection} disabled={loading}
                                    style={{ width: '100%', padding: '14px', background: 'var(--primary)', color: '#000', border: 'none', fontFamily: 'inherit', fontWeight: 800, letterSpacing: '0.05em', fontSize: '0.8125rem', cursor: 'pointer', borderRadius: '10px' }}>
                                    {loading ? 'ADDING...' : `ADD ${multiPickerSelected.length} MEMBER${multiPickerSelected.length !== 1 ? 'S' : ''}`}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Animation */}
            <style>{`
                @keyframes modalSlideUp {
                    from { opacity: 0; transform: translateY(20px) scale(0.98); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
        </div>
    );
};

export default Admin;