import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getOnboardingList, getHRDepartments, verifyOnboarding, addTeamMember, issueCertificate, sendCertificateEmail, getEmailTemplates, fetchDocBlobUrl, viewDoc, getWorkSessions } from '../../apiClient';
import GenerateCertModal from './GenerateCertModal';
import { previewTemplate } from '../../lib/emailPreview';
import { usePermissions } from '../../context/PermissionContext';
import {
    Users, Plus, Search, Edit2, X, CheckCircle, Building2,
    Mail, Calendar, Briefcase, Phone, FileText, RefreshCw,
    ChevronRight, Award, Shield, BookOpen, ScrollText,
    Clock, AlertCircle, Crown, ExternalLink, UserCheck, Download,
} from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────────────

// Shared role set — the "Role / Access" (portal_role) and "Member Type" dropdowns
// use the SAME values. ROLE_OPTIONS pairs the portal_role machine value with its label.
const ROLE_OPTIONS = [
    ['member',      'Member'],
    ['intern',      'Intern'],
    ['team_lead',   'Team Lead'],
    ['advisory',    'Advisory'],
    ['hr',          'HR'],
    ['admin',       'Admin'],
    ['contractual', 'Contractual'],
];
const MEMBER_TYPES = ROLE_OPTIONS.map(([, label]) => label);

// Full-access role — grants Django is_superuser. Only offered to existing Super
// Users (the backend rejects the change otherwise), so it lives outside ROLE_OPTIONS.
const SUPERUSER_OPTION = ['superuser', 'Super User'];

const TYPE_STYLE = {
    'Member':      { bg: 'color-mix(in srgb, var(--primary) 10%, transparent)', color: 'var(--primary)' },
    'Intern':      { bg: 'color-mix(in srgb, #0ea5e9 10%, transparent)',         color: '#0ea5e9' },
    'Team Lead':   { bg: 'color-mix(in srgb, #067a50 10%, transparent)',         color: '#067a50' },
    'Advisory':    { bg: 'color-mix(in srgb, #ec4899 10%, transparent)',         color: '#ec4899' },
    'HR':          { bg: 'color-mix(in srgb, #8a5700 10%, transparent)',         color: '#8a5700' },
    'Admin':       { bg: 'color-mix(in srgb, #e11d48 10%, transparent)',         color: '#e11d48' },
    'Contractual': { bg: 'color-mix(in srgb, #9333ea 10%, transparent)',         color: '#9333ea' },
};

const CERTS = [
    { key: 'internship_cert', label: 'Internship Certificate', short: 'IC',  icon: Award },
    { key: 'lor',             label: 'Letter of Recommendation', short: 'LOR', icon: ScrollText },
    { key: 'noc',             label: 'No Objection Certificate', short: 'NOC', icon: Shield },
];

const AVATAR_COLORS = ['#fe7a00','#f59e0b','#f97316','#0ea5e9','#10b981','#ec4899','#e11d48','#14b8a6','#ef4444'];

// ── Helpers ────────────────────────────────────────────────────────────────────

function initials(name) {
    return (name || '?').split(/\s+/).map(w => w[0] || '').join('').toUpperCase().slice(0, 2) || '?';
}
function avatarColor(name) {
    let h = 0;
    for (const c of (name || '?')) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function parseMeta(hr_notes) {
    try { const p = JSON.parse(hr_notes || '{}'); if (typeof p === 'object' && p) return p; } catch {}
    return { notes: hr_notes || '' };
}
function serializeMeta(meta) { return JSON.stringify(meta); }
function fmtDate(iso) {
    if (!iso) return null;
    try { return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return null; }
}

// ── Photo Avatar (loads with JWT, falls back to initials) ──────────────────────

function PhotoAvatar({ member, size = 44, textSize = '0.9375rem' }) {
    const [imgUrl, setImgUrl] = useState(member.avatar_url || null);
    const color = avatarColor(member.candidate_name);
    const mounted = useRef(true);

    useEffect(() => {
        // Prefer the member's profile picture (public Cloudinary URL, set in Profile).
        if (member.avatar_url) { setImgUrl(member.avatar_url); return; }
        mounted.current = true;
        if (!member.has_photo) return;
        // Fallback: the authenticated onboarding photo endpoint (returns the image).
        fetchDocBlobUrl(`/api/career/onboarding/${member.id}/doc/photo/`)
            .then(url => { if (mounted.current && url) setImgUrl(url); });
        return () => { mounted.current = false; };
    }, [member.id, member.has_photo, member.avatar_url]);

    // Only revoke blob: URLs we created (never the public avatar_url).
    useEffect(() => () => { if (imgUrl && imgUrl.startsWith('blob:')) URL.revokeObjectURL(imgUrl); }, [imgUrl]);

    if (imgUrl) return (
        <img src={imgUrl} alt={member.candidate_name} style={{
            width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0,
            border: `2px solid color-mix(in srgb, ${color} 35%, transparent)`,
        }} />
    );
    return (
        <div style={{
            width: size, height: size, borderRadius: '50%', flexShrink: 0,
            background: `color-mix(in srgb, ${color} 16%, var(--surface-container-low))`,
            border: `2px solid color-mix(in srgb, ${color} 28%, transparent)`,
            display: 'grid', placeItems: 'center',
            fontSize: textSize, fontWeight: 800, color, fontFamily: 'Hanken Grotesk, sans-serif',
        }}>
            {initials(member.candidate_name)}
        </div>
    );
}

// ── Shared field style ─────────────────────────────────────────────────────────

const F = {
    width: '100%', padding: '10px 13px', borderRadius: 8,
    background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)',
    color: 'var(--text-main)', fontSize: '0.875rem', fontFamily: 'inherit',
    boxSizing: 'border-box', outline: 'none',
};
const Lbl = ({ children }) => (
    <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>
        {children}
    </label>
);

// ── Cert status icons for the row ──────────────────────────────────────────────

function CertDots({ certs }) {
    return (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {CERTS.map(c => {
                const issued = !!certs[c.key];
                return (
                    <span key={c.key} title={`${c.label}: ${issued ? 'Issued' : 'Not issued'}`} style={{
                        fontSize: '0.5625rem', fontWeight: 700, padding: '2px 5px', borderRadius: 4,
                        background: issued ? 'color-mix(in srgb, #067a50 10%, transparent)' : 'color-mix(in srgb, var(--text-muted) 8%, transparent)',
                        color: issued ? '#067a50' : 'var(--text-muted)',
                        border: `1px solid ${issued ? 'color-mix(in srgb, #067a50 20%, transparent)' : 'var(--outline-variant)'}`,
                    }}>{c.short}</span>
                );
            })}
        </div>
    );
}

// ── Member Row ─────────────────────────────────────────────────────────────────

function MemberRow({ member, onClick, isLast }) {
    const meta = parseMeta(member.hr_notes);
    const certs = meta.certs || {};
    const typeStyle = TYPE_STYLE[meta.type] || {};
    const joinDate = fmtDate(meta.joining_date || member.verified_at);
    const [hovered, setHovered] = useState(false);

    return (
        <div
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
                borderBottom: isLast ? 'none' : '1px solid var(--outline-variant)',
                cursor: 'pointer', transition: 'background 140ms ease',
                background: hovered ? 'color-mix(in srgb, var(--primary) 4%, var(--surface-container-lowest))' : 'transparent',
            }}
        >
            {/* Photo / Avatar */}
            <PhotoAvatar member={member} size={42} textSize="0.875rem" />

            {/* Name + role */}
            <div style={{ minWidth: 0, flex: '1 1 160px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-main)', fontFamily: 'Hanken Grotesk, sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>
                        {member.candidate_name}
                    </span>
                    {meta.type && (
                        <span style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, ...typeStyle }}>
                            {meta.type}
                        </span>
                    )}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {member.role_offered || '—'}
                </div>
            </div>

            {/* Dept chips */}
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flex: '0 1 auto', minWidth: 0 }}>
                {(member.assigned_departments || []).map(d => (
                    <span key={d} style={{ fontSize: '0.5625rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'color-mix(in srgb, var(--primary) 7%, transparent)', color: 'var(--primary)', border: '1px solid color-mix(in srgb, var(--primary) 15%, transparent)', whiteSpace: 'nowrap' }}>
                        {d}
                    </span>
                ))}
            </div>

            {/* Email */}
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flex: '1 1 180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                {member.candidate_email}
            </div>

            {/* Join date */}
            {joinDate && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Calendar size={11} /> {joinDate}
                </div>
            )}

            {/* Cert dots */}
            <CertDots certs={certs} />

            {/* Chevron */}
            <ChevronRight size={15} style={{ color: 'var(--text-muted)', flexShrink: 0, opacity: hovered ? 1 : 0.4, transition: 'opacity 140ms ease' }} />
        </div>
    );
}

// ── Profile Modal ──────────────────────────────────────────────────────────────

function ProfileModal({ member, departments, onClose, onUpdated, onEdit }) {
    const meta = parseMeta(member.hr_notes);
    // Prefer the structured cert fields; fall back to legacy hr_notes meta.
    const [certs, setCerts] = useState(() => ({
        internship_cert: member.cert_internship_issued_at || meta.certs?.internship_cert || null,
        lor: member.cert_lor_issued_at || meta.certs?.lor || null,
        noc: member.cert_noc_issued_at || meta.certs?.noc || null,
    }));
    const [certSaving, setCertSaving] = useState(null);
    const [certMsg, setCertMsg] = useState(null);
    const [sendModal, setSendModal] = useState(null);   // { cert } to generate & email
    const [offerModal, setOfferModal] = useState(false); // issue offer letter

    // ── Working hours: all-history per-day log (scoped server-side to who may see it) ──
    const [worklog, setWorklog] = useState(null);   // null = loading
    const [showHistory, setShowHistory] = useState(false);   // full-detail history modal
    useEffect(() => {
        let alive = true;
        getWorkSessions({ member: member.id })
            .then((res) => { if (alive) setWorklog(res || { sessions: [], daily: [] }); })
            .catch(() => { if (alive) setWorklog({ sessions: [], daily: [] }); });
        return () => { alive = false; };
    }, [member.id]);

    // Build per-day rows: { date, minutes, items:[{title, note}] }. Uses the locked
    // finalized breakdown when present, else the day's raw sessions. No timings shown.
    const workDays = useMemo(() => {
        if (!worklog) return null;
        const daily = worklog.daily || [];
        const sessions = worklog.sessions || [];
        const days = {};
        daily.forEach((d) => {
            days[d.date] = {
                date: d.date, minutes: d.minutes || 0, finalized: !!d.finalized,
                items: (d.tasks || []).map((t) => ({ title: t.title || t.custom_task || 'Work', note: t.note || '' })),
            };
        });
        sessions.forEach((s) => {
            const day = days[s.date] || (days[s.date] = { date: s.date, minutes: 0, finalized: false, items: [] });
            if (day.finalized) return;                 // finalized days already have their task breakdown
            day.items.push({ title: s.task_title || s.custom_task || 'Work', note: s.note || '' });
        });
        return Object.values(days).sort((a, b) => (a.date < b.date ? 1 : -1));
    }, [worklog]);

    const totalMinutes = (workDays || []).reduce((sum, d) => sum + (d.minutes || 0), 0);
    const fmtHM = (m) => {
        const h = Math.floor(m / 60), mm = m % 60;
        return h ? (mm ? `${h}h ${mm}m` : `${h}h`) : `${mm}m`;
    };

    // Download the full work history as a CSV: one line per work item (Date, Hours,
    // Task, Details). Handles quoting for commas/newlines in the notes.
    const downloadHistory = () => {
        const rows = [['Date', 'Hours', 'Task', 'Details']];
        (workDays || []).forEach((d) => {
            if (d.items.length) {
                d.items.forEach((it, i) => rows.push([
                    i === 0 ? fmtDate(d.date) : '',
                    i === 0 ? fmtHM(d.minutes) : '',
                    it.title || '', it.note || '',
                ]));
            } else {
                rows.push([fmtDate(d.date), fmtHM(d.minutes), '', '']);
            }
        });
        const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
        const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `work-history-${(member.candidate_name || 'member').replace(/\s+/g, '-')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Check localStorage for offer status
    const offerSentMap = (() => {
        try { return JSON.parse(localStorage.getItem('tv_offers_sent') || '{}'); } catch { return {}; }
    })();
    const offerSent = offerSentMap[member.candidate_email];

    const joinDate = fmtDate(meta.joining_date || member.verified_at);

    const toggleCert = async (key) => {
        const isIssuing = !certs[key];
        setCertSaving(key);
        setCertMsg(null);
        // Marks the certificate (structured field + audit log). Emailing is a
        // separate, explicit step via the "Send" button so HR can choose the
        // template and attach a PDF.
        const res = await issueCertificate(member.id, {
            cert_key: key, action: isIssuing ? 'issue' : 'revoke', send_email: false,
        });
        if (res?.id) {
            setCerts(c => ({ ...c, [key]: isIssuing ? new Date().toISOString() : null }));
            onUpdated(res);
        } else {
            setCertMsg(res?.error || 'Could not update certificate');
            setTimeout(() => setCertMsg(null), 4000);
        }
        setCertSaving(null);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(15,20,25,0.72)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
            <div style={{ background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)', borderRadius: 18, width: '100%', maxWidth: 600, boxShadow: '0 40px 100px rgba(0,0,0,0.28)', marginTop: 24 }}>

                {/* ── Header ── */}
                <div style={{ padding: '28px 28px 0', position: 'relative' }}>
                    <button onClick={onClose} style={{ position: 'absolute', top: 18, right: 18, background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', color: 'var(--text-muted)', cursor: 'pointer', borderRadius: 9, width: 34, height: 34, display: 'grid', placeItems: 'center' }}>
                        <X size={15} />
                    </button>

                    <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
                        <PhotoAvatar member={member} size={76} textSize="1.5rem" />

                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-main)', fontFamily: 'Hanken Grotesk, sans-serif' }}>
                                    {member.candidate_name}
                                </h2>
                                {meta.type && (
                                    <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '3px 9px', borderRadius: 5, textTransform: 'uppercase', letterSpacing: '0.06em', ...(TYPE_STYLE[meta.type] || {}) }}>
                                        {meta.type}
                                    </span>
                                )}
                            </div>
                            <div style={{ fontSize: '0.9375rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8 }}>
                                {member.role_offered || 'No role assigned'}
                            </div>
                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
                                {(member.assigned_departments || []).map(d => (
                                    <span key={d} style={{ fontSize: '0.625rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'color-mix(in srgb, var(--primary) 8%, transparent)', color: 'var(--primary)', border: '1px solid color-mix(in srgb, var(--primary) 18%, transparent)' }}>
                                        {d}
                                    </span>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                                    <Mail size={12} /> {member.candidate_email}
                                </span>
                                {joinDate && (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                                        <Calendar size={12} /> Joined {joinDate}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Edit button */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, paddingBottom: 20, borderBottom: '1px solid var(--outline-variant)' }}>
                        <button onClick={onEdit} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 8, color: 'var(--text-muted)', fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer' }}>
                            <Edit2 size={12} /> Edit Member
                        </button>
                    </div>
                </div>

                {/* ── Body sections ── */}
                <div style={{ padding: '0 28px 28px', display: 'flex', flexDirection: 'column', gap: 0 }}>

                    {/* Working Hours — compact per-day total (date + time only). Full
                        work detail + download lives behind "View full history". */}
                    <ProfileSection
                        title={`Working Hours${workDays && workDays.length ? ` · ${fmtHM(totalMinutes)} total` : ''}`}
                        icon={<Clock size={14} />}
                    >
                        {worklog === null ? (
                            <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '10px 2px' }}>Loading…</div>
                        ) : !workDays || workDays.length === 0 ? (
                            <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 14px', borderRadius: 10, background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)' }}>
                                No work logged yet for this member.
                            </div>
                        ) : (
                            <>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                                    {workDays.map((d) => (
                                        <div key={d.date} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)' }}>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>{fmtDate(d.date)}</span>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>{fmtHM(d.minutes)}</span>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                    <button
                                        onClick={() => setShowHistory(true)}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)', color: 'var(--text-main)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                                    >
                                        <ScrollText size={14} /> View full history
                                    </button>
                                    <button
                                        onClick={downloadHistory}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: '1px solid var(--outline-variant)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                                    >
                                        <Download size={14} /> Download CSV
                                    </button>
                                </div>
                            </>
                        )}
                    </ProfileSection>

                    {/* Offer / Joining Letter */}
                    <ProfileSection title="Offer Letter" icon={<FileText size={14} />}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10, background: offerSent ? 'color-mix(in srgb, #067a50 6%, var(--surface-container-low))' : 'var(--surface-container-low)', border: `1px solid ${offerSent ? 'color-mix(in srgb, #067a50 18%, transparent)' : 'var(--outline-variant)'}` }}>
                            {offerSent
                                ? <CheckCircle size={16} color="#067a50" />
                                : <Clock size={16} color="var(--text-muted)" />
                            }
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: offerSent ? '#067a50' : 'var(--text-muted)' }}>
                                    {offerSent ? 'Offer Letter Sent' : 'No offer letter on record'}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 1 }}>
                                    {offerSent ? 'Sent to ' + member.candidate_email : 'Issue one now — the member’s name & department fill in automatically.'}
                                </div>
                            </div>
                            <button
                                onClick={() => setOfferModal(true)}
                                disabled={!member.candidate_email}
                                title={member.candidate_email ? '' : 'This member has no email on file'}
                                style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: member.candidate_email ? 'pointer' : 'not-allowed', opacity: member.candidate_email ? 1 : 0.5 }}
                            >
                                <Mail size={13} /> {offerSent ? 'Send again' : 'Issue offer letter'}
                            </button>
                        </div>
                    </ProfileSection>

                    {/* Documents */}
                    <ProfileSection title="Documents" icon={<BookOpen size={14} />}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                            {[
                                { key: 'aadhaar',    label: 'Aadhaar Card',    uploaded: member.has_aadhaar },
                                { key: 'college_id', label: 'College / Inst. ID', uploaded: member.has_college_id },
                                { key: 'photo',      label: 'Profile Photo',   uploaded: member.has_photo },
                            ].map(({ key, label, uploaded }) => (
                                <div key={key} style={{
                                    padding: '10px 12px', borderRadius: 9,
                                    background: uploaded ? 'color-mix(in srgb, #067a50 5%, var(--surface-container-low))' : 'var(--surface-container-low)',
                                    border: `1px solid ${uploaded ? 'color-mix(in srgb, #067a50 18%, transparent)' : 'var(--outline-variant)'}`,
                                    display: 'flex', flexDirection: 'column', gap: 6,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        {uploaded ? <CheckCircle size={13} color="#067a50" /> : <Clock size={13} color="var(--text-muted)" />}
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: uploaded ? 'var(--text-main)' : 'var(--text-muted)' }}>{label}</span>
                                    </div>
                                    {uploaded ? (
                                        <button onClick={(e) => { e.stopPropagation(); viewDoc(`/api/career/onboarding/${member.id}/doc/${key}/`); }}
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.6875rem', fontWeight: 700, color: 'var(--primary)', textDecoration: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                                            <ExternalLink size={10} /> View
                                        </button>
                                    ) : (
                                        <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>Not uploaded</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </ProfileSection>

                    {/* Certificates */}
                    <ProfileSection title="Certificates & Letters" icon={<Award size={14} />}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {CERTS.map(cert => {
                                const issued = !!certs[cert.key];
                                const issuedDate = certs[cert.key] ? fmtDate(certs[cert.key]) : null;
                                const isSaving = certSaving === cert.key;
                                const Icon = cert.icon;
                                return (
                                    <div key={cert.key} style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '12px 14px', borderRadius: 10,
                                        background: issued ? 'color-mix(in srgb, #067a50 5%, var(--surface-container-low))' : 'var(--surface-container-low)',
                                        border: `1px solid ${issued ? 'color-mix(in srgb, #067a50 18%, transparent)' : 'var(--outline-variant)'}`,
                                    }}>
                                        <Icon size={16} style={{ color: issued ? '#067a50' : 'var(--text-muted)', flexShrink: 0 }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-main)' }}>{cert.label}</div>
                                            <div style={{ fontSize: '0.75rem', color: issued ? '#067a50' : 'var(--text-muted)', fontWeight: 600, marginTop: 1 }}>
                                                {issued ? `Issued on ${issuedDate}` : 'Not yet issued'}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                            <button
                                                onClick={() => setSendModal({ cert })}
                                                title="Email this certificate"
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                                                    border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)', background: 'color-mix(in srgb, var(--primary) 8%, transparent)', color: 'var(--primary)',
                                                }}
                                            >
                                                <Mail size={13} /> Send
                                            </button>
                                            <button
                                                onClick={() => toggleCert(cert.key)}
                                                disabled={isSaving}
                                                style={{
                                                    padding: '6px 14px', borderRadius: 7, fontSize: '0.75rem', fontWeight: 700, cursor: isSaving ? 'wait' : 'pointer',
                                                    border: issued ? '1px solid color-mix(in srgb, #ba1a1a 25%, transparent)' : '1px solid color-mix(in srgb, #067a50 25%, transparent)',
                                                    background: issued ? 'color-mix(in srgb, #ba1a1a 6%, transparent)' : 'color-mix(in srgb, #067a50 8%, transparent)',
                                                    color: issued ? '#ba1a1a' : '#067a50',
                                                    opacity: isSaving ? 0.6 : 1,
                                                }}
                                            >
                                                {isSaving ? '…' : issued ? 'Revoke' : 'Mark Issued'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {certMsg && (
                            <div style={{ marginTop: 10, fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)', background: 'color-mix(in srgb, var(--primary) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)', borderRadius: 8, padding: '8px 12px' }}>
                                {certMsg}
                            </div>
                        )}
                        {sendModal && (
                            <GenerateCertModal
                                member={member}
                                docLabel={sendModal.cert.label}
                                certKey={sendModal.cert.key}
                                onClose={() => setSendModal(null)}
                                onSent={() => { setCerts(c => ({ ...c, [sendModal.cert.key]: c[sendModal.cert.key] || new Date().toISOString() })); }}
                            />
                        )}
                    </ProfileSection>

                    {/* Emergency Contact */}
                    {(member.emergency_name || member.emergency_phone) && (
                        <ProfileSection title="Emergency Contact" icon={<AlertCircle size={14} />}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                                {[
                                    { label: 'Name',     value: member.emergency_name },
                                    { label: 'Phone',    value: member.emergency_phone },
                                    { label: 'Relation', value: member.emergency_relation },
                                ].filter(f => f.value).map(({ label, value }) => (
                                    <div key={label}>
                                        <div style={{ fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
                                        <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-main)' }}>{value}</div>
                                    </div>
                                ))}
                            </div>
                        </ProfileSection>
                    )}

                    {/* HR Notes */}
                    {meta.notes && (
                        <ProfileSection title="HR Notes" icon={<FileText size={14} />}>
                            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.65, background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 9, padding: '12px 14px' }}>
                                {meta.notes}
                            </p>
                        </ProfileSection>
                    )}
                </div>
            </div>

            {showHistory && (
                <WorkHistoryModal
                    memberName={member.candidate_name}
                    workDays={workDays || []}
                    totalMinutes={totalMinutes}
                    fmtHM={fmtHM}
                    onDownload={downloadHistory}
                    onClose={() => setShowHistory(false)}
                />
            )}

            {offerModal && (
                <GenerateCertModal
                    member={member}
                    docLabel="Offer Letter"
                    certKey="offer_letter"
                    onClose={() => setOfferModal(false)}
                    onSent={() => {
                        try {
                            const map = JSON.parse(localStorage.getItem('tv_offers_sent') || '{}');
                            map[member.candidate_email] = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                            localStorage.setItem('tv_offers_sent', JSON.stringify(map));
                        } catch { /* ignore */ }
                        setOfferModal(false);
                    }}
                />
            )}
        </div>
    );
}

// Full per-day work history — date + hours + everything the member did that day,
// with a download. Opened from the compact Working Hours list.
function WorkHistoryModal({ memberName, workDays, totalMinutes, fmtHM, onDownload, onClose }) {
    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 10300, background: 'rgba(15,20,25,0.72)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 640, background: 'var(--surface-container-lowest, var(--surface))', borderRadius: 16, border: '1px solid var(--outline-variant)', boxShadow: '0 24px 60px -20px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--outline-variant)' }}>
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-main)', fontFamily: 'Hanken Grotesk, sans-serif' }}>Work history — {memberName}</div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>{workDays.length} day{workDays.length === 1 ? '' : 's'} · {fmtHM(totalMinutes)} total</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={onDownload} title="Download CSV" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                            <Download size={14} /> Download
                        </button>
                        <button onClick={onClose} style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 9, border: '1px solid var(--outline-variant)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                            <X size={16} />
                        </button>
                    </div>
                </div>
                <div style={{ maxHeight: '70vh', overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {workDays.length === 0 ? (
                        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No work logged yet.</div>
                    ) : workDays.map((d) => (
                        <div key={d.date} style={{ display: 'flex', gap: 14, padding: '12px 14px', borderRadius: 10, background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)' }}>
                            <div style={{ flex: 'none', width: 100 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>{fmtDate(d.date)}</div>
                                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--primary)', marginTop: 2 }}>{fmtHM(d.minutes)}</div>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                {d.items.length ? (
                                    <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 5 }}>
                                        {d.items.map((it, i) => (
                                            <li key={i} style={{ fontSize: 13, color: 'var(--text-main)', lineHeight: 1.5 }}>
                                                {it.note || <span style={{ color: 'var(--text-muted)' }}>{it.title || 'Work'}</span>}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>No note added.</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function ProfileSection({ title, icon, children }) {
    return (
        <div style={{ paddingTop: 20, marginTop: 20, borderTop: '1px solid var(--outline-variant)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
                <span style={{ color: 'var(--primary)' }}>{icon}</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'Hanken Grotesk, sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</span>
            </div>
            {children}
        </div>
    );
}

// ── Edit Modal ─────────────────────────────────────────────────────────────────

function EditModal({ member, departments, onClose, onSaved, allowSuperuser }) {
    const meta = parseMeta(member.hr_notes);
    // Offer Super User only to superusers; also keep it visible if this member
    // already holds it, so the dropdown reflects their real role.
    const roleOptions = (allowSuperuser || member.portal_role === 'superuser')
        ? [...ROLE_OPTIONS, SUPERUSER_OPTION]
        : ROLE_OPTIONS;
    const [form, setForm] = useState({
        candidate_name: member.candidate_name || '',
        role_offered:   member.role_offered   || '',
        portal_role:    member.portal_role    || 'member',
        member_type:    meta.type             || '',
        notes:          meta.notes            || '',
        joining_date:   meta.joining_date     || (member.verified_at ? member.verified_at.slice(0, 10) : ''),
        assigned_departments: member.assigned_departments || [],
    });
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');

    const handleSave = async () => {
        if (!form.candidate_name.trim()) { setErr('Name is required.'); return; }
        setSaving(true);
        const newMeta = { ...meta, type: form.member_type, notes: form.notes, joining_date: form.joining_date };
        const res = await verifyOnboarding(member.id, {
            candidate_name:       form.candidate_name,
            role_offered:         form.role_offered,
            portal_role:          form.portal_role,
            assigned_departments: form.assigned_departments,
            hr_notes:             serializeMeta(newMeta),
        });
        setSaving(false);
        if (res?.id) onSaved(res);
        else setErr(res?.error || 'Save failed.');
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10100, background: 'rgba(15,20,25,0.72)', backdropFilter: 'blur(10px)', display: 'grid', placeItems: 'center', padding: 24 }}>
            <div style={{ background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,0.22)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid var(--outline-variant)' }}>
                    <strong style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'Hanken Grotesk, sans-serif' }}>Edit Member</strong>
                    <button onClick={onClose} style={{ background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', color: 'var(--text-muted)', cursor: 'pointer', borderRadius: 8, width: 32, height: 32, display: 'grid', placeItems: 'center' }}><X size={14} /></button>
                </div>
                <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div><Lbl>Full Name *</Lbl><input style={F} value={form.candidate_name} onChange={e => setForm(f => ({ ...f, candidate_name: e.target.value }))} /></div>
                        <div><Lbl>Role / Title</Lbl><input style={F} value={form.role_offered} onChange={e => setForm(f => ({ ...f, role_offered: e.target.value }))} placeholder="e.g. Content Writer" /></div>
                        <div>
                            <Lbl>Role / Access</Lbl>
                            <select style={{ ...F, cursor: 'pointer' }} value={form.portal_role} onChange={e => setForm(f => ({ ...f, portal_role: e.target.value }))}>
                                {roleOptions.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                            </select>
                        </div>
                        <div>
                            <Lbl>Member Type</Lbl>
                            <select style={{ ...F, cursor: 'pointer' }} value={form.member_type} onChange={e => setForm(f => ({ ...f, member_type: e.target.value }))}>
                                <option value="">Select type…</option>
                                {MEMBER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div><Lbl>Joining Date</Lbl><input type="date" style={F} value={form.joining_date} onChange={e => setForm(f => ({ ...f, joining_date: e.target.value }))} /></div>
                    </div>
                    <div>
                        <Lbl>Departments</Lbl>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {departments.filter(d => d.is_active).map(d => {
                                const on = form.assigned_departments.includes(d.name);
                                return (
                                    <button key={d.id} onClick={() => setForm(f => ({ ...f, assigned_departments: on ? f.assigned_departments.filter(x => x !== d.name) : [...f.assigned_departments, d.name] }))} style={{ padding: '5px 12px', borderRadius: 20, fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer', border: on ? '1px solid color-mix(in srgb, var(--primary) 40%, transparent)' : '1px solid var(--outline-variant)', background: on ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent', color: on ? 'var(--primary)' : 'var(--text-muted)' }}>
                                        {d.name}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div><Lbl>HR Notes</Lbl><textarea style={{ ...F, resize: 'vertical', minHeight: 72 }} rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Performance notes, stipend, additional info…" /></div>
                    {err && <p style={{ margin: 0, fontSize: '0.8125rem', color: '#ba1a1a', fontWeight: 600 }}>{err}</p>}
                </div>
                <div style={{ display: 'flex', gap: 10, padding: '0 22px 20px' }}>
                    <button onClick={onClose} style={{ flex: 1, minHeight: 42, background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 9, color: 'var(--text-muted)', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem' }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving} style={{ flex: 2, minHeight: 42, background: 'var(--primary)', border: 'none', borderRadius: 9, color: '#fff', fontWeight: 800, cursor: saving ? 'wait' : 'pointer', fontSize: '0.875rem', opacity: saving ? 0.7 : 1 }}>
                        {saving ? 'Saving…' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Add Member Modal ───────────────────────────────────────────────────────────

function SendCertModal({ member, cert, onClose }) {
    const [templates, setTemplates] = useState([]);
    const [templateId, setTemplateId] = useState('');
    const [pdfBase64, setPdfBase64] = useState('');
    const [pdfName, setPdfName] = useState('');
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState(null);

    useEffect(() => {
        (async () => {
            const list = await getEmailTemplates();
            const arr = Array.isArray(list) ? list : [];
            setTemplates(arr);
            const def = arr.find(t => t.key === 'certificate_issue') || arr[0];
            if (def) setTemplateId(def.id);
        })();
    }, []);

    const selected = templates.find(t => t.id === templateId);
    const ctx = {
        name: member.candidate_name || 'there',
        document: cert.label, issued_by: 'HR Team',
        portal_url: `${window.location.origin}/login`,
        subject_title: cert.label, role: member.role_offered || '',
        department: (member.assigned_departments || []).join(', '),
    };

    const onPdf = (file) => {
        const reader = new FileReader();
        reader.onload = () => { setPdfBase64(String(reader.result).split(',')[1] || ''); setPdfName(file.name); };
        reader.readAsDataURL(file);
    };

    const send = async () => {
        if (!selected) return;
        setSending(true); setResult(null);
        const res = await sendCertificateEmail(member.id, {
            template_key: selected.key, cert_key: cert.key,
            pdf_base64: pdfBase64 || '', filename: pdfName || `${cert.label}.pdf`,
        });
        setSending(false);
        if (res?.sent) setResult({ ok: true, msg: `Sent to ${res.to}${pdfBase64 ? ' with PDF' : ''}` });
        else if (res && 'sent' in res) setResult({ ok: false, msg: 'Not sent — check the address or SES sender.' });
        else setResult({ ok: false, msg: res?.error || 'Send failed.' });
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10200, background: 'rgba(15,20,25,0.72)', backdropFilter: 'blur(10px)', display: 'grid', placeItems: 'center', padding: 24 }}>
            <div style={{ background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)', borderRadius: 16, width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,0.22)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid var(--outline-variant)' }}>
                    <div>
                        <strong style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>Send {cert.label}</strong>
                        <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>To {member.candidate_name} · {member.candidate_email || 'no email'}</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', color: 'var(--text-muted)', cursor: 'pointer', borderRadius: 8, width: 32, height: 32, display: 'grid', placeItems: 'center' }}><X size={14} /></button>
                </div>
                <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                        <Lbl>Email template</Lbl>
                        <select value={templateId} onChange={e => setTemplateId(Number(e.target.value))} style={{ ...F, cursor: 'pointer' }}>
                            {templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_custom ? ' (custom)' : ''}</option>)}
                        </select>
                    </div>

                    <div>
                        <Lbl>PDF attachment (optional)</Lbl>
                        {pdfName ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem', color: 'var(--text-main)' }}>
                                <FileText size={15} style={{ color: 'var(--primary)' }} /> {pdfName}
                                <button onClick={() => { setPdfBase64(''); setPdfName(''); }} style={{ background: 'none', border: 'none', color: '#ba1a1a', cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem' }}>Remove</button>
                            </div>
                        ) : (
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--outline-variant)', cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                <FileText size={14} /> Attach a PDF
                                <input type="file" accept="application/pdf,.pdf" hidden onChange={e => e.target.files[0] && onPdf(e.target.files[0])} />
                            </label>
                        )}
                    </div>

                    <div>
                        <Lbl>Preview</Lbl>
                        <div style={{ border: '1px solid var(--outline-variant)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                            <iframe title="cert-preview" srcDoc={selected ? previewTemplate(selected, ctx) : ''} style={{ width: '100%', height: 320, border: 'none', background: '#fff' }} sandbox="" />
                        </div>
                    </div>

                    {result && (
                        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: result.ok ? '#067a50' : '#ba1a1a', background: result.ok ? 'color-mix(in srgb, #067a50 8%, transparent)' : 'color-mix(in srgb, #ba1a1a 8%, transparent)', border: `1px solid ${result.ok ? 'color-mix(in srgb, #067a50 22%, transparent)' : 'color-mix(in srgb, #ba1a1a 22%, transparent)'}`, borderRadius: 8, padding: '9px 12px' }}>{result.msg}</div>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 10, padding: '0 22px 20px' }}>
                    <button onClick={onClose} style={{ flex: 1, minHeight: 42, background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 9, color: 'var(--text-muted)', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem' }}>{result?.ok ? 'Done' : 'Cancel'}</button>
                    {!result?.ok && (
                        <button onClick={send} disabled={sending || !selected || !member.candidate_email} style={{ flex: 2, minHeight: 42, background: 'var(--primary)', border: 'none', borderRadius: 9, color: '#fff', fontWeight: 800, cursor: sending ? 'wait' : 'pointer', fontSize: '0.875rem', opacity: (sending || !member.candidate_email) ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                            <Mail size={15} /> {sending ? 'Sending…' : 'Send Email'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

function AddModal({ departments, onClose, onAdded }) {
    const [form, setForm] = useState({ candidate_name: '', candidate_email: '', role_offered: '', member_type: 'Intern', notes: '', joining_date: '', assigned_departments: [] });
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    const [created, setCreated] = useState(null);
    const [copied, setCopied] = useState(false);
    const loginUrl = `${window.location.origin}/login`;

    const copyCreds = () => {
        navigator.clipboard?.writeText(`Username: ${created.username}\nTemp password: ${created.password}\nLogin: ${loginUrl}`);
        setCopied(true); setTimeout(() => setCopied(false), 2000);
    };

    const handleAdd = async () => {
        if (!form.candidate_name.trim()) { setErr('Full name is required.'); return; }
        if (!form.candidate_email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.candidate_email)) { setErr('Enter a valid email address.'); return; }
        setSaving(true);
        const res = await addTeamMember({
            candidate_name:       form.candidate_name,
            candidate_email:      form.candidate_email,
            role_offered:         form.role_offered,
            assigned_departments: form.assigned_departments,
            hr_notes:             serializeMeta({ type: form.member_type, notes: form.notes, joining_date: form.joining_date }),
        });
        setSaving(false);
        if (res?.id) {
            onAdded(res);
            if (res._temp_password) setCreated({ username: res.account_username || res.candidate_email, password: res._temp_password });
            else onClose();
        } else setErr(res?.error || 'Could not add member.');
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10100, background: 'rgba(15,20,25,0.72)', backdropFilter: 'blur(10px)', display: 'grid', placeItems: 'center', padding: 24 }}>
            <div style={{ background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)', borderRadius: 16, width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,0.22)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid var(--outline-variant)' }}>
                    <div>
                        <strong style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'Hanken Grotesk, sans-serif' }}>Add Team Member</strong>
                        <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Manually add someone who bypassed the onboarding flow.</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', color: 'var(--text-muted)', cursor: 'pointer', borderRadius: 8, width: 32, height: 32, display: 'grid', placeItems: 'center', flexShrink: 0 }}><X size={14} /></button>
                </div>
                {created ? (
                    <>
                        <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <CheckCircle size={22} style={{ color: '#16a34a' }} />
                                <strong style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>Member added — login created</strong>
                            </div>
                            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                                The credentials email is currently off, so copy these and share them with the member:
                            </p>
                            <div style={{ background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 10, padding: '14px 16px', display: 'grid', gap: 10, fontSize: '0.8125rem' }}>
                                <div><span style={{ color: 'var(--text-muted)' }}>Username</span><div style={{ fontWeight: 700, color: 'var(--text-main)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{created.username}</div></div>
                                <div><span style={{ color: 'var(--text-muted)' }}>Temp password</span><div style={{ fontWeight: 700, color: 'var(--text-main)', fontFamily: 'monospace' }}>{created.password}</div></div>
                                <div><span style={{ color: 'var(--text-muted)' }}>Login URL</span><div style={{ fontWeight: 700, color: 'var(--primary)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{loginUrl}</div></div>
                            </div>
                            <button onClick={copyCreds} style={{ alignSelf: 'flex-start', padding: '7px 14px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'transparent', color: 'var(--text-main)', fontWeight: 700, fontSize: '0.8125rem', cursor: 'pointer' }}>{copied ? 'Copied!' : 'Copy login details'}</button>
                        </div>
                        <div style={{ display: 'flex', gap: 10, padding: '0 22px 20px' }}>
                            <button onClick={onClose} style={{ flex: 1, minHeight: 42, background: 'var(--primary)', border: 'none', borderRadius: 9, color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '0.875rem' }}>Done</button>
                        </div>
                    </>
                ) : (<>
                <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div><Lbl>Full Name *</Lbl><input style={F} value={form.candidate_name} onChange={e => setForm(f => ({ ...f, candidate_name: e.target.value }))} placeholder="e.g. Priya Sharma" /></div>
                        <div><Lbl>Email *</Lbl><input type="email" style={F} value={form.candidate_email} onChange={e => setForm(f => ({ ...f, candidate_email: e.target.value }))} placeholder="priya@example.com" /></div>
                        <div><Lbl>Role / Title</Lbl><input style={F} value={form.role_offered} onChange={e => setForm(f => ({ ...f, role_offered: e.target.value }))} placeholder="e.g. UI/UX Designer" /></div>
                        <div>
                            <Lbl>Member Type</Lbl>
                            <select style={{ ...F, cursor: 'pointer' }} value={form.member_type} onChange={e => setForm(f => ({ ...f, member_type: e.target.value }))}>
                                {MEMBER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div style={{ gridColumn: 'span 2' }}><Lbl>Joining Date</Lbl><input type="date" style={{ ...F, maxWidth: 220 }} value={form.joining_date} onChange={e => setForm(f => ({ ...f, joining_date: e.target.value }))} /></div>
                    </div>
                    <div>
                        <Lbl>Departments</Lbl>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {departments.filter(d => d.is_active).map(d => {
                                const on = form.assigned_departments.includes(d.name);
                                return (
                                    <button key={d.id} onClick={() => setForm(f => ({ ...f, assigned_departments: on ? f.assigned_departments.filter(x => x !== d.name) : [...f.assigned_departments, d.name] }))} style={{ padding: '5px 12px', borderRadius: 20, fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer', border: on ? '1px solid color-mix(in srgb, var(--primary) 40%, transparent)' : '1px solid var(--outline-variant)', background: on ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent', color: on ? 'var(--primary)' : 'var(--text-muted)' }}>
                                        {d.name}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div><Lbl>Notes</Lbl><textarea style={{ ...F, resize: 'vertical', minHeight: 72 }} rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Stipend, performance notes, or additional info…" /></div>
                    {err && <p style={{ margin: 0, fontSize: '0.8125rem', color: '#ba1a1a', fontWeight: 600 }}>{err}</p>}
                </div>
                <div style={{ display: 'flex', gap: 10, padding: '0 22px 20px' }}>
                    <button onClick={onClose} style={{ flex: 1, minHeight: 42, background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 9, color: 'var(--text-muted)', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem' }}>Cancel</button>
                    <button onClick={handleAdd} disabled={saving} style={{ flex: 2, minHeight: 42, background: 'var(--primary)', border: 'none', borderRadius: 9, color: '#fff', fontWeight: 800, cursor: saving ? 'wait' : 'pointer', fontSize: '0.875rem', opacity: saving ? 0.7 : 1 }}>
                        {saving ? 'Adding…' : 'Add Member'}
                    </button>
                </div>
                </>)}
            </div>
        </div>
    );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function TeamDirectory() {
    const { isSuperuser } = usePermissions();
    const [members, setMembers] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [deptFilter, setDeptFilter] = useState('all');
    const [profileTarget, setProfileTarget] = useState(null);
    const [editTarget, setEditTarget] = useState(null);
    const [showAdd, setShowAdd] = useState(false);
    const [notification, setNotification] = useState(null);

    const showNotice = (msg, type = 'success') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 4000);
    };

    const load = useCallback(async () => {
        setLoading(true);
        const [subs, depts] = await Promise.all([getOnboardingList(), getHRDepartments()]);
        setMembers(Array.isArray(subs) ? subs.filter(s => s.status === 'verified') : []);
        setDepartments(Array.isArray(depts) ? depts : []);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return members;
        return members.filter(m => [m.candidate_name, m.candidate_email, m.role_offered, ...(m.assigned_departments || [])].some(v => (v || '').toLowerCase().includes(q)));
    }, [members, search]);

    const groups = useMemo(() => {
        const result = {};
        departments.filter(d => d.is_active).forEach(d => {
            if (deptFilter === 'all' || deptFilter === d.name) result[d.name] = { dept: d, members: [] };
        });
        filtered.forEach(m => {
            const depts = m.assigned_departments || [];
            if (depts.length === 0) {
                if (deptFilter === 'all' || deptFilter === '__unassigned__') {
                    if (!result['__unassigned__']) result['__unassigned__'] = { dept: { name: 'Unassigned' }, members: [] };
                    result['__unassigned__'].members.push(m);
                }
            } else {
                depts.forEach(dName => {
                    if (deptFilter !== 'all' && deptFilter !== dName) return;
                    if (!result[dName]) result[dName] = { dept: { name: dName }, members: [] };
                    if (!result[dName].members.find(x => x.id === m.id)) result[dName].members.push(m);
                });
            }
        });
        // Unassigned at end
        if (result['__unassigned__']) { const ua = result['__unassigned__']; delete result['__unassigned__']; result['__unassigned__'] = ua; }
        return result;
    }, [filtered, departments, deptFilter]);

    const stats = useMemo(() => [
        { label: 'Total Members', value: members.length, accent: true },
        ...departments.filter(d => d.is_active).map(d => ({ label: d.name, value: members.filter(m => (m.assigned_departments || []).includes(d.name)).length })),
        { label: 'Unassigned', value: members.filter(m => !(m.assigned_departments || []).length).length },
    ], [members, departments]);

    const handleUpdated = (updated) => {
        setMembers(prev => prev.map(m => m.id === updated.id ? updated : m));
        if (profileTarget?.id === updated.id) setProfileTarget(updated);
        showNotice('Saved.');
    };

    const handleAdded = (newMember) => {
        setMembers(prev => [newMember, ...prev]);
        showNotice('Member added!');
        setShowAdd(false);
    };

    const filterOptions = [
        { key: 'all', label: 'All' },
        ...departments.filter(d => d.is_active).map(d => ({ key: d.name, label: d.name })),
        { key: '__unassigned__', label: 'Unassigned' },
    ];

    return (
        <div style={{ padding: '32px 28px', minHeight: '100%' }}>

            {/* Toast */}
            {notification && (
                <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 9999, background: notification.type === 'error' ? 'color-mix(in srgb, #ba1a1a 12%, var(--surface-container-lowest))' : 'color-mix(in srgb, #067a50 12%, var(--surface-container-lowest))', border: `1px solid ${notification.type === 'error' ? 'color-mix(in srgb, #ba1a1a 25%, transparent)' : 'color-mix(in srgb, #067a50 25%, transparent)'}`, color: notification.type === 'error' ? '#ba1a1a' : '#067a50', padding: '12px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, boxShadow: '0 4px 20px rgba(0,0,0,0.14)' }}>
                    {notification.msg}
                </div>
            )}

            {/* Header */}
            <div className="career-admin-header" style={{ marginBottom: 24 }}>
                <div>
                    <span className="career-admin-eyebrow">HR Operations</span>
                    <h1>Team Directory</h1>
                    <p>All verified members, interns, and employees — organized by department. Click any row to view their full profile.</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={load} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 9, color: 'var(--text-muted)', fontSize: '0.8125rem', fontWeight: 700, cursor: loading ? 'wait' : 'pointer' }}>
                        <RefreshCw size={14} style={{ animation: loading ? 'tv-spin 1s linear infinite' : 'none' }} /> Refresh
                    </button>
                    <button className="career-admin-create" onClick={() => setShowAdd(true)}>
                        <Plus size={16} /> Add Member
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24, overflowX: 'auto', paddingBottom: 2 }}>
                {stats.map(({ label, value, accent }) => (
                    <div key={label} style={{ padding: '10px 16px', borderRadius: 10, flexShrink: 0, background: accent ? 'color-mix(in srgb, var(--primary) 7%, var(--surface-container-low))' : 'var(--surface-container-low)', border: accent ? '1px solid color-mix(in srgb, var(--primary) 20%, transparent)' : '1px solid var(--outline-variant)' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 900, color: accent ? 'var(--primary)' : 'var(--text-main)', fontFamily: 'Hanken Grotesk, sans-serif', lineHeight: 1 }}>{loading ? '—' : value}</div>
                        <div style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 3 }}>{label}</div>
                    </div>
                ))}
            </div>

            {/* Toolbar */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ position: 'relative', minWidth: 220, flex: '1 1 220px' }}>
                    <Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email or role…" style={{ ...F, paddingLeft: 34 }} />
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {filterOptions.map(({ key, label }) => (
                        <button key={key} onClick={() => setDeptFilter(key)} style={{ padding: '7px 14px', borderRadius: 20, fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer', border: deptFilter === key ? '1px solid color-mix(in srgb, var(--primary) 40%, transparent)' : '1px solid var(--outline-variant)', background: deptFilter === key ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : 'transparent', color: deptFilter === key ? 'var(--primary)' : 'var(--text-muted)' }}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Directory */}
            {loading ? (
                <div style={{ color: 'var(--text-muted)', padding: '64px 0', textAlign: 'center', fontSize: 13, fontWeight: 600 }}>Loading team directory…</div>
            ) : Object.keys(groups).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-muted)', fontSize: 14 }}>
                    <Users size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
                    <p style={{ margin: 0, fontWeight: 600 }}>No verified members yet.</p>
                    <p style={{ margin: '6px 0 0', fontSize: 13 }}>Verify onboarding submissions to see them here, or click <strong>Add Member</strong> to add manually.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                    {Object.entries(groups).map(([key, { dept, members: deptMembers }]) => (
                        <section key={key}>
                            {/* Section header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                                <Building2 size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                                <h2 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'Hanken Grotesk, sans-serif' }}>{dept.name}</h2>
                                <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'color-mix(in srgb, var(--primary) 8%, transparent)', color: 'var(--primary)', flexShrink: 0 }}>
                                    {deptMembers.length} {deptMembers.length === 1 ? 'member' : 'members'}
                                </span>
                                <div style={{ flex: 1, height: 1, background: 'var(--outline-variant)', minWidth: 20 }} />
                            </div>

                            {deptMembers.length === 0 ? (
                                <div style={{ padding: '20px', borderRadius: 10, border: '1px dashed var(--outline-variant)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>
                                    No verified members in this department yet.
                                </div>
                            ) : (
                                <div style={{ background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)', borderRadius: 12, overflow: 'hidden' }}>
                                    {/* Column headers */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 16px', background: 'var(--surface-container-low)', borderBottom: '1px solid var(--outline-variant)' }}>
                                        <div style={{ width: 42, flexShrink: 0 }} />
                                        <div style={{ flex: '1 1 160px', fontSize: '0.625rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Member</div>
                                        <div style={{ flex: '0 1 auto', minWidth: 80, fontSize: '0.625rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Department</div>
                                        <div style={{ flex: '1 1 180px', fontSize: '0.625rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Email</div>
                                        <div style={{ whiteSpace: 'nowrap', flexShrink: 0, fontSize: '0.625rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', width: 90 }}>Joined</div>
                                        <div style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', width: 80 }}>Certs</div>
                                        <div style={{ width: 15, flexShrink: 0 }} />
                                    </div>
                                    {deptMembers.map((m, i) => (
                                        <MemberRow key={m.id} member={m} onClick={() => setProfileTarget(m)} isLast={i === deptMembers.length - 1} />
                                    ))}
                                </div>
                            )}
                        </section>
                    ))}
                </div>
            )}

            {/* Profile Modal */}
            {profileTarget && (
                <ProfileModal
                    member={profileTarget}
                    departments={departments}
                    onClose={() => setProfileTarget(null)}
                    onUpdated={handleUpdated}
                    onEdit={() => { setEditTarget(profileTarget); }}
                />
            )}

            {/* Edit Modal */}
            {editTarget && (
                <EditModal
                    member={editTarget}
                    departments={departments}
                    allowSuperuser={isSuperuser}
                    onClose={() => setEditTarget(null)}
                    onSaved={(updated) => { handleUpdated(updated); setEditTarget(null); }}
                />
            )}

            {/* Add Modal */}
            {showAdd && (
                <AddModal
                    departments={departments}
                    onClose={() => setShowAdd(false)}
                    onAdded={handleAdded}
                />
            )}
        </div>
    );
}
