import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import {
    getDepartments, createDepartment, updateDepartment, deleteDepartment,
    getTeamMembers, createTeamMember, updateTeamMember, deleteTeamMember,
    getEventSpeakers, createEventSpeaker, updateEventSpeaker, deleteEventSpeaker,
    getEventRegistrations, createEventRegistration, updateEventRegistration, deleteEventRegistration,
    getSettings, updateSetting, uploadImage, listCloudinaryImages
} from '../../apiClient';
import { Plus, Edit2, Trash2, X, Sparkles, BookOpen, PlaySquare, Users, Video, Calendar, ExternalLink, FileText, Briefcase } from 'lucide-react';
import ImageUploadField from '../../components/ImageUploadField';
import { resolveImg } from '../../utils/img';

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

// Surface the first DRF field validation error, e.g. {slug:["required"]} -> "slug: required"
const firstValidationError = (res) => {
    if (!res || typeof res !== 'object') return null;
    const key = Object.keys(res).find(k => k !== 'id');
    if (!key) return null;
    const v = res[key];
    return `${key}: ${Array.isArray(v) ? v[0] : v}`;
};

// ===== TAB CONFIGURATION =====
// NOTE: field sets below mirror the Django models exactly (tiesverse_app.models).
// Department -> Supabase 'articles', EventSpeaker -> 'guests',
// EventRegistration -> 'workshops'. Keep form fields in sync with those models.
const TAB_CONFIG = {
    departments: {
        title: 'Articles & Reports', subtitle: 'Newsroom and research content (Supabase: articles).', icon: <BookOpen size={20} />, itemLabel: 'Article',
        fetchFn: getDepartments, createFn: createDepartment, updateFn: updateDepartment, deleteFn: deleteDepartment,
        imageField: 'cover_url', defaultForm: { kind: 'Article', featured: false, published: true },
    },
    team_members: {
        title: 'Team Members', subtitle: 'Manage the team directory and profiles.', icon: <Users size={20} />, itemLabel: 'Member',
        fetchFn: getTeamMembers, createFn: createTeamMember, updateFn: updateTeamMember, deleteFn: deleteTeamMember,
        imageField: 'photo_url', defaultForm: { is_founder: false, display_order: 0 },
    },
    event_speakers: {
        title: 'Speakers / Guests', subtitle: 'People who have joined Tiesverse events (Supabase: guests).', icon: <Users size={20} />, itemLabel: 'Speaker',
        fetchFn: getEventSpeakers, createFn: createEventSpeaker, updateFn: updateEventSpeaker, deleteFn: deleteEventSpeaker,
        imageField: 'photo_url', defaultForm: { featured: false },
    },
    event_registrations: {
        title: 'Workshops', subtitle: 'Workshop / open-registration listings (Supabase: workshops).', icon: <FileText size={20} />, itemLabel: 'Workshop',
        fetchFn: getEventRegistrations, createFn: createEventRegistration, updateFn: updateEventRegistration, deleteFn: deleteEventRegistration,
        imageField: 'cover_url', defaultForm: { status: 'upcoming' },
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
    const [uploadingImage, setUploadingImage] = useState(false);

    const showNotice = (msg, type = 'success') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 4000);
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

    // ===== IMAGE UPLOAD (Cloudinary) =====
    // Upload a picked file → store the returned secure_url in the active tab's
    // image field (config.imageField). Used by ImageUploadField.
    const handleImageFile = async (file) => {
        setUploadingImage(true);
        const res = await uploadImage(file);
        setUploadingImage(false);
        if (res?.secure_url) {
            setFormData(prev => ({ ...prev, [config.imageField]: res.secure_url }));
            setPreviewUrl(res.secure_url);
            showNotice('Image uploaded');
        } else {
            showNotice(res?.error || 'Image upload failed', 'error');
        }
    };

    const openLibrary = async () => {
        setCloudinaryPicker({ open: true, images: [], loading: true });
        const res = await listCloudinaryImages();
        setCloudinaryPicker({ open: true, images: res?.images || [], loading: false });
    };

    // Picks one image from the library into the active tab's image field.
    const selectCloudinaryImage = (url) => {
        setFormData(prev => ({ ...prev, [config.imageField]: url }));
        setPreviewUrl(url);
        setCloudinaryPicker({ open: false, images: [], loading: false });
        setMultiPickerSelected([]);
    };

    // Vestigial handlers for legacy picker branches (size-warning modal and
    // team bulk-add) that are no longer reachable with single-select. Defined
    // so the unreachable JSX can't throw a ReferenceError if ever rendered.
    const proceedWithImage = () => setSizeWarning({ open: false, file: null });
    const confirmTeamPickerSelection = () => setCloudinaryPicker({ open: false, images: [], loading: false });

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
        setLoading(true);
        const { id, created_at, ...dataToSave } = formData;

        try {
            const res = editingId
                ? await config.updateFn(editingId, dataToSave)
                : await config.createFn(dataToSave);
            // A successful save returns the object (with an `id`). DRF validation
            // errors come back as field-keyed arrays with no `id` and no `error`.
            if (res && res.id) {
                showNotice(editingId ? 'Updated successfully!' : 'Published successfully!');
                closeFormModal();
                fetchData();
            } else {
                showNotice('Error: ' + (res?.error || firstValidationError(res) || 'Save failed'), 'error');
            }
        } catch (err) { showNotice('Error: ' + err.message, 'error'); }
        setLoading(false);
    };

    // ===== DELETE =====
    const handleDelete = async () => {
        const { id } = deleteModal;
        setLoading(true);
        const res = await config.deleteFn(id);
        if (res?.error) showNotice('Error: ' + res.error, 'error');
        else { showNotice('Removed successfully.'); fetchData(); }
        setLoading(false);
        setDeleteModal({ open: false, id: null, title: '' });
    };

    // ===== RENDER FORM FIELDS PER TAB =====
    // Fields mirror the Django models exactly. Required fields are marked.
    const renderFormFields = () => {
        if (tab === 'departments') return (   // Department model -> Supabase 'articles'
            <>
                <FormField label="Title *" name="title" value={formData.title} onChange={handleInputChange} placeholder="e.g. India's Semiconductor Push" required />
                <FormField label="Slug *" name="slug" value={formData.slug} onChange={handleInputChange} placeholder="india-semiconductor-push (unique)" required />
                <div><FieldLabel>Dek / Summary</FieldLabel><textarea name="dek" value={formData.dek || ''} onChange={handleInputChange} style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} placeholder="One-line summary shown under the title." /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <FormField label="Category (cat)" name="cat" value={formData.cat} onChange={handleInputChange} placeholder="e.g. Geopolitics" />
                    <FormField label="Topic" name="topic" value={formData.topic} onChange={handleInputChange} placeholder="e.g. Trade" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                        <FieldLabel>Kind</FieldLabel>
                        <select name="kind" value={formData.kind || 'Article'} onChange={handleInputChange} style={selectStyle}>
                            <option value="Article">Article</option>
                            <option value="Report">Report</option>
                            <option value="Brief">Brief</option>
                            <option value="Analysis">Analysis</option>
                        </select>
                    </div>
                    <FormField label="Read time" name="read_time" value={formData.read_time} onChange={handleInputChange} placeholder="e.g. 6 min read" />
                </div>
                <FormField label="Date" name="date" value={formData.date} onChange={handleInputChange} placeholder="e.g. Jun 24, 2026" />
                <ImageUploadField label="Cover Image URL *" name="cover_url" value={formData.cover_url} onChange={handleInputChange} placeholder="https://…" required onFile={handleImageFile} onBrowse={openLibrary} uploading={uploadingImage} />
                <div style={{ display: 'flex', gap: '24px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem' }}>
                        <input type="checkbox" name="featured" checked={!!formData.featured} onChange={e => handleInputChange({ target: { name: 'featured', value: e.target.checked } })} /> Featured
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem' }}>
                        <input type="checkbox" name="published" checked={formData.published !== false} onChange={e => handleInputChange({ target: { name: 'published', value: e.target.checked } })} /> Published
                    </label>
                </div>
            </>
        );

        if (tab === 'team_members') return (   // TeamMember model
            <>
                <FormField label="Full Name *" name="name" value={formData.name} onChange={handleInputChange} placeholder="Jane Doe" required />
                <FormField label="Role / Title *" name="role" value={formData.role} onChange={handleInputChange} placeholder="e.g. Researcher" required />
                <div><FieldLabel>Bio</FieldLabel><textarea name="bio" value={formData.bio || ''} onChange={handleInputChange} style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} placeholder="Brief bio..." /></div>
                <ImageUploadField label="Photo URL" name="photo_url" value={formData.photo_url} onChange={handleInputChange} placeholder="https://example.com/photo.jpg" onFile={handleImageFile} onBrowse={openLibrary} uploading={uploadingImage} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <FormField label="Department" name="department" value={formData.department} onChange={handleInputChange} placeholder="e.g. Research" />
                    <FormField label="Display order" name="display_order" value={formData.display_order} onChange={handleInputChange} placeholder="0" type="number" />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem' }}>
                    <input type="checkbox" name="is_founder" checked={!!formData.is_founder} onChange={e => handleInputChange({ target: { name: 'is_founder', value: e.target.checked } })} /> Founder
                </label>
            </>
        );

        if (tab === 'event_speakers') return (   // EventSpeaker model -> Supabase 'guests'
            <>
                <FormField label="Speaker Name *" name="name" value={formData.name} onChange={handleInputChange} placeholder="Full name" required />
                <FormField label="Role / Designation *" name="role" value={formData.role} onChange={handleInputChange} placeholder="e.g. CEO, Author, Diplomat" required />
                <FormField label="Organization" name="org" value={formData.org} onChange={handleInputChange} placeholder="e.g. Ministry of External Affairs" />
                <div><FieldLabel>Quote</FieldLabel><textarea name="quote" value={formData.quote || ''} onChange={handleInputChange} style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} placeholder="A notable quote from this guest..." /></div>
                <ImageUploadField label="Photo URL" name="photo_url" value={formData.photo_url} onChange={handleInputChange} placeholder="https://example.com/photo.jpg" onFile={handleImageFile} onBrowse={openLibrary} uploading={uploadingImage} />
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem' }}>
                    <input type="checkbox" name="featured" checked={!!formData.featured} onChange={e => handleInputChange({ target: { name: 'featured', value: e.target.checked } })} /> Featured
                </label>
            </>
        );

        if (tab === 'event_registrations') return (   // EventRegistration model -> Supabase 'workshops'
            <>
                <FormField label="Workshop Title *" name="title" value={formData.title} onChange={handleInputChange} placeholder="e.g. Newsroom Masterclass" required />
                <div><FieldLabel>Description</FieldLabel><textarea name="description" value={formData.description || ''} onChange={handleInputChange} style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} placeholder="What the workshop covers..." /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <FormField label="Date" name="date" value={formData.date} onChange={handleInputChange} placeholder="e.g. Jul 12, 2026" />
                    <FormField label="Time / TZ" name="time_tz" value={formData.time_tz} onChange={handleInputChange} placeholder="e.g. 4:00 PM IST" />
                </div>
                <FormField label="Host" name="host" value={formData.host} onChange={handleInputChange} placeholder="e.g. Nimble" />
                <ImageUploadField label="Cover Image URL" name="cover_url" value={formData.cover_url} onChange={handleInputChange} placeholder="https://…" onFile={handleImageFile} onBrowse={openLibrary} uploading={uploadingImage} />
                <FormField label="Registration URL" name="register_url" value={formData.register_url} onChange={handleInputChange} placeholder="https://…" />
                <div>
                    <FieldLabel>Status</FieldLabel>
                    <select name="status" value={formData.status || 'upcoming'} onChange={handleInputChange} style={selectStyle}>
                        <option value="upcoming">Upcoming</option>
                        <option value="past">Past</option>
                    </select>
                </div>
            </>
        );

        return null;
    };

    // ===== RENDER ITEM CARD =====
    const renderItemCard = (item) => {
        const thumb = config.imageField ? item[config.imageField] : null;
        const title = item.title || item.name || 'Untitled';
        const subtitle = item.role || item.cat || item.host || item.org || item.department || item.kind || '';
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
                        <img src={resolveImg(thumb)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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

    const filteredItems = items;

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