import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  RefreshCw,
  Search,
  TicketCheck,
  Users,
  UserCheck,
  Video,
} from 'lucide-react';
import { getWebinarRegistrationsFull, markAttended } from '../../apiClient';
import './Registrations.css';

const normalizeType = (value) => String(value || 'event').trim().toLowerCase();

const formatDate = (value, withTime = false) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(parsed);
};

const registrationStatus = (registration) => {
  const paymentStatus = String(registration.payment_status || '').toLowerCase();
  if (paymentStatus === 'failed') return { label: 'Payment failed', tone: 'danger' };
  if (paymentStatus === 'pending') return { label: 'Payment pending', tone: 'warning' };
  if (paymentStatus === 'paid') return { label: 'Paid', tone: 'success' };
  return { label: 'Confirmed', tone: 'success' };
};

export default function Registrations() {
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [query, setQuery]       = useState('');
  const [type, setType]         = useState('all');
  const [attendFilter, setAttendFilter] = useState('all'); // 'all'|'attended'|'not-attended'
  const [toggling, setToggling] = useState(new Set());   // ids currently being toggled

  const loadRegistrations = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getWebinarRegistrationsFull();
      if (response?.error) {
        setError(response.error);
        setRegistrations([]);
      } else {
        setRegistrations(Array.isArray(response) ? response : []);
      }
    } catch (requestError) {
      setError(requestError.message || 'Unable to load registrations.');
      setRegistrations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadRegistrations, 0);
    return () => window.clearTimeout(timer);
  }, [loadRegistrations]);

  const toggleAttended = async (registration) => {
    const id = registration.id;
    if (!id || toggling.has(id)) return;
    const newVal = !registration.attended;

    // Optimistic update
    setRegistrations(prev => prev.map(r => r.id === id ? { ...r, attended: newVal } : r));
    setToggling(prev => new Set([...prev, id]));

    await markAttended([id], newVal);
    setToggling(prev => { const s = new Set(prev); s.delete(id); return s; });
  };

  const webinarCount  = registrations.filter(r => normalizeType(r.event_type) === 'webinar').length;
  const eventCount    = registrations.length - webinarCount;
  const confirmedCount = registrations.filter(r => {
    const s = String(r.payment_status || 'free').toLowerCase();
    return s === 'free' || s === 'paid' || s === 'success';
  }).length;
  const attendedCount = registrations.filter(r => r.attended == 1 || r.attended === true).length;

  const visibleRegistrations = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return registrations.filter(item => {
      const itemType = normalizeType(item.event_type);
      const matchesType = type === 'all'
        || (type === 'webinar' && itemType === 'webinar')
        || (type === 'event'   && itemType !== 'webinar');
      const isAttended = item.attended == 1 || item.attended === true;
      const matchesAttend = attendFilter === 'all'
        || (attendFilter === 'attended'     && isAttended)
        || (attendFilter === 'not-attended' && !isAttended);
      if (!matchesType || !matchesAttend) return false;
      if (!needle) return true;
      return [item.name, item.email, item.phone, item.city, item.event_title]
        .some(v => String(v || '').toLowerCase().includes(needle));
    });
  }, [query, registrations, type, attendFilter]);

  const metrics = [
    { label: 'All registrations',  value: registrations.length, icon: Users,        tone: 'violet' },
    { label: 'Webinar sign-ups',   value: webinarCount,          icon: Video,        tone: 'blue' },
    { label: 'Event sign-ups',     value: eventCount,            icon: CalendarDays, tone: 'amber' },
    { label: 'Confirmed',          value: confirmedCount,         icon: CheckCircle2, tone: 'green' },
    { label: 'Attended',           value: attendedCount,          icon: UserCheck,    tone: 'teal' },
  ];

  return (
    <div className="registration-page">
      <header className="registration-header">
        <div>
          <span className="registration-eyebrow">Attendee operations</span>
          <h1>Registrations</h1>
          <p>Track registrations, mark who attended, and send certificates to attendees.</p>
        </div>
        <button type="button" className="registration-refresh" onClick={loadRegistrations} disabled={loading}>
          <RefreshCw size={17} className={loading ? 'is-spinning' : ''} />
          Refresh
        </button>
      </header>

      <section className="registration-metrics" aria-label="Registration totals">
        {metrics.map(({ label, value, icon: Icon, tone }) => (
          <article className="registration-metric" key={label}>
            <span className={`registration-metric-icon is-${tone}`}><Icon size={21} /></span>
            <div><small>{label}</small><strong>{value}</strong></div>
          </article>
        ))}
      </section>

      <section className="registration-panel">
        <div className="registration-toolbar">
          <label className="registration-search">
            <Search size={18} />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search attendee, email, city, or event"
              aria-label="Search registrations"
            />
          </label>
          <div className="registration-filters" aria-label="Filter by type">
            {[['all','All'],['webinar','Webinars'],['event','Events']].map(([value, label]) => (
              <button key={value} type="button" className={type === value ? 'is-active' : ''} onClick={() => setType(value)}>
                {label}
              </button>
            ))}
          </div>
          <div className="registration-filters" aria-label="Filter by attendance">
            {[['all','All'],['attended','Attended'],['not-attended','Not yet']].map(([value, label]) => (
              <button key={value} type="button" className={attendFilter === value ? 'is-active' : ''} onClick={() => setAttendFilter(value)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="registration-error">{error}</div>}

        {loading ? (
          <div className="registration-state"><RefreshCw size={24} className="is-spinning" /><p>Loading registrations…</p></div>
        ) : visibleRegistrations.length === 0 ? (
          <div className="registration-state">
            <TicketCheck size={34} />
            <p>{registrations.length ? 'No registrations match these filters.' : 'No registrations have arrived yet.'}</p>
          </div>
        ) : (
          <div className="registration-table-wrap">
            <table className="registration-table">
              <thead>
                <tr>
                  <th>Attendee</th>
                  <th>Contact</th>
                  <th>Webinar / event</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Attended</th>
                  <th>Registered</th>
                </tr>
              </thead>
              <tbody>
                {visibleRegistrations.map((registration, index) => {
                  const itemType   = normalizeType(registration.event_type);
                  const status     = registrationStatus(registration);
                  const name       = registration.name || 'Guest';
                  const isAttended = registration.attended == 1 || registration.attended === true;
                  const isToggling = toggling.has(registration.id);
                  return (
                    <tr key={registration.id || `${registration.email}-${index}`}>
                      <td>
                        <div className="registration-person">
                          <span>{name.slice(0, 2).toUpperCase()}</span>
                          <div><strong>{name}</strong><small>{registration.city || 'City not provided'}</small></div>
                        </div>
                      </td>
                      <td>
                        <strong>{registration.email || '—'}</strong>
                        <small>{registration.phone || 'No phone'}</small>
                      </td>
                      <td>
                        <strong>{registration.event_title || 'Untitled'}</strong>
                        <small>{formatDate(registration.event_date)}</small>
                      </td>
                      <td>
                        <span className={`registration-type is-${itemType === 'webinar' ? 'webinar' : 'event'}`}>
                          {itemType === 'webinar' ? 'Webinar' : 'Event'}
                        </span>
                      </td>
                      <td>
                        <span className={`registration-status is-${status.tone}`}>{status.label}</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`reg-attend-btn ${isAttended ? 'is-attended' : ''} ${isToggling ? 'is-toggling' : ''}`}
                          onClick={() => toggleAttended(registration)}
                          title={isAttended ? 'Mark as not attended' : 'Mark as attended'}
                          disabled={isToggling}
                        >
                          <UserCheck size={14}/>
                          {isAttended ? 'Attended' : 'Mark'}
                        </button>
                      </td>
                      <td>{formatDate(registration.registered_at, true)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <style>{`
        .reg-attend-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 11px;
          border-radius: 7px;
          border: 1px solid var(--outline-variant);
          background: transparent;
          color: var(--text-muted);
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
          transition: all 160ms;
          white-space: nowrap;
        }
        .reg-attend-btn:hover:not(:disabled) {
          border-color: #22c55e;
          color: #16a34a;
          background: color-mix(in srgb, #22c55e 10%, transparent);
        }
        .reg-attend-btn.is-attended {
          border-color: #22c55e;
          background: color-mix(in srgb, #22c55e 15%, transparent);
          color: #16a34a;
        }
        .reg-attend-btn.is-toggling { opacity: 0.5; cursor: wait; }
        .registration-metric-icon.is-teal {
          background: color-mix(in srgb, #14b8a6 15%, transparent);
          color: #0f766e;
        }
      `}</style>
    </div>
  );
}
