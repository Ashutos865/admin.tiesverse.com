import { useCallback, useEffect, useMemo, useState } from 'react';
import SeoCoach from '../../components/SeoCoach';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Edit2,
  MapPin,
  Plus,
  Sparkles,
  Star,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { createEvent, deleteEvent, getEvents, updateEvent, uploadImage } from '../../apiClient';
import ImageUploadField from '../../components/ImageUploadField';
import './EventsManagement.css';

const EMPTY_EVENT = {
  title: '',
  category: '',
  city: '',
  venue: '',
  date: '',
  time: '',
  host: '',
  price: '',
  orig_price: '',
  capacity: '',
  cover_url: '',
  register_url: '',
  note: '',
  flagship: false,
  past: false,
};

const PAGE_SIZE = 6;

const firstValidationError = (response) => {
  if (!response || typeof response !== 'object') return null;
  const key = Object.keys(response)[0];
  if (!key) return null;
  const value = response[key];
  return `${key}: ${Array.isArray(value) ? value[0] : value}`;
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
  // Internal form vs a link to somebody else's registration page.
  const [regMode, setRegMode] = useState('internal');
  const [page, setPage] = useState(1);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast({ message: '', type: '' }), 4000);
  }, []);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getEvents();
      if (Array.isArray(response)) {
        setEvents(response);
      } else if (response && !response.error) {
        setEvents(response.results || []);
      } else {
        showToast(response?.error || 'Failed to load events', 'error');
      }
    } catch {
      showToast('Error fetching events', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const timer = window.setTimeout(fetchEvents, 0);
    return () => window.clearTimeout(timer);
  }, [fetchEvents]);

  const totalPages = Math.max(1, Math.ceil(events.length / PAGE_SIZE));
  const activePage = Math.min(page, totalPages);
  const visibleEvents = useMemo(
    () => events.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE),
    [activePage, events],
  );

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFormData((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleCoverUpload = async (file) => {
    setUploadingImage(true);
    const response = await uploadImage(file);
    setUploadingImage(false);
    if (response?.secure_url) {
      setFormData((current) => ({ ...current, cover_url: response.secure_url }));
      showToast('Image uploaded');
    } else {
      showToast(response?.error || 'Image upload failed', 'error');
    }
  };

  const buildPayload = () => ({
    title: formData.title.trim(),
    category: formData.category.trim(),
    city: formData.city.trim(),
    venue: formData.venue.trim(),
    date: formData.date.trim(),
    time: formData.time.trim(),
    host: formData.host.trim(),
    price: Number(formData.price) || 0,
    orig_price: formData.orig_price === '' ? null : Number(formData.orig_price),
    capacity: formData.capacity === '' ? null : Number(formData.capacity),
    cover_url: formData.cover_url.trim(),
    register_url: formData.register_url.trim(),
    note: formData.note.trim(),
    flagship: Boolean(formData.flagship),
    past: Boolean(formData.past),
  });

  const closeFormModal = () => {
    setFormModalOpen(false);
    setEditingId(null);
    setFormData({ ...EMPTY_EVENT });
  };

  const openCreateModal = () => {
    setEditingId(null);
    setFormData({ ...EMPTY_EVENT });
    setRegMode('internal');
    setFormModalOpen(true);
  };

  const openEditModal = (event) => {
    setEditingId(event.id);
    setFormData({
      title: event.title || '',
      category: event.category || '',
      city: event.city || '',
      venue: event.venue || '',
      date: event.date || '',
      time: event.time || '',
      host: event.host || '',
      price: event.price ?? '',
      orig_price: event.orig_price ?? '',
      capacity: event.capacity ?? '',
      cover_url: event.cover_url || '',
      register_url: event.register_url || '',
      note: event.note || '',
      flagship: Boolean(event.flagship),
      past: Boolean(event.past),
    });
    // An event already pointing somewhere else opens on the external option.
    setRegMode(/^https?:\/\//i.test((event.register_url || '').trim()) ? 'external' : 'internal');
    setFormModalOpen(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!formData.title.trim() || !formData.date.trim()) {
      showToast('Title and date are required.', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = editingId
        ? await updateEvent(editingId, buildPayload())
        : await createEvent(buildPayload());
      if (response?.id) {
        showToast(editingId ? 'Event updated successfully.' : 'Event published successfully.');
        closeFormModal();
        await fetchEvents();
      } else {
        showToast(response?.error || firstValidationError(response) || 'Failed to save event', 'error');
      }
    } catch {
      showToast('Error saving event details', 'error');
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    setLoading(true);
    try {
      const response = await deleteEvent(deleteModal.id);
      if (response && !response.error) {
        showToast('Event removed successfully.');
        await fetchEvents();
      } else {
        showToast(response?.error || 'Failed to delete event', 'error');
      }
    } catch {
      showToast('Error removing event', 'error');
    } finally {
      setDeleteModal({ open: false, id: null, title: '' });
      setLoading(false);
    }
  };

  return (
    <div className="events-management-page">
      <header className="events-page-header">
        <div>
          <span className="events-eyebrow">Webinar & event operations</span>
          <h1>Events Management</h1>
          <p>Create, update, and manage physical events, webinars, and digital gatherings from the Webinar Portal.</p>
        </div>
        <button type="button" className="events-create-button" onClick={openCreateModal}>
          <Plus size={18} /> Add New Event
        </button>
      </header>

      {toast.message && <div className={`events-toast is-${toast.type || 'success'}`}>{toast.message}</div>}

      {loading && events.length === 0 ? (
        <div className="events-state">Loading events…</div>
      ) : events.length === 0 ? (
        <div className="events-state">
          <CalendarDays size={38} />
          <strong>No events yet</strong>
          <span>Click “Add New Event” to create one.</span>
        </div>
      ) : (
        <>
          <section className="events-grid">
            {visibleEvents.map((event) => {
              const category = event.category || 'Event';
              return (
                <article className={`event-card event-card-${category.toLowerCase().replace(/\s+/g, '-')}`} key={event.id}>
                  <div className="event-card-badges">
                    <span className="event-category">{category}</span>
                    {event.flagship && <span className="event-flagship"><Star size={12} fill="currentColor" /> Flagship</span>}
                  </div>

                  <h2>{event.title}</h2>
                  <p className="event-note">{event.note || 'No description provided for this event yet.'}</p>

                  <div className="event-details">
                    <div><CalendarDays size={17} /><span>{event.date || 'Date to be announced'}{event.time ? ` · ${event.time}` : ''}</span></div>
                    <div><MapPin size={17} /><span>{[event.venue, event.city].filter(Boolean).join(', ') || 'Venue to be announced'}</span></div>
                    <div><Users size={17} /><span>{event.capacity ? `Capacity: ${event.capacity}` : 'Open capacity'}</span></div>
                  </div>

                  <footer className="event-card-footer">
                    <div className="event-status-price">
                      <span className={event.past ? 'is-past' : 'is-upcoming'}>
                        {event.past ? 'Past' : 'Upcoming'}
                      </span>
                      <strong>{Number(event.price) > 0 ? `₹${Number(event.price).toLocaleString('en-IN')}` : 'Free'}</strong>
                    </div>
                    <div className="event-card-actions">
                      <button type="button" onClick={() => openEditModal(event)} aria-label={`Edit ${event.title}`}><Edit2 size={17} /></button>
                      <button type="button" className="is-danger" onClick={() => setDeleteModal({ open: true, id: event.id, title: event.title })} aria-label={`Delete ${event.title}`}><Trash2 size={17} /></button>
                    </div>
                  </footer>
                </article>
              );
            })}
          </section>

          <nav className="events-pagination" aria-label="Events pagination">
            <p>Showing <strong>{visibleEvents.length}</strong> of {events.length} events</p>
            <div>
              <button type="button" onClick={() => setPage((value) => value - 1)} disabled={activePage === 1} aria-label="Previous page"><ChevronLeft size={17} /></button>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                <button type="button" key={pageNumber} className={pageNumber === activePage ? 'is-active' : ''} onClick={() => setPage(pageNumber)}>
                  {pageNumber}
                </button>
              ))}
              <button type="button" onClick={() => setPage((value) => value + 1)} disabled={activePage === totalPages} aria-label="Next page"><ChevronRight size={17} /></button>
            </div>
          </nav>
        </>
      )}

      {formModalOpen && (
        <div className="event-modal-overlay" onClick={(event) => { if (event.target === event.currentTarget) closeFormModal(); }}>
          <div className="event-modal">
            <div className="event-modal-header">
              <div><Sparkles size={20} /><h2>{editingId ? 'Edit Event' : 'Create New Event'}</h2></div>
              <button type="button" onClick={closeFormModal} aria-label="Close event form"><X size={18} /></button>
            </div>

            <form onSubmit={handleSubmit}>
              <FormField label="Event Title *" name="title" value={formData.title} onChange={handleChange} placeholder="Geopolitics Live: The Delhi Salon" required />
              <div className="event-form-grid two">
                <FormField label="Date *" name="date" value={formData.date} onChange={handleChange} placeholder="Jul 05, 2026" required />
                <FormField label="Time" name="time" value={formData.time} onChange={handleChange} placeholder="6:30 PM" />
              </div>
              <div className="event-form-grid two">
                <FormField label="Category" name="category" value={formData.category} onChange={handleChange} placeholder="Summit / Salon / Meetup" />
                <FormField label="Host" name="host" value={formData.host} onChange={handleChange} placeholder="Foreign Policy India" />
              </div>
              <div className="event-form-grid two">
                <FormField label="City" name="city" value={formData.city} onChange={handleChange} placeholder="New Delhi" />
                <FormField label="Venue" name="venue" value={formData.venue} onChange={handleChange} placeholder="India Habitat Centre" />
              </div>
              <div className="event-form-grid three">
                <FormField label="Price (₹)" name="price" type="number" value={formData.price} onChange={handleChange} placeholder="0" />
                <FormField label="Original price" name="orig_price" type="number" value={formData.orig_price} onChange={handleChange} placeholder="Optional" />
                <FormField label="Capacity" name="capacity" type="number" value={formData.capacity} onChange={handleChange} placeholder="Optional" />
              </div>
              <ImageUploadField label="Cover Image URL" name="cover_url" value={formData.cover_url} onChange={handleChange} placeholder="https://…" onFile={handleCoverUpload} uploading={uploadingImage} />
              {/* Where "Register" goes on tiesverse.com. Internal keeps our own
                  form (registrants land in this panel); external hands the
                  visitor to a partner or ticketing site instead. */}
              <label className="event-field">
                <span>Registration handled by</span>
                <select
                  name="reg_mode"
                  value={regMode}
                  onChange={(e) => {
                    const mode = e.target.value;
                    setRegMode(mode);
                    if (mode === 'internal') handleChange({ target: { name: 'register_url', value: '' } });
                  }}
                >
                  <option value="internal">This website — use the built-in registration form</option>
                  <option value="external">Another website — send visitors to a link</option>
                </select>
              </label>
              {regMode === 'external' && (
                <>
                  <FormField label="External registration URL" name="register_url" value={formData.register_url} onChange={handleChange} placeholder="https://partner-site.com/register" />
                  <p style={{ margin: '-6px 0 12px', fontSize: 12.5, color: /^https?:\/\//i.test((formData.register_url || '').trim()) ? 'var(--text-muted)' : '#b45309' }}>
                    {/^https?:\/\//i.test((formData.register_url || '').trim())
                      ? 'The Register button will open this link in a new tab. No registrations are collected here.'
                      : 'Enter a full link starting with https:// — without it the built-in form is used.'}
                  </p>
                </>
              )}
              <label className="event-field">
                <span>Description / Note</span>
                <textarea name="note" value={formData.note} onChange={handleChange} placeholder="Short blurb shown on the event card." />
              </label>
              {/* The note is what a search result and a share card will show,
                  so it is worth seeing that while writing it. */}
              <SeoCoach
                kind="event"
                title={formData.title}
                description={formData.note}
                extras={[
                  { label: 'The date', value: formData.date },
                  { label: 'The city', value: formData.city },
                ]}
              />
              <div className="event-checkboxes">
                <label><input type="checkbox" name="flagship" checked={formData.flagship} onChange={handleChange} /> Flagship event</label>
                <label><input type="checkbox" name="past" checked={formData.past} onChange={handleChange} /> Past event</label>
              </div>
              <div className="event-modal-actions">
                <button type="button" onClick={closeFormModal}>Cancel</button>
                <button type="submit" disabled={loading}>{loading ? 'Saving…' : editingId ? 'Update Event' : 'Publish Event'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteModal.open && (
        <div className="event-modal-overlay" onClick={(event) => { if (event.target === event.currentTarget) setDeleteModal({ open: false, id: null, title: '' }); }}>
          <div className="event-delete-modal">
            <span><Trash2 size={24} /></span>
            <h2>Delete Event?</h2>
            <p>Remove <strong>“{deleteModal.title}”</strong>? This action cannot be undone.</p>
            <div>
              <button type="button" onClick={() => setDeleteModal({ open: false, id: null, title: '' })}>Cancel</button>
              <button type="button" onClick={confirmDelete} disabled={loading}>{loading ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const FormField = ({ label, name, value, onChange, placeholder, required, type = 'text' }) => (
  <label className="event-field">
    <span>{label}</span>
    <input type={type} name={name} value={value ?? ''} onChange={onChange} placeholder={placeholder} required={required} />
  </label>
);

export default EventsManagement;
