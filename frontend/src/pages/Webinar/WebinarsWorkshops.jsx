import './WebinarsWorkshops.css';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Award, ChevronDown, ChevronUp, ClipboardList, Edit2, FileQuestion, Mail, Mic2,
  Plus, Save, Send, Trash2, Upload, Users, Video, X,
} from 'lucide-react';
import {
  createEventRegistration, deleteEventRegistration,
  updateEventRegistration, getEventRegistrations,
  getFormQuestions, createFormQuestion, updateFormQuestion,
  deleteFormQuestion, reorderFormQuestions,
  getEventSpeakers, createEventSpeaker,
  getWebinarRegistrationsFull, markAttended,
  webinarBroadcast, getWebinarSendHistory,
  generateWebinarMeeting, getWebinarMeetingGuests,
  getEmailTemplates, getSESSenders,
  uploadImage,
} from '../../apiClient';
import { listCertificateTemplates, getCertificateTemplate, generateCertificate } from '../Certificates/certificateApi';
import ScheduleCalendar from '../../components/ScheduleCalendar.jsx';

/* ─── constants ─────────────────────────────────────────────── */
const EMPTY_ITEM = {
  kind: 'webinar', title: '', description: '', date: '', time_tz: '',
  host: '', host_image_url: '', price: 0, cover_url: '', status: 'upcoming',
};

const toSlug = (str) =>
  String(str || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Registrant data fields available to map onto certificate fields + email tokens.
const REG_FIELDS = [
  ['name', 'Participant name'],
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['organization', 'Organisation'],
  ['role', 'Role / designation'],
  ['city', 'City'],
  ['country', 'Country'],
  ['event_title', 'Event title'],
  ['event_date', 'Event date'],
];
const REG_SAMPLE = {
  name: 'Aarav Sharma', email: 'aarav@example.com', phone: '+91 98765 43210',
  organization: 'IIT Bombay', role: 'Student', city: 'Mumbai', country: 'India',
};
// Guess the best registrant field for a certificate variable name.
const autoCertSource = (varName) => {
  const n = (varName || '').toLowerCase();
  if (n.includes('event') || n.includes('webinar') || n.includes('workshop') || n.includes('topic') || n.includes('course')) return 'event_title';
  if (n.includes('email')) return 'email';
  if (/(^|[^a-z])id([^a-z]|$)|cert/.test(n)) return 'id';
  if (n.includes('name')) return 'name';
  if (n.includes('position') || n.includes('designation') || n.includes('role') || n.includes('title')) return 'role';
  if (n.includes('org') || n.includes('company') || n.includes('institut') || n.includes('college') || n.includes('university')) return 'organization';
  if (n.includes('city')) return 'city';
  if (n.includes('country')) return 'country';
  if (n.includes('date')) return 'event_date';
  if (n.includes('phone') || n.includes('mobile')) return 'phone';
  return 'custom';
};

const makeDefaultQuestions = (eKey, eType) => [
  { label: 'Full Name',                    field_type: 'text',     required: true,  order: 0, placeholder: 'Your full name',                   event_key: eKey, event_type: eType },
  { label: 'Email Address',                field_type: 'email',    required: true,  order: 1, placeholder: 'you@example.com',                   event_key: eKey, event_type: eType },
  { label: 'WhatsApp Number',              field_type: 'phone',    required: true,  order: 2, placeholder: 'Include country code (e.g. +91)',    event_key: eKey, event_type: eType },
  { label: 'Current Role',                 field_type: 'select',   required: true,  order: 3, placeholder: 'Select your role',                   options: 'College Student,Working Professional,Researcher / Analyst,NGO / Non-Profit,Teacher / Professor,Other', event_key: eKey, event_type: eType },
  { label: 'Organization / University',    field_type: 'text',     required: true,  order: 4, placeholder: 'Where do you study or work?',        event_key: eKey, event_type: eType },
  { label: 'Country',                      field_type: 'text',     required: true,  order: 5, placeholder: 'e.g. India',                         event_key: eKey, event_type: eType },
  { label: 'City',                         field_type: 'text',     required: true,  order: 6, placeholder: 'e.g. New Delhi',                     event_key: eKey, event_type: eType },
  { label: 'How did you hear about this?', field_type: 'select',   required: true,  order: 7, placeholder: 'Select one',                         options: 'LinkedIn,X / Twitter,Instagram,Email from TIES,TIES Website,Referral', event_key: eKey, event_type: eType },
  { label: 'What do you hope to learn?',   field_type: 'textarea', required: true,  order: 8, placeholder: 'Your interest in this session…', event_key: eKey, event_type: eType },
  { label: 'Question for the Speaker',     field_type: 'textarea', required: false, order: 9, placeholder: 'Ask a targeted question (optional)', event_key: eKey, event_type: eType },
];

const previewUrl = (kind, title) =>
  `https://tiesverse.com/${kind === 'webinar' ? 'webinar' : 'workshop'}/${toSlug(title)}`;
const EMPTY_Q = { label: '', field_type: 'text', placeholder: '', options: '', required: true };
const EMPTY_SPEAKER = { name: '', role: '', org: '', photo_url: '', quote: '', featured: false };
const FIELD_TYPES = [
  { value: 'text',     label: 'Short Text' },
  { value: 'textarea', label: 'Long Text' },
  { value: 'email',    label: 'Email' },
  { value: 'phone',    label: 'Phone' },
  { value: 'select',  label: 'Dropdown' },
  { value: 'radio',   label: 'Radio' },
  { value: 'checkbox',label: 'Checkbox' },
];
const TABS = [
  { key: 'details',       label: 'Details',        icon: Edit2 },
  { key: 'questions',     label: 'Form Questions', icon: FileQuestion },
  { key: 'registrations', label: 'Registrations',  icon: ClipboardList },
  { key: 'meeting',       label: 'Meeting',        icon: Video },
  { key: 'emails',        label: 'Emails',         icon: Mail },
  { key: 'speaker',       label: 'Guest Speaker',  icon: Mic2 },
];

/* ─── helpers ────────────────────────────────────────────────── */
const eventKey = (item) => String(item?.id || item?.title || '');
const badge = (kind) => kind === 'webinar' ? 'Webinar' : 'Workshop';

/* ═══════════════════════════════════════════════════════════════
   Sub-component: RegistrationsTab
   ═══════════════════════════════════════════════════════════════ */
function RegistrationsTab({ item }) {
  const eKey  = toSlug(item.title || '');

  const [rows,     setRows]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [sel,      setSel]      = useState(new Set());
  const [expanded, setExpanded] = useState(new Set());
  const [marking,  setMarking]  = useState(false);
  const [msg,      setMsg]      = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const regs = await getWebinarRegistrationsFull(eKey);
    setRows(Array.isArray(regs) ? regs : []);
    setLoading(false);
  }, [eKey]);

  useEffect(() => { load(); }, [load]);

  const toggleSel = (id) => setSel(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const allSel  = rows.length > 0 && sel.size === rows.length;
  const someSel = sel.size > 0 && sel.size < rows.length;
  const toggleAll = () => setSel(allSel ? new Set() : new Set(rows.map(r => r.id)));
  const toggleExp = (id) => setExpanded(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const handleMark = async (attended) => {
    if (!sel.size) return;
    setMarking(true); setMsg('');
    await markAttended([...sel], attended);
    await load();
    setSel(new Set());
    setMarking(false);
  };

  const fmtMoney = (n) => parseInt(n || 0) > 0 ? `₹${parseInt(n).toLocaleString('en-IN')}` : 'Free';
  const fmtDate  = (s) => {
    if (!s) return '—';
    const d = new Date(s);
    return isNaN(d) ? s : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="ww-tab-body">
      <div className="ww-tab-header">
        <p className="ww-tab-hint">
          {loading ? 'Loading…' : `${rows.length} registration${rows.length !== 1 ? 's' : ''}`}
          {sel.size > 0 && <strong> · {sel.size} selected</strong>}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {sel.size > 0 && (<>
            <button className="ww-btn ww-btn-ghost" onClick={() => handleMark(true)} disabled={marking}>
              {marking ? 'Saving…' : '✓ Mark attended'}
            </button>
            <button className="ww-btn ww-btn-ghost" onClick={() => handleMark(false)} disabled={marking}>
              ✗ Unmark
            </button>
          </>)}
          <button className="ww-btn ww-btn-ghost" onClick={load} title="Refresh">↺</button>
        </div>
      </div>

      {msg && <p className="ww-err" style={{ margin: '0 0 12px' }}>{msg}</p>}
      <p className="ww-tab-hint" style={{ margin: '0 0 12px' }}>
        Mark who attended here. To issue certificates, go to the <strong>Emails</strong> tab and turn on <strong>“Attach a certificate PDF.”</strong>
      </p>

      {loading ? (
        <p className="ww-loading">Loading registrations…</p>
      ) : rows.length === 0 ? (
        <div className="ww-empty">
          <Users size={36} strokeWidth={1.3}/>
          <p>No registrations yet for this event.</p>
        </div>
      ) : (
        <div className="ww-reg-wrap">
          <table className="ww-reg-table">
            <thead>
              <tr>
                <th className="ww-reg-th-chk">
                  <input type="checkbox" checked={allSel} ref={el => { if (el) el.indeterminate = someSel; }} onChange={toggleAll} />
                </th>
                <th>Name / Contact</th>
                <th>Role &amp; Org</th>
                <th>Country</th>
                <th>Payment</th>
                <th>Attended</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const isExp = expanded.has(r.id);
                const isSel = sel.has(r.id);
                const paid   = r.payment_required && r.payment_required !== '0' && r.payment_required !== 0;
                const amt    = parseInt(r.final_amount || r.amount || 0);
                const status = (r.payment_status || 'free').toLowerCase();
                const attended = r.attended && r.attended !== '0' && r.attended !== 0;
                return (
                  <React.Fragment key={r.id}>
                    <tr className={`ww-reg-row${isSel ? ' is-sel' : ''}`}>
                      <td><input type="checkbox" checked={isSel} onChange={() => toggleSel(r.id)} /></td>
                      <td>
                        <span className="ww-reg-name">{r.name || '—'}</span>
                        <span className="ww-reg-sub">{r.email}</span>
                        {r.phone && <span className="ww-reg-sub">{r.phone}</span>}
                      </td>
                      <td>
                        <span className="ww-reg-role">{r.role || '—'}</span>
                        {r.organization && <span className="ww-reg-sub">{r.organization}</span>}
                      </td>
                      <td><span className="ww-reg-country">{r.country || r.city || '—'}</span></td>
                      <td>
                        {paid ? (
                          <span className={`ww-badge ww-badge-${status === 'paid' ? 'green' : 'amber'}`}>
                            {fmtMoney(amt)} · {status}
                          </span>
                        ) : (
                          <span className="ww-badge ww-badge-gray">Free</span>
                        )}
                      </td>
                      <td>
                        {attended
                          ? <span className="ww-badge ww-badge-green">✓ Yes</span>
                          : <span className="ww-badge ww-badge-gray">—</span>}
                      </td>
                      <td>
                        <button className="ww-reg-exp-btn" onClick={() => toggleExp(r.id)} title="Show details">
                          {isExp ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                        </button>
                      </td>
                    </tr>
                    {isExp && (
                      <tr className="ww-reg-exp-row">
                        <td colSpan={7}>
                          <div className="ww-reg-exp-body">
                            <div className="ww-reg-exp-grid">
                              {r.city      && <div><label>City</label><span>{r.city}</span></div>}
                              {r.source    && <div><label>How they heard</label><span>{r.source}</span></div>}
                              {r.registered_at && <div><label>Registered</label><span>{fmtDate(r.registered_at)}</span></div>}
                              {r.razorpay_payment_id && <div><label>Payment ID</label><span>{r.razorpay_payment_id}</span></div>}
                            </div>
                            {r.expectations && (
                              <div className="ww-reg-exp-qa">
                                <label>What they hope to learn</label>
                                <p>{r.expectations}</p>
                              </div>
                            )}
                            {r.speaker_question && (
                              <div className="ww-reg-exp-qa">
                                <label>Question for the speaker</label>
                                <p>{r.speaker_question}</p>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Sub-component: FormQuestionsTab
═══════════════════════════════════════════════════════════════ */
function FormQuestionsTab({ item }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(null);   // null | { mode:'add'|'edit', q }
  const [form, setForm]           = useState(EMPTY_Q);
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState('');
  const eKey  = toSlug(item.title || '');
  const eType = item.kind === 'webinar' ? 'webinar' : 'workshop';

  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async (autoSeed = false) => {
    setLoading(true);
    const data = await getFormQuestions(eKey, eType);
    const qs = Array.isArray(data) ? data : [];
    if (qs.length === 0 && autoSeed) {
      // First time this event has no questions — seed defaults silently
      const defaults = makeDefaultQuestions(eKey, eType);
      await Promise.all(defaults.map(q => createFormQuestion(q)));
      const seeded = await getFormQuestions(eKey, eType);
      setQuestions(Array.isArray(seeded) ? seeded : []);
    } else {
      setQuestions(qs);
    }
    setLoading(false);
  }, [eKey, eType]);

  useEffect(() => { load(true); }, [load]);

  const openAdd  = () => { setForm(EMPTY_Q); setModal({ mode: 'add' }); };
  const openEdit = (q) => { setForm({ ...q }); setModal({ mode: 'edit', q }); };

  const seedDefaults = async () => {
    setSeeding(true);
    const defaults = makeDefaultQuestions(eKey, eType);
    await Promise.all(defaults.map(q => createFormQuestion(q)));
    await load();
    setSeeding(false);
  };

  const save = async () => {
    if (!form.label.trim()) return setMsg('Label is required.');
    setSaving(true);
    const payload = { ...form, event_key: eKey, event_type: eType, order: questions.length };
    let res;
    if (modal.mode === 'add') {
      res = await createFormQuestion(payload);
    } else {
      res = await updateFormQuestion(modal.q.id, payload);
    }
    if (res?.error) { setMsg(res.error); } else { setModal(null); load(); }
    setSaving(false);
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this question?')) return;
    await deleteFormQuestion(id);
    load();
  };

  const move = async (idx, dir) => {
    const next = [...questions];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    const items = next.map((q, i) => ({ id: q.id, order: i }));
    setQuestions(next);
    await reorderFormQuestions(items);
  };

  return (
    <div className="ww-tab-body">
      <div className="ww-tab-header">
        <p className="ww-tab-hint">
          These questions appear on the registration form for this {badge(item.kind).toLowerCase()}.
        </p>
        <div style={{display:'flex',gap:8}}>
          {questions.length > 0 && (
            <button className="ww-btn ww-btn-ghost" onClick={seedDefaults} disabled={seeding} title="Add the 10 standard questions">
              {seeding ? 'Seeding…' : <><Plus size={14}/> Seed defaults</>}
            </button>
          )}
          <button className="ww-btn ww-btn-primary" onClick={openAdd}>
            <Plus size={15} /> Add Question
          </button>
        </div>
      </div>

      {loading ? (
        <p className="ww-loading">Loading questions…</p>
      ) : questions.length === 0 ? (
        <div className="ww-empty">
          <FileQuestion size={36} strokeWidth={1.3} />
          <p>No questions yet. Add one manually or seed the standard set.</p>
          <button className="ww-btn ww-btn-primary" onClick={seedDefaults} disabled={seeding} style={{marginTop:12}}>
            {seeding ? 'Seeding…' : <><Plus size={14}/> Seed 10 default questions</>}
          </button>
        </div>
      ) : (
        <div className="ww-q-list">
          {questions.map((q, idx) => (
            <div key={q.id} className="ww-q-card">
              <div className="ww-q-info">
                <span className="ww-q-label">{q.label}</span>
                <span className="ww-q-meta">
                  {FIELD_TYPES.find(f => f.value === q.field_type)?.label || q.field_type}
                  {q.required && <span className="ww-badge ww-badge-red">Required</span>}
                </span>
              </div>
              <div className="ww-q-actions">
                <button onClick={() => move(idx, -1)} disabled={idx === 0} title="Move up"><ChevronUp size={14}/></button>
                <button onClick={() => move(idx, 1)} disabled={idx === questions.length - 1} title="Move down"><ChevronDown size={14}/></button>
                <button onClick={() => openEdit(q)} title="Edit"><Edit2 size={14}/></button>
                <button onClick={() => remove(q.id)} title="Delete" className="ww-btn-danger-icon"><Trash2 size={14}/></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Question modal */}
      {modal && (
        <div className="ww-inner-overlay" onClick={() => setModal(null)}>
          <div className="ww-inner-modal" onClick={e => e.stopPropagation()}>
            <div className="ww-inner-modal-head">
              <h4>{modal.mode === 'add' ? 'Add Question' : 'Edit Question'}</h4>
              <button onClick={() => setModal(null)}><X size={16}/></button>
            </div>
            <div className="ww-inner-modal-body">
              {msg && <p className="ww-err">{msg}</p>}
              <label>Question Label <span>*</span>
                <input value={form.label} onChange={e => setForm(f => ({...f, label: e.target.value}))} placeholder="e.g. Your LinkedIn URL" />
              </label>
              <label>Field Type
                <select value={form.field_type} onChange={e => setForm(f => ({...f, field_type: e.target.value}))}>
                  {FIELD_TYPES.map(ft => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
                </select>
              </label>
              <label>Placeholder Text
                <input value={form.placeholder} onChange={e => setForm(f => ({...f, placeholder: e.target.value}))} placeholder="Optional hint shown inside the field" />
              </label>
              {['select','radio','checkbox'].includes(form.field_type) && (
                <label>Options <small>(comma-separated)</small>
                  <input value={form.options} onChange={e => setForm(f => ({...f, options: e.target.value}))} placeholder="Option A, Option B, Option C" />
                </label>
              )}
              <label className="ww-checkbox-label">
                <input type="checkbox" checked={form.required} onChange={e => setForm(f => ({...f, required: e.target.checked}))} />
                Required field
              </label>
            </div>
            <div className="ww-inner-modal-foot">
              <button className="ww-btn ww-btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="ww-btn ww-btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save Question'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Sub-component: GuestSpeakerTab
═══════════════════════════════════════════════════════════════ */
function GuestSpeakerTab({ item }) {
  const [speakers, setSpeakers] = useState([]);
  const [form, setForm]         = useState(EMPTY_SPEAKER);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState('');
  const [success, setSuccess]   = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    getEventSpeakers().then(r => setSpeakers(Array.isArray(r) ? r : []));
  }, [success]);

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const res = await uploadImage(file);
    if (res?.secure_url) setForm(f => ({ ...f, photo_url: res.secure_url }));
    else setMsg(res?.error || 'Upload failed');
    setUploading(false);
  };

  const save = async () => {
    if (!form.name.trim() || !form.role.trim()) return setMsg('Name and Role are required.');
    setSaving(true);
    setMsg('');
    const res = await createEventSpeaker(form);
    if (res?.id) {
      setSuccess(`Speaker "${res.name}" added — now live on the website guest section.`);
      setForm(EMPTY_SPEAKER);
    } else {
      setMsg(res?.error || 'Failed to save speaker.');
    }
    setSaving(false);
  };

  return (
    <div className="ww-tab-body">
      <p className="ww-tab-hint">
        Add a guest or speaker for this {badge(item.kind).toLowerCase()}.
        They will appear instantly on the Tiesverse website guest section via Supabase sync.
      </p>

      {success && (
        <div className="ww-success-banner">
          <Award size={16}/> {success}
        </div>
      )}

      <div className="ww-speaker-form">
        <h4>Add / Invite a Speaker</h4>
        {msg && <p className="ww-err">{msg}</p>}
        <div className="ww-two-col">
          <label>Name <span>*</span>
            <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Speaker full name" />
          </label>
          <label>Title / Role <span>*</span>
            <input value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))} placeholder="e.g. CEO, UX Lead" />
          </label>
        </div>
        <label>Organization
          <input value={form.org} onChange={e => setForm(f => ({...f, org: e.target.value}))} placeholder="Company or institution" />
        </label>
        <label>Bio / Quote
          <textarea rows={2} value={form.quote} onChange={e => setForm(f => ({...f, quote: e.target.value}))} placeholder="Short bio or keynote quote" />
        </label>

        {/* Photo */}
        <label>Photo</label>
        <div className="ww-photo-row">
          {form.photo_url
            ? <img src={form.photo_url} alt="preview" className="ww-photo-preview" />
            : <div className="ww-photo-placeholder"><Mic2 size={28}/></div>
          }
          <div>
            <button className="ww-btn ww-btn-ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Upload size={14}/> {uploading ? 'Uploading…' : 'Upload Photo'}
            </button>
            {form.photo_url && (
              <button className="ww-btn-danger-sm" onClick={() => setForm(f => ({...f, photo_url: ''}))}>
                <X size={12}/> Remove
              </button>
            )}
            <input type="file" ref={fileRef} accept="image/*" style={{display:'none'}} onChange={pickPhoto} />
          </div>
        </div>

        <label className="ww-checkbox-label">
          <input type="checkbox" checked={form.featured} onChange={e => setForm(f => ({...f, featured: e.target.checked}))} />
          Feature on homepage
        </label>

        <button className="ww-btn ww-btn-primary" onClick={save} disabled={saving || uploading}>
          {saving ? 'Saving…' : <><Plus size={14}/> Add Speaker to Website</>}
        </button>
      </div>

      {/* Recent speakers */}
      {speakers.length > 0 && (
        <div className="ww-speakers-recent">
          <h4>All Speakers ({speakers.length})</h4>
          <div className="ww-speakers-grid">
            {speakers.slice(0, 6).map(s => (
              <div key={s.id} className="ww-speaker-chip">
                {s.photo_url
                  ? <img src={s.photo_url} alt={s.name} />
                  : <div className="ww-speaker-initials">{s.name?.[0]}</div>
                }
                <div>
                  <strong>{s.name}</strong>
                  <span>{s.role}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Sub-component: MeetingTab — one Google Meet per event + host controls
   ═══════════════════════════════════════════════════════════════ */
function MeetingTab({ item, showToast }) {
  const [start, setStart]         = useState(item.meeting_start ? String(item.meeting_start).slice(0, 16) : '');
  const [duration, setDuration]   = useState(item.meeting_duration_min || 60);
  const [hosts, setHosts]         = useState((item.meeting_hosts || []).join(', '));
  const [joinAccess, setJoinAccess] = useState(item.meeting_join_access || 'invited');
  const [guestsSee, setGuestsSee] = useState(!!item.meeting_guests_see_each_other);
  const [moderation, setModeration] = useState(item.meeting_moderation !== false);
  const [autoRecord, setAutoRecord] = useState(!!item.meeting_auto_record);
  const [link, setLink]           = useState(item.meeting_link || '');
  const [busy, setBusy]           = useState(false);
  const [guestInfo, setGuestInfo] = useState(null);   // { attendees, guests_can_see_other_guests, has_meeting }

  const loadGuests = useCallback(async () => {
    const g = await getWebinarMeetingGuests(item.id);
    setGuestInfo(g || null);
  }, [item.id]);
  useEffect(() => { loadGuests(); }, [loadGuests]);

  const generate = async () => {
    if (!start) return showToast?.('Pick a meeting date and time.', 'error');
    setBusy(true);
    const res = await generateWebinarMeeting({
      event_pk: item.id,
      start, duration_min: Number(duration) || 60,
      hosts: hosts.split(',').map((s) => s.trim()).filter(Boolean),
      join_access: joinAccess, guests_see_each_other: guestsSee,
      moderation, auto_record: autoRecord,
    });
    setBusy(false);
    if (res?.meeting_link) { setLink(res.meeting_link); showToast?.('Meeting created — Google Meet link generated.', 'success'); loadGuests(); }
    else showToast?.(res?.error || 'Could not create the meeting.', 'error');
  };

  const F = {
    field: { display: 'grid', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' },
    input: { padding: '9px 12px', border: '1px solid #dcdce6', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', fontWeight: 400 },
    check: { display: 'flex', gap: 9, alignItems: 'center', fontSize: 13.5, fontWeight: 500, cursor: 'pointer' },
    checkbox: { width: 'auto', margin: 0 },
  };

  return (
    <div className="ww-tab-body">
      <p className="ww-tab-hint">
        One Google Meet for this {badge(item.kind).toLowerCase()}. <strong>Only paid registrants get the link</strong> —
        they're added as guests automatically on payment. Set the host controls, then generate.
      </p>

      {link && (
        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: 13 }}>
          <strong style={{ color: '#065f46' }}>Meet link:</strong>{' '}
          <a href={link} target="_blank" rel="noreferrer" style={{ color: 'var(--primary, #6366f1)', fontWeight: 600, wordBreak: 'break-all' }}>{link}</a>
        </div>
      )}

      <div style={{ display: 'grid', gap: 14, maxWidth: 560 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12 }}>
          <label style={F.field}>Date &amp; time<input type="datetime-local" style={F.input} value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label style={F.field}>Duration (min)<input type="number" min="15" step="15" style={F.input} value={duration} onChange={(e) => setDuration(e.target.value)} /></label>
        </div>
        <label style={F.field}>Hosts / co-hosts <span style={{ fontWeight: 400, color: 'var(--soft)' }}>(emails, comma-separated — get the invite + host controls)</span>
          <input style={F.input} value={hosts} onChange={(e) => setHosts(e.target.value)} placeholder="host@tiesverse.com, cohost@tiesverse.com" />
        </label>
        <label style={F.field}>Who can join
          <select style={F.input} value={joinAccess} onChange={(e) => setJoinAccess(e.target.value)}>
            <option value="invited">Invited only (paid guests + hosts)</option>
            <option value="org">Anyone in the organisation</option>
            <option value="open">Anyone with the link</option>
          </select>
        </label>
        <label style={F.check}><input type="checkbox" style={F.checkbox} checked={guestsSee} onChange={(e) => setGuestsSee(e.target.checked)} /> Guests can see each other</label>
        <label style={F.check}><input type="checkbox" style={F.checkbox} checked={moderation} onChange={(e) => setModeration(e.target.checked)} /> Moderation on — only hosts can present &amp; chat</label>
        <label style={F.check}><input type="checkbox" style={F.checkbox} checked={autoRecord} onChange={(e) => setAutoRecord(e.target.checked)} /> Auto-record the session</label>
        <button className="ww-btn ww-btn-primary" onClick={generate} disabled={busy} style={{ justifySelf: 'start' }}>
          <Video size={14} /> {busy ? 'Creating…' : (link ? 'Regenerate meeting' : 'Generate Meet link')}
        </button>
      </div>

      {/* Guest list (live from Google Calendar) */}
      {guestInfo && guestInfo.has_meeting && (
        <div style={{ marginTop: 20, border: '1px solid var(--rule, #eadfce)', borderRadius: 12, padding: 16, maxWidth: 560 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 13.5 }}>Guest list ({(guestInfo.attendees || []).length})</strong>
            <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
              background: guestInfo.guests_can_see_other_guests ? '#e0f2fe' : '#f3f4f6',
              color: guestInfo.guests_can_see_other_guests ? '#075985' : '#6b7280' }}>
              {guestInfo.guests_can_see_other_guests ? '👁 Guests CAN see each other' : '🙈 Guests can’t see each other'}
            </span>
            <button className="ww-btn ww-btn-ghost" onClick={loadGuests} title="Refresh" style={{ padding: '4px 10px' }}>↺</button>
          </div>
          {(guestInfo.attendees || []).length === 0 ? (
            <p className="ww-tab-hint" style={{ margin: 0 }}>No guests yet. Hosts appear here after generating; paid registrants are added automatically when they pay.</p>
          ) : (
            <div style={{ display: 'grid', gap: 4 }}>
              {guestInfo.attendees.map((a) => (
                <div key={a.email} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '5px 0', borderTop: '1px solid var(--hair, #f0f0f5)' }}>
                  <span>{a.email}{a.organizer ? ' · organiser' : ''}</span>
                  <span style={{ color: 'var(--soft, #8a8aa0)', fontSize: 12 }}>{a.status === 'accepted' ? '✓ accepted' : a.status === 'declined' ? '✗ declined' : 'invited'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="ww-tab-hint" style={{ marginTop: 14 }}>
        Guest visibility &amp; the Meet link work now. Moderation, join-access and recording apply once the
        <strong> Meet API</strong> step is enabled. True in-call <strong>co-host</strong> is a one-click action during the meeting (Google has no API for it).
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Sub-component: EmailsTab — per-webinar mail automation + analytics
   ═══════════════════════════════════════════════════════════════ */
function EmailsTab({ item, showToast }) {
  const eKey  = toSlug(item.title || '');
  const eType = item.kind === 'webinar' ? 'webinar' : 'workshop';

  const [templates, setTemplates] = useState([]);
  const [rows, setRows]           = useState([]);      // registrants (for counts + audience)
  const [history, setHistory]     = useState({ summary: {}, recipients: [], log: [] });
  const [loading, setLoading]     = useState(true);

  const [tplKey, setTplKey]       = useState('webinar_reminder');
  const [subject, setSubject]     = useState('');
  const [audience, setAudience]   = useState('all');
  const [joinLink, setJoinLink]   = useState('');
  const [recLink, setRecLink]     = useState('');
  const [timeStr, setTimeStr]     = useState(item.time_tz || '');
  const [testEmail, setTestEmail] = useState('');
  const [busy, setBusy]           = useState(false);

  // Recipient source: this webinar's registrants, or a custom list (CSV / manual)
  const [recipMode, setRecipMode] = useState('registrants'); // 'registrants' | 'custom'
  const [customList, setCustomList] = useState([]);           // [{ name, email }]
  const [mName, setMName]         = useState('');
  const [mEmail, setMEmail]       = useState('');

  // Certificate attachment + field mapping
  const [certTemplates, setCertTemplates] = useState([]);
  const [attachCert, setAttachCert] = useState(false);
  const [certTplId, setCertTplId]   = useState(item.certificate_template_id || '');
  const [certVars, setCertVars]     = useState([]);       // manual variables of the chosen template
  const [certMap, setCertMap]       = useState({});       // { varName: { source, value } }
  const [certPreviewUrl, setCertPreviewUrl] = useState('');
  const [certPreviewBusy, setCertPreviewBusy] = useState(false);
  const [showCertMap, setShowCertMap] = useState(false);

  const sourceLabel = (spec) => {
    const s = spec?.source;
    if (s === 'id') return 'Verification ID';
    if (s === 'custom') return spec.value ? `“${spec.value}”` : 'custom text';
    if (s === 'blank' || !s) return 'blank';
    const f = REG_FIELDS.find(([k]) => k === s);
    return f ? f[1] : s;
  };

  // When a certificate template is chosen, load its fields + auto-map name/id.
  useEffect(() => {
    if (!attachCert || !certTplId) { setCertVars([]); setCertMap({}); setCertPreviewUrl(''); return; }
    let alive = true;
    getCertificateTemplate(certTplId).then((tpl) => {
      if (!alive) return;
      const vars = (tpl?.variables || []).filter((v) => !v.generator_enabled);
      setCertVars(vars);
      setCertMap((prev) => {
        const m = {};
        vars.forEach((v) => {
          if (prev[v.name]) { m[v.name] = prev[v.name]; return; }
          const src = autoCertSource(v.name);
          m[v.name] = { source: src, value: src === 'custom' ? (v.sample_value || v.default_value || '') : '' };
        });
        return m;
      });
      setCertPreviewUrl('');
    }).catch(() => { setCertVars([]); setCertMap({}); });
    return () => { alive = false; };
  }, [certTplId, attachCert]); // eslint-disable-line

  const hasIdField = certVars.some((v) => certMap[v.name]?.source === 'id');
  const setMap = (name, patch) => setCertMap((m) => ({ ...m, [name]: { ...m[name], ...patch } }));

  const previewCertificate = async () => {
    if (!certTplId) return showToast?.('Pick a certificate template first.', 'error');
    setCertPreviewBusy(true);
    const sample = {};
    certVars.forEach((v) => {
      const s = (certMap[v.name] || {}).source;
      if (s === 'id') sample[v.name] = 'TIES-WEB-4F9A2C';
      else if (s === 'custom') sample[v.name] = (certMap[v.name] || {}).value || '';
      else if (s === 'blank' || !s) { /* omit */ }
      else if (s === 'event_title') sample[v.name] = item.title;
      else if (s === 'event_date') sample[v.name] = item.date || '20 Jul 2026';
      else sample[v.name] = REG_SAMPLE[s] != null ? REG_SAMPLE[s] : `[${s}]`;
    });
    try {
      const res = await generateCertificate(certTplId, sample);
      setCertPreviewUrl(URL.createObjectURL(res.blob));
    } catch (e) {
      showToast?.(`Could not generate preview — ${e?.message || 'certificate service error'}.`, 'error');
    } finally {
      setCertPreviewBusy(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [tpls, regs, hist, certs] = await Promise.all([
      getEmailTemplates().catch(() => []),
      getWebinarRegistrationsFull(eKey).catch(() => []),
      getWebinarSendHistory(eKey),
      listCertificateTemplates().catch(() => []),
    ]);
    setTemplates(Array.isArray(tpls) ? tpls : []);
    setRows(Array.isArray(regs) ? regs : []);
    setHistory(hist || { summary: {}, recipients: [], log: [] });
    setCertTemplates(Array.isArray(certs) ? certs : []);
    setLoading(false);
  }, [eKey]);
  useEffect(() => { load(); }, [load]);

  // Prefer webinar templates in the picker; fall back gracefully.
  const tplOptions = [...templates].sort((a, b) => {
    const aw = a.key?.startsWith('webinar_') ? 0 : 1;
    const bw = b.key?.startsWith('webinar_') ? 0 : 1;
    return aw - bw || String(a.name).localeCompare(String(b.name));
  });
  useEffect(() => {
    if (!templates.length) return;
    if (!templates.some(t => t.key === tplKey)) {
      const pref = templates.find(t => t.key === 'webinar_reminder')
        || templates.find(t => t.key?.startsWith('webinar_')) || templates[0];
      if (pref) setTplKey(pref.key);
    }
  }, [templates]); // eslint-disable-line
  const currentTpl = templates.find(t => t.key === tplKey) || null;
  useEffect(() => { setSubject(currentTpl?.subject || ''); }, [tplKey]); // eslint-disable-line

  const [showPreview, setShowPreview] = useState(false);
  const previewHtml = (currentTpl?.body_html || '<p style="padding:24px;font-family:sans-serif;color:#888">Pick a template to preview.</p>')
    .replace(/{{\s*(\w+)\s*}}/g, (m, k) => {
      const vals = {
        name: 'Aarav Sharma', topic: item.title, event_title: item.title,
        date: item.date || 'Jul 20, 2026', time: timeStr || '6:00 PM IST',
        join_link: joinLink || 'https://meet.google.com/abc-defg-hij',
        recording_link: recLink || 'https://youtu.be/xxxxxxxx',
      };
      return vals[k] != null ? vals[k] : m;
    });

  const total    = rows.length;
  const attended = rows.filter(r => Number(r.attended) === 1).length;
  const noShow   = total - attended;
  const audienceCount = audience === 'attended' ? attended : audience === 'not_attended' ? noShow : total;

  const extraCtx = () => ({ join_link: joinLink, recording_link: recLink, time: timeStr, date: item.date || '' });
  const fmt = (iso) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };

  // ── custom recipient list (CSV upload + manual entry) ──
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validCustom = customList.filter(r => EMAIL_RE.test((r.email || '').trim()));
  const sendCount = recipMode === 'custom' ? validCustom.length : audienceCount;

  const parseCSV = (text) => {
    const out = []; let i = 0, f = '', row = [], q = false;
    const pf = () => { row.push(f); f = ''; }; const pr = () => { out.push(row); row = []; };
    while (i < text.length) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ',') pf();
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { pf(); pr(); }
      else f += c;
      i++;
    }
    if (f.length || row.length) { pf(); pr(); }
    return out.filter(r => r.some(c => (c || '').trim() !== ''));
  };
  const onCsv = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCSV(String(reader.result || ''));
      if (!rows.length) { showToast?.('CSV looks empty.', 'error'); return; }
      const headers = rows[0].map(h => h.trim().toLowerCase());
      let ei = headers.findIndex(h => /e-?mail/.test(h));
      let ni = headers.findIndex(h => /name/.test(h));
      let data;
      if (ei === -1) { // no recognisable header → treat every row as data, guess columns
        data = rows;
        ei = rows[0].findIndex(c => EMAIL_RE.test((c || '').trim()));
        if (ei === -1) ei = 0;
        ni = ei === 0 ? 1 : 0;
      } else { data = rows.slice(1); }
      const list = data
        .map(r => ({ name: (r[ni] || '').trim(), email: (r[ei] || '').trim() }))
        .filter(x => x.email);
      setCustomList(list);
      setRecipMode('custom');
      showToast?.(`Loaded ${list.length} recipient(s) from CSV.`, 'success');
    };
    reader.readAsText(file);
  };
  const addManual = () => {
    const em = mEmail.trim();
    if (!EMAIL_RE.test(em)) return showToast?.('Enter a valid email address.', 'error');
    if (customList.some(r => r.email.toLowerCase() === em.toLowerCase())) return showToast?.('That email is already on the list.', 'info');
    setCustomList(prev => [...prev, { name: mName.trim(), email: em }]);
    setMName(''); setMEmail('');
  };
  const removeRecip = (idx) => setCustomList(prev => prev.filter((_, i) => i !== idx));

  const certPayload = () => (attachCert && certTplId
    ? { certificate_template_id: certTplId, include_certificate: true, include_id: hasIdField, certificate_fields: certMap }
    : {});

  const doTest = async () => {
    if (!testEmail.trim()) return showToast?.('Enter a test email address.', 'error');
    if (attachCert && !certTplId) return showToast?.('Pick a certificate template.', 'error');
    setBusy(true);
    const res = await webinarBroadcast({
      event_key: eKey, event_type: eType, event_title: item.title,
      template_key: tplKey, subject, extra_context: extraCtx(), test_email: testEmail.trim(),
      ...certPayload(),
    });
    setBusy(false);
    if (res?.sent) showToast?.(`Test sent to ${testEmail.trim()}`, 'success');
    else if (res?.stubbed) showToast?.('Test stubbed — email sending is off or SES creds are missing.', 'info');
    else showToast?.(res?.error || 'Test failed.', 'error');
  };

  const doSend = async () => {
    if (!sendCount) return showToast?.('No valid recipients selected.', 'error');
    const label = recipMode === 'custom' ? `${sendCount} on your list` : `${sendCount} recipient(s)`;
    if (!window.confirm(`Send “${currentTpl?.name || tplKey}” to ${label}?`)) return;
    setBusy(true);
    const payload = {
      event_key: eKey, event_type: eType, event_title: item.title,
      template_key: tplKey, subject, extra_context: extraCtx(),
    };
    if (recipMode === 'custom') payload.recipients = validCustom;
    else payload.audience = audience;
    Object.assign(payload, certPayload());
    const res = await webinarBroadcast(payload);
    setBusy(false);
    if (res?.error) return showToast?.(res.error, 'error');
    const parts = [`${res.sent} sent`];
    if (res.stubbed) parts.push(`${res.stubbed} stubbed`);
    if (res.skipped) parts.push(`${res.skipped} skipped`);
    showToast?.(`Broadcast complete — ${parts.join(', ')}.`, 'success');
    load();
  };

  const S = {
    strip: { display: 'flex', gap: 10, flexWrap: 'wrap', margin: '0 0 18px' },
    stat: { flex: '1 1 120px', background: '#f8f8fb', border: '1px solid #ececf3', borderRadius: 10, padding: '12px 14px' },
    statN: { fontSize: 22, fontWeight: 800, lineHeight: 1, color: '#1a1a2e' },
    statL: { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: '#8a8aa0', marginTop: 5 },
    card: { background: '#fff', border: '1px solid #ececf3', borderRadius: 12, padding: 18, marginBottom: 18 },
    label: { display: 'block', fontSize: 12.5, fontWeight: 700, color: '#3a3a4d', margin: '0 0 6px' },
    input: { width: '100%', padding: '9px 11px', border: '1px solid #dcdce6', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' },
    row: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 },
    aud: (on) => ({ flex: '1 1 30%', padding: '10px 12px', border: `1.5px solid ${on ? '#6366f1' : '#e2e2ee'}`, borderRadius: 9, cursor: 'pointer', background: on ? 'rgba(99,102,241,.06)' : '#fff' }),
    audN: { fontSize: 13, fontWeight: 700, color: '#1a1a2e' },
    audL: { fontSize: 11, color: '#8a8aa0' },
    section: { fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6366f1', margin: '0 0 12px' },
  };

  if (loading) return <p className="ww-loading">Loading email tools…</p>;

  return (
    <div className="ww-tab-body">
      {/* stats strip */}
      <div style={S.strip}>
        <div style={S.stat}><div style={S.statN}>{total}</div><div style={S.statL}>Registered</div></div>
        <div style={S.stat}><div style={{ ...S.statN, color: '#16a34a' }}>{attended}</div><div style={S.statL}>Attended</div></div>
        <div style={S.stat}><div style={{ ...S.statN, color: '#d97706' }}>{noShow}</div><div style={S.statL}>No-show</div></div>
        <div style={S.stat}><div style={{ ...S.statN, color: '#6366f1' }}>{history.summary?.total_sends || 0}</div><div style={S.statL}>Emails sent</div></div>
      </div>

      {/* composer */}
      <div style={S.card}>
        <p style={S.section}><Send size={13} style={{ verticalAlign: -2, marginRight: 6 }} />Broadcast to registrants</p>

        <div style={S.row}>
          <div style={{ flex: '1 1 260px' }}>
            <label style={S.label}>Email template</label>
            <select style={S.input} value={tplKey} onChange={e => setTplKey(e.target.value)}>
              {tplOptions.map(t => <option key={t.key} value={t.key}>{t.name}{t.key?.startsWith('webinar_') ? '' : ' (general)'}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 260px' }}>
            <label style={S.label}>Subject <span style={{ fontWeight: 400, color: '#a0a0b4' }}>(override for this send)</span></label>
            <input style={S.input} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject line" />
          </div>
        </div>

        <div className="ww-tab-hint" style={{ margin: '0 0 12px' }}>
          {currentTpl?.variables?.length ? (
            <>Tokens in “<strong>{currentTpl.name}</strong>” <span style={{ color: '#a0a0b4' }}>(click to add to subject)</span>:{' '}
              {currentTpl.variables.map((t) => (
                <code key={t} onClick={() => setSubject((s) => `${s}{{${t}}}`)} title="Add to subject"
                  style={{ background: '#eef0fe', color: '#4338ca', padding: '1px 5px', borderRadius: 4, marginRight: 5, fontSize: 11.5, cursor: 'pointer' }}>{`{{${t}}}`}</code>
              ))}
            </>
          ) : (
            <>This template has no tokens defined — add some in the Email Designer.</>
          )}
          <div style={{ marginTop: 4, color: '#a0a0b4' }}>
            Any registrant field also works even if not listed:{' '}
            {['organization', 'role', 'city', 'country', 'event_date'].map((t) => (
              <code key={t} onClick={() => setSubject((s) => `${s}{{${t}}}`)} title="Add to subject"
                style={{ background: '#f0f0f5', padding: '1px 5px', borderRadius: 4, marginRight: 5, fontSize: 11, cursor: 'pointer' }}>{`{{${t}}}`}</code>
            ))}
          </div>
        </div>

        <label style={S.label}>Recipients</label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <button type="button" className={`ww-btn ${recipMode === 'registrants' ? 'ww-btn-primary' : 'ww-btn-ghost'}`} onClick={() => setRecipMode('registrants')}>
            <Users size={14} /> Registrants
          </button>
          <button type="button" className={`ww-btn ${recipMode === 'custom' ? 'ww-btn-primary' : 'ww-btn-ghost'}`} onClick={() => setRecipMode('custom')}>
            <Upload size={14} /> Upload / manual list
          </button>
        </div>

        {recipMode === 'registrants' ? (
          <div style={S.row}>
            {[['all', 'Everyone', total], ['attended', 'Attended only', attended], ['not_attended', 'Did not attend', noShow]].map(([v, l, n]) => (
              <div key={v} style={S.aud(audience === v)} onClick={() => setAudience(v)}>
                <div style={S.audN}>{l}</div>
                <div style={S.audL}>{n} recipient{n !== 1 ? 's' : ''}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
              <label className="ww-btn ww-btn-ghost" style={{ cursor: 'pointer' }}>
                <Upload size={14} /> {customList.length ? 'Replace CSV' : 'Upload CSV'}
                <input type="file" accept=".csv,text/csv" hidden onChange={e => e.target.files[0] && onCsv(e.target.files[0])} />
              </label>
              <span className="ww-tab-hint" style={{ margin: 0 }}>
                CSV with <code>name</code> &amp; <code>email</code> columns.
                {customList.length > 0 && <> <strong>{validCustom.length}</strong> valid{customList.length !== validCustom.length ? ` · ${customList.length - validCustom.length} invalid` : ''}</>}
              </span>
              {customList.length > 0 && <button className="ww-btn ww-btn-ghost" onClick={() => setCustomList([])}>Clear</button>}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <input style={{ ...S.input, flex: '1 1 150px' }} value={mName} onChange={e => setMName(e.target.value)} placeholder="Name (optional)" />
              <input style={{ ...S.input, flex: '1 1 200px' }} value={mEmail} onChange={e => setMEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && addManual()} placeholder="email@example.com" />
              <button className="ww-btn ww-btn-ghost" onClick={addManual}><Plus size={14} /> Add</button>
            </div>

            {customList.length > 0 && (
              <div className="ww-reg-wrap" style={{ maxHeight: 220, overflow: 'auto' }}>
                <table className="ww-reg-table">
                  <thead><tr><th>Name</th><th>Email</th><th /></tr></thead>
                  <tbody>
                    {customList.map((r, idx) => {
                      const ok = EMAIL_RE.test((r.email || '').trim());
                      return (
                        <tr key={idx} style={ok ? undefined : { background: '#fef2f2' }}>
                          <td>{r.name || '—'}</td>
                          <td style={{ color: ok ? undefined : '#b91c1c' }}>{r.email}{ok ? '' : ' · invalid'}</td>
                          <td><button className="ww-btn ww-btn-ghost" style={{ padding: '3px 8px' }} onClick={() => removeRecip(idx)}><Trash2 size={13} /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div style={S.row}>
          <div style={{ flex: '1 1 30%' }}>
            <label style={S.label}>Join link <span style={{ fontWeight: 400, color: '#a0a0b4' }}>{'{{join_link}}'}</span></label>
            <input style={S.input} value={joinLink} onChange={e => setJoinLink(e.target.value)} placeholder="https://meet…" />
          </div>
          <div style={{ flex: '1 1 30%' }}>
            <label style={S.label}>Recording link <span style={{ fontWeight: 400, color: '#a0a0b4' }}>{'{{recording_link}}'}</span></label>
            <input style={S.input} value={recLink} onChange={e => setRecLink(e.target.value)} placeholder="https://youtu.be…" />
          </div>
          <div style={{ flex: '1 1 30%' }}>
            <label style={S.label}>Time <span style={{ fontWeight: 400, color: '#a0a0b4' }}>{'{{time}}'}</span></label>
            <input style={S.input} value={timeStr} onChange={e => setTimeStr(e.target.value)} placeholder="6:00 PM IST" />
          </div>
        </div>

        {/* live email preview */}
        <div style={{ borderTop: '1px solid #f0f0f5', paddingTop: 14, marginTop: 4 }}>
          <button type="button" className="ww-btn ww-btn-ghost" onClick={() => setShowPreview((v) => !v)} style={{ padding: '6px 12px' }}>
            {showPreview ? 'Hide preview' : '👁 Preview email'}
          </button>
          {showPreview && (
            <div style={{ marginTop: 10, border: '1px solid #e6e6ef', borderRadius: 10, overflow: 'hidden', background: '#f4f4f8' }}>
              <iframe title="Email preview" srcDoc={previewHtml} style={{ width: '100%', height: 460, border: 'none', background: '#fff' }} />
            </div>
          )}
        </div>

        {/* certificate attachment */}
        <div style={{ borderTop: '1px solid #f0f0f5', paddingTop: 14, marginTop: 4 }}>
          <label style={{ display: 'flex', gap: 9, alignItems: 'center', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto', margin: 0 }} checked={attachCert} onChange={e => setAttachCert(e.target.checked)} />
            🎓 Attach a certificate PDF to each email
          </label>
          {attachCert && (
            <div style={{ display: 'grid', gap: 12, marginTop: 10, paddingLeft: 28 }}>
              <label style={S.label}>Certificate template
                <select style={S.input} value={certTplId} onChange={e => setCertTplId(e.target.value)}>
                  <option value="">— Select a template —</option>
                  {certTemplates.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
                </select>
              </label>
              {certTemplates.length === 0 && (
                <p className="ww-tab-hint" style={{ margin: 0, color: '#b45309' }}>No templates found — design one in the Certificate Generator first.</p>
              )}

              {/* Auto-match summary + optional review table */}
              {certTplId && certVars.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 12.5, color: 'var(--soft, #6b6b80)', flex: '1 1 260px' }}>
                      <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ Auto-matched</span>{' '}
                      <span style={{ color: 'var(--ink)' }}>{certVars.map((v) => `${v.name} → ${sourceLabel(certMap[v.name])}`).join('  ·  ')}</span>
                    </div>
                    <button type="button" className="ww-btn ww-btn-ghost" style={{ padding: '4px 10px' }} onClick={() => setShowCertMap((s) => !s)}>
                      {showCertMap ? 'Hide fields' : 'Review / edit'}
                    </button>
                  </div>
                  {showCertMap && (
                  <div className="ww-reg-wrap" style={{ marginTop: 10 }}>
                    <table className="ww-reg-table">
                      <thead><tr><th>Certificate field</th><th>Fill with</th></tr></thead>
                      <tbody>
                        {certVars.map((v) => {
                          const spec = certMap[v.name] || {};
                          return (
                            <tr key={v.name}>
                              <td style={{ fontWeight: 600 }}>{v.name}
                                {v.sample_value ? <span style={{ fontWeight: 400, color: 'var(--soft, #8a8aa0)', fontSize: 11 }}><br />e.g. {v.sample_value}</span> : null}
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                  <select style={{ ...S.input, padding: '6px 8px', width: 'auto' }} value={spec.source || 'custom'} onChange={e => setMap(v.name, { source: e.target.value })}>
                                    <optgroup label="From each registrant">
                                      {REG_FIELDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                                    </optgroup>
                                    <option value="id">Verification ID (auto)</option>
                                    <option value="custom">Custom text</option>
                                    <option value="blank">Leave blank</option>
                                  </select>
                                  {spec.source === 'custom' && (
                                    <input style={{ ...S.input, padding: '6px 8px', flex: '1 1 120px' }} value={spec.value || ''} onChange={e => setMap(v.name, { value: e.target.value })} placeholder="text to print" />
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  )}
                </div>
              )}

              {certTplId && certVars.length === 0 && (
                <p className="ww-tab-hint" style={{ margin: 0 }}>This template has no fillable fields — it'll be sent as-is.</p>
              )}

              {/* Preview */}
              {certTplId && (
                <div>
                  <button type="button" className="ww-btn ww-btn-ghost" onClick={previewCertificate} disabled={certPreviewBusy} style={{ padding: '6px 12px' }}>
                    {certPreviewBusy ? 'Generating…' : '👁 Preview certificate'}
                  </button>
                  {certPreviewUrl && (
                    <div style={{ marginTop: 10, border: '1px solid #e6e6ef', borderRadius: 10, overflow: 'hidden' }}>
                      <iframe title="Certificate preview" src={certPreviewUrl} style={{ width: '100%', height: 380, border: 'none', background: '#f4f4f8' }} />
                    </div>
                  )}
                  <p className="ww-tab-hint" style={{ margin: '8px 0 0' }}>
                    Preview uses sample data (name “Aarav Sharma”{hasIdField ? ', ID “TIES-WEB-4F9A2C”' : ''}). Each real recipient gets their own name{hasIdField ? ' + a unique ID' : ''}.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', borderTop: '1px solid #f0f0f5', paddingTop: 14 }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={S.label}>Send a test to</label>
            <input style={S.input} value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="you@tiesverse.com" />
          </div>
          <button className="ww-btn ww-btn-ghost" onClick={doTest} disabled={busy}>Send test</button>
          <button className="ww-btn ww-btn-primary" onClick={doSend} disabled={busy || !sendCount}>
            <Send size={14} /> {busy ? 'Sending…' : `Send to ${sendCount}`}
          </button>
        </div>
        <p className="ww-tab-hint" style={{ marginTop: 10 }}>
          Uses the “{currentTpl?.name || tplKey}” template · from {currentTpl?.from_name || 'Tiesverse'}. Edit content in the Email Designer.
        </p>
      </div>

      {/* send history / counts */}
      <div style={S.card}>
        <p style={S.section}><Mail size={13} style={{ verticalAlign: -2, marginRight: 6 }} />Send history · {history.summary?.unique_recipients || 0} people · {history.summary?.total_sends || 0} emails</p>
        {(!history.recipients || history.recipients.length === 0) ? (
          <p className="ww-tab-hint" style={{ margin: 0 }}>No emails sent for this {eType} yet. Your broadcasts will show here with per-person counts.</p>
        ) : (
          <div className="ww-reg-wrap">
            <table className="ww-reg-table">
              <thead><tr><th>Recipient</th><th>Emails</th><th>Last sent</th><th>Templates</th></tr></thead>
              <tbody>
                {history.recipients.map(r => (
                  <tr key={r.email}>
                    <td><strong>{r.name || '—'}</strong><br /><span style={{ color: '#8a8aa0', fontSize: 12 }}>{r.email}</span></td>
                    <td><span style={{ fontWeight: 800, color: '#6366f1' }}>{r.count}×</span></td>
                    <td style={{ fontSize: 12.5 }}>{fmt(r.last_sent)}</td>
                    <td style={{ fontSize: 12, color: '#6a6a80' }}>{(r.templates || []).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* certificates sent */}
      <div style={S.card}>
        <p style={S.section}>🎓 Certificates sent · {history.summary?.certificates_sent || 0}</p>
        {(!history.certificates || history.certificates.length === 0) ? (
          <p className="ww-tab-hint" style={{ margin: 0 }}>No certificates sent yet. Turn on “Attach a certificate PDF” above and send — each one is logged here with its verification ID.</p>
        ) : (
          <div className="ww-reg-wrap">
            <table className="ww-reg-table">
              <thead><tr><th>Recipient</th><th>Certificate ID</th><th>Sent</th></tr></thead>
              <tbody>
                {history.certificates.map((c, i) => (
                  <tr key={`${c.email}-${i}`}>
                    <td><strong>{c.name || '—'}</strong><br /><span style={{ color: '#8a8aa0', fontSize: 12 }}>{c.email}</span></td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12.5, fontWeight: 600 }}>{c.certificate_id || '—'}</td>
                    <td style={{ fontSize: 12.5 }}>{fmt(c.sent_at)}</td>
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

/* ═══════════════════════════════════════════════════════════════
   Main component: WebinarsWorkshops
═══════════════════════════════════════════════════════════════ */
const WebinarsWorkshops = () => {
  const [items, setItems]       = useState([]);
  const [calView, setCalView]   = useState('list');   // 'list' | 'calendar'
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);  // { item, tab }
  const [activeTab, setActiveTab] = useState('details');
  const [formModal, setFormModal] = useState(null); // null | { mode, data }
  const [form, setForm]         = useState({ ...EMPTY_ITEM });
  const [saving, setSaving]     = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast]       = useState({ msg: '', type: '' });
  const [filter, setFilter]     = useState('all'); // 'all'|'webinar'|'workshop'
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingHost, setUploadingHost]   = useState(false);
  const coverRef = useRef(null);
  const hostRef  = useRef(null);
  // Two-step create modal
  const [modalStep, setModalStep]             = useState(1);
  const [stepQs, setStepQs]                   = useState([]);
  const [stepQsLoading, setStepQsLoading]     = useState(false);
  const [stepCreatedItem, setStepCreatedItem] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    window.setTimeout(() => setToast({ msg: '', type: '' }), 3500);
  };

  const pickCover = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    const res = await uploadImage(file);
    if (res?.secure_url) setForm(f => ({ ...f, cover_url: res.secure_url }));
    else showToast(res?.error || 'Cover upload failed.', 'error');
    setUploadingCover(false);
    if (coverRef.current) coverRef.current.value = '';
  };

  const pickHostImg = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingHost(true);
    const res = await uploadImage(file);
    if (res?.secure_url) setForm(f => ({ ...f, host_image_url: res.secure_url }));
    else showToast(res?.error || 'Host image upload failed.', 'error');
    setUploadingHost(false);
    if (hostRef.current) hostRef.current.value = '';
  };

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getEventRegistrations();
    setItems(Array.isArray(res) ? res : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const closeModal = () => { setFormModal(null); setModalStep(1); setStepQs([]); setStepCreatedItem(null); };

  const openCreate = () => {
    setForm({ ...EMPTY_ITEM });
    setModalStep(1);
    setStepQs([]);
    setStepCreatedItem(null);
    setFormModal({ mode: 'create' });
  };

  const openEdit = (item) => {
    setForm({ ...item });
    setModalStep(1);
    setFormModal({ mode: 'edit', item });
  };

  // Step 1 → create item + seed default questions → Step 2
  const handleNext = async () => {
    if (!form.title.trim()) return showToast('Title is required.', 'error');
    setSaving(true);
    const res = await createEventRegistration({ ...form, price: Number(form.price) || 0 });
    if (res?.id || res?.title) {
      setStepCreatedItem(res);
      load();
      setStepQsLoading(true);
      setModalStep(2);
      const eKey  = toSlug(res.title || form.title);
      const eType = res.kind || form.kind || 'webinar';
      const defaults = makeDefaultQuestions(eKey, eType);
      const created = await Promise.all(defaults.map(q => createFormQuestion(q)));
      setStepQs(created.filter(q => q?.id));
      setStepQsLoading(false);
    } else {
      showToast(res?.error || 'Save failed.', 'error');
    }
    setSaving(false);
  };

  // Edit-only save
  const saveForm = async () => {
    if (!form.title.trim()) return showToast('Title is required.', 'error');
    setSaving(true);
    const res = await updateEventRegistration(formModal.item.id, { ...form, price: Number(form.price) || 0 });
    if (res?.id || res?.title) { closeModal(); load(); showToast('Updated.'); }
    else showToast(res?.error || 'Save failed.', 'error');
    setSaving(false);
  };

  // Toggle required on a step-2 default question
  const toggleStepQRequired = async (q) => {
    const updated = await updateFormQuestion(q.id, { ...q, required: !q.required });
    if (updated?.id) setStepQs(prev => prev.map(x => x.id === q.id ? { ...x, required: !x.required } : x));
  };

  // Close Step 2 and open the created item in detail panel
  const handleDone = () => {
    const item = stepCreatedItem;
    closeModal();
    if (item) { setSelected({ item }); setActiveTab('details'); showToast(`"${item.title}" created!`); }
  };

  const confirmDelete = async () => {
    await deleteEventRegistration(deleteTarget.id);
    setDeleteTarget(null);
    if (selected?.item?.id === deleteTarget.id) setSelected(null);
    load();
    showToast('Deleted.');
  };

  const openManage = (item) => {
    setSelected({ item });
    setActiveTab('details');
  };

  const visible = items.filter(i => filter === 'all' || i.kind === filter);

  return (
    <div className="ww-root">
      {/* Toast */}
      {toast.msg && (
        <div className={`ww-toast ${toast.type === 'error' ? 'ww-toast-error' : 'ww-toast-ok'}`}>
          {toast.msg}
        </div>
      )}

      {/* Page header */}
      <div className="ww-page-header">
        <div>
          <h2>Webinars &amp; Workshops</h2>
          <p>Manage listings, registration forms, speakers, and certificate distribution.</p>
        </div>
        <button className="ww-btn ww-btn-primary" onClick={openCreate}>
          <Plus size={15}/> New
        </button>
      </div>

      {/* Filter tabs */}
      <div className="ww-filter-bar" style={{ display: 'flex', alignItems: 'center' }}>
        {[['all','All'],['webinar','Webinars'],['workshop','Workshops']].map(([val, lbl]) => (
          <button key={val} className={`ww-filter-btn ${filter === val ? 'is-active' : ''}`}
            onClick={() => setFilter(val)}>{lbl}</button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'inline-flex', gap: 2, border: '1px solid var(--rule, #e6e6ef)', borderRadius: 8, padding: 2 }}>
          <button type="button" onClick={() => setCalView('list')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: 'none', borderRadius: 6, background: calView === 'list' ? 'var(--accent, #6366f1)' : 'transparent', color: calView === 'list' ? '#fff' : 'inherit', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}><ClipboardList size={14} /> List</button>
          <button type="button" onClick={() => setCalView('calendar')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: 'none', borderRadius: 6, background: calView === 'calendar' ? 'var(--accent, #6366f1)' : 'transparent', color: calView === 'calendar' ? '#fff' : 'inherit', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}><Award size={14} /> Calendar</button>
        </div>
      </div>

      {calView === 'calendar' ? (
        <div style={{ padding: '4px 0' }}>
          <ScheduleCalendar
            accent="#6366f1"
            events={visible.map((it) => ({
              id: it.id,
              date: it.meeting_start || it.date,
              title: it.title,
              subtitle: it.host || badge(it.kind),
              link: it.meeting_link || '',
            }))}
            emptyLabel="No webinars/workshops with a date yet."
          />
        </div>
      ) : (
      <div className="ww-layout">
        {/* Left: cards */}
        <div className="ww-list">
          {loading ? (
            <p className="ww-loading">Loading…</p>
          ) : visible.length === 0 ? (
            <div className="ww-empty">
              <Video size={40} strokeWidth={1.2}/>
              <p>No {filter !== 'all' ? filter + 's' : 'items'} yet. Create one.</p>
            </div>
          ) : (
            visible.map(item => (
              <div
                key={item.id}
                className={`ww-card ${selected?.item?.id === item.id ? 'is-selected' : ''}`}
                onClick={() => openManage(item)}
              >
                {item.cover_url && <img src={item.cover_url} alt="" className="ww-card-cover" />}
                <div className="ww-card-body">
                  <div className="ww-card-badges">
                    <span className={`ww-badge ${item.kind === 'webinar' ? 'ww-badge-blue' : 'ww-badge-purple'}`}>
                      {badge(item.kind)}
                    </span>
                    <span className={`ww-badge ${item.status === 'upcoming' ? 'ww-badge-green' : 'ww-badge-gray'}`}>
                      {item.status}
                    </span>
                    {item.price > 0 && <span className="ww-badge ww-badge-amber">₹{item.price}</span>}
                  </div>
                  <h3 className="ww-card-title">{item.title}</h3>
                  <p className="ww-card-meta">{item.host && `${item.host} • `}{item.date}</p>
                </div>
                <div className="ww-card-actions" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEdit(item)} title="Edit details"><Edit2 size={14}/></button>
                  <button onClick={() => setDeleteTarget(item)} title="Delete" className="ww-btn-danger-icon">
                    <Trash2 size={14}/>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right: detail panel */}
        {selected ? (
          <div className="ww-detail">
            <div className="ww-detail-head">
              <div>
                <h3>{selected.item.title}</h3>
                <span className={`ww-badge ${selected.item.kind === 'webinar' ? 'ww-badge-blue' : 'ww-badge-purple'}`}>
                  {badge(selected.item.kind)}
                </span>
              </div>
              <button onClick={() => setSelected(null)}><X size={18}/></button>
            </div>

            <div className="ww-tabs">
              {TABS.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    className={`ww-tab ${activeTab === tab.key ? 'is-active' : ''}`}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    <Icon size={14}/> {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="ww-tab-content">
              {activeTab === 'details'       && <DetailsTab item={selected.item} onSaved={load} showToast={showToast} />}
              {activeTab === 'questions'     && <FormQuestionsTab item={selected.item} />}
              {activeTab === 'registrations' && <RegistrationsTab item={selected.item} />}
              {activeTab === 'meeting'       && <MeetingTab item={selected.item} showToast={showToast} />}
              {activeTab === 'emails'        && <EmailsTab item={selected.item} showToast={showToast} />}
              {activeTab === 'speaker'       && <GuestSpeakerTab item={selected.item} />}
            </div>
          </div>
        ) : (
          <div className="ww-detail ww-detail-empty">
            <Users size={48} strokeWidth={1.1}/>
            <p>Select a webinar or workshop on the left to manage its details, form questions, speakers, and certificate distribution.</p>
          </div>
        )}
      </div>
      )}

      {/* Create / Edit modal */}
      {formModal && (
        <div className="ww-overlay" onClick={closeModal}>
          <div className="ww-modal" onClick={e => e.stopPropagation()}>

          {/* ── Step 2: Form Questions ── */}
          {modalStep === 2 ? (<>
            <div className="ww-modal-head">
              <div>
                <h3>Registration Form Questions</h3>
                <span className="ww-step-chip">Step 2 of 2 · Question Setup</span>
              </div>
              <button onClick={handleDone}><X size={18}/></button>
            </div>
            <div className="ww-modal-body">
              <p style={{fontSize:13, color:'var(--text-muted)', margin:0, lineHeight:1.5}}>
                These questions appear on the registration form. Toggle any question optional or keep it required. Add more from the <strong>Form Questions</strong> tab later.
              </p>
              {stepQsLoading ? (
                <p className="ww-loading">Setting up default questions…</p>
              ) : (
                <div className="ww-step2-list">
                  {stepQs.map(q => (
                    <div key={q.id} className="ww-step2-q">
                      <div className="ww-step2-q-info">
                        <span className="ww-step2-q-label">{q.label}</span>
                        <span className="ww-step2-q-type">{q.field_type}</span>
                      </div>
                      <div className="ww-toggle-wrap" onClick={() => toggleStepQRequired(q)}>
                        <span className="ww-toggle-text">{q.required ? 'Required' : 'Optional'}</span>
                        <div className={`ww-toggle ${q.required ? 'is-on' : ''}`} role="switch" aria-checked={q.required}/>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="ww-step2-hint">
                <Plus size={13}/> Add more custom questions (dropdown, checkbox, etc.) from the <strong>Form Questions</strong> tab inside the panel.
              </div>
            </div>
            <div className="ww-modal-foot" style={{justifyContent:'space-between', alignItems:'center'}}>
              <span style={{fontSize:12, color:'var(--text-muted)'}}>{stepQs.length} default questions set up</span>
              <button className="ww-btn ww-btn-primary" onClick={handleDone}>Done — Open Panel →</button>
            </div>
          </>) : (<>

          {/* ── Step 1: Basic Info ── */}
            <div className="ww-modal-head">
              <div>
                <h3>{formModal.mode === 'create' ? 'New Webinar / Workshop' : 'Edit Details'}</h3>
                {formModal.mode === 'create' && <span className="ww-step-chip">Step 1 of 2 · Basic Info</span>}
              </div>
              <button onClick={closeModal}><X size={18}/></button>
            </div>
            <div className="ww-modal-body">
              <div className="ww-two-col">
                <label>Type
                  <select value={form.kind} onChange={e => setForm(f => ({...f, kind: e.target.value}))}>
                    <option value="webinar">Webinar</option>
                    <option value="workshop">Workshop</option>
                  </select>
                </label>
                <label>Status
                  <select value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))}>
                    <option value="upcoming">Upcoming</option>
                    <option value="past">Past</option>
                  </select>
                </label>
              </div>
              <label>Title <span>*</span>
                <input value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} placeholder="Session title" />
              </label>
              <label>Description
                <textarea rows={3} value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="Brief description" />
              </label>
              <div className="ww-two-col">
                <label>Date
                  <input value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} placeholder="e.g. 20 July 2025" />
                </label>
                <label>Time (with timezone)
                  <input value={form.time_tz} onChange={e => setForm(f => ({...f, time_tz: e.target.value}))} placeholder="e.g. 6:00 PM IST" />
                </label>
              </div>
              <div className="ww-two-col">
                <div>
                  <label>Host / Speaker
                    <input value={form.host} onChange={e => setForm(f => ({...f, host: e.target.value}))} placeholder="Host or speaker name" />
                  </label>
                  <div className="ww-host-img-row">
                    {form.host_image_url
                      ? <img src={form.host_image_url} alt="" className="ww-host-thumb"/>
                      : <div className="ww-host-thumb-empty"><Mic2 size={13}/></div>
                    }
                    <button type="button" className="ww-btn ww-btn-ghost ww-btn-sm" onClick={() => hostRef.current?.click()} disabled={uploadingHost || saving}>
                      <Upload size={12}/> {uploadingHost ? 'Uploading…' : 'Host Photo'}
                    </button>
                    {form.host_image_url && (
                      <button type="button" className="ww-btn-danger-sm" onClick={() => setForm(f => ({...f, host_image_url:''}))}>
                        <X size={11}/>
                      </button>
                    )}
                    <input type="file" ref={hostRef} accept="image/*" style={{display:'none'}} onChange={pickHostImg}/>
                  </div>
                </div>
                <label>Price (₹ — 0 for free)
                  <input type="number" min={0} value={form.price} onChange={e => setForm(f => ({...f, price: e.target.value}))} />
                </label>
              </div>
              <div className="ww-field-label">Cover Image</div>
              <div className="ww-upload-row">
                {form.cover_url
                  ? <img src={form.cover_url} alt="cover" className="ww-cover-preview"/>
                  : <div className="ww-cover-placeholder"><Video size={22}/></div>
                }
                <div style={{display:'flex', flexDirection:'column', gap: 6}}>
                  <button type="button" className="ww-btn ww-btn-ghost" onClick={() => coverRef.current?.click()} disabled={uploadingCover || saving}>
                    <Upload size={14}/> {uploadingCover ? 'Uploading…' : 'Upload Cover Image'}
                  </button>
                  {form.cover_url && (
                    <button type="button" className="ww-btn-danger-sm" onClick={() => setForm(f => ({...f, cover_url:''}))}>
                      <X size={12}/> Remove
                    </button>
                  )}
                  <small style={{color:'var(--text-muted)', fontSize:11}}>JPG, PNG, WebP — recommended 16:9 ratio</small>
                </div>
                <input type="file" ref={coverRef} accept="image/*" style={{display:'none'}} onChange={pickCover}/>
              </div>
              {form.title && (
                <div className="ww-url-preview">
                  <span className="ww-url-preview-label">Registration URL (auto-generated)</span>
                  <span className="ww-url-preview-val">{previewUrl(form.kind, form.title)}</span>
                </div>
              )}
            </div>
            <div className="ww-modal-foot">
              <button className="ww-btn ww-btn-ghost" onClick={closeModal}>Cancel</button>
              {formModal.mode === 'create' ? (
                <button className="ww-btn ww-btn-primary" onClick={handleNext} disabled={saving || uploadingCover || uploadingHost}>
                  {saving ? 'Creating…' : 'Next — Form Questions →'}
                </button>
              ) : (
                <button className="ww-btn ww-btn-primary" onClick={saveForm} disabled={saving || uploadingCover || uploadingHost}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              )}
            </div>
          </>)}
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="ww-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="ww-modal ww-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="ww-modal-head">
              <h3>Delete "{deleteTarget.title}"?</h3>
              <button onClick={() => setDeleteTarget(null)}><X size={18}/></button>
            </div>
            <div className="ww-modal-body">
              <p>This will permanently remove the {badge(deleteTarget.kind).toLowerCase()} listing. This cannot be undone.</p>
            </div>
            <div className="ww-modal-foot">
              <button className="ww-btn ww-btn-ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="ww-btn ww-btn-danger" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── DetailsTab (inline edit inside panel) ──────────────────── */
function DetailsTab({ item, onSaved, showToast }) {
  const [form, setForm]                     = useState({ ...item });
  const [saving, setSaving]                 = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingHost, setUploadingHost]   = useState(false);
  const coverRef = useRef(null);
  const hostRef  = useRef(null);

  const save = async () => {
    setSaving(true);
    const res = await updateEventRegistration(item.id, { ...form, price: Number(form.price) || 0 });
    if (res?.id || res?.title) { showToast('Saved.'); onSaved(); }
    else showToast(res?.error || 'Save failed.', 'error');
    setSaving(false);
  };

  const pickCover = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    const res = await uploadImage(file);
    if (res?.secure_url) setForm(f => ({ ...f, cover_url: res.secure_url }));
    else showToast(res?.error || 'Cover upload failed.', 'error');
    setUploadingCover(false);
    if (coverRef.current) coverRef.current.value = '';
  };

  const pickHostImg = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingHost(true);
    const res = await uploadImage(file);
    if (res?.secure_url) setForm(f => ({ ...f, host_image_url: res.secure_url }));
    else showToast(res?.error || 'Host image upload failed.', 'error');
    setUploadingHost(false);
    if (hostRef.current) hostRef.current.value = '';
  };

  return (
    <div className="ww-tab-body">
      <div className="ww-two-col">
        <label>Type
          <select value={form.kind} onChange={e => setForm(f => ({...f, kind: e.target.value}))}>
            <option value="webinar">Webinar</option>
            <option value="workshop">Workshop</option>
          </select>
        </label>
        <label>Status
          <select value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))}>
            <option value="upcoming">Upcoming</option>
            <option value="past">Past</option>
          </select>
        </label>
      </div>
      <label>Title
        <input value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} />
      </label>
      <label>Description
        <textarea rows={3} value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} />
      </label>
      <div className="ww-two-col">
        <label>Date
          <input value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} />
        </label>
        <label>Time (timezone)
          <input value={form.time_tz} onChange={e => setForm(f => ({...f, time_tz: e.target.value}))} />
        </label>
      </div>
      <div className="ww-two-col">
        <div>
          <label>Host / Speaker
            <input value={form.host} onChange={e => setForm(f => ({...f, host: e.target.value}))} />
          </label>
          <div className="ww-host-img-row">
            {form.host_image_url
              ? <img src={form.host_image_url} alt="" className="ww-host-thumb"/>
              : <div className="ww-host-thumb-empty"><Mic2 size={13}/></div>
            }
            <button type="button" className="ww-btn ww-btn-ghost ww-btn-sm" onClick={() => hostRef.current?.click()} disabled={uploadingHost || saving}>
              <Upload size={12}/> {uploadingHost ? 'Uploading…' : 'Host Photo'}
            </button>
            {form.host_image_url && (
              <button type="button" className="ww-btn-danger-sm" onClick={() => setForm(f => ({...f, host_image_url:''}))}>
                <X size={11}/>
              </button>
            )}
            <input type="file" ref={hostRef} accept="image/*" style={{display:'none'}} onChange={pickHostImg}/>
          </div>
        </div>
        <label>Price (₹)
          <input type="number" min={0} value={form.price} onChange={e => setForm(f => ({...f, price: e.target.value}))} />
        </label>
      </div>
      <div className="ww-field-label">Cover Image</div>
      <div className="ww-upload-row">
        {form.cover_url
          ? <img src={form.cover_url} alt="cover" className="ww-cover-preview"/>
          : <div className="ww-cover-placeholder"><Video size={22}/></div>
        }
        <div style={{display:'flex', flexDirection:'column', gap: 6}}>
          <button type="button" className="ww-btn ww-btn-ghost" onClick={() => coverRef.current?.click()} disabled={uploadingCover || saving}>
            <Upload size={14}/> {uploadingCover ? 'Uploading…' : 'Upload Cover Image'}
          </button>
          {form.cover_url && (
            <button type="button" className="ww-btn-danger-sm" onClick={() => setForm(f => ({...f, cover_url:''}))}>
              <X size={12}/> Remove
            </button>
          )}
          <small style={{color:'var(--text-muted)', fontSize:11}}>JPG, PNG, WebP — recommended 16:9</small>
        </div>
        <input type="file" ref={coverRef} accept="image/*" style={{display:'none'}} onChange={pickCover}/>
      </div>
      <div>
        <div className="ww-field-label" style={{marginBottom: 6}}>Registration URL</div>
        <div className="ww-url-display">
          <span>{item.register_url || previewUrl(item.kind, item.title)}</span>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(item.register_url || previewUrl(item.kind, item.title))}
            title="Copy URL"
          >
            Copy
          </button>
        </div>
        <small style={{color:'var(--text-muted)', fontSize:11, marginTop: 4, display:'block'}}>
          Auto-generated from title · updates when you save a new title
        </small>
      </div>
      <button className="ww-btn ww-btn-primary" onClick={save} disabled={saving || uploadingCover || uploadingHost} style={{marginTop: '8px'}}>
        <Save size={14}/> {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </div>
  );
}

export default WebinarsWorkshops;
