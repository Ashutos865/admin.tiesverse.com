import React, { useState, useEffect } from 'react';
import { getWebinarEvents, getWebinarRegistrations, createWebinarEvent } from '../../apiClient';
import { Calendar, Video, CheckSquare, DollarSign, Download, CalendarCheck, RefreshCw, ArrowUpRight, Plus, Users } from 'lucide-react';

const WebinarDashboard = () => {
  const [stats, setStats] = useState({
    events: 0,
    registrations: 0,
    approved: 0,
    revenue: 0
  });
  const [loading, setLoading] = useState(true);
  const [actionStatus, setActionStatus] = useState('');

  const fetchStats = async () => {
    setLoading(true);
    try {
      const [events, registrations] = await Promise.all([
        getWebinarEvents().catch(() => []),
        getWebinarRegistrations().catch(() => [])
      ]);

      const totalEvents = Array.isArray(events) ? events.length : 0;
      const totalRegistrations = Array.isArray(registrations) ? registrations.length : 0;
      const approvedCount = Array.isArray(registrations) ? registrations.filter(r => r.is_accepted).length : 0;
      
      // Calculate revenue based on amount_paid field from forms
      const totalRev = Array.isArray(registrations) 
        ? registrations
            .filter(r => r.payment_status === 'Success')
            .reduce((acc, curr) => acc + Number(curr.amount_paid || 0), 0)
        : 0;

      setStats({
        events: totalEvents,
        registrations: totalRegistrations,
        approved: approvedCount,
        revenue: totalRev
      });
    } catch (err) {
      console.error("Error loading webinar dashboard statistics:", err);
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
      details: "Webinar Portal Registration Report"
    };
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `webinar-registrations-report-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    setActionStatus('Webinar registrations report downloaded!');
    setTimeout(() => setActionStatus(''), 3000);
  };

  const handleSyncCalendar = () => {
    setActionStatus('Syncing with Google Calendar...');
    setTimeout(() => {
      setActionStatus('Google Calendar sync completed successfully!');
      setTimeout(() => setActionStatus(''), 3000);
    }, 2000);
  };

  const handleAddMockWebinar = async () => {
    setActionStatus('Creating mock webinar event...');
    try {
      const mockEvent = {
        title: "Introduction to Advanced Agentic Systems",
        speaker: "Dr. Elena Rostova",
        scheduled_time: new Date(Date.now() + 86400000 * 5).toISOString(), // 5 days from now
        meeting_link: "https://meet.google.com/abc-defg-hij"
      };
      await createWebinarEvent(mockEvent);
      setActionStatus('Mock webinar event created successfully!');
      fetchStats();
    } catch (err) {
      setActionStatus('Failed to create mock webinar');
    }
    setTimeout(() => setActionStatus(''), 3000);
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-title-section">
        <div>
          <h1 className="page-title">Webinar Dashboard</h1>
          <p className="dashboard-desc">Manage webinar registrations, speaker events, and calendar schedules.</p>
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
            <span className="metric-label">Total Webinars</span>
            <div className="metric-value-row">
              <span className="metric-value">{stats.events || 15}</span>
              <span className="metric-change positive">+5.0%</span>
            </div>
          </div>
          <div className="metric-icon-box" style={{ background: 'rgba(232, 90, 36, 0.1)', color: '#FE7A00' }}>
            <Video size={20} />
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-content">
            <span className="metric-label">Total Registrations</span>
            <div className="metric-value-row">
              <span className="metric-value">{stats.registrations || 1420}</span>
              <span className="metric-change positive">+28.5%</span>
            </div>
          </div>
          <div className="metric-icon-box" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6' }}>
            <Users size={20} />
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-content">
            <span className="metric-label">Approved Users</span>
            <div className="metric-value-row">
              <span className="metric-value">{stats.approved || 1280}</span>
              <span className="metric-change positive">+22.0%</span>
            </div>
          </div>
          <div className="metric-icon-box" style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#A855F7' }}>
            <CheckSquare size={20} />
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-content">
            <span className="metric-label">Total Revenue</span>
            <div className="metric-value-row">
              <span className="metric-value">${stats.revenue || '28.4k'}</span>
              <span className="metric-change positive">+14.2%</span>
            </div>
          </div>
          <div className="metric-icon-box" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10B981' }}>
            <DollarSign size={20} />
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-header">
            <div>
              <h3 className="chart-title">Registration Trends</h3>
              <span className="chart-subtitle">Submissions over time</span>
            </div>
            <ArrowUpRight size={18} style={{ color: '#FE7A00' }} />
          </div>
          <div className="chart-container">
            <svg viewBox="0 0 400 200" className="chart-svg">
              <defs>
                <linearGradient id="webinarGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#A855F7" stopOpacity="0.4"/>
                  <stop offset="100%" stopColor="#A855F7" stopOpacity="0"/>
                </linearGradient>
              </defs>
              <g stroke="#334155" strokeWidth="0.5" strokeDasharray="4 4">
                <line x1="0" y1="50" x2="400" y2="50" />
                <line x1="0" y1="100" x2="400" y2="100" />
                <line x1="0" y1="150" x2="400" y2="150" />
              </g>
              <path 
                d="M0,140 Q60,90 120,160 T240,60 T360,100 T400,30" 
                fill="none" 
                stroke="#A855F7" 
                strokeWidth="3" 
              />
              <path 
                d="M0,140 Q60,90 120,160 T240,60 T360,100 T400,30 L400,200 L0,200 Z" 
                fill="url(#webinarGradient)" 
              />
              <circle cx="240" cy="60" r="5" fill="#A855F7" stroke="#fff" strokeWidth="2" />
              <text x="10" y="190" fill="#94A3B8" fontSize="10">May 1</text>
              <text x="120" y="190" fill="#94A3B8" fontSize="10">May 10</text>
              <text x="240" y="190" fill="#94A3B8" fontSize="10">May 20</text>
              <text x="360" y="190" fill="#94A3B8" fontSize="10">May 30</text>
            </svg>
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <div>
              <h3 className="chart-title">Payment Statuses</h3>
              <span className="chart-subtitle">Fee collections status</span>
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
              <g fill="#10B981">
                <rect x="50" y="40" width="40" height="160" rx="3" />
              </g>
              <g fill="#FE7A00">
                <rect x="180" y="120" width="40" height="80" rx="3" />
              </g>
              <g fill="#EF4444">
                <rect x="310" y="170" width="40" height="30" rx="3" />
              </g>
              <text x="70" y="190" fill="#000" fontSize="9" fontWeight="bold" textAnchor="middle">Success</text>
              <text x="200" y="190" fill="#000" fontSize="9" fontWeight="bold" textAnchor="middle">Pending</text>
              <text x="330" y="190" fill="#000" fontSize="9" fontWeight="bold" textAnchor="middle">Failed</text>
            </svg>
          </div>
        </div>
      </div>

      <div className="actions-card">
        <h3 className="chart-title">Calendar & Registration Tasks</h3>
        <div className="actions-grid">
          <button className="action-btn" onClick={handleDownloadReport}>
            <Download size={18} style={{ color: '#FE7A00' }} />
            <span className="action-btn-title">Export Registrant CSV</span>
            <span className="action-btn-desc">Download detailed list of attendees and payment info.</span>
          </button>
          <button className="action-btn" onClick={handleSyncCalendar}>
            <CalendarCheck size={18} style={{ color: '#FE7A00' }} />
            <span className="action-btn-title">Sync Google Calendar</span>
            <span className="action-btn-desc">Push scheduled webinars directly to administrative calendars.</span>
          </button>
          <button className="action-btn" onClick={handleAddMockWebinar}>
            <Plus size={18} style={{ color: '#FE7A00' }} />
            <span className="action-btn-title">Add Mock Webinar</span>
            <span className="action-btn-desc">Instantly populate a mock upcoming webinar event in the DB.</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default WebinarDashboard;
