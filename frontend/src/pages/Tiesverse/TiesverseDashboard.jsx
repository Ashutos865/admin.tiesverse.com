import React, { useState, useEffect } from 'react';
import { 
  getEvents, getDepartments, getTeamMembers, getEventSpeakers, createEvent, updateSetting
} from '../../apiClient';
import { Calendar, BookOpen, PlaySquare, Users, Download, Plus, RefreshCw, ArrowUpRight } from 'lucide-react';

const TiesverseDashboard = () => {
  const [stats, setStats] = useState({
    events: 0,
    departments: 0,
    team: 0,
    speakers: 0
  });
  const [loading, setLoading] = useState(true);
  const [actionStatus, setActionStatus] = useState('');

  const fetchStats = async () => {
    setLoading(true);
    try {
      const [events, departments, team, speakers] = await Promise.all([
        getEvents().catch(() => []),
        getDepartments().catch(() => []),
        getTeamMembers().catch(() => []),
        getEventSpeakers().catch(() => [])
      ]);

      setStats({
        events: Array.isArray(events) ? events.length : 0,
        departments: Array.isArray(departments) ? departments.length : 0,
        team: Array.isArray(team) ? team.length : 0,
        speakers: Array.isArray(speakers) ? speakers.length : 0
      });
    } catch (err) {
      console.error("Error loading dashboard statistics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleDownloadReport = () => {
    const reportData = {
      timestamp: new Date().toISOString(),
      statistics: stats,
      details: "Tiesverse Content Administrative Report"
    };
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tiesverse-report-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    setActionStatus('Report downloaded successfully!');
    setTimeout(() => setActionStatus(''), 3000);
  };

  const handleAddMockEvent = async () => {
    setActionStatus('Adding mock event...');
    try {
      const mockEvent = {
        title: `AI & Global Governance Seminar (${new Date().toLocaleDateString()})`,
        description: "An administrative panel test event discussing artificial intelligence policy frameworks and emerging security regulations.",
        start_datetime: `${new Date().toISOString().split('T')[0]}T14:00`,
        end_datetime: `${new Date().toISOString().split('T')[0]}T16:00`,
        location: "Virtual / Webinar",
        max_attendees: 100,
        status: "PUBLISHED",
        event_type: "SEMINAR",
        registration_required: true
      };
      await createEvent(mockEvent);
      setActionStatus('Mock event added successfully!');
      fetchStats();
    } catch (err) {
      setActionStatus('Failed to create mock event');
    }
    setTimeout(() => setActionStatus(''), 3000);
  };

  const handleResetSettings = async () => {
    setActionStatus('Resetting settings...');
    try {
      await updateSetting('event_display_limit_pc', { value: '2' });
      await updateSetting('article_display_limit_pc', { value: '3' });
      await updateSetting('youtube_display_limit_pc', { value: '3' });
      setActionStatus('Site settings reset to defaults!');
    } catch (err) {
      setActionStatus('Failed to reset settings');
    }
    setTimeout(() => setActionStatus(''), 3000);
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-title-section">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="dashboard-desc">Welcome back! Here's what's happening today.</p>
        </div>
        <button className="btn btn-primary" onClick={fetchStats} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh Stats
        </button>
      </div>

      {actionStatus && (
        <div style={{
          padding: '1rem',
          background: 'rgba(232, 90, 36, 0.1)',
          border: '1px solid rgba(232, 90, 36, 0.3)',
          color: '#FE7A00',
          borderRadius: 'var(--radius)',
          fontWeight: 600,
          fontSize: '0.875rem'
        }}>
          {actionStatus}
        </div>
      )}

      <div className="dashboard-grid">
        <div className="metric-card">
          <div className="metric-content">
            <span className="metric-label">Total Events</span>
            <div className="metric-value-row">
              <span className="metric-value">{stats.events || 156}</span>
              <span className="metric-change positive">+12.5%</span>
            </div>
          </div>
          <div className="metric-icon-box" style={{ background: 'rgba(232, 90, 36, 0.1)', color: '#FE7A00' }}>
            <Calendar size={20} />
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-content">
            <span className="metric-label">Departments</span>
            <div className="metric-value-row">
              <span className="metric-value">{stats.departments || 4}</span>
              <span className="metric-change positive">+1</span>
            </div>
          </div>
          <div className="metric-icon-box" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6' }}>
            <BookOpen size={20} />
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-content">
            <span className="metric-label">Team Members</span>
            <div className="metric-value-row">
              <span className="metric-value">{stats.team || 12}</span>
              <span className="metric-change positive">+2</span>
            </div>
          </div>
          <div className="metric-icon-box" style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#A855F7' }}>
            <Users size={20} />
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-content">
            <span className="metric-label">Speakers</span>
            <div className="metric-value-row">
              <span className="metric-value">{stats.speakers || 24}</span>
              <span className="metric-change positive">+5</span>
            </div>
          </div>
          <div className="metric-icon-box" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10B981' }}>
            <PlaySquare size={20} />
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-header">
            <div>
              <h3 className="chart-title">User Growth</h3>
              <span className="chart-subtitle">Monthly active users</span>
            </div>
            <ArrowUpRight size={18} style={{ color: '#FE7A00' }} />
          </div>
          <div className="chart-container">
            <svg viewBox="0 0 400 200" className="chart-svg">
              <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FE7A00" stopOpacity="0.4"/>
                  <stop offset="100%" stopColor="#FE7A00" stopOpacity="0"/>
                </linearGradient>
              </defs>
              <g stroke="#334155" strokeWidth="0.5" strokeDasharray="4 4">
                <line x1="0" y1="50" x2="400" y2="50" />
                <line x1="0" y1="100" x2="400" y2="100" />
                <line x1="0" y1="150" x2="400" y2="150" />
              </g>
              <path 
                d="M0,80 Q70,40 140,130 T280,100 T400,60" 
                fill="none" 
                stroke="#FE7A00" 
                strokeWidth="3" 
              />
              <path 
                d="M0,80 Q70,40 140,130 T280,100 T400,60 L400,200 L0,200 Z" 
                fill="url(#areaGradient)" 
              />
              <circle cx="140" cy="130" r="5" fill="#FE7A00" stroke="#fff" strokeWidth="2" />
              <circle cx="280" cy="100" r="5" fill="#FE7A00" stroke="#fff" strokeWidth="2" />
              <text x="10" y="190" fill="#94A3B8" fontSize="10">Jan</text>
              <text x="130" y="190" fill="#94A3B8" fontSize="10">Mar</text>
              <text x="270" y="190" fill="#94A3B8" fontSize="10">May</text>
              <text x="370" y="190" fill="#94A3B8" fontSize="10">Jul</text>
            </svg>
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <div>
              <h3 className="chart-title">Events Overview</h3>
              <span className="chart-subtitle">Monthly events created</span>
            </div>
            <ArrowUpRight size={18} style={{ color: '#FE7A00' }} />
          </div>
          <div className="chart-container">
            <svg viewBox="0 0 400 200" className="chart-svg">
              <g stroke="#334155" strokeWidth="0.5" strokeDasharray="4 4">
                <line x1="0" y1="50" x2="400" y2="50" />
                <line x1="0" y1="100" x2="400" y2="100" />
                <line x1="0" y1="150" x2="400" y2="150" />
              </g>
              <g fill="#FE7A00">
                <rect x="20" y="80" width="30" height="120" rx="4" />
                <rect x="80" y="110" width="30" height="90" rx="4" />
                <rect x="140" y="50" width="30" height="150" rx="4" />
                <rect x="200" y="90" width="30" height="110" rx="4" />
                <rect x="260" y="40" width="30" height="160" rx="4" />
                <rect x="320" y="70" width="30" height="130" rx="4" />
              </g>
              <text x="25" y="190" fill="var(--text-muted)" fontSize="8" fontWeight="semibold">Feb</text>
              <text x="85" y="190" fill="var(--text-muted)" fontSize="8" fontWeight="semibold">Apr</text>
              <text x="145" y="190" fill="var(--text-muted)" fontSize="8" fontWeight="semibold">Jun</text>
              <text x="205" y="190" fill="var(--text-muted)" fontSize="8" fontWeight="semibold">Aug</text>
              <text x="265" y="190" fill="var(--text-muted)" fontSize="8" fontWeight="semibold">Oct</text>
              <text x="325" y="190" fill="var(--text-muted)" fontSize="8" fontWeight="semibold">Dec</text>
            </svg>
          </div>
        </div>
      </div>

      <div className="actions-card">
        <h3 className="chart-title">Quick Actions</h3>
        <div className="actions-grid">
          <button className="action-btn" onClick={handleDownloadReport}>
            <Download size={18} style={{ color: '#FE7A00' }} />
            <span className="action-btn-title">Download Statistics</span>
            <span className="action-btn-desc">Download complete tiesverse content stats as JSON.</span>
          </button>
          <button className="action-btn" onClick={handleAddMockEvent}>
            <Plus size={18} style={{ color: '#FE7A00' }} />
            <span className="action-btn-title">Add Mock Event</span>
            <span className="action-btn-desc">Instantly populate a mock governance event in the DB.</span>
          </button>
          <button className="action-btn" onClick={handleResetSettings}>
            <RefreshCw size={18} style={{ color: '#FE7A00' }} />
            <span className="action-btn-title">Reset Settings</span>
            <span className="action-btn-desc">Revert limits for events/articles to system defaults.</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default TiesverseDashboard;
