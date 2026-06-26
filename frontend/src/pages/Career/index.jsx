import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight, ChevronRight } from 'lucide-react';
import {
  getPositions, createPosition, updatePosition, deletePosition,
  getCandidates, updateCandidateStatus, sendOffer,
  getFormGates, updateFormGates,
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

const DECISION_OPTIONS = ['Under Review', 'Shortlisted', 'Selected', 'Rejected'];
const DECISION_COLORS = { Selected: '#10B981', Accepted: '#10B981', Rejected: '#EF4444', Shortlisted: '#F59E0B', 'Under Review': '#9CA3AF' };

export function EnrollmentTracker() {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('All');

  useEffect(() => {
    getCandidates().then((data) => {
      if (data?.error) setError(data.error);
      else setCandidates(Array.isArray(data) ? data : (data?.data || data?.results || []));
      setLoading(false);
    });
  }, []);

  const fullName = (c) => `${c.first_name || ''} ${c.last_name || ''}`.trim() || '—';
  const departments = ['All', ...Array.from(new Set(candidates.map((c) => c.department).filter(Boolean)))];
  const shown = filter === 'All' ? candidates : candidates.filter((c) => c.department === filter);

  // Keep a legacy value (e.g. "Accepted") selectable so it still displays.
  const optionsFor = (cur) => (cur && !DECISION_OPTIONS.includes(cur) ? [cur, ...DECISION_OPTIONS] : DECISION_OPTIONS);

  const setDecision = async (c, final_decision) => {
    setCandidates((prev) => prev.map((x) => (x.id === c.id ? { ...x, final_decision } : x)));
    await updateCandidateStatus(c.id, {
      interview_status: c.interview_status || '',
      interviewer: c.interviewer || '',
      rating: c.rating || 0,
      final_decision,
    });
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Enrollment Tracker</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>All applicants from the public career forms.</p>
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}
          style={{ padding: '0.4rem 0.6rem', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <div className="card">
        {loading && <p style={{ padding: '1rem' }}>Loading…</p>}
        {error && <p style={{ color: '#EF4444', padding: '1rem' }}>{error}</p>}
        {!loading && !error && (
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Applicant</th><th>Department</th><th>Role</th><th>City</th><th>Decision</th></tr>
              </thead>
              <tbody>
                {shown.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No applicants.</td></tr>
                )}
                {shown.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{fullName(c)}</strong><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{c.email}</div></td>
                    <td>{c.department || '—'}</td>
                    <td>{c.roles || '—'}</td>
                    <td>{c.city || '—'}</td>
                    <td>
                      <select value={c.final_decision || 'Under Review'} onChange={(e) => setDecision(c, e.target.value)}
                        style={{ padding: '0.25rem 0.5rem', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', fontWeight: 600, color: DECISION_COLORS[c.final_decision] || '#9CA3AF' }}>
                        {optionsFor(c.final_decision).map((s) => <option key={s} value={s}>{s}</option>)}
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

// ── Offer Letters ─────────────────────────────────────────────────────────────

const olLabel = { display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', margin: '0.6rem 0 0.25rem' };
const olField = { width: '100%', padding: '0.5rem 0.6rem', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', boxSizing: 'border-box' };
const olGhost = { padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '13px' };
const olPrimary = { padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '13px' };

// Only "Selected" candidates appear in the offer-letter roster.
const ACCEPTED_DECISIONS = ['Selected'];

export function OfferLetter() {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);            // candidate being offered
  const [form, setForm] = useState({ role_title: '', salary: '', joining_date: '' });
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    getCandidates().then((data) => {
      if (data?.error) setError(data.error);
      else setCandidates(Array.isArray(data) ? data : (data?.data || data?.results || []));
      setLoading(false);
    });
  }, []);

  const accepted = candidates.filter((c) => ACCEPTED_DECISIONS.includes(c.final_decision));
  const fullName = (c) => `${c.first_name || ''} ${c.last_name || ''}`.trim() || '—';

  const openModal = (c) => {
    setModal(c);
    setForm({ role_title: c.roles || c.department || '', salary: '', joining_date: '' });
    setToast(null);
  };

  // Frontend jsPDF generation of the offer letter.
  const buildPdf = (c) => {
    const doc = new jsPDF();
    const name = fullName(c);
    const today = new Date().toLocaleDateString();
    doc.setFontSize(22); doc.text('Tiesverse', 20, 24);
    doc.setFontSize(13); doc.setTextColor(90); doc.text('Letter of Offer', 20, 33);
    doc.setTextColor(0); doc.setFontSize(11);
    const lines = [
      `Date: ${today}`, '',
      `Dear ${name},`, '',
      'We are delighted to offer you the position of',
      `${form.role_title || c.roles || 'Team Member'} in our ${c.department || 'team'} at Tiesverse.`,
      '',
      ...(form.salary ? [`Compensation: ${form.salary}`] : []),
      ...(form.joining_date ? [`Proposed joining date: ${form.joining_date}`] : []),
      '',
      'We were genuinely impressed by your application and are excited about',
      'the prospect of you joining us. Please reply to this email to confirm',
      'your acceptance of this offer.',
      '', 'Warm regards,', 'Tiesverse Careers', 'careers@tiesverse.com',
    ];
    let y = 48;
    lines.forEach((line) => { doc.text(line, 20, y); y += 8; });
    return doc;
  };

  const downloadPdf = () => buildPdf(modal).save(`Offer-${fullName(modal).replace(/\s+/g, '-')}.pdf`);

  const sendEmail = async () => {
    setSending(true);
    const pdf_base64 = buildPdf(modal).output('datauristring').split(',')[1];
    const res = await sendOffer({
      email: modal.email, name: fullName(modal), pdf_base64,
      subject: 'Your Offer Letter — Tiesverse',
    });
    setSending(false);
    setToast(res?.message || res?.error || 'Done');
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Offer Letters</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          Accepted candidates — generate and send their offer letter from careers@tiesverse.com.
        </p>
      </div>
      <div className="card">
        {loading && <p style={{ padding: '1rem' }}>Loading…</p>}
        {error && <p style={{ color: '#EF4444', padding: '1rem' }}>{error}</p>}
        {!loading && !error && (
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Candidate</th><th>Department</th><th>Role</th><th>Decision</th><th></th></tr>
              </thead>
              <tbody>
                {accepted.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No accepted candidates yet.</td></tr>
                )}
                {accepted.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{fullName(c)}</strong><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{c.email}</div></td>
                    <td>{c.department || '—'}</td>
                    <td>{c.roles || '—'}</td>
                    <td><span style={{ fontSize: '12px', fontWeight: 700, color: '#10B981' }}>{c.final_decision}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      <button onClick={() => openModal(c)} style={olPrimary}>Create Offer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div onClick={() => setModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: '440px', maxWidth: '92vw', padding: '1.5rem' }}>
            <h2 style={{ margin: '0 0 0.25rem' }}>Offer — {fullName(modal)}</h2>
            <p style={{ margin: '0 0 0.5rem', fontSize: '13px', color: 'var(--text-muted)' }}>{modal.email}</p>
            <label style={olLabel}>Role / Title</label>
            <input style={olField} value={form.role_title} onChange={(e) => setForm({ ...form, role_title: e.target.value })} placeholder="e.g. Frontend Engineer" />
            <label style={olLabel}>Compensation</label>
            <input style={olField} value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} placeholder="e.g. ₹6,00,000 / yr" />
            <label style={olLabel}>Joining Date</label>
            <input type="date" style={olField} value={form.joining_date} onChange={(e) => setForm({ ...form, joining_date: e.target.value })} />
            {toast && <div style={{ margin: '0.75rem 0 0', padding: '0.6rem', borderRadius: '8px', background: '#3B82F620', color: '#3B82F6', fontSize: '13px' }}>{toast}</div>}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(null)} style={olGhost}>Close</button>
              <button onClick={downloadPdf} style={olGhost}>Download PDF</button>
              <button onClick={sendEmail} disabled={sending} style={{ ...olPrimary, opacity: sending ? 0.6 : 1 }}>
                {sending ? 'Sending…' : 'Generate & Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Form Gates ──────────────────────────────────────────────────────────────
// Open/close the public application forms. Gates are a category→role hierarchy
// stored in Cloudflare D1; closing a category cascades to its roles.
const GATE_GROUPS = [
  { cat: 'Tech', roles: ['tech_roles'] },
  { cat: 'Content', roles: ['content_editor', 'content_writer_upsc', 'upsc_strategist', 'graphic_designer_canva', 'uiux_designer'] },
  { cat: 'Media', roles: ['video_editor_reels_yt', 'social_media_manager_ig', 'youtube_manager'] },
  { cat: 'Operations', roles: ['hr', 'marketing_outreach', 'management_coordination', 'collab_outreach'] },
];
const prettyGate = (k) => k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function GateToggle({ on, onClick }) {
  return (
    <button onClick={onClick} aria-pressed={on} style={{
      width: 42, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer', position: 'relative',
      background: on ? '#10B981' : 'var(--border)', transition: 'background 0.15s',
    }}>
      <span style={{
        position: 'absolute', top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: '50%',
        background: '#fff', transition: 'left 0.15s',
      }} />
    </button>
  );
}

export function FormGates() {
  const [gates, setGates] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    getFormGates().then((res) => {
      setGates(res?.gates || {});
      setLoading(false);
    });
  }, []);

  const toggle = (key) => setGates((g) => ({ ...g, [key]: !g[key] }));

  const save = async () => {
    setSaving(true);
    const res = await updateFormGates({ gates });
    setSaving(false);
    setToast(res?.status === 'success' ? 'Form gates saved.' : (res?.message || 'Save failed.'));
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Form Gates</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Open or close the public application forms. Closing a category closes all its roles.</p>
        </div>
        <button onClick={save} disabled={loading || saving} style={{ padding: '0.5rem 1.1rem', borderRadius: '8px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
      {toast && <div style={{ margin: '0 0 1rem', padding: '0.6rem 0.9rem', borderRadius: '8px', background: '#10B98120', color: '#10B981', fontSize: '13px' }}>{toast}</div>}
      {loading ? <p style={{ padding: '1rem' }}>Loading…</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {GATE_GROUPS.map((grp) => (
            <div key={grp.cat} className="card" style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.6rem', marginBottom: '0.6rem', borderBottom: '1px solid var(--border)' }}>
                <strong>{grp.cat}</strong>
                <GateToggle on={gates[grp.cat] !== false} onClick={() => toggle(grp.cat)} />
              </div>
              {grp.roles.map((r) => (
                <div key={r} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0', opacity: gates[grp.cat] === false ? 0.45 : 1 }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{prettyGate(r)}</span>
                  <GateToggle on={gates[r] !== false} onClick={() => toggle(r)} />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CareerAdmin({ tab }) {
  if (tab === 'enrollments') return <EnrollmentTracker />;
  if (tab === 'offers')      return <OfferLetter />;
  if (tab === 'form_gates')  return <FormGates />;
  return <PositionTracker />;
}
