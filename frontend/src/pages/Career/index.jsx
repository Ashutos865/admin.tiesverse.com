import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight, ChevronRight } from 'lucide-react';
import {
  getPositions, createPosition, updatePosition, deletePosition,
  getApplicants, updateApplicant,
  getOffers, createOffer, updateOffer,
} from '../../apiClient';

// ── Position Tracker ─────────────────────────────────────────────────────────

export function PositionTracker() {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({});

  const load = async () => {
    setLoading(true);
    const data = await getPositions();
    if (data?.error) setError(data.error);
    else setPositions(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleOpen = async (pos) => {
    await updatePosition(pos.id, { position_var: !pos.position_var });
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this position?')) return;
    await deletePosition(id);
    load();
  };

  const handleSave = async () => {
    if (form.id) await updatePosition(form.id, form);
    else await createPosition(form);
    setShowForm(false);
    setForm({});
    load();
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">Positions</h1>
        <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          onClick={() => { setForm({}); setShowForm(true); }}>
          <Plus size={18} /> New position
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>{form.id ? 'Edit Position' : 'New Position'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {['title', 'department', 'sector', 'location', 'employment_type', 'salary_range', 'description'].map((field) => (
              <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: field === 'description' ? 'span 2' : undefined }}>
                <span style={{ fontSize: '12px', textTransform: 'capitalize', color: 'var(--text-muted)' }}>{field.replace(/_/g, ' ')}</span>
                {field === 'description'
                  ? <textarea rows={3} value={form[field] || ''} onChange={(e) => setForm({ ...form, [field]: e.target.value })} style={{ padding: '0.4rem 0.6rem', border: '1px solid var(--border)', borderRadius: '6px', resize: 'vertical' }} />
                  : <input value={form[field] || ''} onChange={(e) => setForm({ ...form, [field]: e.target.value })} style={{ padding: '0.4rem 0.6rem', border: '1px solid var(--border)', borderRadius: '6px' }} />
                }
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '1rem' }}>
            <button className="btn btn-primary" onClick={handleSave}>Save</button>
            <button className="btn" onClick={() => { setShowForm(false); setForm({}); }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        {loading && <p style={{ padding: '1rem' }}>Loading…</p>}
        {error && <p style={{ color: '#EF4444', padding: '1rem' }}>{error}</p>}
        {!loading && !error && (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Position</th><th>Sector</th><th>Applicants</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {positions.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No positions yet.</td></tr>
                )}
                {positions.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.title}</strong>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{p.department} · {p.location}</div>
                    </td>
                    <td>{p.sector}</td>
                    <td>{p.applicants?.length ?? p.applicant_count ?? '—'}</td>
                    <td>
                      <button className="btn" style={{ background: 'transparent', padding: '0.25rem', display: 'flex', alignItems: 'center', gap: '4px', color: p.position_var ? '#10B981' : '#9CA3AF' }}
                        onClick={() => toggleOpen(p)}>
                        {p.position_var ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                        <span style={{ fontSize: '12px' }}>{p.position_var ? 'OPEN' : 'CLOSED'}</span>
                      </button>
                    </td>
                    <td style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn" style={{ padding: '0.25rem', background: 'transparent', color: 'var(--text-muted)' }} onClick={() => { setForm(p); setShowForm(true); }}>
                        <Edit2 size={16} />
                      </button>
                      <button className="btn" style={{ padding: '0.25rem', background: 'transparent', color: '#EF4444' }} onClick={() => handleDelete(p.id)}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Enrollment Tracker ────────────────────────────────────────────────────────

export function EnrollmentTracker() {
  const [positions, setPositions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [applicants, setApplicants] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPositions().then((data) => {
      if (!data?.error) setPositions(Array.isArray(data) ? data : []);
      setLoading(false);
    });
  }, []);

  const selectPosition = async (pos) => {
    setSelected(pos);
    const data = await getApplicants(pos.id);
    setApplicants(Array.isArray(data) ? data : []);
  };

  const moveStage = async (applicant, stage) => {
    await updateApplicant(applicant.id, { stage });
    selectPosition(selected);
  };

  const STAGES = ['applied', 'review', 'interview', 'offered', 'hired', 'rejected'];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Enrollment Tracker</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '1rem' }}>
        <div className="card" style={{ padding: '0.5rem' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', padding: '0.5rem 0.75rem', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Positions</p>
          {loading && <p style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>Loading…</p>}
          {positions.map((p) => (
            <button key={p.id} onClick={() => selectPosition(p)}
              style={{ width: '100%', textAlign: 'left', padding: '0.6rem 0.75rem', borderRadius: '6px', border: 'none', cursor: 'pointer', background: selected?.id === p.id ? 'var(--primary-light, #EEF2FF)' : 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: '14px' }}>{p.title}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{p.sector}</div>
              </div>
              <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
            </button>
          ))}
        </div>

        <div className="card">
          {!selected && <p style={{ padding: '1rem', color: 'var(--text-muted)' }}>Select a position to view applicants.</p>}
          {selected && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', padding: '0 0.5rem' }}>
                <h3>{selected.title} <span style={{ background: selected.position_var ? '#D1FAE5' : '#F3F4F6', color: selected.position_var ? '#065F46' : '#6B7280', padding: '2px 8px', borderRadius: '999px', fontSize: '12px', marginLeft: '8px' }}>{selected.position_var ? 'OPEN' : 'CLOSED'}</span></h3>
                <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{applicants.length} applicants</span>
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr><th>Applicant</th><th>Applied</th><th>Stage</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    {applicants.length === 0 && (
                      <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No applicants yet.</td></tr>
                    )}
                    {applicants.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <strong>{a.name}</strong>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{a.email}</div>
                        </td>
                        <td>{a.applied_at ? new Date(a.applied_at).toLocaleDateString() : '—'}</td>
                        <td>
                          <select value={a.stage || 'applied'} onChange={(e) => moveStage(a, e.target.value)}
                            style={{ padding: '0.25rem 0.5rem', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px' }}>
                            {STAGES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                          </select>
                        </td>
                        <td>
                          {a.resume_url && (
                            <a href={a.resume_url} target="_blank" rel="noreferrer" className="btn" style={{ fontSize: '13px', padding: '0.25rem 0.75rem' }}>Resume</a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Offer Letters ─────────────────────────────────────────────────────────────

export function OfferLetter() {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getOffers().then((data) => {
      if (data?.error) setError(data.error);
      else setOffers(Array.isArray(data) ? data : []);
      setLoading(false);
    });
  }, []);

  const updateStatus = async (id, status) => {
    await updateOffer(id, { status });
    const data = await getOffers();
    if (!data?.error) setOffers(Array.isArray(data) ? data : []);
  };

  const STATUS_COLORS = { draft: '#9CA3AF', sent: '#3B82F6', signed: '#10B981' };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Offer Letters</h1>
      </div>
      <div className="card">
        {loading && <p style={{ padding: '1rem' }}>Loading…</p>}
        {error && <p style={{ color: '#EF4444', padding: '1rem' }}>{error}</p>}
        {!loading && !error && (
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Applicant</th><th>Role</th><th>Salary</th><th>Start Date</th><th>Status</th></tr>
              </thead>
              <tbody>
                {offers.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No offers generated yet.</td></tr>
                )}
                {offers.map((o) => (
                  <tr key={o.id}>
                    <td><strong>{o.applicants?.name ?? '—'}</strong><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{o.applicants?.email}</div></td>
                    <td>{o.positions?.title ?? o.role_title}</td>
                    <td>{o.salary}</td>
                    <td>{o.start_date}</td>
                    <td>
                      <select value={o.status || 'draft'} onChange={(e) => updateStatus(o.id, e.target.value)}
                        style={{ padding: '0.25rem 0.5rem', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', color: STATUS_COLORS[o.status] || '#9CA3AF' }}>
                        <option value="draft">Draft</option>
                        <option value="sent">Sent</option>
                        <option value="signed">Signed</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
