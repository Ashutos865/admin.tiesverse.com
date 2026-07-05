import React, { useState, useEffect } from 'react';
import { getEvents, getEventRegistrations, getWebinarRegistrations, getWebinarRevenue } from '../../apiClient';
import { Video, Users, CheckSquare, RefreshCw, IndianRupee } from 'lucide-react';
import { useMe } from '../../context/MeContext';

const WebinarDashboard = () => {
  const { isAdvisory } = useMe();
  const [events, setEvents] = useState([]);
  const [listings, setListings] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [revenue, setRevenue] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [evts, content, regs] = await Promise.all([
        getEvents(),
        getEventRegistrations(),
        getWebinarRegistrations(),
      ]);
      setEvents(Array.isArray(evts) ? evts : []);
      setListings(Array.isArray(content) ? content : []);
      if (regs && regs.error) {
        setError(regs.error);
        setRegistrations([]);
      } else {
        setRegistrations(Array.isArray(regs) ? regs : []);
      }
      if (isAdvisory) {
        const rev = await getWebinarRevenue().catch(() => null);
        setRevenue(rev && !rev.detail ? rev : null);
      }
    } catch (e) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const webinarRegs = registrations.filter(r => r.event_type === 'webinar');
  const eventRegs = registrations.filter(r => r.event_type !== 'webinar');
  const shown = filterType === 'webinar' ? webinarRegs
    : filterType === 'event' ? eventRegs
    : registrations;

  return (
    <div className="dashboard-container">
      <div className="dashboard-title-section">
        <h1 className="dashboard-title">Webinar & Events Portal</h1>
        <p className="dashboard-subtitle">Registrations from Turso</p>
        <button className="action-btn-small" onClick={fetchData} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="dashboard-grid" style={{ marginBottom: 24 }}>
        {[
          ...(isAdvisory && revenue ? [{ label: 'Revenue (paid)', value: `₹${Number(revenue.total_revenue || 0).toLocaleString('en-IN')}`, icon: <IndianRupee size={20} />, color: '#16A34A' }] : []),
          { label: 'Webinars & Workshops', value: listings.length, icon: <Video size={20} />, color: '#FE7A00' },
          { label: 'Total Registrations', value: registrations.length, icon: <Users size={20} />, color: '#3B82F6' },
          { label: 'Webinar Signups', value: webinarRegs.length, icon: <CheckSquare size={20} />, color: '#A855F7' },
          { label: `Event Signups / ${events.length} Events`, value: eventRegs.length, icon: <CheckSquare size={20} />, color: '#22C55E' },
        ].map(s => (
          <div className="metric-card" key={s.label}>
            <div className="metric-content">
              <span className="metric-label">{s.label}</span>
              <div className="metric-value-row">
                <span className="metric-value">{s.value}</span>
              </div>
            </div>
            <div className="metric-icon-box" style={{ background: s.color + '22', color: s.color }}>{s.icon}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['All', 'All'], ['webinar', 'Webinars'], ['event', 'Events']].map(([val, label]) => (
          <button key={val} onClick={() => setFilterType(val)}
            style={{
              padding: '6px 14px', borderRadius: 20, border: '1px solid',
              borderColor: filterType === val ? '#FE7A00' : '#334155',
              background: filterType === val ? '#FE7A00' : 'transparent',
              color: filterType === val ? '#fff' : '#94a3b8',
              cursor: 'pointer', fontSize: 13,
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Turso not configured banner */}
      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#f87171', marginBottom: 16 }}>
          {error.includes('not configured')
            ? 'Turso not configured — add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to admin .env'
            : error}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#94a3b8' }}>Loading registrations…</p>
      ) : shown.length === 0 ? (
        <p style={{ color: '#94a3b8' }}>
          {error ? 'No data — check Turso connection.' : 'No registrations yet.'}
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b' }}>
                {['Name', 'Email', 'Phone', 'City', 'Event', 'Type', 'Registered'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={r.id ?? i} style={{ borderBottom: '1px solid #0f172a' }}>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{r.name}</td>
                  <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{r.email}</td>
                  <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{r.phone || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{r.city || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>{r.event_title}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 4,
                      background: r.event_type === 'webinar' ? 'rgba(168,85,247,0.15)' : 'rgba(59,130,246,0.15)',
                      color: r.event_type === 'webinar' ? '#A855F7' : '#3B82F6',
                    }}>{r.event_type || 'event'}</span>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#64748b', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {r.registered_at ? new Date(r.registered_at).toLocaleDateString('en-IN') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default WebinarDashboard;
