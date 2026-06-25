import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import {
    getDepartments, createDepartment, updateDepartment, deleteDepartment,
    getTeamMembers, createTeamMember, updateTeamMember, deleteTeamMember,
    getEventSpeakers, createEventSpeaker, updateEventSpeaker, deleteEventSpeaker,
    getEventRegistrations, createEventRegistration, updateEventRegistration, deleteEventRegistration,
    getSettings, updateSetting
} from '../../apiClient';
import { Plus, Edit2, Trash2, X, Sparkles, BookOpen, PlaySquare, Users, Video, Calendar, ExternalLink, Image, FileText, Briefcase } from 'lucide-react';

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
    departments: {
        title: 'Departments', subtitle: 'Manage organization departments.', icon: <BookOpen size={20} />, itemLabel: 'Department',
        fetchFn: getDepartments, createFn: createDepartment, updateFn: updateDepartment, deleteFn: deleteDepartment,
        imageField: 'cover_image_url', defaultForm: {},
    },
    team_members: {
        title: 'Team Members', subtitle: 'Manage the team directory and profiles.', icon: <Users size={20} />, itemLabel: 'Member',
        fetchFn: getTeamMembers, createFn: createTeamMember, updateFn: updateTeamMember, deleteFn: deleteTeamMember,
        imageField: 'photo_url', defaultForm: { is_active: true },
    },
    event_speakers: {
        title: 'Speakers', subtitle: 'Manage event speakers.', icon: <Users size={20} />, itemLabel: 'Speaker',
        fetchFn: getEventSpeakers, createFn: createEventSpeaker, updateFn: updateEventSpeaker, deleteFn: deleteEventSpeaker,
        imageField: 'photo_url', defaultForm: {},
    },
    event_registrations: {
        title: 'Registrations', subtitle: 'Manage event registrations.', icon: <FileText size={20} />, itemLabel: 'Registration',
        fetchFn: getEventRegistrations, createFn: createEventRegistration, updateFn: updateEventRegistration, deleteFn: deleteEventRegistration,
        imageField: null, defaultForm: { status: 'confirmed' },
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
        const res = await config.deleteFn(id);
        if (res?.error) showNotice('Error: ' + res.error, 'error');
        else { showNotice('Removed successfully.'); fetchData(); }
        setLoading(false);
        setDeleteModal({ open: false, id: null, title: '' });
    };

    // ===== RENDER FORM FIELDS PER TAB =====
    const renderFormFields = () => {
        if (tab === 'departments') return (
            <>
                <FormField label="Department Name" name="name" value={formData.name} onChange={handleInputChange} placeholder="e.g. Defense" required />
            </>
        );

        if (tab === 'team_members') return (
            <>
                <FormField label="Full Name" name="name" value={formData.name} onChange={handleInputChange} placeholder="Jane Doe" required />
                <FormField label="Role / Title" name="role" value={formData.role} onChange={handleInputChange} placeholder="e.g. Researcher" />
                <FormField label="Bio" name="bio" value={formData.bio} onChange={handleInputChange} placeholder="Brief bio..." />
                <FormField label="Photo URL" name="photo_url" value={formData.photo_url} onChange={handleInputChange} placeholder="https://example.com/photo.jpg" />
                <FormField label="Department ID" name="department_id" value={formData.department_id} onChange={handleInputChange} placeholder="ID of department" type="number" />
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem' }}>
                    <input type="checkbox" name="is_active" checked={formData.is_active !== false} onChange={e => handleInputChange({ target: { name: 'is_active', value: e.target.checked }})} /> Active
                </label>
            </>
        );

        if (tab === 'event_speakers') return (
            <>
                <FormField label="Event ID" name="event_id" value={formData.event_id} onChange={handleInputChange} placeholder="ID of Event" type="number" required />
                <FormField label="Speaker Name" name="name" value={formData.name} onChange={handleInputChange} placeholder="Full name" required />
                <FormField label="Designation" name="designation" value={formData.designation} onChange={handleInputChange} placeholder="e.g. CEO" />
                <FormField label="Organization" name="organization" value={formData.organization} onChange={handleInputChange} placeholder="e.g. Company" />
                <div><FieldLabel>Bio</FieldLabel><textarea name="bio" value={formData.bio || ''} onChange={handleInputChange} style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} placeholder="Brief bio..." /></div>
                <FormField label="Photo URL" name="photo_url" value={formData.photo_url} onChange={handleInputChange} placeholder="https://example.com/photo.jpg" />
            </>
        );

        if (tab === 'event_registrations') return (
            <>
                <FormField label="Event ID" name="event_id" value={formData.event_id} onChange={handleInputChange} placeholder="ID of Event" type="number" required />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <FormField label="First Name" name="first_name" value={formData.first_name} onChange={handleInputChange} required />
                    <FormField label="Last Name" name="last_name" value={formData.last_name} onChange={handleInputChange} required />
                </div>
                <FormField label="Email" name="email" value={formData.email} onChange={handleInputChange} type="email" required />
                <FormField label="Phone" name="phone" value={formData.phone} onChange={handleInputChange} />
                <FormField label="Organization" name="organization" value={formData.organization} onChange={handleInputChange} />
                <div>
                    <FieldLabel>Status</FieldLabel>
                    <select name="status" value={formData.status || 'confirmed'} onChange={handleInputChange} style={selectStyle}>
                        <option value="confirmed">Confirmed</option>
                        <option value="waitlisted">Waitlisted</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="attended">Attended</option>
                    </select>
                </div>
                <div><FieldLabel>Notes</FieldLabel><textarea name="notes" value={formData.notes || ''} onChange={handleInputChange} style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} placeholder="Admin notes..." /></div>
            </>
        );

        return null;
    };

    // ===== RENDER ITEM CARD =====
    const renderItemCard = (item) => {
        const thumb = config.imageField ? item[config.imageField] : null;
        const title = item.name || (item.first_name ? `${item.first_name} ${item.last_name}` : '') || 'Untitled';
        const subtitle = item.role || item.designation || item.status || '';
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