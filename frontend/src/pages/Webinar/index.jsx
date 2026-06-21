import React, { useState, useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import { getWebinarEvents } from '../../apiClient';

// The authoritative webinar admin UI lives at webinar.tiesverse.com/admin.
// These pages embed that UI via iframe and provide a direct link, so admins
// can manage events without leaving the Tiesverse Admin shell.

const WEBINAR_ADMIN = import.meta.env.VITE_WEBINAR_URL
  ? `${import.meta.env.VITE_WEBINAR_URL}/admin`
  : 'http://localhost:3001/admin';

function WebinarFrame({ path = '' }) {
  return (
    <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', height: 'calc(100vh - 160px)' }}>
      <iframe
        src={`${WEBINAR_ADMIN}${path}`}
        style={{ width: '100%', height: '100%', border: 'none' }}
        title="Webinar admin"
      />
    </div>
  );
}

export function ManagingList() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getWebinarEvents().then((data) => {
      if (data?.error) setError(data.error);
      else setEvents(Array.isArray(data) ? data : []);
      setLoading(false);
    });
  }, []);

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">Webinar Managing List</h1>
        <a href={WEBINAR_ADMIN} target="_blank" rel="noreferrer" className="btn" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ExternalLink size={16} /> Open full admin
        </a>
      </div>

      {loading && <div className="card"><p style={{ padding: '1rem' }}>Connecting to webinar.tiesverse.com (Turso)…</p></div>}
      {error && (
        <div className="card">
          <p style={{ color: '#EF4444', padding: '1rem' }}>{error}</p>
          <p style={{ color: 'var(--text-muted)', padding: '0 1rem 1rem' }}>Make sure the webinar site is running and WEBINAR_API_URL is set in the Node.js backend .env</p>
        </div>
      )}
      {!loading && !error && (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Title</th><th>Date / Time</th><th>Venue</th><th>Published</th></tr>
              </thead>
              <tbody>
                {events.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No webinar events found.</td></tr>
                )}
                {events.map((e) => (
                  <tr key={e.id}>
                    <td><strong>{e.title}</strong></td>
                    <td>{e.startAt ? new Date(e.startAt).toLocaleString() : '—'}</td>
                    <td>{e.venueType}</td>
                    <td>{e.isPublished ? '✓' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function ManageEvents() {
  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">Manage Webinar Events</h1>
        <a href={`${WEBINAR_ADMIN}/events`} target="_blank" rel="noreferrer" className="btn" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ExternalLink size={16} /> Open in webinar admin
        </a>
      </div>
      <WebinarFrame path="/events" />
    </div>
  );
}

export function UserSubmissionsReview() {
  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">User Submissions / Calendar</h1>
        <a href={WEBINAR_ADMIN} target="_blank" rel="noreferrer" className="btn" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ExternalLink size={16} /> Open full admin
        </a>
      </div>
      <WebinarFrame />
    </div>
  );
}
