import React, { useState, useEffect } from 'react';
import { getCandidates, updateCandidateStatus, getPositions } from '../../apiClient';
import { Briefcase, FileText, RefreshCw, ChevronDown } from 'lucide-react';

const DECISIONS = ['Under Review', 'Shortlisted', 'Accepted', 'Rejected'];
const STATUSES = ['Pending Setup', 'Interview Scheduled', 'Interview Done', 'On Hold'];

const CareerDashboard = () => {
  const [candidates, setCandidates] = useState([]);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('All');
  const [updating, setUpdating] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [cands, pos] = await Promise.all([getCandidates(), getPositions()]);
      if (cands && cands.error) {
        setError(cands.error);
        setCandidates([]);
      } else {
        setCandidates(Array.isArray(cands) ? cands : []);
      }
      setPositions(Array.isArray(pos) ? pos : []);
    } catch (e) {
      setError('Failed to load candidates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleDecision = async (id, field, value) => {
    setUpdating(id);
    const cand = candidates.find(c => String(c.id) === String(id));
    if (!cand) return;
    await updateCandidateStatus(id, {
      interview_status: field === 'interview_status' ? value : (cand.interview_status || ''),
      interviewer: cand.interviewer || '',
      rating: cand.rating || 0,
      final_decision: field === 'final_decision' ? value : (cand.final_decision || 'Under Review'),
    });
    setCandidates(prev => prev.map(c => String(c.id) === String(id) ? { ...c, [field]: value } : c));
    setUpdating(null);
  };

  const departments = ['All', ...Array.from(new Set(candidates.map(c => c.department).filter(Boolean)))];
  const shown = filter === 'All' ? candidates : candidates.filter(c => c.department === filter);

  const openCount = positions.filter(p => p.is_open).length;
  const pending = candidates.filter(c => c.final_decision === 'Under Review').length;
  const accepted = candidates.filter(c => c.final_decision === 'Accepted').length;

  return (
    <div className="dashboard-container">
      <div className="dashboard-title-section">
        <h1 className="dashboard-title">Career Portal</h1>
        <p className="dashboard-subtitle">Applications from Cloudflare D1</p>
        <button className="action-btn-small" onClick={fetchData} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="dashboard-grid" style={{ marginBottom: 24 }}>
        {[
          { label: 'Open Positions', value: openCount, icon: <Briefcase size={20} />, color: '#FE7A00' },
          { label: 'Total Applicants', value: candidates.length, icon: <FileText size={20} />, color: '#3B82F6' },
          { label: 'Pending Review', value: pending, icon: <FileText size={20} />, color: '#A855F7' },
          { label: 'Accepted', value: accepted, icon: <FileText size={20} />, color: '#22C55E' },
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

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {departments.map(d => (
          <button key={d} onClick={() => setFilter(d)}
            style={{
              padding: '6px 14px', borderRadius: 20, border: '1px solid',
              borderColor: filter === d ? '#FE7A00' : '#334155',
              background: filter === d ? '#FE7A00' : 'transparent',
              color: filter === d ? '#fff' : '#94a3b8',
              cursor: 'pointer', fontSize: 13,
            }}>
            {d}
          </button>
        ))}
      </div>

      {/* Error / loading */}
      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#f87171', marginBottom: 16 }}>
          {error} — check Cloudflare D1 credentials in admin .env
        </div>
      )}

      {loading ? (
        <p style={{ color: '#94a3b8' }}>Loading candidates…</p>
      ) : shown.length === 0 ? (
        <p style={{ color: '#94a3b8' }}>No applicants yet{filter !== 'All' ? ` in ${filter}` : ''}.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b' }}>
                {['Name', 'Email', 'Dept / Role', 'City', 'Status', 'Decision', 'Date'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #0f172a' }}>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    {c.first_name} {c.last_name}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{c.email}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: 12, background: '#1e293b', padding: '2px 8px', borderRadius: 4 }}>{c.department}</span>
                    {c.roles && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{c.roles}</div>}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{c.city || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <select
                      value={c.interview_status || 'Pending Setup'}
                      disabled={updating === c.id}
                      onChange={e => handleDecision(c.id, 'interview_status', e.target.value)}
                      style={{ background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 4, padding: '4px 8px', fontSize: 12 }}>
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <select
                      value={c.final_decision || 'Under Review'}
                      disabled={updating === c.id}
                      onChange={e => handleDecision(c.id, 'final_decision', e.target.value)}
                      style={{
                        background: '#1e293b',
                        color: c.final_decision === 'Accepted' ? '#22C55E' : c.final_decision === 'Rejected' ? '#f87171' : '#e2e8f0',
                        border: '1px solid #334155', borderRadius: 4, padding: '4px 8px', fontSize: 12,
                      }}>
                      {DECISIONS.map(d => <option key={d}>{d}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#64748b', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN') : '—'}
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

export default CareerDashboard;
