import './WebinarsWorkshops.css';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Award, ChevronDown, ChevronUp, ClipboardList, Edit2, FileQuestion, Mic2,
  Plus, Save, Trash2, Upload, Users, Video, X,
} from 'lucide-react';
import {
  createEventRegistration, deleteEventRegistration,
  updateEventRegistration, getEventRegistrations,
  getFormQuestions, createFormQuestion, updateFormQuestion,
  deleteFormQuestion, reorderFormQuestions,
  getEventSpeakers, createEventSpeaker,
  getEventCertificateLink, saveEventCertificateLink,
  getWebinarRegistrationsFull, markAttended,
  uploadImage,
} from '../../apiClient';
import { listCertificateTemplates } from '../Certificates/certificateApi';

/* ─── constants ─────────────────────────────────────────────── */
const EMPTY_ITEM = {
  kind: 'webinar', title: '', description: '', date: '', time_tz: '',
  host: '', host_image_url: '', price: 0, cover_url: '', status: 'upcoming',
};

const toSlug = (str) =>
  String(str || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

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
  { key: 'speaker',       label: 'Guest Speaker',  icon: Mic2 },
  { key: 'certs',         label: 'Certificates',   icon: Award },
];

/* ─── helpers ────────────────────────────────────────────────── */
const eventKey = (item) => String(item?.id || item?.title || '');
const badge = (kind) => kind === 'webinar' ? 'Webinar' : 'Workshop';

/* ═══════════════════════════════════════════════════════════════
   Sub-component: RegistrationsTab
   ═══════════════════════════════════════════════════════════════ */
function RegistrationsTab({ item }) {
  const navigate = useNavigate();
  const eKey  = toSlug(item.title || '');
  const eType = item.kind === 'webinar' ? 'webinar' : 'workshop';

  const [rows,     setRows]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [sel,      setSel]      = useState(new Set());
  const [expanded, setExpanded] = useState(new Set());
  const [marking,  setMarking]  = useState(false);
  const [certLink, setCertLink] = useState(null);
  const [msg,      setMsg]      = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [regs, link] = await Promise.all([
      getWebinarRegistrationsFull(eKey),
      getEventCertificateLink(eKey, eType).catch(() => null),
    ]);
    setRows(Array.isArray(regs) ? regs : []);
    setCertLink(link || null);
    setLoading(false);
  }, [eKey, eType]);

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

  const handleSendCerts = () => {
    if (!certLink?.template_id) {
      setMsg('Assign a certificate template in the Certificates tab first, then come back here.');
      return;
    }
    setMsg('');
    navigate(`/certificates/templates/${certLink.template_id}/generate`, {
      state: { event_key: eKey, event_type: eType, event_title: item.title },
    });
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
          <button className="ww-btn ww-btn-primary" onClick={handleSendCerts}>
            <Award size={14}/> Send Certificates
          </button>
          <button className="ww-btn ww-btn-ghost" onClick={load} title="Refresh">↺</button>
        </div>
      </div>

      {msg && <p className="ww-err" style={{ margin: '0 0 12px' }}>{msg}</p>}

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
   Sub-component: CertificatesTab
═══════════════════════════════════════════════════════════════ */
function CertificatesTab({ item }) {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [link, setLink]           = useState({ template_id: '', template_name: '' });
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState('');
  const eKey  = toSlug(item.title || '');
  const eType = item.kind === 'webinar' ? 'webinar' : 'workshop';

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [tmpl, current] = await Promise.all([
        listCertificateTemplates().catch(() => []),
        getEventCertificateLink(eKey, eType),
      ]);
      setTemplates(Array.isArray(tmpl) ? tmpl : []);
      setLink(current || { template_id: '', template_name: '' });
      setLoading(false);
    })();
  }, [eKey, eType]);

  const assignTemplate = async () => {
    if (!link.template_id) return setMsg('Select a template first.');
    setSaving(true);
    const res = await saveEventCertificateLink({
      event_key: eKey, event_type: eType,
      template_id: link.template_id, template_name: link.template_name,
    });
    if (res?.saved) setMsg(''); else setMsg(res?.error || 'Failed to save.');
    setSaving(false);
  };

  const goSend = () => {
    if (!link.template_id) return;
    navigate(`/certificates/templates/${link.template_id}/generate`);
  };

  if (loading) return <p className="ww-loading">Loading certificate options…</p>;

  return (
    <div className="ww-tab-body">
      <p className="ww-tab-hint">
        Assign a certificate template from the Certificate Portal. After the {badge(item.kind).toLowerCase()} ends,
        send certificates to all marked attendees in one click.
      </p>

      {msg && <p className="ww-err">{msg}</p>}

      <div className="ww-cert-section">
        <label>Certificate Template
          <select
            value={link.template_id}
            onChange={e => {
              const t = templates.find(t => String(t.id) === e.target.value);
              setLink({ template_id: e.target.value, template_name: t?.name || '' });
            }}
          >
            <option value="">— Select a template —</option>
            {templates.map(t => (
              <option key={t.id} value={String(t.id)}>{t.name}</option>
            ))}
          </select>
        </label>

        <div className="ww-cert-actions">
          <button className="ww-btn ww-btn-ghost" onClick={assignTemplate} disabled={saving || !link.template_id}>
            <Save size={14}/> {saving ? 'Saving…' : 'Assign Template'}
          </button>

          {link.template_id && (
            <button className="ww-btn ww-btn-primary" onClick={goSend}>
              <Award size={14}/> Send Certificates →
            </button>
          )}
        </div>

        {link.template_id && (
          <div className="ww-cert-status">
            <Award size={14}/>
            <span>Template assigned: <strong>{link.template_name}</strong></span>
          </div>
        )}

        {!link.template_id && templates.length === 0 && (
          <div className="ww-empty">
            <Award size={36} strokeWidth={1.3}/>
            <p>No certificate templates found. Upload one in the <strong>Certificate Generator</strong> portal first.</p>
            <button className="ww-btn ww-btn-ghost" onClick={() => navigate('/certificates/templates')}>
              Go to Certificate Portal
            </button>
          </div>
        )}
      </div>

      <div className="ww-cert-help">
        <h4>How it works</h4>
        <ol>
          <li>Upload and design your certificate template in the Certificate Generator portal.</li>
          <li>Assign it here to this {badge(item.kind).toLowerCase()}.</li>
          <li>After the session, mark attendees in the Registrations page.</li>
          <li>Click "Send Certificates →" — the generate page opens pre-linked to this event's attendees.</li>
          <li>Choose "Email batch" mode and send in one click.</li>
        </ol>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Main component: WebinarsWorkshops
═══════════════════════════════════════════════════════════════ */
const WebinarsWorkshops = () => {
  const [items, setItems]       = useState([]);
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
      <div className="ww-filter-bar">
        {[['all','All'],['webinar','Webinars'],['workshop','Workshops']].map(([val, lbl]) => (
          <button key={val} className={`ww-filter-btn ${filter === val ? 'is-active' : ''}`}
            onClick={() => setFilter(val)}>{lbl}</button>
        ))}
      </div>

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
              {activeTab === 'speaker'       && <GuestSpeakerTab item={selected.item} />}
              {activeTab === 'certs'         && <CertificatesTab item={selected.item} />}
            </div>
          </div>
        ) : (
          <div className="ww-detail ww-detail-empty">
            <Users size={48} strokeWidth={1.1}/>
            <p>Select a webinar or workshop on the left to manage its details, form questions, speakers, and certificate distribution.</p>
          </div>
        )}
      </div>

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
