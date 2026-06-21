import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, ExternalLink } from 'lucide-react';
import {
  getArticles, createArticle, updateArticle, deleteArticle,
  getYoutubeVideos, createYoutubeVideo, updateYoutubeVideo, deleteYoutubeVideo,
  getWorkshops, createWorkshop, updateWorkshop, deleteWorkshop,
  getTeam, createMember, updateMember, deleteMember,
  getGuests, createGuest, updateGuest, deleteGuest,
  getWebinarEvents, createWebinarEvent, updateWebinarEvent, deleteWebinarEvent,
} from '../../apiClient';

// ── Shared helpers ────────────────────────────────────────────────────────────

function useResource(fetchFn) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    const data = await fetchFn();
    if (data?.error) setError(data.error);
    else setItems(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  return { items, loading, error, reload: load };
}

function ResourceTable({ cols, rows, onEdit, onDelete }) {
  if (!rows.length) return <p style={{ color: 'var(--text-muted)', padding: '1rem' }}>No items found.</p>;
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            {cols.map((c) => <th key={c}>{c}</th>)}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {cols.map((c) => <td key={c}>{String(row[c.toLowerCase().replace(/ /g, '_')] ?? '')}</td>)}
              <td>
                <button className="btn" style={{ padding: '0.25rem', background: 'transparent', color: 'var(--text-muted)' }} onClick={() => onEdit(row)}>
                  <Edit2 size={16} />
                </button>
                <button className="btn" style={{ padding: '0.25rem', background: 'transparent', color: '#EF4444' }} onClick={() => onDelete(row.id)}>
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Articles ──────────────────────────────────────────────────────────────────

export function ArticlesManagement() {
  const { items, loading, error, reload } = useResource(getArticles);

  const handleDelete = async (id) => {
    if (!confirm('Delete this article?')) return;
    await deleteArticle(id);
    reload();
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">Articles & Content</h1>
        <a href="https://tiesverse.com/newsroom" target="_blank" rel="noreferrer" className="btn" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ExternalLink size={16} /> View on site
        </a>
      </div>
      <div className="card">
        {loading && <p style={{ padding: '1rem' }}>Loading…</p>}
        {error && <p style={{ color: '#EF4444', padding: '1rem' }}>{error}</p>}
        {!loading && (
          <ResourceTable
            cols={['Title', 'Category', 'Author']}
            rows={items.map((a) => ({ ...a, Title: a.title, Category: a.category, Author: a.author }))}
            onEdit={() => {}}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  );
}

// ── YouTube Videos ────────────────────────────────────────────────────────────

export function YoutubeVideos() {
  const { items, loading, error, reload } = useResource(getYoutubeVideos);

  const handleDelete = async (id) => {
    if (!confirm('Delete this video?')) return;
    await deleteYoutubeVideo(id);
    reload();
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">YouTube Videos</h1>
      </div>
      <div className="card">
        {loading && <p style={{ padding: '1rem' }}>Loading…</p>}
        {error && <p style={{ color: '#EF4444', padding: '1rem' }}>{error}</p>}
        {!loading && (
          <ResourceTable
            cols={['Title', 'Url']}
            rows={items.map((v) => ({ ...v, Title: v.title, Url: v.url }))}
            onEdit={() => {}}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  );
}

// ── Workshops ─────────────────────────────────────────────────────────────────

export function WorkshopList() {
  const { items, loading, error, reload } = useResource(getWorkshops);

  const handleDelete = async (id) => {
    if (!confirm('Delete this workshop?')) return;
    await deleteWorkshop(id);
    reload();
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">Workshops</h1>
      </div>
      <div className="card">
        {loading && <p style={{ padding: '1rem' }}>Loading…</p>}
        {error && <p style={{ color: '#EF4444', padding: '1rem' }}>{error}</p>}
        {!loading && (
          <ResourceTable
            cols={['Title', 'Category', 'Date']}
            rows={items.map((w) => ({ ...w, Title: w.title, Category: w.category, Date: w.date }))}
            onEdit={() => {}}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  );
}

// ── Team ──────────────────────────────────────────────────────────────────────

export function TeamList() {
  const { items, loading, error, reload } = useResource(getTeam);

  const handleDelete = async (id) => {
    if (!confirm('Remove this team member?')) return;
    await deleteMember(id);
    reload();
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">Team</h1>
      </div>
      <div className="card">
        {loading && <p style={{ padding: '1rem' }}>Loading…</p>}
        {error && <p style={{ color: '#EF4444', padding: '1rem' }}>{error}</p>}
        {!loading && (
          <ResourceTable
            cols={['Name', 'Role', 'Department']}
            rows={items.map((m) => ({ ...m, Name: m.name, Role: m.role, Department: m.department }))}
            onEdit={() => {}}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  );
}

// ── Guests ────────────────────────────────────────────────────────────────────

export function GuestList() {
  const { items, loading, error, reload } = useResource(getGuests);

  const handleDelete = async (id) => {
    if (!confirm('Remove this guest?')) return;
    await deleteGuest(id);
    reload();
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">Guests</h1>
      </div>
      <div className="card">
        {loading && <p style={{ padding: '1rem' }}>Loading…</p>}
        {error && <p style={{ color: '#EF4444', padding: '1rem' }}>{error}</p>}
        {!loading && (
          <ResourceTable
            cols={['Name', 'Role', 'Organisation']}
            rows={items.map((g) => ({ ...g, Name: g.name, Role: g.role, Organisation: g.organisation }))}
            onEdit={() => {}}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  );
}

// ── Webinar listings (mirrors webinar.tiesverse.com via Node.js → Turso) ──────

export function Webinars() {
  const { items, loading, error, reload } = useResource(getWebinarEvents);
  const [form, setForm] = useState(null);

  const handleDelete = async (id) => {
    if (!confirm('Delete this webinar event?')) return;
    await deleteWebinarEvent(id);
    reload();
  };

  const handleSave = async () => {
    if (!form) return;
    if (form.id) {
      await updateWebinarEvent(form.id, form);
    } else {
      await createWebinarEvent(form);
    }
    setForm(null);
    reload();
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">Webinar Events</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <a href={`${import.meta.env.VITE_WEBINAR_URL || 'http://localhost:3001'}`} target="_blank" rel="noreferrer" className="btn" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ExternalLink size={16} /> webinar.tiesverse.com
          </a>
          <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={() => setForm({ title: '', summary: '', startAt: '', venueType: 'ONLINE' })}>
            <Plus size={18} /> New event
          </button>
        </div>
      </div>

      {form && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>{form.id ? 'Edit Event' : 'New Event'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {['title', 'summary', 'startAt', 'venueType', 'locationText', 'meetingUrl'].map((field) => (
              <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '12px', textTransform: 'capitalize', color: 'var(--text-muted)' }}>{field}</span>
                <input
                  className="input"
                  value={form[field] || ''}
                  onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                  style={{ padding: '0.4rem 0.6rem', border: '1px solid var(--border)', borderRadius: '6px' }}
                />
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '1rem' }}>
            <button className="btn btn-primary" onClick={handleSave}>Save</button>
            <button className="btn" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        {loading && <p style={{ padding: '1rem' }}>Loading from webinar.tiesverse.com (Turso)…</p>}
        {error && <p style={{ color: '#EF4444', padding: '1rem' }}>{error} — is the webinar site running?</p>}
        {!loading && !error && (
          <ResourceTable
            cols={['Title', 'StartAt', 'VenueType']}
            rows={items.map((e) => ({ ...e, Title: e.title, StartAt: e.startAt ? new Date(e.startAt).toLocaleString() : '—', VenueType: e.venueType }))}
            onEdit={(row) => setForm(row)}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  );
}
