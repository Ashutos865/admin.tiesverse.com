import React, { useState, useEffect, useCallback } from 'react';
import { getOnboardingList, verifyOnboarding, getHRDepartments, getOnboardingDocUrl, initiateOnboarding } from '../../apiClient';
import { ClipboardCheck, CheckCircle, XCircle, Clock, Copy, Eye, Building2, X, UserCheck, RefreshCw } from 'lucide-react';

const STATUS_META = {
    pending:   { label: 'Awaiting Docs', bg: 'color-mix(in srgb, #8a5700 12%, transparent)',       color: '#8a5700' },
    submitted: { label: 'Docs Received', bg: 'color-mix(in srgb, var(--primary) 10%, transparent)', color: 'var(--primary)' },
    verified:  { label: 'Verified',      bg: 'color-mix(in srgb, #067a50 10%, transparent)',        color: '#067a50' },
    rejected:  { label: 'Rejected',      bg: 'color-mix(in srgb, #ba1a1a 10%, transparent)',        color: '#ba1a1a' },
};

const DocBadge = ({ label, uploaded }) => (
    <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.625rem', fontWeight: 700,
        padding: '3px 8px', borderRadius: 5,
        background: uploaded ? 'color-mix(in srgb, #067a50 10%, transparent)' : 'color-mix(in srgb, var(--text-muted) 8%, transparent)',
        color: uploaded ? '#067a50' : 'var(--text-muted)',
        border: `1px solid ${uploaded ? 'color-mix(in srgb, #067a50 20%, transparent)' : 'var(--outline-variant)'}`,
    }}>
        {uploaded ? <CheckCircle size={9} /> : <Clock size={9} />} {label}
    </span>
);

const WEBSITE_URL = (import.meta.env.VITE_WEBSITE_URL || 'https://tiesverse.com');

export default function OnboardingManagement() {
    const [submissions, setSubmissions] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [profileModal, setProfileModal] = useState(null); // null | submission object
    const [saving, setSaving] = useState(false);
    const [notification, setNotification] = useState(null);
    const [draftDepts, setDraftDepts] = useState([]);
    const [draftNotes, setDraftNotes] = useState('');
    const [copied, setCopied] = useState(false);

    const showNotice = (msg, type = 'success') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 4000);
    };

    const [syncing, setSyncing] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        const [subs, depts] = await Promise.all([getOnboardingList(), getHRDepartments()]);
        const subList = Array.isArray(subs) ? subs : [];
        setSubmissions(subList);
        setDepartments(Array.isArray(depts) ? depts : []);
        setLoading(false);
        return subList;
    }, []);

    // On mount: check localStorage for anyone who was sent an offer but has no DB record yet.
    // This repairs the gap from offer sends that happened before the onboarding table existed.
    const syncFromOffersSent = useCallback(async (existingSubs) => {
        let offerSentMap = {};
        try { offerSentMap = JSON.parse(localStorage.getItem('tv_offers_sent') || '{}'); } catch {}
        const existingEmails = new Set((existingSubs || []).map(s => s.candidate_email));
        const missing = Object.keys(offerSentMap).filter(email => !existingEmails.has(email));
        if (missing.length === 0) return;
        setSyncing(true);
        let anyCreated = false;
        for (const email of missing) {
            try {
                const res = await initiateOnboarding({
                    candidate_id: email,
                    candidate_name: email.split('@')[0],
                    candidate_email: email,
                    role_offered: '',
                });
                if (res?.id) anyCreated = true;
            } catch (_) {}
        }
        if (anyCreated) await load();
        setSyncing(false);
    }, [load]);

    useEffect(() => {
        load().then(subs => syncFromOffersSent(subs));
    }, [load, syncFromOffersSent]);

    const openProfile = (sub) => {
        setProfileModal(sub);
        setDraftDepts(sub.assigned_departments || []);
        setDraftNotes(sub.hr_notes || '');
        setCopied(false);
    };

    const closeProfile = () => setProfileModal(null);

    const toggleDept = (name) => {
        setDraftDepts(prev => prev.includes(name) ? prev.filter(d => d !== name) : [...prev, name]);
    };

    const handleSaveNotes = async () => {
        if (!profileModal) return;
        setSaving(true);
        const res = await verifyOnboarding(profileModal.id, { assigned_departments: draftDepts, hr_notes: draftNotes });
        if (res?.id) {
            setSubmissions(prev => prev.map(s => s.id === res.id ? res : s));
            setProfileModal(res);
            showNotice('Notes and departments saved.');
        } else showNotice('Save failed.', 'error');
        setSaving(false);
    };

    const handleVerify = async () => {
        if (!profileModal) return;
        setSaving(true);
        const res = await verifyOnboarding(profileModal.id, { status: 'verified', assigned_departments: draftDepts, hr_notes: draftNotes });
        if (res?.id) {
            setSubmissions(prev => prev.map(s => s.id === res.id ? res : s));
            setProfileModal(res);
            showNotice('Documents verified and departments assigned!');
        } else showNotice('Verification failed.', 'error');
        setSaving(false);
    };

    const handleReject = async () => {
        if (!profileModal || !window.confirm('Reject this submission?')) return;
        setSaving(true);
        const res = await verifyOnboarding(profileModal.id, { status: 'rejected', hr_notes: draftNotes });
        if (res?.id) {
            setSubmissions(prev => prev.map(s => s.id === res.id ? res : s));
            setProfileModal(res);
            showNotice('Submission rejected.');
        } else showNotice('Action failed.', 'error');
        setSaving(false);
    };

    const copyLink = (token) => {
        navigator.clipboard.writeText(`${WEBSITE_URL}/onboarding/${token}`).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const filtered = submissions.filter(s => filter === 'all' || s.status === filter);
    const stats = [
        { label: 'Total',        value: submissions.length,                                              color: 'var(--text-main)' },
        { label: 'Awaiting Docs',value: submissions.filter(s => s.status === 'pending').length,          color: '#8a5700' },
        { label: 'Docs Received',value: submissions.filter(s => s.status === 'submitted').length,        color: 'var(--primary)' },
        { label: 'Verified',     value: submissions.filter(s => s.status === 'verified').length,         color: '#067a50' },
    ];
    const TABS = ['all', 'pending', 'submitted', 'verified', 'rejected'];
    const TAB_LABELS = { all: 'All', pending: 'Awaiting Docs', submitted: 'Docs Received', verified: 'Verified', rejected: 'Rejected' };

    const allDocsUploaded = profileModal?.has_aadhaar && profileModal?.has_college_id && profileModal?.has_photo;

    return (
        <div style={{ padding: '32px 28px', minHeight: '100%' }}>
            {/* Notification */}
            {notification && (
                <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 9999, maxWidth: 360, background: notification.type === 'error' ? 'color-mix(in srgb, #ba1a1a 12%, var(--surface-container-lowest))' : 'color-mix(in srgb, #067a50 12%, var(--surface-container-lowest))', border: `1px solid ${notification.type === 'error' ? 'color-mix(in srgb, #ba1a1a 25%, transparent)' : 'color-mix(in srgb, #067a50 25%, transparent)'}`, color: notification.type === 'error' ? '#ba1a1a' : '#067a50', padding: '12px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, boxShadow: '0 4px 20px rgba(0,0,0,0.12)' }}>{notification.msg}</div>
            )}

            {/* Header */}
            <div className="career-admin-header" style={{ marginBottom: 24 }}>
                <div>
                    <span className="career-admin-eyebrow">HR Operations</span>
                    <h1>Onboarding</h1>
                    <p>Everyone who received an offer letter appears here. Track document uploads, verify, and assign departments.</p>
                </div>
                <button onClick={() => load().then(s => syncFromOffersSent(s))} disabled={syncing || loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 9, color: 'var(--text-muted)', fontSize: '0.8125rem', fontWeight: 700, cursor: (syncing || loading) ? 'wait' : 'pointer' }}>
                    <RefreshCw size={14} style={{ animation: (syncing || loading) ? 'spin 1s linear infinite' : 'none' }} />
                    {syncing ? 'Syncing…' : 'Refresh'}
                </button>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
                {stats.map(({ label, value, color }) => (
                    <div key={label} style={{ background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 12, padding: '14px 16px' }}>
                        <div style={{ fontSize: '1.75rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 700, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
                    </div>
                ))}
            </div>

            {/* Filter tabs */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--outline-variant)', overflowX: 'auto' }}>
                {TABS.map(t => (
                    <button key={t} onClick={() => setFilter(t)} style={{ padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 700, background: 'transparent', borderRadius: '8px 8px 0 0', color: filter === t ? 'var(--primary)' : 'var(--text-muted)', borderBottom: filter === t ? '2px solid var(--primary)' : '2px solid transparent', whiteSpace: 'nowrap' }}>
                        {TAB_LABELS[t]}{t !== 'all' && ` (${submissions.filter(s => s.status === t).length})`}
                    </button>
                ))}
            </div>

            {loading || syncing ? (
                <div style={{ color: 'var(--text-muted)', padding: '64px 0', textAlign: 'center', fontSize: 13, fontWeight: 600 }}>{syncing ? 'Syncing offer letter recipients…' : 'Loading…'}</div>
            ) : filtered.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', padding: '48px 0', textAlign: 'center', fontSize: 13, lineHeight: 1.7 }}>
                    {submissions.length === 0
                        ? 'No onboarding records yet.\nSend an offer letter from the Offer Letters section — recipients will appear here automatically.'
                        : `No candidates in "${TAB_LABELS[filter]}" status.`}
                </div>
            ) : (
                /* Cards grid */
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                    {filtered.map(sub => {
                        const sm = STATUS_META[sub.status] || STATUS_META.pending;
                        const docsCount = [sub.has_aadhaar, sub.has_college_id, sub.has_photo].filter(Boolean).length;
                        return (
                            <button key={sub.id} onClick={() => openProfile(sub)} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 18px', borderRadius: 13, cursor: 'pointer', textAlign: 'left', background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)', transition: 'border-color 150ms ease, transform 150ms ease', ':hover': { borderColor: 'var(--primary)' } }}>
                                {/* Card top */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                                    {sub.avatar_url
                                        ? <img src={sub.avatar_url} alt={sub.candidate_name} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--outline-variant)' }} />
                                        : <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--primary-fixed)', display: 'grid', placeItems: 'center', fontSize: '1rem', fontWeight: 800, color: 'var(--primary)', fontFamily: 'Hanken Grotesk, sans-serif', flexShrink: 0 }}>
                                            {sub.candidate_name?.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()}
                                        </div>}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
                                            <span style={{ color: 'var(--text-main)', fontWeight: 700, fontSize: '0.9375rem', fontFamily: 'Hanken Grotesk, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub.candidate_name}</span>
                                            <span style={{ fontSize: '0.625rem', fontWeight: 800, padding: '2px 8px', borderRadius: 4, background: sm.bg, color: sm.color, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>{sm.label}</span>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub.candidate_email}</div>
                                    </div>
                                </div>

                                {/* Role */}
                                {sub.role_offered && (
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', background: 'color-mix(in srgb, var(--primary) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 15%, transparent)', padding: '3px 10px', borderRadius: 20, alignSelf: 'flex-start' }}>{sub.role_offered}</span>
                                )}

                                {/* Doc badges */}
                                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                    <DocBadge label="Aadhaar" uploaded={sub.has_aadhaar} />
                                    <DocBadge label="College ID" uploaded={sub.has_college_id} />
                                    <DocBadge label="Photo" uploaded={sub.has_photo} />
                                </div>

                                {/* Footer */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 10, borderTop: '1px solid var(--outline-variant)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    <span>{docsCount}/3 docs {docsCount === 3 ? '✓' : 'received'}</span>
                                    <span style={{ color: 'var(--primary)', fontWeight: 700 }}>Open Profile →</span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* ── Profile Detail Modal ─────────────────────────────────────────── */}
            {profileModal && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(25,28,30,0.72)', backdropFilter: 'blur(10px)', display: 'grid', placeItems: 'center', padding: 20 }}>
                    <div style={{ background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(15,23,42,0.3)' }}>

                        {/* Modal header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 24px', borderBottom: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)', borderRadius: '16px 16px 0 0', flexShrink: 0 }}>
                            {profileModal.avatar_url
                                ? <img src={profileModal.avatar_url} alt={profileModal.candidate_name} style={{ width: 50, height: 50, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--outline-variant)' }} />
                                : <div style={{ width: 50, height: 50, borderRadius: '50%', background: 'var(--primary-fixed)', display: 'grid', placeItems: 'center', fontSize: '1.125rem', fontWeight: 800, color: 'var(--primary)', fontFamily: 'Hanken Grotesk, sans-serif', flexShrink: 0 }}>
                                    {profileModal.candidate_name?.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()}
                                </div>}
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <strong style={{ fontSize: '1.0625rem', color: 'var(--text-main)', fontFamily: 'Hanken Grotesk, sans-serif' }}>{profileModal.candidate_name}</strong>
                                    {(() => { const sm = STATUS_META[profileModal.status] || STATUS_META.pending; return <span style={{ fontSize: '0.625rem', fontWeight: 800, padding: '2px 9px', borderRadius: 4, background: sm.bg, color: sm.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{sm.label}</span>; })()}
                                </div>
                                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 2 }}>{profileModal.candidate_email}</div>
                            </div>
                            <button onClick={closeProfile} style={{ background: 'var(--surface-container)', border: '1px solid var(--outline-variant)', color: 'var(--text-muted)', cursor: 'pointer', borderRadius: 8, width: 34, height: 34, display: 'grid', placeItems: 'center', flexShrink: 0 }}><X size={15} /></button>
                        </div>

                        {/* Scrollable body */}
                        <div style={{ overflowY: 'auto', padding: '22px 24px', flex: 1, display: 'flex', flexDirection: 'column', gap: 22, scrollbarWidth: 'thin', scrollbarColor: 'var(--outline-variant) transparent' }}>

                            {/* Role + Upload Link row */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                                {profileModal.role_offered && (
                                    <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--primary)', background: 'color-mix(in srgb, var(--primary) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 18%, transparent)', padding: '4px 12px', borderRadius: 20 }}>{profileModal.role_offered}</span>
                                )}
                                <button onClick={() => copyLink(profileModal.token)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', background: copied ? 'color-mix(in srgb, #067a50 8%, var(--surface-container-low))' : 'var(--surface-container-low)', border: `1px solid ${copied ? 'color-mix(in srgb, #067a50 25%, transparent)' : 'var(--outline-variant)'}`, borderRadius: 8, cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 700, color: copied ? '#067a50' : 'var(--text-main)' }}>
                                    {copied ? <CheckCircle size={13} /> : <Copy size={13} />} {copied ? 'Copied!' : 'Copy Upload Link'}
                                </button>
                            </div>

                            {/* Documents received */}
                            <div>
                                <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Documents Received</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                                    {[
                                        { key: 'aadhaar',    label: 'Aadhaar Card',  uploaded: profileModal.has_aadhaar },
                                        { key: 'college_id', label: 'College ID',    uploaded: profileModal.has_college_id },
                                        { key: 'photo',      label: 'Profile Photo', uploaded: profileModal.has_photo },
                                    ].map(({ key, label, uploaded }) => (
                                        <div key={key} style={{ padding: '14px 14px', background: uploaded ? 'color-mix(in srgb, #067a50 5%, var(--surface-container-low))' : 'var(--surface-container-low)', border: `1px solid ${uploaded ? 'color-mix(in srgb, #067a50 18%, transparent)' : 'var(--outline-variant)'}`, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                                {uploaded ? <CheckCircle size={14} color="#067a50" /> : <Clock size={14} color="var(--text-muted)" />}
                                                <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: uploaded ? 'var(--text-main)' : 'var(--text-muted)' }}>{label}</span>
                                            </div>
                                            {uploaded ? (
                                                <a href={getOnboardingDocUrl(profileModal.id, key)} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', textDecoration: 'none', padding: '4px 0' }}>
                                                    <Eye size={12} /> View Document
                                                </a>
                                            ) : (
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Not yet uploaded</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Emergency Contact */}
                            <div>
                                <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Emergency Contact</div>
                                {profileModal.emergency_name || profileModal.emergency_phone ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                                        {[['Name', profileModal.emergency_name], ['Phone', profileModal.emergency_phone], ['Relation', profileModal.emergency_relation]].map(([lbl, val]) => (
                                            <div key={lbl} style={{ padding: '12px 14px', background: 'var(--surface-container-low)', borderRadius: 9, border: '1px solid var(--outline-variant)' }}>
                                                <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{lbl}</div>
                                                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: val ? 'var(--text-main)' : 'var(--text-muted)' }}>{val || '—'}</div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ padding: '14px', background: 'var(--surface-container-low)', borderRadius: 9, border: '1px solid var(--outline-variant)', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Not yet provided by candidate.</div>
                                )}
                            </div>

                            {/* Assign Departments */}
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                                    <Building2 size={12} style={{ color: 'var(--text-muted)' }} />
                                    <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Assign Departments</div>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                                    {departments.filter(d => d.is_active).map(dept => {
                                        const active = draftDepts.includes(dept.name);
                                        return (
                                            <button key={dept.id} onClick={() => toggleDept(dept.name)} style={{ padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 700, background: active ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'var(--surface-container)', color: active ? 'var(--primary)' : 'var(--text-muted)', border: `1px solid ${active ? 'color-mix(in srgb, var(--primary) 28%, transparent)' : 'var(--outline-variant)'}`, transition: 'all 0.15s' }}>
                                                {dept.name}
                                            </button>
                                        );
                                    })}
                                    {departments.filter(d => d.is_active).length === 0 && <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>No active departments. Create them in HR Departments.</span>}
                                </div>
                                {draftDepts.length > 0 && (
                                    <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        Assigned: {draftDepts.map(d => <span key={d} style={{ color: 'var(--primary)', fontWeight: 700 }}>{d}</span>).reduce((a, b) => [a, ', ', b])}
                                    </div>
                                )}
                            </div>

                            {/* HR Notes */}
                            <div>
                                <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>HR Notes</div>
                                <textarea value={draftNotes} onChange={e => setDraftNotes(e.target.value)} rows={3} placeholder="Internal notes about this candidate…" style={{ width: '100%', background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 8, padding: '10px 12px', color: 'var(--text-main)', fontSize: '0.875rem', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
                            </div>

                            {/* Timestamps */}
                            {(profileModal.submitted_at || profileModal.verified_at) && (
                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                    {profileModal.submitted_at && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Submitted: <strong style={{ color: 'var(--text-main)' }}>{new Date(profileModal.submitted_at).toLocaleString('en-IN')}</strong></div>}
                                    {profileModal.verified_at && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Verified: <strong style={{ color: '#067a50' }}>{new Date(profileModal.verified_at).toLocaleString('en-IN')} by {profileModal.verified_by}</strong></div>}
                                </div>
                            )}
                        </div>

                        {/* Modal footer actions */}
                        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)', borderRadius: '0 0 16px 16px', display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
                            <button onClick={handleSaveNotes} disabled={saving} style={{ flex: 1, minHeight: 40, minWidth: 100, background: 'var(--surface-container)', border: '1px solid var(--outline-variant)', borderRadius: 8, color: 'var(--text-main)', fontWeight: 700, fontSize: '0.875rem', cursor: saving ? 'wait' : 'pointer' }}>
                                {saving ? 'Saving…' : 'Save Notes'}
                            </button>
                            {profileModal.status !== 'rejected' && (
                                <button onClick={handleReject} disabled={saving} style={{ minHeight: 40, padding: '0 16px', background: 'color-mix(in srgb, #ba1a1a 8%, transparent)', border: '1px solid color-mix(in srgb, #ba1a1a 20%, transparent)', borderRadius: 8, color: '#ba1a1a', fontWeight: 700, fontSize: '0.875rem', cursor: saving ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                    <XCircle size={13} /> Reject
                                </button>
                            )}
                            {profileModal.status !== 'verified' && (
                                <button onClick={handleVerify} disabled={saving || !allDocsUploaded} style={{ flex: 2, minHeight: 40, minWidth: 120, background: allDocsUploaded ? 'color-mix(in srgb, #067a50 12%, transparent)' : 'var(--surface-container)', border: `1px solid ${allDocsUploaded ? 'color-mix(in srgb, #067a50 25%, transparent)' : 'var(--outline-variant)'}`, borderRadius: 8, color: allDocsUploaded ? '#067a50' : 'var(--text-muted)', fontWeight: 700, fontSize: '0.875rem', cursor: (saving || !allDocsUploaded) ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, opacity: !allDocsUploaded ? 0.6 : 1 }}>
                                    <CheckCircle size={13} /> {allDocsUploaded ? 'Verify & Assign Departments' : 'All 3 docs needed to verify'}
                                </button>
                            )}
                            {profileModal.status === 'verified' && (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 16px', color: '#067a50', fontWeight: 700, fontSize: '0.875rem' }}>
                                    <UserCheck size={14} /> Verified
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
