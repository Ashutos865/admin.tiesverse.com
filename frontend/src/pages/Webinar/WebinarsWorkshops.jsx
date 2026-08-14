import './WebinarsWorkshops.css';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Award, BarChart3, ChevronDown, ChevronUp, ClipboardList, Download, Edit2, FileQuestion,
  Mail, Mic2, Plus, Save, Send, Trash2, Upload, Users, Video, X,
} from 'lucide-react';
import {
  createEventRegistration, deleteEventRegistration,
  updateEventRegistration, getEventRegistrations,
  refundRegistration, syncRegistrationPayment, manageMeetingGuest,
  getFormQuestions, createFormQuestion, updateFormQuestion,
  deleteFormQuestion, reorderFormQuestions,
  getFormSections, createFormSection, updateFormSection,
  deleteFormSection, reorderFormSections,
  getEventGuests, createEventSpeaker, deleteEventSpeaker, webinarRegistrationQrUrl,
  getWebinarRegistrationsFull, markAttended,
  webinarBroadcast, getWebinarSendHistory, getWebinarMyAccess,
  generateWebinarMeeting, getWebinarMeetingGuests,
  getEmailTemplates, getSESSenders,
  uploadImage, uploadFile,
} from '../../apiClient';
import { listCertificateTemplates, getCertificateTemplate, generateCertificate } from '../Certificates/certificateApi';
import { variableNamesFromElements } from '../Certificates/certificateUtils';
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
  { label: 'Full Name',                    field_type: 'text',     required: true,  order: 0, section: 1, maps_to: 'name',             placeholder: 'Your full name',                   event_key: eKey, event_type: eType },
  { label: 'Email Address',                field_type: 'email',    required: true,  order: 1, section: 1, maps_to: 'email',            placeholder: 'you@example.com',                   event_key: eKey, event_type: eType },
  { label: 'WhatsApp Number',              field_type: 'phone',    required: true,  order: 2, section: 1, maps_to: 'phone',            placeholder: 'Include country code (e.g. +91)',    event_key: eKey, event_type: eType },
  { label: 'Current Role',                 field_type: 'select',   required: true,  order: 3, section: 2, maps_to: 'role',             placeholder: 'Select your role',                   options: 'College Student,Working Professional,Researcher / Analyst,NGO / Non-Profit,Teacher / Professor,Other', event_key: eKey, event_type: eType },
  { label: 'Organization / University',    field_type: 'text',     required: true,  order: 4, section: 2, maps_to: 'organization',     placeholder: 'Where do you study or work?',        event_key: eKey, event_type: eType },
  { label: 'Country',                      field_type: 'text',     required: true,  order: 5, section: 2, maps_to: 'country',          placeholder: 'e.g. India',                         event_key: eKey, event_type: eType },
  { label: 'City',                         field_type: 'text',     required: true,  order: 6, section: 2, maps_to: 'city',             placeholder: 'e.g. New Delhi',                     event_key: eKey, event_type: eType },
  { label: 'How did you hear about this?', field_type: 'select',   required: true,  order: 7, section: 3, maps_to: 'source',           placeholder: 'Select one',                         options: 'LinkedIn,X / Twitter,Instagram,Email from TIES,TIES Website,Referral', event_key: eKey, event_type: eType },
  { label: 'What do you hope to learn?',   field_type: 'textarea', required: true,  order: 8, section: 3, maps_to: 'expectations',     placeholder: 'Your interest in this session…', event_key: eKey, event_type: eType },
  { label: 'Question for the Speaker',     field_type: 'textarea', required: false, order: 9, section: 3, maps_to: 'speaker_question', placeholder: 'Ask a targeted question (optional)', event_key: eKey, event_type: eType },
];

const previewUrl = (kind, title) =>
  `https://tiesverse.com/webinars/${toSlug(title)}`;

/* Parse the listing's free-text date/time ("20 Jul 2026", "6:00 PM IST") into
   a datetime-local value, so the Meet scheduler prefills itself from the
   listing instead of the date being retyped (mirrors event_time.py). */
const MONTHS3 = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function parseListingDate(text) {
  if (!text) return null;
  const t = String(text).trim().toLowerCase().replace(/,/g, ' ');
  let m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);                       // ISO
  if (m) return { y: +m[1], mo: +m[2] - 1, d: +m[3] };
  m = t.match(/(\d{1,2})\s*[/.]\s*(\d{1,2})\s*[/.]\s*(\d{4})/);         // 20/07/2026
  if (m) return { y: +m[3], mo: +m[2] - 1, d: +m[1] };
  m = t.match(/(\d{1,2})\s+([a-z]{3,9})\s+(\d{4})/);                    // 20 Jul 2026
  if (m && MONTHS3[m[2].slice(0, 3)] !== undefined) return { y: +m[3], mo: MONTHS3[m[2].slice(0, 3)], d: +m[1] };
  m = t.match(/([a-z]{3,9})\s+(\d{1,2})\s+(\d{4})/);                    // Jul 20 2026
  if (m && MONTHS3[m[1].slice(0, 3)] !== undefined) return { y: +m[3], mo: MONTHS3[m[1].slice(0, 3)], d: +m[2] };
  return null;
}
function parseListingTime(text) {
  const m = String(text || '').trim().toLowerCase().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!m) return null;
  let h = +m[1];
  const min = +(m[2] || 0);
  if (m[3] === 'pm' && h !== 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  return (h >= 0 && h <= 23 && min <= 59) ? { h, min } : null;
}
function listingStartLocal(item) {
  if (item.meeting_start) return String(item.meeting_start).slice(0, 16);
  const d = parseListingDate(item.date);
  if (!d) return '';
  const tm = parseListingTime(item.time_tz) || { h: 18, min: 0 };   // visible in the field either way
  const p = (n) => String(n).padStart(2, '0');
  return `${d.y}-${p(d.mo + 1)}-${p(d.d)}T${p(tm.h)}:${p(tm.min)}`;
}
const EMPTY_Q = { label: '', field_type: 'text', placeholder: '', options: '', required: true , section: 1 };
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
// Which capability each detail tab needs (details is always shown to viewers).
const TAB_CAP = {
  details: 'view', questions: 'manage_questions', registrations: 'manage_registrations',
  meeting: 'manage_meeting', emails: 'send_emails', speaker: 'manage_speakers',
  analytics: 'view',
};
const TABS = [
  { key: 'details',       label: 'Details',        icon: Edit2 },
  { key: 'questions',     label: 'Form Questions', icon: FileQuestion },
  { key: 'registrations', label: 'Registrations',  icon: ClipboardList },
  { key: 'meeting',       label: 'Meeting',        icon: Video },
  { key: 'emails',        label: 'Emails',         icon: Mail },
  { key: 'speaker',       label: 'Guest Speaker',  icon: Mic2 },
  { key: 'analytics',     label: 'Analytics',      icon: BarChart3 },
];

/* ─── helpers ────────────────────────────────────────────────── */
const eventKey = (item) => String(item?.id || item?.title || '');
const badge = (kind) => kind === 'webinar' ? 'Webinar' : 'Workshop';

/* ═══════════════════════════════════════════════════════════════
   Sub-component: RegistrationsTab
   ═══════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════
   Sub-component: AnalyticsTab — one screen answering "how is this going?"
   ═══════════════════════════════════════════════════════════════ */

// Enough hues to tell channels apart, ordered so the first few stay distinct.
const CHART_COLOURS = ['#fe7a00', '#2563eb', '#10b981', '#a855f7', '#f43f5e', '#0891b2', '#eab308', '#64748b'];

/** A donut drawn as SVG arcs — no chart library, so nothing else to ship. */
function Donut({ slices, total, size = 168, label }) {
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--outline-variant)" strokeWidth={stroke} />
        {total > 0 && slices.map((s, i) => {
          const len = (s.value / total) * c;
          const el = (
            <circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={s.colour} strokeWidth={stroke}
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset}>
              <title>{`${s.label}: ${s.value}`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
      </g>
      <text x="50%" y="47%" textAnchor="middle" fontSize="26" fontWeight="800" fill="var(--text-main)">{total}</text>
      <text x="50%" y="62%" textAnchor="middle" fontSize="10.5" fill="var(--text-muted)"
        style={{ letterSpacing: '.08em', textTransform: 'uppercase' }}>registered</text>
    </svg>
  );
}

const Stat = ({ label, value, sub, tone }) => (
  <div style={{
    border: '1px solid var(--outline-variant)', borderRadius: 12, padding: '14px 16px',
    background: 'var(--surface)', minWidth: 0,
  }}>
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.15, marginTop: 4, color: tone || 'var(--text-main)' }}>{value}</div>
    {sub && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
  </div>
);

function AnalyticsTab({ item }) {
  const eKey = toSlug(item.title || '');
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let alive = true;
    getWebinarRegistrationsFull(eKey, item.id)
      .then((r) => { if (alive) setRows(Array.isArray(r) ? r : []); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [eKey, item.id]);

  if (rows === null) return <div className="ww-tab-body"><p className="ww-tab-hint">Loading…</p></div>;

  const total = rows.length;
  const isPaidRow = (r) => (!Number(r.payment_required) ? true : String(r.payment_status || '').toLowerCase() === 'paid');
  const paid = rows.filter(isPaidRow).length;
  const pending = rows.filter((r) => String(r.payment_status || '').toLowerCase() === 'pending').length;
  const failed = rows.filter((r) => String(r.payment_status || '').toLowerCase() === 'failed').length;
  const refunded = rows.filter((r) => String(r.payment_status || '').toLowerCase().includes('refund')).length;
  const attended = rows.filter((r) => Number(r.attended) === 1).length;

  // Revenue: final_amount is stored in paise and already reflects coupons.
  //
  // Gross is every payment that was actually taken, INCLUDING the ones later
  // refunded — money has to be counted in before it can be counted back out.
  // Netting refunds off a gross that excluded refunded rows produced a
  // negative "Collected": three 99-rupee refunds were subtracted from a gross
  // that had never contained them.
  const tookMoney = (r) => {
    if (!Number(r.payment_required)) return false;   // free seats are not revenue
    const st = String(r.payment_status || '').toLowerCase();
    return st === 'paid' || st.includes('refund');
  };
  const grossPaise = rows.filter(tookMoney)
    .reduce((s, r) => s + Number(r.final_amount || r.amount || 0), 0);
  const refundedPaise = rows.reduce((s, r) => s + Number(r.refund_amount || 0), 0);
  const inr = (paise) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;

  // Where they came from — the campaign tag, else the self-reported answer.
  const tally = new Map();
  rows.forEach((r) => {
    const key = String(r.utm_source || '').trim().toLowerCase()
      || String(r.source || '').trim().toLowerCase()
      || 'direct / untagged';
    tally.set(key, (tally.get(key) || 0) + 1);
  });
  const sources = [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, colour: CHART_COLOURS[i % CHART_COLOURS.length] }));
  const topCount = sources[0]?.value || 1;

  // Registrations per day, most recent fortnight, so a push is visible.
  const byDay = new Map();
  rows.forEach((r) => {
    const d = String(r.registered_at || '').slice(0, 10);
    if (d) byDay.set(d, (byDay.get(d) || 0) + 1);
  });
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  const dayMax = Math.max(1, ...days.map(([, n]) => n));

  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <div className="ww-tab-body">
      <p className="ww-tab-hint" style={{ margin: '0 0 14px' }}>
        Everything about this {badge(item.kind).toLowerCase()} at a glance — who registered, who paid,
        who turned up, and which link brought them.
      </p>

      {total === 0 ? (
        <p style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>No registrations yet. Share a link from the Details tab and the numbers appear here.</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 18 }}>
            <Stat label="Registered" value={total} />
            <Stat label="Paid / confirmed" value={paid} sub={`${pct(paid)}% of registrations`} tone="#10b981" />
            <Stat label="Pending payment" value={pending} sub={pending ? 'Not yet paid' : 'Nothing outstanding'} tone={pending ? '#d97706' : undefined} />
            <Stat label="Attended" value={attended} sub={`${pct(attended)}% turned up`} />
            {/* Both halves of the sum, so the net figure can be checked at a
                glance rather than taken on trust. */}
            <Stat label="Collected" value={inr(grossPaise - refundedPaise)}
              sub={refundedPaise
                ? `${inr(grossPaise)} in, ${inr(refundedPaise)} refunded to ${refunded}`
                : (failed ? `${failed} failed` : 'net of refunds')} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 260px) minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
            <div style={{ border: '1px solid var(--outline-variant)', borderRadius: 12, padding: 16, background: 'var(--surface)' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 800, color: 'var(--text-main)' }}>Where they came from</h4>
              <div style={{ display: 'grid', placeItems: 'center' }}>
                <Donut slices={sources} total={total} label="Registrations by source" />
              </div>
              <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
                {sources.slice(0, 8).map((s) => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: s.colour, flex: 'none' }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-main)' }}>{s.label}</span>
                    <strong style={{ color: 'var(--text-main)' }}>{s.value}</strong>
                    <span style={{ color: 'var(--text-muted)', minWidth: 34, textAlign: 'right' }}>{pct(s.value)}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 18 }}>
              <div style={{ border: '1px solid var(--outline-variant)', borderRadius: 12, padding: 16, background: 'var(--surface)' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 800, color: 'var(--text-main)' }}>Registrations by channel</h4>
                <div style={{ display: 'grid', gap: 9 }}>
                  {sources.map((s) => (
                    <div key={s.label} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 40px', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                      <span style={{ height: 9, borderRadius: 6, background: 'var(--outline-variant)', overflow: 'hidden' }}>
                        <span style={{ display: 'block', height: '100%', width: `${(s.value / topCount) * 100}%`, background: s.colour, borderRadius: 6 }} />
                      </span>
                      <strong style={{ fontSize: 12.5, textAlign: 'right', color: 'var(--text-main)' }}>{s.value}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ border: '1px solid var(--outline-variant)', borderRadius: 12, padding: 16, background: 'var(--surface)' }}>
                <h4 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 800, color: 'var(--text-main)' }}>Sign-ups per day</h4>
                <p style={{ margin: '0 0 12px', fontSize: 11.5, color: 'var(--text-muted)' }}>Last {days.length} day{days.length === 1 ? '' : 's'} with registrations</p>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 110 }}>
                  {days.map(([d, n]) => (
                    <div key={d} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 0 }}>
                      <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{n}</span>
                      <span title={`${d}: ${n}`} style={{
                        width: '100%', maxWidth: 34, height: `${(n / dayMax) * 76}px`, minHeight: 4,
                        background: 'var(--primary, #fe7a00)', borderRadius: '5px 5px 0 0',
                      }} />
                      <span style={{ fontSize: 9.5, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{d.slice(8)}/{d.slice(5, 7)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ border: '1px solid var(--outline-variant)', borderRadius: 12, padding: 16, background: 'var(--surface)' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 800, color: 'var(--text-main)' }}>Payment status</h4>
                <div style={{ display: 'flex', height: 12, borderRadius: 7, overflow: 'hidden', background: 'var(--outline-variant)' }}>
                  {[['Paid', paid, '#10b981'], ['Pending', pending, '#d97706'], ['Failed', failed, '#dc2626'], ['Refunded', refunded, '#64748b']]
                    .filter(([, n]) => n > 0)
                    .map(([label, n, colour]) => (
                      <span key={label} title={`${label}: ${n}`} style={{ width: `${(n / total) * 100}%`, background: colour }} />
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, fontSize: 12 }}>
                  {[['Paid', paid, '#10b981'], ['Pending', pending, '#d97706'], ['Failed', failed, '#dc2626'], ['Refunded', refunded, '#64748b']]
                    .map(([label, n, colour]) => (
                      <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
                        <span style={{ width: 9, height: 9, borderRadius: 3, background: colour }} />
                        {label} <strong style={{ color: 'var(--text-main)' }}>{n}</strong>
                      </span>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Which channels actually brought people in.
 *
 * Counts the tagged link each registrant arrived through. Untagged arrivals
 * are shown as "direct or untagged" rather than hidden, so the numbers always
 * add up to the total and a channel is never credited by omission.
 */
function SourceBreakdown({ rows }) {
  if (!rows.length) return null;
  const tally = new Map();
  rows.forEach((r) => {
    const key = String(r.utm_source || '').trim().toLowerCase() || 'direct or untagged';
    tally.set(key, (tally.get(key) || 0) + 1);
  });
  const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length === 1 && sorted[0][0] === 'direct or untagged') return null;

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '0 0 12px' }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.04em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
        Came from
      </span>
      {sorted.map(([src, n]) => (
        <span key={src} style={{
          display: 'inline-flex', alignItems: 'baseline', gap: 6, padding: '4px 11px', borderRadius: 20,
          border: '1px solid var(--outline-variant)', background: 'var(--surface)', fontSize: 12,
        }}>
          <strong style={{ color: 'var(--text-main)' }}>{src}</strong>
          <span style={{ color: 'var(--text-muted)' }}>{n}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Refund controls for one registration.
 *
 * Money leaves the account here, so nothing happens on a single click: the
 * amount is shown, a reason is asked for, and the confirm step names the
 * person and the sum. "Check with Razorpay" re-reads the payment for rows that
 * drifted (a refund issued from Razorpay's own dashboard, say).
 */
/** Answers to the admin's own questions, as [question, answer] pairs.
 *  Anything unreadable is skipped rather than thrown: one malformed row must
 *  not take the whole registrations list down with it. */
function parseCustomAnswers(raw) {
  if (!raw) return [];
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== 'object') return [];
    return Object.entries(obj).filter(([q, a]) => q && a);
  } catch { return []; }
}

function RefundPanel({ row, paidAmount, eventKey, onDone, setMsg }) {
  const [open, setOpen]     = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy]     = useState(false);

  /* Refunding somebody does not decide whether they should still be in the
     room: a partial refund often means they are still coming, and a full one
     usually means they are not. Rather than guess, the guest list is left to
     be set here by hand, next to the refund that prompted the question. */
  const setGuest = async (action) => {
    const email = (row.email || '').trim();
    if (!email) return setMsg('That registration has no email address.');
    const who = row.name ? `${row.name} (${email})` : email;
    if (!window.confirm(
      action === 'add'
        ? `Add ${who} to the meeting guest list?\n\nThey will be able to join the Meet.`
        : `Remove ${who} from the meeting guest list?\n\nThey will no longer be able to join the Meet.`,
    )) return;
    setBusy(true);
    const res = await manageMeetingGuest({ event_key: eventKey, action, email, notify: false });
    setBusy(false);
    if (res?.status === 'ok') {
      setMsg(action === 'add' ? `${email} added to the guest list.` : `${email} removed from the guest list.`);
    } else {
      setMsg(res?.error || 'Could not update the guest list.');
    }
  };

  const refundedRupees = Math.round(Number(row.refund_amount || 0) / 100);
  const remaining = Math.max(0, paidAmount - refundedRupees);
  const fullyRefunded = String(row.payment_status || '') === 'refunded' || remaining <= 0;

  const doRefund = async () => {
    const asked = amount.trim() === '' ? remaining : Number(amount);
    if (!Number.isFinite(asked) || asked <= 0) return setMsg('Enter a refund amount in rupees.');
    if (asked > remaining) return setMsg(`Only ₹${remaining.toLocaleString('en-IN')} is still refundable.`);
    if (!window.confirm(
      `Refund ₹${asked.toLocaleString('en-IN')} to ${row.name || row.email}?\n\n`
      + 'This sends the money back through Razorpay and cannot be undone.',
    )) return;
    setBusy(true);
    const res = await refundRegistration({
      registration_id: row.id,
      amount: amount.trim() === '' ? undefined : asked,
      reason: reason.trim(),
    });
    setBusy(false);
    if (res?.success) {
      setMsg(`Refunded ₹${Math.round((res.refund_amount || 0) / 100).toLocaleString('en-IN')} — ${res.payment_status.replace(/_/g, ' ')}.`);
      setOpen(false); setAmount(''); setReason('');
      onDone?.();
    } else setMsg(res?.error || 'Refund failed.');
  };

  const doSync = async () => {
    setBusy(true);
    const res = await syncRegistrationPayment({ registration_id: row.id });
    setBusy(false);
    if (res?.success) {
      setMsg(`Razorpay says: ${res.razorpay_status || '—'}`
        + (res.amount_refunded ? `, ₹${Math.round(res.amount_refunded / 100).toLocaleString('en-IN')} refunded.` : ', nothing refunded.'));
      onDone?.();
    } else setMsg(res?.error || 'Could not reach Razorpay.');
  };

  return (
    <div className="ww-reg-exp-qa" style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: 12, marginTop: 4 }}>
      <label>Payment</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          Paid ₹{paidAmount.toLocaleString('en-IN')}
          {refundedRupees > 0 && ` · refunded ₹${refundedRupees.toLocaleString('en-IN')}`}
          {!fullyRefunded && refundedRupees > 0 && ` · ₹${remaining.toLocaleString('en-IN')} left`}
        </span>
        <button type="button" className="ww-btn ww-btn-ghost" onClick={doSync} disabled={busy} style={{ padding: '5px 11px', fontSize: 12 }}>
          Check with Razorpay
        </button>
        {!fullyRefunded && (
          <button type="button" className="ww-btn ww-btn-ghost" onClick={() => setOpen((o) => !o)} disabled={busy}
            style={{ padding: '5px 11px', fontSize: 12, color: '#dc2626', borderColor: '#dc2626' }}>
            {open ? 'Cancel' : 'Refund…'}
          </button>
        )}
        {fullyRefunded && (
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>FULLY REFUNDED</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Meeting guest list</span>
        <button type="button" className="ww-btn ww-btn-ghost" onClick={() => setGuest('add')} disabled={busy}
          style={{ padding: '5px 11px', fontSize: 12 }}>
          Add to guest list
        </button>
        <button type="button" className="ww-btn ww-btn-ghost" onClick={() => setGuest('remove')} disabled={busy}
          style={{ padding: '5px 11px', fontSize: 12, color: '#dc2626', borderColor: '#dc2626' }}>
          Remove from guest list
        </button>
      </div>
      {row.refund_notes && (
        <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--text-muted)' }}>{row.refund_notes}</p>
      )}
      {open && (
        <div style={{ display: 'grid', gap: 8, marginTop: 10, maxWidth: 460 }}>
          <input
            value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder={`Amount in ₹ (blank = full ₹${remaining.toLocaleString('en-IN')})`}
            style={{ padding: '8px 11px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface)', color: 'var(--text-main)', fontSize: 13.5 }}
          />
          <input
            value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (kept with the refund, e.g. could not attend)"
            style={{ padding: '8px 11px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface)', color: 'var(--text-main)', fontSize: 13.5 }}
          />
          <button type="button" className="ww-btn ww-btn-primary" onClick={doRefund} disabled={busy} style={{ justifySelf: 'start' }}>
            {busy ? 'Refunding…' : `Refund ₹${(amount.trim() === '' ? remaining : Number(amount) || 0).toLocaleString('en-IN')}`}
          </button>
        </div>
      )}
    </div>
  );
}

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
    // Pass the pk too: slugs collide when two events ever shared a title.
    const regs = await getWebinarRegistrationsFull(eKey, item.id);
    setRows(Array.isArray(regs) ? regs : []);
    setLoading(false);
  }, [eKey, item.id]);

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

      <SourceBreakdown rows={rows} />

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
                // Stored in paise. final_amount is what they actually paid
                // after any coupon; the base amount is only a fallback for
                // rows that predate coupons.
                const amt    = Math.round(parseInt(r.final_amount || r.amount || 0) / 100);
                const discount = Math.round(parseInt(r.discount_amount || 0) / 100);
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
                        {/* On the row itself, not only in the expanded panel:
                            the whole point of a tagged link is being able to
                            see at a glance which one brought someone. */}
                        {r.utm_source && (
                          <span className="ww-badge ww-badge-blue" style={{ marginTop: 4, display: 'inline-block' }}
                            title={[r.utm_medium, r.utm_campaign].filter(Boolean).join(' · ')}>
                            via {r.utm_source}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="ww-reg-role">{r.role || '—'}</span>
                        {r.organization && <span className="ww-reg-sub">{r.organization}</span>}
                      </td>
                      <td><span className="ww-reg-country">{r.country || r.city || '—'}</span></td>
                      <td>
                        {paid ? (
                          <span className={`ww-badge ww-badge-${
                            status === 'paid' ? 'green'
                              : status === 'refunded' ? 'gray'
                              : status === 'partially_refunded' ? 'amber' : 'amber'}`}>
                            {fmtMoney(amt)} · {status.replace(/_/g, ' ')}
                          </span>
                        ) : r.coupon_code && discount > 0 ? (
                          <span className="ww-badge ww-badge-gray" title={`Coupon ${r.coupon_code} covered the full price`}>Free · coupon</span>
                        ) : (
                          <span className="ww-badge ww-badge-gray">Free</span>
                        )}
                        {paid && discount > 0 && (
                          <span className="ww-reg-sub" title={`Coupon ${r.coupon_code || ''}`}>
                            after coupon −₹{discount.toLocaleString('en-IN')}
                          </span>
                        )}
                        {Number(r.refund_amount) > 0 && (
                          <span className="ww-reg-sub" title={r.refund_notes || ''}>
                            refunded ₹{Math.round(Number(r.refund_amount) / 100).toLocaleString('en-IN')}
                          </span>
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
                              {(r.utm_source || r.referrer) && (
                                <div>
                                  <label>Came from</label>
                                  <span>
                                    {r.utm_source || '—'}
                                    {r.utm_medium ? ` · ${r.utm_medium}` : ''}
                                    {r.utm_campaign ? ` · ${r.utm_campaign}` : ''}
                                  </span>
                                </div>
                              )}
                              {r.razorpay_payment_id && <div><label>Payment ID</label><span>{r.razorpay_payment_id}</span></div>}
                              {r.coupon_code && <div><label>Coupon</label><span>{r.coupon_code}{discount > 0 ? ` (−₹${discount.toLocaleString('en-IN')})` : ''}</span></div>}
                              {paid && <div><label>Paid (after coupon)</label><span>₹{amt.toLocaleString('en-IN')}</span></div>}
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
                            {/* Answers to questions added in the Form Questions
                                tab. Stored against the wording used at the time,
                                so a later rename does not relabel an old reply. */}
                            {parseCustomAnswers(r.custom_answers).map(([q, a]) => (
                              <div className="ww-reg-exp-qa" key={q}>
                                <label>{q}</label>
                                <p>{a}</p>
                              </div>
                            ))}
                            {r.razorpay_payment_id && (
                              <RefundPanel row={r} paidAmount={amt} eventKey={eKey} onDone={load} setMsg={setMsg} />
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
  const [sections, setSections] = useState([]);
  const [secModal, setSecModal] = useState(null);   // null | {mode, sec}
  const [secForm, setSecForm]   = useState({ title: '', subtitle: '' });

  const load = useCallback(async (autoSeed = false) => {
    setLoading(true);
    const [data, secs] = await Promise.all([
      getFormQuestions(eKey, eType),
      getFormSections(eKey, eType),
    ]);
    setSections(Array.isArray(secs) ? secs : []);
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

  /* Section handling. The server assigns section numbers and refuses to
     delete the last one, so this only has to ask. */
  const saveSection = async () => {
    const title = secForm.title.trim();
    if (!title) return setMsg('A section needs a title.');
    const res = secModal.mode === 'add'
      ? await createFormSection({ event_key: eKey, event_type: eType, title, subtitle: secForm.subtitle })
      : await updateFormSection(secModal.sec.id, { title, subtitle: secForm.subtitle });
    if (res?.error) return setMsg(res.error);
    setSecModal(null); setMsg(''); load();
  };

  const removeSection = async (sec) => {
    const inIt = questions.filter(q => Number(q.section) === Number(sec.number)).length;
    const warn = inIt
      ? `Delete “${sec.title}”?\n\n${inIt} question${inIt === 1 ? '' : 's'} will move to the first section — nothing is deleted.`
      : `Delete “${sec.title}”?`;
    if (!window.confirm(warn)) return;
    const res = await deleteFormSection(sec.id);
    if (res?.error) return setMsg(res.error);
    setMsg(''); load();
  };

  const moveSection = async (idx, dir) => {
    const next = [...sections];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setSections(next);
    await reorderFormSections(next.map((sec, i) => ({ id: sec.id, order: i })));
    load();
  };

  /* Sections as the admin sees them, with their questions attached. An
     event that has never been edited has no rows of its own, so the server
     describes the three the form has always had; those have no id and can
     only be added to, not renamed, until the first real edit creates them. */
  const grouped = (sections.length ? sections : []).map(sec => ({
    ...sec,
    questions: questions
      .filter(q => Number(q.section || 1) === Number(sec.number))
      .sort((a, b) => (a.order || 0) - (b.order || 0)),
  }));
  // Anything pointing at a section that no longer exists still has to be
  // reachable, so it is shown rather than quietly hidden.
  const orphans = questions.filter(
    q => !sections.some(sec => Number(sec.number) === Number(q.section || 1)));

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
    const payload = {
      ...form, event_key: eKey, event_type: eType,
      section: Number(form.section) || 1,
      // A new question joins the end of the form; an edited one keeps its place.
      ...(modal.mode === 'add' ? { order: questions.length } : {}),
    };
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
    const res = await deleteFormQuestion(id);
    // The server refuses to remove the questions the mail automation depends
    // on; say why rather than appearing to do nothing.
    if (res?.error) return setMsg(res.error);
    setMsg('');
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
          <button className="ww-btn ww-btn-ghost" onClick={() => { setSecForm({ title: '', subtitle: '' }); setSecModal({ mode: 'add' }); }}>
            <Plus size={14} /> Add Step
          </button>
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
        <div className="ww-sec-list">
          {grouped.map((sec, si) => (
            <div key={sec.id ?? `n${sec.number}`} className="ww-sec">
              <div className="ww-sec-head">
                <div>
                  <span className="ww-sec-step">Step {si + 1}</span>
                  <span className="ww-sec-title">{sec.title}</span>
                  {sec.subtitle && <span className="ww-sec-sub">{sec.subtitle}</span>}
                  <span className="ww-sec-count">
                    {sec.questions.length} question{sec.questions.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="ww-q-actions">
                  <button onClick={() => moveSection(si, -1)} disabled={si === 0 || !sec.id} title="Move section up"><ChevronUp size={14}/></button>
                  <button onClick={() => moveSection(si, 1)} disabled={si === grouped.length - 1 || !sec.id} title="Move section down"><ChevronDown size={14}/></button>
                  <button onClick={() => { setSecForm({ title: sec.title, subtitle: sec.subtitle || '' }); setSecModal({ mode: 'edit', sec }); }}
                    disabled={!sec.id} title={sec.id ? 'Rename section' : 'Add a section first to edit these'}><Edit2 size={14}/></button>
                  <button onClick={() => removeSection(sec)} disabled={!sec.id}
                    title="Delete section (its questions move, they are not deleted)"
                    className="ww-btn-danger-icon"><Trash2 size={14}/></button>
                </div>
              </div>

              {sec.questions.length === 0 ? (
                <p className="ww-sec-empty">No questions in this step yet.</p>
              ) : sec.questions.map((q, idx) => (
                <div key={q.id} className="ww-q-card">
                  <div className="ww-q-info">
                    <span className="ww-q-label">
                      {q.label}
                      {q.is_locked && (
                        <span className="ww-badge ww-badge-lock" title="Every confirmation, reminder and certificate is addressed using this answer, so it cannot be removed. You can still reword it or move it to another step.">
                          Permanent
                        </span>
                      )}
                    </span>
                    <span className="ww-q-meta">
                      {FIELD_TYPES.find(f => f.value === q.field_type)?.label || q.field_type}
                      {q.required && <span className="ww-badge ww-badge-red">Required</span>}
                    </span>
                  </div>
                  <div className="ww-q-actions">
                    <button onClick={() => move(questions.indexOf(q), -1)} disabled={idx === 0} title="Move up"><ChevronUp size={14}/></button>
                    <button onClick={() => move(questions.indexOf(q), 1)} disabled={idx === sec.questions.length - 1} title="Move down"><ChevronDown size={14}/></button>
                    <button onClick={() => openEdit(q)} title="Edit"><Edit2 size={14}/></button>
                    <button onClick={() => remove(q.id)} title={q.is_locked ? 'This question cannot be removed' : 'Delete'}
                      disabled={q.is_locked} className="ww-btn-danger-icon"><Trash2 size={14}/></button>
                  </div>
                </div>
              ))}
            </div>
          ))}

          {orphans.length > 0 && (
            <div className="ww-sec">
              <div className="ww-sec-head">
                <div>
                  <span className="ww-sec-title">Not in any step</span>
                  <span className="ww-sec-sub">Edit each one to choose where it is asked.</span>
                </div>
              </div>
              {orphans.map(q => (
                <div key={q.id} className="ww-q-card">
                  <div className="ww-q-info">
                    <span className="ww-q-label">{q.label}</span>
                    <span className="ww-q-meta">{FIELD_TYPES.find(f => f.value === q.field_type)?.label || q.field_type}</span>
                  </div>
                  <div className="ww-q-actions">
                    <button onClick={() => openEdit(q)} title="Edit"><Edit2 size={14}/></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Section modal */}
      {secModal && (
        <div className="ww-inner-overlay" onClick={() => setSecModal(null)}>
          <div className="ww-inner-modal" onClick={e => e.stopPropagation()}>
            <div className="ww-inner-modal-head">
              <h4>{secModal.mode === 'add' ? 'Add Step' : 'Rename Step'}</h4>
              <button onClick={() => setSecModal(null)}><X size={16}/></button>
            </div>
            <div className="ww-inner-modal-body">
              {msg && <p className="ww-err">{msg}</p>}
              <label>Step name <span>*</span>
                <input value={secForm.title} autoFocus
                  onChange={e => setSecForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Your Interests" />
              </label>
              <label>Subtitle <small>(optional)</small>
                <input value={secForm.subtitle}
                  onChange={e => setSecForm(f => ({ ...f, subtitle: e.target.value }))}
                  placeholder="A line of guidance shown under the step name" />
              </label>
            </div>
            <div className="ww-inner-modal-foot">
              <button className="ww-btn ww-btn-ghost" onClick={() => setSecModal(null)}>Cancel</button>
              <button className="ww-btn ww-btn-primary" onClick={saveSection}>Save Step</button>
            </div>
          </div>
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
              <label>Ask this in
                <select value={form.section || 1} onChange={e => setForm(f => ({...f, section: Number(e.target.value)}))}>
                  {(sections.length ? sections : [{ number: 1, title: 'Personal Info' }]).map((sec, i) => (
                    <option key={sec.id ?? sec.number} value={sec.number}>Step {i + 1} · {sec.title}</option>
                  ))}
                </select>
              </label>
              <label className="ww-checkbox-label">
                <input type="checkbox" checked={form.required}
                  disabled={modal.mode === 'edit' && modal.q?.is_locked}
                  onChange={e => setForm(f => ({...f, required: e.target.checked}))} />
                Required field
              </label>
              {modal.mode === 'edit' && modal.q?.is_locked && (
                <p className="ww-tab-hint" style={{ margin: '2px 0 0' }}>
                  This answer addresses every confirmation, reminder and certificate, so it
                  stays required and cannot be removed. Its wording and step are yours to change.
                </p>
              )}
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
  const [speakers, setSpeakers] = useState([]);   // guests of THIS webinar
  const [form, setForm]         = useState(EMPTY_SPEAKER);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState('');
  const [success, setSuccess]   = useState('');
  // A counter, not the message text: two saves with the same outcome must
  // still refresh the list, or the second guest looks like it never saved.
  const [reload, setReload]     = useState(0);
  const [removingId, setRemovingId] = useState(null);
  const fileRef = useRef(null);

  const removeSpeaker = async (s) => {
    if (!window.confirm(`Remove ${s.name} from this ${badge(item.kind).toLowerCase()}?`)) return;
    setRemovingId(s.id);
    const res = await deleteEventSpeaker(s.id);
    setRemovingId(null);
    if (res?.error) setMsg(res.error);
    else setReload(n => n + 1);
  };

  useEffect(() => {
    getEventGuests(item.id).then(r => setSpeakers(Array.isArray(r) ? r : []));
  }, [reload, item.id]);

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
    const res = await createEventSpeaker({ ...form, event: item.id });
    if (res?.id) {
      setSuccess(res.published
        ? `Speaker "${res.name}" added — live on the website guest section.`
        : `Speaker "${res.name}" added to this ${badge(item.kind).toLowerCase()} — they go live on the website automatically after it ends.`);
      setForm(EMPTY_SPEAKER);
      setReload(n => n + 1);
    } else {
      // Show what the server actually said, not a generic shrug.
      const detail = typeof res === 'object' && res
        ? (res.error || Object.entries(res).map(([k, v]) => `${k}: ${v}`).join(' · '))
        : '';
      setMsg(detail || 'Failed to save speaker.');
    }
    setSaving(false);
  };

  return (
    <div className="ww-tab-body">
      <p className="ww-tab-hint">
        Add one or more guests for this {badge(item.kind).toLowerCase()}.
        They join the guest list right away, and appear on the website&apos;s guest
        section automatically once the {badge(item.kind).toLowerCase()} ends.
      </p>

      {/* Speakers are managed HERE — the listing has no separate host field. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 14px', padding: '9px 12px',
        background: 'var(--accent-soft, #fff7ed)', border: '1px solid var(--rule, #eadfce)', borderRadius: 10, fontSize: 12.5 }}>
        <Mic2 size={14} />
        <span>This is the one place for speakers — add as many as the {badge(item.kind).toLowerCase()} has.
        <strong> All of them appear together on the website listing</strong>, with equal standing.</span>
      </div>

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

      {/* This webinar's speakers */}
      {speakers.length > 0 && (
        <div className="ww-speakers-recent">
          <h4>Speakers of this {badge(item.kind).toLowerCase()} ({speakers.length})</h4>
          <div className="ww-speakers-grid">
            {speakers.map(s => (
              <div key={s.id} className="ww-speaker-chip" style={{ position: 'relative' }}>
                {s.photo_url
                  ? <img src={s.photo_url} alt={s.name} />
                  : <div className="ww-speaker-initials">{s.name?.[0]}</div>
                }
                <div>
                  <strong>{s.name}</strong>
                  <span>{s.role}</span>
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 600,
                    color: s.published ? '#059669' : '#b45309' }}>
                    {s.published ? '● Live on website' : '○ Goes live after it ends'}
                  </span>
                </div>
                <button type="button" title={`Remove ${s.name}`} onClick={() => removeSpeaker(s)}
                  disabled={removingId === s.id}
                  style={{ position: 'absolute', top: 6, right: 6, background: 'none', border: 'none',
                    cursor: 'pointer', color: 'var(--text-muted, #8a8aa0)', padding: 2, lineHeight: 0 }}>
                  <X size={13}/>
                </button>
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
  const [start, setStart]         = useState(listingStartLocal(item));
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

  /* Anyone who paid before this meeting was generated was never invited —
     there was no calendar event to invite them to. This invites whoever is
     still missing; it is safe to press repeatedly, since adding somebody who
     is already on the list does nothing. */
  const syncPaidGuests = async () => {
    setBusy(true);
    const res = await manageMeetingGuest({ event_pk: item.id, action: 'sync', notify: false });
    setBusy(false);
    if (res?.status === 'ok') {
      showToast?.(res.added
        ? `${res.added} paid registrant${res.added === 1 ? '' : 's'} added to the guest list.`
        : 'Every paid registrant is already on the guest list.', 'success');
      loadGuests();
    } else showToast?.(res?.error || 'Could not sync the guest list.', 'error');
  };

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
          <label style={F.field}>Date &amp; time
            <input type="datetime-local" style={F.input} value={start} onChange={(e) => setStart(e.target.value)} />
            {!item.meeting_start && start && (
              <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--soft, #8a8aa0)' }}>
                Auto-filled from the listing ({item.date}{item.time_tz ? ` · ${item.time_tz}` : ''}) — check before generating.
              </span>
            )}
          </label>
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
            <button className="ww-btn ww-btn-ghost" onClick={syncPaidGuests} disabled={busy}
              title="Invite any paid registrant who is not on the list yet"
              style={{ padding: '4px 10px', fontSize: 12 }}>
              Sync paid registrants
            </button>
            <button className="ww-btn ww-btn-ghost" onClick={loadGuests} title="Refresh" style={{ padding: '4px 10px' }}>↺</button>
          </div>
          {(guestInfo.attendees || []).length === 0 ? (
            <p className="ww-tab-hint" style={{ margin: 0 }}>
              No guests yet. Hosts appear here after generating, and paid registrants are added when they pay.
              Anyone who paid before this meeting was generated can be swept in with “Sync paid registrants”.
            </p>
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
  // The event's own Meet link, so mails carry the real link without pasting.
  // Follows the record: generating (or regenerating) the link on the Meeting
  // tab updates this without needing a page reload.
  const [joinLink, setJoinLink]   = useState(item.meeting_link || '');
  useEffect(() => { setJoinLink(item.meeting_link || ''); }, [item.meeting_link]);
  useEffect(() => { setTimeStr(item.time_tz || ''); }, [item.time_tz]);
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
  const [showCertMap, setShowCertMap] = useState(true);   // matching visible by default (parity with Mail Automation)

  // Extra file attachments (PDFs / docs) — the same set is sent to every recipient.
  const [attachFiles, setAttachFiles] = useState([]);     // [{ url, filename, bytes }]
  const [uploadingFile, setUploadingFile] = useState(false);
  const attachInputRef = useRef(null);
  const fmtSize = (n) => { n = Number(n) || 0; return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`; };
  const totalAttachBytes = attachFiles.reduce((s, f) => s + (Number(f.bytes) || 0), 0);

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
      let vars = (tpl?.variables || []).filter((v) => !v.generator_enabled);
      if (!vars.length) {
        // Fall back to variables actually PLACED on the design ({{token}} in text
        // elements) — the same detection Mail Automation uses — so the matching
        // table shows even when a template has no separately-declared variables.
        vars = variableNamesFromElements(tpl?.text_elements || []).map((name) => ({ name }));
      }
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
      getWebinarRegistrationsFull(eKey, item.id).catch(() => []),
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
  // A free session has no payment step, so those registrants count as paid —
  // otherwise every registrant of a free webinar looks unpaid. Mirrors
  // _has_paid() on the server, which is what actually filters the send.
  const hasPaid  = (r) => (!Number(r.payment_required) ? true : String(r.payment_status || '').toLowerCase() === 'paid');
  const paid     = rows.filter(hasPaid).length;
  const unpaid   = total - paid;
  const audienceCount = { attended, not_attended: noShow, paid, unpaid }[audience] ?? total;

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

  const pickAttachments = async (e) => {
    const files = Array.from(e.target.files || []);
    if (e.target) e.target.value = '';
    if (!files.length) return;
    setUploadingFile(true);
    for (const f of files) {
      const res = await uploadFile(f).catch(() => ({ error: 'Upload failed' }));
      if (res && res.url) {
        setAttachFiles(prev => [...prev, { url: res.url, filename: res.filename || f.name, bytes: res.bytes || f.size }]);
      } else {
        showToast?.(res?.error || `Could not upload ${f.name}`, 'error');
      }
    }
    setUploadingFile(false);
  };
  const removeAttachment = (idx) => setAttachFiles(prev => prev.filter((_, i) => i !== idx));
  const attachmentsPayload = () => attachFiles.map(f => ({ url: f.url, filename: f.filename }));

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
      attachments: attachmentsPayload(),
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
      attachments: attachmentsPayload(),
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
            {[
              ['all', 'Everyone', total],
              ['paid', 'Paid only', paid],
              ['unpaid', 'Not paid yet', unpaid],
              ['attended', 'Attended only', attended],
              ['not_attended', 'Did not attend', noShow],
            ].map(([v, l, n]) => (
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
            {item.meeting_link && joinLink === item.meeting_link && (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#059669' }}>✓ Auto-filled from this event&apos;s Meet link</span>
            )}
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

        {/* file attachments (PDFs / docs) — same set to every recipient */}
        <div style={{ borderTop: '1px solid #f0f0f5', paddingTop: 14, marginTop: 4 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>📎 Attach files (PDF / documents)</div>
          <p className="ww-tab-hint" style={{ margin: '4px 0 8px' }}>
            The same file(s) go to every recipient — mix and match freely with the certificate below.
          </p>
          {attachFiles.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              {attachFiles.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '7px 11px', border: '1px solid var(--rule, #e6e6ef)', borderRadius: 8, fontSize: 13 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📄 {f.filename}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <span style={{ color: 'var(--soft, #8a8aa0)', fontSize: 12 }}>{fmtSize(f.bytes)}</span>
                    <button type="button" className="ww-btn-danger-sm" onClick={() => removeAttachment(i)}>Remove</button>
                  </span>
                </div>
              ))}
              <div style={{ fontSize: 12, color: totalAttachBytes > 20 * 1048576 ? '#dc2626' : 'var(--soft, #8a8aa0)' }}>
                Total: {fmtSize(totalAttachBytes)}{totalAttachBytes > 20 * 1048576 ? ' — over the ~20 MB email limit; some files may be dropped' : ''}
              </div>
            </div>
          )}
          <input ref={attachInputRef} type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,image/*" style={{ display: 'none' }} onChange={pickAttachments} />
          <button type="button" className="ww-btn ww-btn-ghost" onClick={() => attachInputRef.current?.click()} disabled={uploadingFile}>
            <Upload size={14} /> {uploadingFile ? 'Uploading…' : (attachFiles.length ? 'Add more files' : 'Add files')}
          </button>
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
  const [caps, setCaps] = useState(null);          // null = loading; array of capability keys
  const can = (c) => Array.isArray(caps) && caps.includes(c);
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
    const list = Array.isArray(res) ? res : [];
    setItems(list);
    // Re-point the open detail pane at its refreshed row. Without this the
    // pane keeps the snapshot it opened with, so a saved edit (or a Meet link
    // generated on another tab) is invisible until the page is reloaded.
    setSelected((s) => {
      if (!s?.item?.id) return s;
      const fresh = list.find((i) => i.id === s.item.id);
      return fresh ? { ...s, item: fresh } : s;
    });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { getWebinarMyAccess().then(r => setCaps(r?.capabilities || [])); }, []);

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

      {/* Listing header + filters: only in list view — hidden while managing one item */}
      {!selected && (
      <>
      {/* Page header */}
      <div className="ww-page-header">
        <div>
          <h2>Webinars &amp; Workshops</h2>
          <p>Manage listings, registration forms, speakers, and certificate distribution.</p>
        </div>
        {can('edit_event') && (
          <button className="ww-btn ww-btn-primary" onClick={openCreate}>
            <Plus size={15}/> New
          </button>
        )}
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
      </>
      )}

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
      <div className={`ww-layout ${selected ? 'is-detail' : ''}`}>
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
                {item.cover_url
                  ? <img src={item.cover_url} alt="" className="ww-card-cover" />
                  : (
                    <div className="ww-card-cover-ph">
                      {item.kind === 'webinar' ? <Video size={22}/> : <Mic2 size={22}/>}
                      <b>{(item.title || '?').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()}</b>
                    </div>
                  )}
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
                {can('edit_event') && (
                  <div className="ww-card-actions" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEdit(item)} title="Edit details"><Edit2 size={14}/></button>
                    <button onClick={() => setDeleteTarget(item)} title="Delete" className="ww-btn-danger-icon">
                      <Trash2 size={14}/>
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Right: detail panel */}
        {selected ? (
          <div className="ww-detail">
            <div className="ww-detail-head">
              <div>
                <button className="ww-back-btn" onClick={() => setSelected(null)} title="Back to list">
                  <ArrowLeft size={16}/> Back to list
                </button>
                <h3>{selected.item.title}</h3>
                <span className={`ww-badge ${selected.item.kind === 'webinar' ? 'ww-badge-blue' : 'ww-badge-purple'}`}>
                  {badge(selected.item.kind)}
                </span>
              </div>
              <button onClick={() => setSelected(null)} title="Close"><X size={18}/></button>
            </div>

            <div className="ww-tabs">
              {/* Past events don't need the registration form or a meeting link;
                  keep Registrations for attendance + certificate distribution. */}
              {TABS.filter(tab => (tab.key === 'details' || can(TAB_CAP[tab.key]))
                && !(selected.item.status === 'past' && (tab.key === 'questions' || tab.key === 'meeting'))).map(tab => {
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

            {/* Keyed on the event id: every tab seeds its form state from the
                item on mount, so without this React reuses the previous
                webinar's state and fields look empty (or stale) after
                switching events or saving. */}
            <div className="ww-tab-content">
              {activeTab === 'details'       && <DetailsTab key={selected.item.id} item={selected.item} onSaved={load} showToast={showToast} canEdit={can('edit_event')} onManageGuests={() => setActiveTab('speaker')} />}
              {activeTab === 'questions'     && <FormQuestionsTab key={selected.item.id} item={selected.item} />}
              {activeTab === 'registrations' && <RegistrationsTab key={selected.item.id} item={selected.item} />}
              {activeTab === 'meeting'       && <MeetingTab key={selected.item.id} item={selected.item} showToast={showToast} />}
              {activeTab === 'emails'        && <EmailsTab key={selected.item.id} item={selected.item} showToast={showToast} />}
              {activeTab === 'speaker'       && <GuestSpeakerTab key={selected.item.id} item={selected.item} />}
              {activeTab === 'analytics'     && <AnalyticsTab key={selected.item.id} item={selected.item} />}
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
                  <div className="ww-field-label">Speakers</div>
                  <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>
                    Added after saving, in the <strong>Guest Speaker</strong> tab — one or many,
                    all shown together on the website listing.
                  </p>
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
const qrUrl = (id, size, download) => webinarRegistrationQrUrl(id, size, download);

/* Channels worth their own link out of the box. `medium` follows the usual
   convention so the numbers stay comparable with anything else you measure:
   social for a post, chat for a message someone forwards. */
const SHARE_CHANNELS = [
  { key: 'whatsapp',  label: 'WhatsApp',  medium: 'chat' },
  { key: 'instagram', label: 'Instagram', medium: 'social' },
  { key: 'linkedin',  label: 'LinkedIn',  medium: 'social' },
  { key: 'x',         label: 'X',         medium: 'social' },
  { key: 'telegram',  label: 'Telegram',  medium: 'chat' },
  { key: 'email',     label: 'Email',     medium: 'email' },
  { key: 'poster',    label: 'Poster QR', medium: 'print' },
];

const utmSlug = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function buildUtmUrl(base, { source, medium, campaign, content }) {
  if (!base) return '';
  const url = new URL(base, 'https://www.tiesverse.com');
  // Set rather than append: rebuilding a link that already had tags should
  // replace them, not stack a second copy.
  if (source) url.searchParams.set('utm_source', utmSlug(source));
  if (medium) url.searchParams.set('utm_medium', utmSlug(medium));
  if (campaign) url.searchParams.set('utm_campaign', utmSlug(campaign));
  if (content) url.searchParams.set('utm_content', utmSlug(content));
  return url.toString();
}

/**
 * Share links that say where a registration came from.
 *
 * Each channel gets the registration URL with campaign tags attached; the site
 * records them on arrival and stores them with the registration, so the
 * Registrations tab can total them by source. Custom channels cover anything
 * not listed (a newsletter, a partner, a specific person's story).
 */
function SharePanel({ item, baseUrl }) {
  const defaultCampaign = utmSlug(item.title || '').slice(0, 60);
  const [campaign, setCampaign] = useState(defaultCampaign);
  const [custom, setCustom] = useState('');
  const [extras, setExtras] = useState([]);          // custom source names
  const [copied, setCopied] = useState('');
  const [open, setOpen] = useState(false);

  const channels = [
    ...SHARE_CHANNELS,
    ...extras.map((e) => ({ key: e, label: e, medium: 'referral', custom: true })),
  ];

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(''), 1600);
    } catch { /* clipboard blocked */ }
  };

  const addCustom = () => {
    const name = utmSlug(custom);
    if (!name) return;
    if (!extras.includes(name) && !SHARE_CHANNELS.some((c) => c.key === name)) {
      setExtras((x) => [...x, name]);
    }
    setCustom('');
  };

  const plain = buildUtmUrl(baseUrl, {});

  return (
    <div style={{ marginTop: 18 }}>
      <div className="ww-field-label" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span>Share links</span>
        <button type="button" className="ww-btn ww-btn-ghost" style={{ padding: '3px 10px', fontSize: 11.5 }}
          onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : 'Show'}
        </button>
      </div>
      <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Copy a channel's link and post it there. Registrations that arrive through it are
        counted against that channel in the Registrations tab.
      </p>

      {open && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Campaign name</label>
            <input value={campaign} onChange={(e) => setCampaign(e.target.value)}
              placeholder="e.g. water-war-and-words"
              style={{ flex: 1, minWidth: 220, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface)', color: 'var(--text-main)', fontSize: 13 }} />
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            {channels.map((c) => {
              const url = buildUtmUrl(baseUrl, { source: c.key, medium: c.medium, campaign });
              return (
                <div key={c.key} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
                  border: '1px solid var(--outline-variant)', borderRadius: 9, padding: '7px 10px', background: 'var(--surface)' }}>
                  <strong style={{ fontSize: 12.5, minWidth: 88, color: 'var(--text-main)' }}>{c.label}</strong>
                  <span style={{ flex: 1, minWidth: 200, fontSize: 11.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</span>
                  <button type="button" className="ww-btn ww-btn-ghost" style={{ padding: '4px 11px', fontSize: 11.5 }}
                    onClick={() => copy(url, c.key)}>
                    {copied === c.key ? 'Copied' : 'Copy'}
                  </button>
                  {c.custom && (
                    <button type="button" className="ww-btn-danger-sm" title="Remove"
                      onClick={() => setExtras((x) => x.filter((e) => e !== c.key))}>×</button>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <input value={custom} onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
              placeholder="Add your own source (newsletter, a partner, a person…)"
              style={{ flex: 1, minWidth: 240, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface)', color: 'var(--text-main)', fontSize: 13 }} />
            <button type="button" className="ww-btn ww-btn-ghost" onClick={addCustom} style={{ padding: '6px 14px', fontSize: 12.5 }}>Add</button>
            <button type="button" className="ww-btn ww-btn-ghost" onClick={() => copy(plain, 'plain')} style={{ padding: '6px 14px', fontSize: 12.5 }}>
              {copied === 'plain' ? 'Copied' : 'Copy plain link'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function DetailsTab({ item, onSaved, showToast, onManageGuests, canEdit = true }) {
  const [form, setForm]                     = useState({ ...item });
  const [saving, setSaving]                 = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [guests, setGuests]                 = useState([]);   // this event's speakers
  const coverRef = useRef(null);

  useEffect(() => {
    getEventGuests(item.id).then(r => setGuests(Array.isArray(r) ? r : []));
  }, [item.id]);

  // Read the typed date/time exactly as the server will. Deliberately ignores
  // meeting_start: a saved start would mask a typo in the field being edited.
  const parsedStart = (() => {
    const d = parseListingDate(form.date);
    const t = parseListingTime(form.time_tz);
    if (!d || !t) return '';
    const dt = new Date(d.y, d.mo, d.d, t.h, t.min);
    if (isNaN(dt.getTime())) return '';
    return dt.toLocaleString('en-IN', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  })();

  // An uploaded cover only reaches the database on Save. Warn before the tab
  // closes so a picture that looks attached is never quietly thrown away.
  const dirty = JSON.stringify({ ...item, ...form }) !== JSON.stringify({ ...item });
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = async () => {
    setSaving(true);
    const res = await updateEventRegistration(item.id, { ...form, price: Number(form.price) || 0 });
    if (res?.id || res?.title) { showToast('Saved.'); onSaved(); }
    else showToast(res?.error || 'Save failed — nothing was changed. Please try again.', 'error');
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

  return (
    <div className="ww-tab-body">
      {/* One disabled fieldset makes the whole form read-only for members who
          only have 'view': every control inside inherits it, so nothing can be
          typed into a form whose save would be refused by the server anyway. */}
      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
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
          <input value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} placeholder="e.g. 27 August 2026" />
        </label>
        <label>Time (timezone)
          <input value={form.time_tz} onChange={e => setForm(f => ({...f, time_tz: e.target.value}))} placeholder="e.g. 11:00 AM IST" />
        </label>
      </div>
      {/* These two fields drive the Meet link, the website listing and every
          reminder mail, so show what the server will actually read from them
          rather than letting a typo surface as a missing meeting later. */}
      <p style={{ margin: '-6px 0 12px', fontSize: 12.5, color: parsedStart ? 'var(--text-muted)' : '#b45309' }}>
        {parsedStart
          ? <>Reads as <strong>{parsedStart}</strong>. Saving a new date moves the Google Meet and emails everyone who has paid.</>
          : <>Date or time not understood yet — the meeting and reminders need both, e.g. “27 August 2026” and “11:00 AM IST”.</>}
      </p>
      <div className="ww-two-col">
        {/* Speakers come from the Guest Speaker tab — one place, any number. */}
        <div>
          <div className="ww-field-label">Speakers</div>
          {guests.length === 0 ? (
            <p style={{ margin: '4px 0 6px', fontSize: 12.5, color: 'var(--text-muted)' }}>
              None yet — add one or more in the Guest Speaker tab.
              They all appear together on the website listing.
            </p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '4px 0 6px' }}>
              {guests.map(g => (
                <span key={g.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px 4px 4px', border: '1px solid var(--rule, #eadfce)', borderRadius: 999, fontSize: 12.5 }}>
                  {g.photo_url
                    ? <img src={g.photo_url} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }}/>
                    : <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-soft, #fff7ed)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Mic2 size={11}/></span>}
                  <strong>{g.name}</strong>
                  <span style={{ color: 'var(--text-muted)' }}>{g.role}</span>
                </span>
              ))}
            </div>
          )}
          <button type="button" className="ww-btn ww-btn-ghost ww-btn-sm" onClick={onManageGuests}>
            <Mic2 size={12}/> {guests.length ? 'Manage speakers' : 'Add speakers'} →
          </button>
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

      <SharePanel item={item} baseUrl={item.register_url || previewUrl(item.kind, item.title)} />

      {/* QR for the registration link — for posters, slides and print. The
          image is generated server-side so the download is print-resolution
          rather than an upscaled screen canvas. */}
      <div className="ww-field-label" style={{marginBottom: 6, marginTop: 18}}>Registration QR</div>
      <div style={{display:'flex', gap:16, alignItems:'flex-start', flexWrap:'wrap'}}>
        <img
          src={qrUrl(item.id, 6)}
          alt="QR code for the registration link"
          width={132}
          height={132}
          style={{
            borderRadius:10, border:'1px solid var(--outline-variant)',
            background:'#fff', padding:6, flex:'none',
          }}
        />
        <div style={{minWidth:200, flex:1}}>
          <p style={{margin:'0 0 10px', fontSize:12.5, color:'var(--text-muted)', lineHeight:1.5}}>
            Scanning this opens the registration page. Download it at print size
            for posters, or copy the link above for anything digital.
          </p>
          <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
            <a
              className="ww-btn ww-btn-ghost"
              href={qrUrl(item.id, 20, true)}
              style={{textDecoration:'none'}}
            >
              <Download size={14}/> Download PNG
            </a>
            <button
              type="button"
              className="ww-btn ww-btn-ghost"
              onClick={() => window.open(qrUrl(item.id, 20), '_blank', 'noopener')}
            >
              Open full size
            </button>
          </div>
        </div>
      </div>

      </fieldset>
      {canEdit ? (
        <button className="ww-btn ww-btn-primary" onClick={save} disabled={saving || uploadingCover} style={{marginTop: '8px'}}>
          <Save size={14}/> {saving ? 'Saving…' : 'Save Changes'}
        </button>
      ) : (
        <p style={{marginTop: 10, fontSize: 12.5, color: 'var(--text-muted)'}}>
          You have read-only access to this portal. Ask a team lead or an admin to make changes.
        </p>
      )}
    </div>
  );
}

export default WebinarsWorkshops;
