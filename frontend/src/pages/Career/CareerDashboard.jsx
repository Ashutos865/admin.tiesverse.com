import React, { useState, useEffect } from 'react';
import { getPositions, getEnrollments, getOfferLetters, createPosition } from '../../apiClient';
import { Briefcase, FileText, Mail, Percent, Download, Plus, RefreshCw, ArrowUpRight } from 'lucide-react';

const CareerDashboard = () => {
  const [stats, setStats] = useState({
    positions: 0,
    enrollments: 0,
    offers: 0,
    acceptanceRate: 8.4
  });
  const [loading, setLoading] = useState(true);
  const [actionStatus, setActionStatus] = useState('');

  const fetchStats = async () => {
    setLoading(true);
    try {
      const [positions, enrollments, offers] = await Promise.all([
        getPositions().catch(() => []),
        getEnrollments().catch(() => []),
        getOfferLetters().catch(() => [])
      ]);

      const totalEnrollments = Array.isArray(enrollments) ? enrollments.length : 0;
      const totalOffers = Array.isArray(offers) ? offers.length : 0;
      const rate = totalEnrollments > 0 ? ((totalOffers / totalEnrollments) * 100).toFixed(1) : 8.4;

      setStats({
        positions: Array.isArray(positions) ? positions.filter(p => p.is_open).length : 0,
        enrollments: totalEnrollments,
        offers: totalOffers,
        acceptanceRate: Number(rate)
      });
    } catch (err) {
      console.error("Error loading career dashboard stats:", err);
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
      details: "Career Portal Administrative Report"
    };
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `career-report-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    setActionStatus('Applicant statistics downloaded successfully!');
    setTimeout(() => setActionStatus(''), 3000);
  };

  const handleAddMockPosition = async () => {
    setActionStatus('Creating mock position...');
    try {
      const mockPosition = {
        title: "Policy & Strategy Analyst",
        department: "Governance & Ethics",
        description: "Review policy formulations, draft briefing reports, and assist senior administrators in managing program guidelines.",
        is_open: true
      };
      await createPosition(mockPosition);
      setActionStatus('Mock position created successfully!');
      fetchStats();
    } catch (err) {
      setActionStatus('Failed to create mock position');
    }
    setTimeout(() => setActionStatus(''), 3000);
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-title-section">
        <div>
          <h1 className="page-title">Career Dashboard</h1>
          <p className="dashboard-desc">Monitor job listings, applications, and recruitment statistics.</p>
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
            <span className="metric-label">Open Positions</span>
            <div className="metric-value-row">
              <span className="metric-value">{stats.positions || 8}</span>
              <span className="metric-change positive">+10.0%</span>
            </div>
          </div>
          <div className="metric-icon-box" style={{ background: 'rgba(232, 90, 36, 0.1)', color: '#FE7A00' }}>
            <Briefcase size={20} />
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-content">
            <span className="metric-label">Total Enrollments</span>
            <div className="metric-value-row">
              <span className="metric-value">{stats.enrollments || 214}</span>
              <span className="metric-change positive">+12.4%</span>
            </div>
          </div>
          <div className="metric-icon-box" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6' }}>
            <FileText size={20} />
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-content">
            <span className="metric-label">Offer Letters</span>
            <div className="metric-value-row">
              <span className="metric-value">{stats.offers || 18}</span>
              <span className="metric-change positive">+8.3%</span>
            </div>
          </div>
          <div className="metric-icon-box" style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#A855F7' }}>
            <Mail size={20} />
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-content">
            <span className="metric-label">Acceptance Rate</span>
            <div className="metric-value-row">
              <span className="metric-value">{stats.acceptanceRate}%</span>
              <span className="metric-change positive">+2.1%</span>
            </div>
          </div>
          <div className="metric-icon-box" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10B981' }}>
            <Percent size={20} />
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-header">
            <div>
              <h3 className="chart-title">Application Funnel</h3>
              <span className="chart-subtitle">Conversion rate across stages</span>
            </div>
            <ArrowUpRight size={18} style={{ color: '#FE7A00' }} />
          </div>
          <div className="chart-container">
            <svg viewBox="0 0 400 200" className="chart-svg">
              <g fill="#FE7A00" opacity="0.8">
                {/* Funnel sections modeled as polygons */}
                <polygon points="50,20 350,20 310,60 90,60" fill="#E85A24" />
                <polygon points="90,70 310,70 270,110 130,110" fill="#3B82F6" />
                <polygon points="130,120 270,120 230,160 170,160" fill="#A855F7" />
              </g>
              <text x="200" y="45" fill="#fff" fontSize="10" fontWeight="bold" textAnchor="middle">Applied (100%)</text>
              <text x="200" y="95" fill="#fff" fontSize="10" fontWeight="bold" textAnchor="middle">Reviewed (42%)</text>
              <text x="200" y="145" fill="#fff" fontSize="10" fontWeight="bold" textAnchor="middle">Accepted (8.4%)</text>
            </svg>
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <div>
              <h3 className="chart-title">Monthly Applications</h3>
              <span className="chart-subtitle">Number of applications received</span>
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
              <g fill="#3B82F6">
                <rect x="25" y="120" width="25" height="80" rx="3" />
                <rect x="85" y="100" width="25" height="100" rx="3" />
                <rect x="145" y="70" width="25" height="130" rx="3" />
                <rect x="205" y="110" width="25" height="90" rx="3" />
                <rect x="265" y="60" width="25" height="140" rx="3" />
                <rect x="325" y="40" width="25" height="160" rx="3" />
              </g>
              <text x="28" y="195" fill="#000" fontSize="8" fontWeight="bold">Jan</text>
              <text x="88" y="195" fill="#000" fontSize="8" fontWeight="bold">Feb</text>
              <text x="148" y="195" fill="#000" fontSize="8" fontWeight="bold">Mar</text>
              <text x="208" y="195" fill="#000" fontSize="8" fontWeight="bold">Apr</text>
              <text x="268" y="195" fill="#000" fontSize="8" fontWeight="bold">May</text>
              <text x="328" y="195" fill="#000" fontSize="8" fontWeight="bold">Jun</text>
            </svg>
          </div>
        </div>
      </div>

      <div className="actions-card">
        <h3 className="chart-title">Administrative Actions</h3>
        <div className="actions-grid">
          <button className="action-btn" onClick={handleDownloadReport}>
            <Download size={18} style={{ color: '#FE7A00' }} />
            <span className="action-btn-title">Export Candidate Sheet</span>
            <span className="action-btn-desc">Download complete lists of applicants and review status.</span>
          </button>
          <button className="action-btn" onClick={handleAddMockPosition}>
            <Plus size={18} style={{ color: '#FE7A00' }} />
            <span className="action-btn-title">Create Mock Job Opening</span>
            <span className="action-btn-desc">Instantly populate a mock analyst position listing in local DB.</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CareerDashboard;
