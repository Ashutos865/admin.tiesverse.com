import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  FileText,
  RefreshCw,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  getDepartments,
  getEventSpeakers,
  getEvents,
  getTeamMembers,
  getWebinarRegistrations,
} from '../../apiClient';
import './TiesverseDashboard.css';
import MyTasksNotes from '../../components/MyTasksNotes.jsx';
import AssignedByMe from '../../components/AssignedByMe.jsx';
import PersonalNotes from '../../components/PersonalNotes.jsx';

const emptyData = {
  events: [],
  departments: [],
  team: [],
  speakers: [],
  registrations: [],
};

const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getInitials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'TV';
}

function formatRelativeTime(value) {
  const date = parseDate(value);
  if (!date) return 'Recently';
  const seconds = Math.max(1, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function buildMonthlySeries(items, dateKeys) {
  const counts = Array.from({ length: 6 }, () => 0);
  const now = new Date();
  const labels = [];

  for (let offset = 5; offset >= 0; offset -= 1) {
    const cursor = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    labels.push(monthLabels[cursor.getMonth()]);
  }

  items.forEach((item) => {
    const date = dateKeys.map((key) => parseDate(item?.[key])).find(Boolean);
    if (!date) return;
    const monthOffset = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
    if (monthOffset >= 0 && monthOffset < 6) counts[5 - monthOffset] += 1;
  });

  return { labels, counts };
}

function buildLinePath(values, width = 620, height = 210) {
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - 24 - (value / max) * (height - 54);
    return [x, y];
  });
  return {
    path: points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x},${y}`).join(' '),
    area: `${points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x},${y}`).join(' ')} L${width},${height} L0,${height} Z`,
    points,
  };
}

const MetricCard = ({ icon: Icon, label, value, helper }) => (
  <article className="tv-metric-card">
    <div className="tv-metric-topline">
      <span className="tv-metric-icon"><Icon size={21} strokeWidth={1.9} /></span>
      <span className="tv-metric-helper">{helper}</span>
    </div>
    <p>{label}</p>
    <strong>{value}</strong>
  </article>
);

const TiesverseDashboard = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const { user, profile } = useContext(AuthContext);
  const firstName = (profile?.display_name || user?.username || 'there').split(/\s+/)[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const results = await Promise.allSettled([
        getEvents(),
        getDepartments(),
        getTeamMembers(),
        getEventSpeakers(),
        getWebinarRegistrations(),
      ]);

      const [events, departments, team, speakers, registrations] = results.map((result) =>
        result.status === 'fulfilled' ? safeArray(result.value) : []
      );

      if (results.some((result) => result.status === 'rejected')) {
        setError('Some live data could not be refreshed. Showing the available records.');
      }

      setData({ events, departments, team, speakers, registrations });
      setLastUpdated(new Date());
    } catch (loadError) {
      console.error('Error loading Tiesverse dashboard:', loadError);
      setError('The dashboard could not reach the API. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadDashboard, 0);
    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  const contentSeries = useMemo(
    () => buildMonthlySeries([...data.departments, ...data.team, ...data.speakers], ['created_at', 'date']),
    [data.departments, data.team, data.speakers]
  );
  const eventsSeries = useMemo(
    () => buildMonthlySeries(data.events, ['created_at', 'date']),
    [data.events]
  );
  const line = useMemo(() => buildLinePath(contentSeries.counts), [contentSeries]);
  const maxEvents = Math.max(...eventsSeries.counts, 1);
  const recentRegistrations = data.registrations.slice(0, 5);

  return (
    <div className="tv-dashboard">
      <section className="tv-dashboard-heading">
        <div>
          <span className="tv-eyebrow">Tiesverse overview</span>
          <h1>{greeting}, {firstName}</h1>
          <p>Welcome back. Here is what is happening across Tiesverse today.</p>
        </div>
        <div className="tv-heading-actions">
          {lastUpdated && (
            <span className="tv-updated">
              Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button type="button" className="tv-primary-button" onClick={loadDashboard} disabled={loading}>
            <RefreshCw size={17} className={loading ? 'tv-spin' : ''} />
            {loading ? 'Refreshing' : 'Refresh stats'}
          </button>
        </div>
      </section>

      {error && <div className="tv-dashboard-alert">{error}</div>}

      <MyTasksNotes />

      <AssignedByMe />

      <PersonalNotes />

      <section className="tv-metric-grid" aria-label="Tiesverse statistics">
        <MetricCard icon={CalendarDays} label="Total events" value={loading ? '—' : data.events.length} helper="Live" />
        <MetricCard icon={FileText} label="Articles & reports" value={loading ? '—' : data.departments.length} helper="Published" />
        <MetricCard icon={Users} label="Team members" value={loading ? '—' : data.team.length} helper="Active" />
        <MetricCard icon={CheckCircle2} label="Speakers" value={loading ? '—' : data.speakers.length} helper="Profiles" />
      </section>

      <section className="tv-chart-grid">
        <article className="tv-panel tv-chart-panel">
          <div className="tv-panel-heading">
            <div>
              <h2>Content growth</h2>
              <p>New articles, team members and speakers</p>
            </div>
            <TrendingUp size={20} />
          </div>
          <div className="tv-line-chart" aria-label="Content growth over six months">
            <svg key={line.path} viewBox="0 0 620 230" preserveAspectRatio="none" role="img">
              <defs>
                <linearGradient id="tv-area-gradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[48, 105, 162].map((y) => <line key={y} x1="0" x2="620" y1={y} y2={y} />)}
              <path className="tv-chart-area" d={line.area} />
              <path className="tv-chart-line" d={line.path} />
              {line.points.map(([x, y], index) => (
                <circle key={`${x}-${y}`} cx={x} cy={y} r="4" className="tv-chart-point">
                  <title>{`${contentSeries.labels[index]}: ${contentSeries.counts[index]}`}</title>
                </circle>
              ))}
            </svg>
            <div className="tv-chart-labels">
              {contentSeries.labels.map((label) => <span key={label}>{label}</span>)}
            </div>
          </div>
        </article>

        <article className="tv-panel tv-chart-panel">
          <div className="tv-panel-heading">
            <div>
              <h2>Events overview</h2>
              <p>Events created during the last six months</p>
            </div>
            <BarChart3 size={20} />
          </div>
          <div className="tv-bar-chart" aria-label="Events created over six months">
            {eventsSeries.counts.map((count, index) => (
              <div className="tv-bar-column" key={`${eventsSeries.labels[index]}-${index}`}>
                <div className="tv-bar-track">
                <span
                  style={{
                    height: `${Math.max(count ? 16 : 4, (count / maxEvents) * 100)}%`,
                    animationDelay: `${index * 85}ms`,
                  }}
                >
                    <b>{count}</b>
                  </span>
                </div>
                <small>{eventsSeries.labels[index]}</small>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="tv-bottom-grid">
        <article className="tv-panel tv-registrations-panel">
          <div className="tv-panel-heading">
            <div>
              <h2>Recent registrations</h2>
              <p>Live from the hosted Turso database</p>
            </div>
            <button type="button" className="tv-text-button" onClick={() => navigate('/webinar/registrations')}>
              View all <ArrowUpRight size={15} />
            </button>
          </div>

          <div className="tv-table-wrap">
            <table className="tv-registration-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Event</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentRegistrations.length > 0 ? recentRegistrations.map((registration, index) => {
                  const name = registration.name || 'Tiesverse guest';
                  const status = registration.payment_status === 'paid'
                    ? 'Paid'
                    : registration.payment_required === '1'
                      ? 'Pending'
                      : 'Confirmed';
                  return (
                    <tr key={registration.id || `${registration.email}-${index}`}>
                      <td>
                        <span className="tv-avatar">{getInitials(name)}</span>
                        <span>
                          <strong>{name}</strong>
                          <small>{registration.email || 'Registration attendee'}</small>
                        </span>
                      </td>
                      <td>{registration.event_title || 'Tiesverse event'}</td>
                      <td><span className={`tv-status tv-status-${status.toLowerCase()}`}>{status}</span></td>
                      <td>{formatRelativeTime(registration.registered_at)}</td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan="4" className="tv-empty-state">
                      {loading ? 'Loading registrations…' : 'No registrations have arrived yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <aside className="tv-focus-card">
          <span className="tv-focus-icon"><ArrowUpRight size={23} /></span>
          <div>
            <span className="tv-eyebrow">Quick access</span>
            <h2>Keep Tiesverse current.</h2>
            <p>Review public events, update listings, and publish changes from one place.</p>
          </div>
          <button type="button" onClick={() => navigate('/webinar/events')}>
            Manage events <ArrowUpRight size={16} />
          </button>
        </aside>
      </section>
    </div>
  );
};

export default TiesverseDashboard;
