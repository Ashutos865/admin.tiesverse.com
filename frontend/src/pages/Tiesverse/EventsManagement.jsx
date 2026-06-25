import React, { useState, useEffect } from 'react';
import { 
  getEvents, createEvent, updateEvent, deleteEvent 
} from '../../apiClient';
import { Plus, Edit2, Trash2, CheckCircle, XCircle, Clock, MapPin, Calendar, Sparkles, X, ExternalLink } from 'lucide-react';

const EventsManagement = () => {
  const [events, setEvents] = useState([]);
  const [formData, setFormData] = useState({
    title: '', status: 'REGISTRATION OPEN', date: '', time: '',
    location: '', description: '', form_link: '', is_featured: false, type: 'SEMINAR'
  });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ message: '', type: '' });
  const [deleteModal, setDeleteModal] = useState({ open: false, id: null, title: '' });
  const [formModalOpen, setFormModalOpen] = useState(false);

  useEffect(() => { fetchEvents(); }, []);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const res = await getEvents();
      if (res && !res.error) setEvents(res);
      else showToast(res?.error || 'Failed to load events', 'error');
    } catch { showToast('Error fetching events', 'error'); }
    setLoading(false);
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast({ message: '', type: '' }), 4000);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingId) {
        const res = await updateEvent(editingId, formData);
        if (res && !res.error) { showToast('Event updated successfully!'); closeFormModal(); fetchEvents(); }
        else showToast(res?.error || 'Failed to update event', 'error');
      } else {
        const res = await createEvent(formData);
        if (res && !res.error) { showToast('Event published successfully!'); closeFormModal(); fetchEvents(); }
        else showToast(res?.error || 'Failed to create event', 'error');
      }
    } catch { showToast('Error saving event details', 'error'); }
    setLoading(false);
  };

  const openCreateModal = () => {
    setEditingId(null);
    setFormData({
      title: '', status: 'REGISTRATION OPEN', date: '', time: '',
      location: '', description: '', form_link: '', is_featured: false, type: 'SEMINAR'
    });
    setFormModalOpen(true);
  };

  const openEditModal = (event) => {
    setEditingId(event.id);
    setFormData({
      title: event.title || '', status: event.status || 'REGISTRATION OPEN',
      date: event.date || '', time: event.time || '', location: event.location || '',
      description: event.description || '', form_link: event.form_link || '',
      is_featured: event.is_featured || false, type: event.type || 'SEMINAR'
    });
    setFormModalOpen(true);
  };

  const closeFormModal = () => {
    setFormModalOpen(false);
    setEditingId(null);
    setFormData({
      title: '', status: 'REGISTRATION OPEN', date: '', time: '',
      location: '', description: '', form_link: '', is_featured: false, type: 'SEMINAR'
    });
  };

  const confirmDelete = async () => {
    const { id } = deleteModal;
    setLoading(true);
    try {
      const res = await deleteEvent(id);
      if (res && !res.error) { showToast('Event removed successfully.'); fetchEvents(); }
      else showToast(res?.error || 'Failed to delete event', 'error');
    } catch { showToast('Error removing event', 'error'); }
    setDeleteModal({ open: false, id: null, title: '' });
    setLoading(false);
  };

  const getStatusStyle = (status) => {
    if (status === 'REGISTRATION OPEN') return { bg: 'rgba(16,185,129,0.1)', color: '#10B981', border: 'rgba(16,185,129,0.2)' };
    if (status === 'REGISTRATION CLOSED') return { bg: 'rgba(245,158,11,0.1)', color: '#F59E0B', border: 'rgba(245,158,11,0.2)' };
    return { bg: 'rgba(107,114,128,0.1)', color: '#6B7280', border: 'rgba(107,114,128,0.2)' };
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', margin: 0 }}>
            Events Management
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.4)', marginTop: '6px' }}>
            Create, update, and manage global Tiesverse events and webinars.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '12px 24px', background: 'var(--primary)',
            color: '#fff', border: 'none', borderRadius: '12px', fontSize: '0.875rem',
            fontWeight: 700, cursor: 'pointer', letterSpacing: '0.02em',
            boxShadow: '0 8px 20px color-mix(in srgb, var(--primary) 30%, transparent)',
            transition: 'all 0.3s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 28px color-mix(in srgb, var(--primary) 40%, transparent)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 20px color-mix(in srgb, var(--primary) 30%, transparent)'; }}
        >
          <Plus size={18} /> Add New Event
        </button>
      </div>

      {/* Toast */}
      {toast.message && (
        <div style={{
          marginBottom: '24px', padding: '14px 20px', borderRadius: '12px',
          fontSize: '0.875rem', fontWeight: 600,
          background: toast.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${toast.type === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
          color: toast.type === 'success' ? '#10B981' : '#EF4444',
        }}>
          {toast.message}
        </div>
      )}

      {/* Events Grid — Full Width */}
      {loading && events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'rgba(255,255,255,0.3)' }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, letterSpacing: '0.1em' }}>LOADING EVENTS...</div>
        </div>
      ) : events.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '80px 0',
          background: 'rgba(255,255,255,0.02)', borderRadius: '16px',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <Calendar size={40} style={{ color: 'rgba(255,255,255,0.15)', marginBottom: '12px' }} />
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem', fontWeight: 600 }}>No events yet</p>
          <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.8125rem', marginTop: '4px' }}>Click "Add New Event" to create one.</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: '20px',
        }}>
          {events.map(event => {
            const statusStyle = getStatusStyle(event.status);
            return (
              <div
                key={event.id}
                style={{
                  background: 'rgba(20,20,20,0.6)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '16px',
                  padding: '24px',
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  cursor: 'default',
                  minHeight: '220px',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--primary) 25%, transparent)';
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 16px 32px rgba(0,0,0,0.4), 0 0 20px color-mix(in srgb, var(--primary) 8%, transparent)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {/* Top Section */}
                <div>
                  {/* Badges Row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '14px' }}>
                    <span style={{
                      fontSize: '0.625rem', fontWeight: 800, letterSpacing: '0.1em',
                      padding: '4px 10px', borderRadius: '6px',
                      background: 'color-mix(in srgb, var(--primary) 10%, transparent)', color: 'var(--primary)',
                      border: '1px solid color-mix(in srgb, var(--primary) 15%, transparent)',
                    }}>
                      {event.type || 'EVENT'}
                    </span>
                    {event.is_featured && (
                      <span style={{
                        fontSize: '0.625rem', fontWeight: 800, letterSpacing: '0.08em',
                        padding: '4px 10px', borderRadius: '6px',
                        background: 'rgba(245,158,11,0.12)', color: '#F59E0B',
                        border: '1px solid rgba(245,158,11,0.2)',
                      }}>
                        ⭐ FEATURED
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h3 style={{
                    fontSize: '1.0625rem', fontWeight: 700, color: '#fff',
                    lineHeight: 1.4, marginBottom: '8px',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {event.title}
                  </h3>

                  {/* Description */}
                  <p style={{
                    fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)', lineHeight: 1.5,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    marginBottom: '16px',
                  }}>
                    {event.description || 'No description provided.'}
                  </p>
                </div>

                {/* Bottom Section */}
                <div>
                  {/* Metadata */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                    {event.date && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
                        <Calendar size={13} /> {event.date}
                      </div>
                    )}
                    {event.time && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
                        <Clock size={13} /> {event.time}
                      </div>
                    )}
                    {event.location && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
                        <MapPin size={13} /> {event.location}
                      </div>
                    )}
                  </div>

                  {/* Status + Actions Bar */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <span style={{
                      fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.04em',
                      padding: '5px 12px', borderRadius: '8px',
                      background: statusStyle.bg, color: statusStyle.color,
                      border: `1px solid ${statusStyle.border}`,
                      display: 'flex', alignItems: 'center', gap: '5px',
                    }}>
                      {event.status === 'REGISTRATION OPEN' ? <CheckCircle size={12} /> : <XCircle size={12} />}
                      {event.status || 'OPEN'}
                    </span>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      {event.form_link && (
                        <a
                          href={event.form_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            padding: '8px', borderRadius: '8px',
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                            color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center',
                            transition: 'all 0.2s',
                          }}
                          title="Open Registration Link"
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--primary) 30%, transparent)'; e.currentTarget.style.color = 'var(--primary)'; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                      <button
                        onClick={() => openEditModal(event)}
                        style={{
                          padding: '8px', borderRadius: '8px',
                          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                          color: 'rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center',
                          transition: 'all 0.2s',
                        }}
                        title="Edit"
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,107,0,0.3)'; e.currentTarget.style.color = '#FF6B00'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteModal({ open: true, id: event.id, title: event.title })}
                        style={{
                          padding: '8px', borderRadius: '8px',
                          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)',
                          color: 'rgba(239,68,68,0.5)', cursor: 'pointer', display: 'flex', alignItems: 'center',
                          transition: 'all 0.2s',
                        }}
                        title="Delete"
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'; e.currentTarget.style.color = '#EF4444'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.12)'; e.currentTarget.style.color = 'rgba(239,68,68,0.5)'; }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== CREATE / EDIT MODAL ===== */}
      {formModalOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            padding: '20px',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeFormModal(); }}
        >
          <div
            style={{
              background: '#111', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '20px', width: '100%', maxWidth: '560px',
              maxHeight: '90vh', overflowY: 'auto', padding: '32px',
              boxShadow: '0 40px 80px rgba(0,0,0,0.6)',
              animation: 'modalSlideUp 0.3s ease',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Sparkles size={20} style={{ color: 'var(--primary)' }} />
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                  {editingId ? 'Edit Event' : 'Create New Event'}
                </h2>
              </div>
              <button
                onClick={closeFormModal}
                style={{
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px', padding: '8px', color: 'rgba(255,255,255,0.4)',
                  cursor: 'pointer', display: 'flex',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <FormField label="Event Title" name="title" value={formData.title} onChange={handleChange} placeholder="e.g. AI Ethics Summit" required />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <FieldLabel>Status</FieldLabel>
                  <select name="status" value={formData.status} onChange={handleChange} style={selectStyle}>
                    <option value="REGISTRATION OPEN">REGISTRATION OPEN</option>
                    <option value="REGISTRATION CLOSED">REGISTRATION CLOSED</option>
                    <option value="EVENT ENDED">EVENT ENDED</option>
                  </select>
                </div>
                <FormField label="Type" name="type" value={formData.type} onChange={handleChange} placeholder="e.g. SEMINAR" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <FormField label="Date" name="date" value={formData.date} onChange={handleChange} placeholder="e.g. 2026-08-15" />
                <FormField label="Time" name="time" value={formData.time} onChange={handleChange} placeholder="e.g. 14:00 IST" />
              </div>

              <FormField label="Location" name="location" value={formData.location} onChange={handleChange} placeholder="e.g. Online / Zoom" />
              <FormField label="Registration Link" name="form_link" value={formData.form_link} onChange={handleChange} placeholder="https://zoom.us/webinar/..." />

              <div>
                <FieldLabel>Description</FieldLabel>
                <textarea
                  name="description" value={formData.description} onChange={handleChange}
                  placeholder="Provide context or schedule details..."
                  style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' }}
                />
              </div>

              <label style={{
                display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
                fontSize: '0.875rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)',
              }}>
                <input
                  type="checkbox" name="is_featured" checked={formData.is_featured} onChange={handleChange}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
                />
                Feature as Top Banner announcement
              </label>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button
                  type="button" onClick={closeFormModal}
                  style={{
                    flex: 1, padding: '14px', borderRadius: '12px',
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem', fontWeight: 700,
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit" disabled={loading}
                  style={{
                    flex: 2, padding: '14px', borderRadius: '12px',
                    background: 'linear-gradient(135deg, #FF6B00, #D45A00)',
                    color: '#fff', border: 'none', fontSize: '0.875rem', fontWeight: 800,
                    cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '0.03em',
                    boxShadow: '0 8px 20px color-mix(in srgb, var(--primary) 30%, transparent)',
                    transition: 'all 0.3s ease', opacity: loading ? 0.7 : 1,
                  }}
                >
                  {loading ? 'Saving...' : editingId ? 'Update Event' : 'Publish Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== DELETE CONFIRMATION MODAL ===== */}
      {deleteModal.open && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            padding: '20px',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteModal({ open: false, id: null, title: '' }); }}
        >
          <div style={{
            background: '#111', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '20px', maxWidth: '420px', width: '100%', padding: '32px',
            boxShadow: '0 40px 80px rgba(0,0,0,0.6)',
            animation: 'modalSlideUp 0.3s ease',
          }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{
                width: '56px', height: '56px', borderRadius: '16px', margin: '0 auto 16px',
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Trash2 size={24} style={{ color: '#EF4444' }} />
              </div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>Delete Event?</h3>
              <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                Are you sure you want to remove <strong style={{ color: 'rgba(255,255,255,0.7)' }}>"{deleteModal.title}"</strong>? This action cannot be undone.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setDeleteModal({ open: false, id: null, title: '' })}
                style={{
                  flex: 1, padding: '14px', borderRadius: '12px',
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem', fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete} disabled={loading}
                style={{
                  flex: 1, padding: '14px', borderRadius: '12px',
                  background: '#EF4444', color: '#fff', border: 'none',
                  fontSize: '0.875rem', fontWeight: 800, cursor: 'pointer',
                  boxShadow: '0 8px 20px rgba(239,68,68,0.3)',
                }}
              >
                {loading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animation Keyframes */}
      <style>{`
        @keyframes modalSlideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
};

/* ===== Reusable styled components ===== */
const inputStyle = {
  width: '100%', padding: '12px 16px', borderRadius: '10px',
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
  color: '#fff', fontSize: '0.875rem', fontFamily: 'inherit',
  transition: 'all 0.2s', outline: 'none', boxSizing: 'border-box',
};

const selectStyle = {
  ...inputStyle, cursor: 'pointer', appearance: 'auto',
};

const FieldLabel = ({ children }) => (
  <label style={{
    display: 'block', fontSize: '0.6875rem', fontWeight: 800,
    textTransform: 'uppercase', letterSpacing: '0.1em',
    color: 'rgba(255,255,255,0.35)', marginBottom: '8px',
  }}>
    {children}
  </label>
);

const FormField = ({ label, name, value, onChange, placeholder, required, type = 'text' }) => (
  <div>
    <FieldLabel>{label}</FieldLabel>
    <input
      type={type} name={name} value={value || ''} onChange={onChange}
      placeholder={placeholder} required={required}
      style={inputStyle}
      onFocus={e => { e.target.style.borderColor = 'color-mix(in srgb, var(--primary) 40%, transparent)'; e.target.style.background = 'rgba(255,255,255,0.06)'; }}
      onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; e.target.style.background = 'rgba(255,255,255,0.04)'; }}
    />
  </div>
);

export default EventsManagement;
