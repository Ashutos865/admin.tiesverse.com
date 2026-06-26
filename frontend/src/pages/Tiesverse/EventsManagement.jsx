import React, { useState, useEffect } from 'react';
import {
  getEvents, createEvent, updateEvent, deleteEvent, uploadImage
} from '../../apiClient';
import { Plus, Edit2, Trash2, CheckCircle, XCircle, MapPin, Calendar, Sparkles, X, Users, Tag, IndianRupee } from 'lucide-react';
import ImageUploadField from '../../components/ImageUploadField';

// Mirrors the Django Event model (tiesverse_app.models.Event).
const EMPTY_EVENT = {
  title: '', category: '', city: '', venue: '', date: '', time: '', host: '',
  price: '', orig_price: '', capacity: '', cover_url: '', register_url: '',
  note: '', flagship: false, past: false,
};

const EventsManagement = () => {
  const [events, setEvents] = useState([]);
  const [formData, setFormData] = useState({ ...EMPTY_EVENT });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ message: '', type: '' });
  const [deleteModal, setDeleteModal] = useState({ open: false, id: null, title: '' });
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => { fetchEvents(); }, []);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const res = await getEvents();
      if (Array.isArray(res)) setEvents(res);
      else if (res && !res.error) setEvents(res.results || []);
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

  // Upload a picked image to Cloudinary and store its secure_url in cover_url.
  const handleCoverUpload = async (file) => {
    setUploadingImage(true);
    const res = await uploadImage(file);
    setUploadingImage(false);
    if (res?.secure_url) {
      setFormData(prev => ({ ...prev, cover_url: res.secure_url }));
      showToast('Image uploaded', 'success');
    } else {
      showToast(res?.error || 'Image upload failed', 'error');
    }
  };

  // Build a payload that matches the serializer's field types.
  const buildPayload = () => {
    const p = {
      title: formData.title.trim(),
      category: formData.category.trim(),
      city: formData.city.trim(),
      venue: formData.venue.trim(),
      date: formData.date.trim(),
      time: formData.time.trim(),
      host: formData.host.trim(),
      price: Number(formData.price) || 0,
      cover_url: formData.cover_url.trim(),
      register_url: formData.register_url.trim(),
      note: formData.note.trim(),
      flagship: !!formData.flagship,
      past: !!formData.past,
    };
    // Optional nullable integers — only send when provided.
    p.orig_price = formData.orig_price === '' ? null : Number(formData.orig_price);
    p.capacity = formData.capacity === '' ? null : Number(formData.capacity);
    return p;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.date.trim()) {
      showToast('Title and Date are required.', 'error');
      return;
    }
    setLoading(true);
    try {
      const payload = buildPayload();
      const res = editingId
        ? await updateEvent(editingId, payload)
        : await createEvent(payload);
      // A successful create/update returns the saved object (which has an `id`).
      // DRF validation errors come back as field-keyed arrays with no `id`.
      if (res && res.id) {
        showToast(editingId ? 'Event updated successfully!' : 'Event published successfully!');
        closeFormModal();
        fetchEvents();
      } else {
        const msg = res?.error || firstValidationError(res) || 'Failed to save event';
        showToast(msg, 'error');
      }
    } catch { showToast('Error saving event details', 'error'); }
    setLoading(false);
  };

  const firstValidationError = (res) => {
    if (!res || typeof res !== 'object') return null;
    const key = Object.keys(res)[0];
    if (!key) return null;
    const val = res[key];
    return `${key}: ${Array.isArray(val) ? val[0] : val}`;
  };

  const openCreateModal = () => {
    setEditingId(null);
    setFormData({ ...EMPTY_EVENT });
    setFormModalOpen(true);
  };

  const openEditModal = (event) => {
    setEditingId(event.id);
    setFormData({
      title: event.title || '', category: event.category || '', city: event.city || '',
      venue: event.venue || '', date: event.date || '', time: event.time || '',
      host: event.host || '', price: event.price ?? '', orig_price: event.orig_price ?? '',
      capacity: event.capacity ?? '', cover_url: event.cover_url || '',
      register_url: event.register_url || '', note: event.note || '',
      flagship: !!event.flagship, past: !!event.past,
    });
    setFormModalOpen(true);
  };

  const closeFormModal = () => {
    setFormModalOpen(false);
    setEditingId(null);
    setFormData({ ...EMPTY_EVENT });
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

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', margin: 0 }}>
            Events Management
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.4)', marginTop: '6px' }}>
            Create, update, and manage on-ground Tiesverse events.
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
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
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

      {/* Events Grid */}
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
          {events.map(event => (
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
                minHeight: '220px',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--primary) 25%, transparent)';
                e.currentTarget.style.transform = 'translateY(-4px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div>
                {/* Badges Row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '14px' }}>
                  <span style={{
                    fontSize: '0.625rem', fontWeight: 800, letterSpacing: '0.1em',
                    padding: '4px 10px', borderRadius: '6px',
                    background: 'color-mix(in srgb, var(--primary) 10%, transparent)', color: 'var(--primary)',
                    border: '1px solid color-mix(in srgb, var(--primary) 15%, transparent)',
                    textTransform: 'uppercase',
                  }}>
                    {event.category || 'EVENT'}
                  </span>
                  {event.flagship && (
                    <span style={{
                      fontSize: '0.625rem', fontWeight: 800, letterSpacing: '0.08em',
                      padding: '4px 10px', borderRadius: '6px',
                      background: 'rgba(245,158,11,0.12)', color: '#F59E0B',
                      border: '1px solid rgba(245,158,11,0.2)',
                    }}>
                      ⭐ FLAGSHIP
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

                {/* Note / blurb */}
                <p style={{
                  fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)', lineHeight: 1.5,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  marginBottom: '16px',
                }}>
                  {event.note || 'No description provided.'}
                </p>
              </div>

              <div>
                {/* Metadata */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                  {event.date && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
                      <Calendar size={13} /> {event.date}{event.time ? ` · ${event.time}` : ''}
                    </div>
                  )}
                  {(event.venue || event.city) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
                      <MapPin size={13} /> {[event.venue, event.city].filter(Boolean).join(', ')}
                    </div>
                  )}
                  {event.capacity && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
                      <Users size={13} /> Cap: {event.capacity}
                    </div>
                  )}
                </div>

                {/* Status + Actions Bar */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.04em',
                      padding: '5px 12px', borderRadius: '8px',
                      background: event.past ? 'rgba(107,114,128,0.1)' : 'rgba(16,185,129,0.1)',
                      color: event.past ? '#6B7280' : '#10B981',
                      border: `1px solid ${event.past ? 'rgba(107,114,128,0.2)' : 'rgba(16,185,129,0.2)'}`,
                      display: 'flex', alignItems: 'center', gap: '5px',
                    }}>
                      {event.past ? <XCircle size={12} /> : <CheckCircle size={12} />}
                      {event.past ? 'Past' : 'Upcoming'}
                    </span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.55)' }}>
                      {Number(event.price) > 0 ? `₹${event.price}` : 'Free'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => openEditModal(event)}
                      style={{
                        padding: '8px', borderRadius: '8px',
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                        color: 'rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center',
                      }}
                      title="Edit"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteModal({ open: true, id: event.id, title: event.title })}
                      style={{
                        padding: '8px', borderRadius: '8px',
                        background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)',
                        color: 'rgba(239,68,68,0.5)', cursor: 'pointer', display: 'flex', alignItems: 'center',
                      }}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
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
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <FormField label="Event Title *" name="title" value={formData.title} onChange={handleChange} placeholder="Geopolitics Live: The Delhi Salon" required />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <FormField label="Date *" name="date" value={formData.date} onChange={handleChange} placeholder="Jul 05, 2026" required />
                <FormField label="Time" name="time" value={formData.time} onChange={handleChange} placeholder="6:30 PM" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <FormField label="Category" name="category" value={formData.category} onChange={handleChange} placeholder="Summit / Salon / Meetup" />
                <FormField label="Host" name="host" value={formData.host} onChange={handleChange} placeholder="Foreign Policy India" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <FormField label="City" name="city" value={formData.city} onChange={handleChange} placeholder="New Delhi" />
                <FormField label="Venue" name="venue" value={formData.venue} onChange={handleChange} placeholder="India Habitat Centre" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <FormField label="Price (₹)" name="price" type="number" value={formData.price} onChange={handleChange} placeholder="0" />
                <FormField label="Orig. Price (₹)" name="orig_price" type="number" value={formData.orig_price} onChange={handleChange} placeholder="optional" />
                <FormField label="Capacity" name="capacity" type="number" value={formData.capacity} onChange={handleChange} placeholder="optional" />
              </div>

              <ImageUploadField label="Cover Image URL" name="cover_url" value={formData.cover_url} onChange={handleChange} placeholder="https://…" onFile={handleCoverUpload} uploading={uploadingImage} />
              <FormField label="Registration URL" name="register_url" value={formData.register_url} onChange={handleChange} placeholder="https://…" />

              <div>
                <FieldLabel>Description / Note</FieldLabel>
                <textarea
                  name="note" value={formData.note} onChange={handleChange}
                  placeholder="Short blurb shown on the event card."
                  style={{ ...inputStyle, minHeight: '90px', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '24px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>
                  <input type="checkbox" name="flagship" checked={formData.flagship} onChange={handleChange}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }} />
                  Flagship event
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>
                  <input type="checkbox" name="past" checked={formData.past} onChange={handleChange}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }} />
                  Past event
                </label>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button
                  type="button" onClick={closeFormModal}
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
                  type="submit" disabled={loading}
                  style={{
                    flex: 2, padding: '14px', borderRadius: '12px',
                    background: 'linear-gradient(135deg, #FF6B00, #D45A00)',
                    color: '#fff', border: 'none', fontSize: '0.875rem', fontWeight: 800,
                    cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '0.03em',
                    boxShadow: '0 8px 20px color-mix(in srgb, var(--primary) 30%, transparent)',
                    opacity: loading ? 0.7 : 1,
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
      type={type} name={name} value={value ?? ''} onChange={onChange}
      placeholder={placeholder} required={required}
      style={inputStyle}
      onFocus={e => { e.target.style.borderColor = 'color-mix(in srgb, var(--primary) 40%, transparent)'; e.target.style.background = 'rgba(255,255,255,0.06)'; }}
      onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; e.target.style.background = 'rgba(255,255,255,0.04)'; }}
    />
  </div>
);

export default EventsManagement;
