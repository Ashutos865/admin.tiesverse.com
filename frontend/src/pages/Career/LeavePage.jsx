import { useState, useEffect, useCallback } from 'react';
import { getLeaveList, createLeaveRequest, reviewLeaveRequest, getOnboardingList } from '../../apiClient';
import { usePermissions } from '../../context/PermissionContext';

const STATUS_STYLE = {
    pending:   { bg: 'var(--secondary-container)', color: 'var(--on-secondary-container)' },
    approved:  { bg: '#d1fae5', color: '#065f46' },
    rejected:  { bg: '#fee2e2', color: '#991b1b' },
    cancelled: { bg: '#f3f4f6', color: '#6b7280' },
};

// All leave is unpaid — these are reason categories only, not paid entitlements.
const LEAVE_TYPES = ['sick', 'casual', 'personal', 'unpaid', 'other'];

const pad = (n) => String(n).padStart(2, '0');
const toISO = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayISO = () => { const t = new Date(); return toISO(t.getFullYear(), t.getMonth(), t.getDate()); };
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const firstName = (name) => (name || '').trim().split(/\s+/)[0] || '—';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function LeavePage() {
    const { hasPermission, isSuperuser } = usePermissions();
    // Team leads can see leave requests, but only HR can approve/reject.
    const canReview = isSuperuser || hasPermission('can_review_leave');

    const [view, setView] = useState('list'); // 'list' | 'calendar'

    const [records, setRecords] = useState([]);
    const [members, setMembers] = useState([]);
    const [filterMember, setFilterMember] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState(null);
    const [saving, setSaving] = useState(false);

    // Calendar state
    const now = new Date();
    const [calYear, setCalYear] = useState(now.getFullYear());
    const [calMonth, setCalMonth] = useState(now.getMonth());
    const [calRecords, setCalRecords] = useState([]);

    // Request modal
    const [showRequest, setShowRequest] = useState(false);
    const [form, setForm] = useState({ member: '', leave_type: 'casual', from_date: '', to_date: '', reason: '' });

    // Review modal
    const [reviewModal, setReviewModal] = useState(null);
    const [reviewNote, setReviewNote] = useState('');

    const showToast = (msg, err = false) => {
        setToast({ msg, err });
        setTimeout(() => setToast(null), 3000);
    };

    const load = useCallback(async () => {
        setLoading(true);
        const params = {};
        if (filterMember) params.member = filterMember;
        if (filterStatus) params.status = filterStatus;
        const [recs, mems] = await Promise.all([
            getLeaveList(params),
            getOnboardingList(),
        ]);
        setRecords(Array.isArray(recs) ? recs : []);
        setMembers(Array.isArray(mems) ? mems.filter(m => m.status === 'verified') : []);
        setLoading(false);
    }, [filterMember, filterStatus]);

    useEffect(() => { load(); }, [load]);

    // Calendar / "who's out today" data — leaves overlapping the visible month
    const loadCalendar = useCallback(async () => {
        const from = toISO(calYear, calMonth, 1);
        const lastDay = new Date(calYear, calMonth + 1, 0).getDate();
        const to = toISO(calYear, calMonth, lastDay);
        const recs = await getLeaveList({ from, to });
        setCalRecords(Array.isArray(recs) ? recs : []);
    }, [calYear, calMonth]);

    useEffect(() => { loadCalendar(); }, [loadCalendar]);

    const handleCreate = async () => {
        if (!form.member || !form.from_date || !form.to_date) {
            showToast('Member, from date, and to date are required', true); return;
        }
        if (form.to_date < form.from_date) {
            showToast('"To" date cannot be before "From" date', true); return;
        }
        setSaving(true);
        const res = await createLeaveRequest(form);
        setSaving(false);
        if (res?.id) {
            showToast('Leave request submitted');
            setShowRequest(false);
            setForm({ member: '', leave_type: 'casual', from_date: '', to_date: '', reason: '' });
            load();
            loadCalendar();
        } else {
            showToast(res?.error || JSON.stringify(res), true);
        }
    };

    const handleReview = async (decision) => {
        setSaving(true);
        const res = await reviewLeaveRequest(reviewModal.id, { decision, note: reviewNote });
        setSaving(false);
        if (res?.id) {
            showToast(`Leave ${decision}`);
            setReviewModal(null);
            setReviewNote('');
            load();
            loadCalendar();
        } else {
            showToast(res?.error || 'Only HR can approve or reject leave.', true);
        }
    };

    // ── Who's out today ──
    const today = todayISO();
    const outToday = calRecords.filter(
        r => r.status === 'approved' && r.from_date <= today && r.to_date >= today,
    );

    return (
        <div style={{ padding: '28px 32px', maxWidth: 1100 }}>
            {toast && (
                <div style={{
                    position: 'fixed', top: 20, right: 20, zIndex: 9999,
                    background: toast.err ? '#ef4444' : 'var(--primary)',
                    color: '#fff', borderRadius: 10, padding: '10px 18px', fontSize: 13,
                    boxShadow: '0 4px 16px rgba(0,0,0,.2)',
                }}>{toast.msg}</div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>Leave Management</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4, maxWidth: 620 }}>
                        All leave is unpaid. Requests are visible to team leads, but{' '}
                        <strong style={{ color: 'var(--text-main)' }}>only HR can approve or reject</strong>.
                    </p>
                </div>
                <button onClick={() => setShowRequest(true)} style={primaryBtn}>+ New Request</button>
            </div>

            {/* Who's out today */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                padding: '10px 14px', marginBottom: 18, borderRadius: 10,
                background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)',
            }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    Out today
                </span>
                {outToday.length === 0 ? (
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Everyone's in 🎉</span>
                ) : (
                    outToday.map(r => (
                        <span key={r.id} title={`${r.leave_type} · until ${fmtDate(r.to_date)}`} style={{
                            fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                            background: '#d1fae5', color: '#065f46',
                        }}>{r.member_name}</span>
                    ))
                )}
            </div>

            {/* View toggle */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
                {['list', 'calendar'].map(v => (
                    <button key={v} onClick={() => setView(v)} style={{
                        padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        border: '1px solid var(--outline-variant)', textTransform: 'capitalize',
                        background: view === v ? 'var(--primary)' : 'transparent',
                        color: view === v ? '#fff' : 'var(--text-muted)',
                    }}>{v}</button>
                ))}
            </div>

            {view === 'list' ? (
                <>
                    {/* Filters */}
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                        <select value={filterMember} onChange={e => setFilterMember(e.target.value)} style={selectStyle}>
                            <option value="">All members</option>
                            {members.map(m => <option key={m.id} value={m.id}>{m.candidate_name}</option>)}
                        </select>
                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
                            <option value="">All statuses</option>
                            {['pending', 'approved', 'rejected', 'cancelled'].map(s => (
                                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                            ))}
                        </select>
                    </div>

                    {loading ? (
                        <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
                    ) : records.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)' }}>No leave requests found.</p>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--outline-variant)' }}>
                                        {['Member', 'Type', 'From', 'To', 'Days', 'Reason', 'Status', 'Reviewed By', canReview ? 'Actions' : ''].filter(Boolean).map(h => (
                                            <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {records.map(r => {
                                        const st = STATUS_STYLE[r.status] || STATUS_STYLE.pending;
                                        return (
                                            <tr key={r.id} style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                                                <td style={{ padding: '10px 12px', fontWeight: 500, color: 'var(--text-main)' }}>{r.member_name}</td>
                                                <td style={{ padding: '10px 12px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{r.leave_type}</td>
                                                <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{fmtDate(r.from_date)}</td>
                                                <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{fmtDate(r.to_date)}</td>
                                                <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{r.duration_days}</td>
                                                <td style={{ padding: '10px 12px', color: 'var(--text-muted)', maxWidth: 180 }}>
                                                    <span title={r.reason} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {r.reason || '—'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px 12px' }}>
                                                    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: st.bg, color: st.color }}>
                                                        {r.status}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{r.reviewed_by_name || '—'}</td>
                                                {canReview && (
                                                    <td style={{ padding: '10px 12px' }}>
                                                        {r.status === 'pending' && (
                                                            <button onClick={() => { setReviewModal(r); setReviewNote(''); }} style={actionBtn}>
                                                                Review
                                                            </button>
                                                        )}
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {!canReview && (
                        <p style={{ marginTop: 14, fontSize: 12, color: 'var(--text-muted)' }}>
                            You can view leave requests for your team. Approving or rejecting is handled by HR.
                        </p>
                    )}
                </>
            ) : (
                <LeaveCalendar
                    year={calYear}
                    month={calMonth}
                    records={calRecords}
                    onPrev={() => { const d = new Date(calYear, calMonth - 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }}
                    onNext={() => { const d = new Date(calYear, calMonth + 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }}
                    onToday={() => { const d = new Date(); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }}
                    onSelect={(r) => canReview && r.status === 'pending' ? (setReviewModal(r), setReviewNote('')) : null}
                />
            )}

            {/* New Request Modal */}
            {showRequest && (
                <Modal title="New Leave Request" onClose={() => setShowRequest(false)}>
                    <div style={{ display: 'grid', gap: 12 }}>
                        <div>
                            <label style={labelStyle}>Member *</label>
                            <select value={form.member} onChange={e => setForm(f => ({ ...f, member: e.target.value }))} style={{ ...inputStyle, width: '100%' }}>
                                <option value="">Select member</option>
                                {members.map(m => <option key={m.id} value={m.id}>{m.candidate_name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Leave Type</label>
                            <select value={form.leave_type} onChange={e => setForm(f => ({ ...f, leave_type: e.target.value }))} style={{ ...inputStyle, width: '100%' }}>
                                {LEAVE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <label style={labelStyle}>From *</label>
                                <input type="date" value={form.from_date} onChange={e => setForm(f => ({ ...f, from_date: e.target.value }))} style={{ ...inputStyle, width: '100%' }} />
                            </div>
                            <div>
                                <label style={labelStyle}>To *</label>
                                <input type="date" value={form.to_date} onChange={e => setForm(f => ({ ...f, to_date: e.target.value }))} style={{ ...inputStyle, width: '100%' }} />
                            </div>
                        </div>
                        <div>
                            <label style={labelStyle}>Reason</label>
                            <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={3} style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                        <button onClick={() => setShowRequest(false)} style={ghostBtn}>Cancel</button>
                        <button onClick={handleCreate} disabled={saving} style={primaryBtn}>{saving ? 'Saving...' : 'Submit'}</button>
                    </div>
                </Modal>
            )}

            {/* Review Modal — HR only */}
            {reviewModal && canReview && (
                <Modal title={`Review Leave — ${reviewModal.member_name}`} onClose={() => setReviewModal(null)}>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                        <span style={{ textTransform: 'capitalize' }}>{reviewModal.leave_type}</span> leave · {fmtDate(reviewModal.from_date)} – {fmtDate(reviewModal.to_date)} ({reviewModal.duration_days} days)
                        {reviewModal.reason && <><br />{reviewModal.reason}</>}
                    </p>
                    <label style={labelStyle}>Note (optional)</label>
                    <input value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="Add a note..." style={{ ...inputStyle, width: '100%' }} />
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                        <button onClick={() => setReviewModal(null)} style={ghostBtn}>Cancel</button>
                        <button onClick={() => handleReview('rejected')} disabled={saving} style={{ ...primaryBtn, background: '#ef4444' }}>Reject</button>
                        <button onClick={() => handleReview('approved')} disabled={saving} style={primaryBtn}>{saving ? 'Saving...' : 'Approve'}</button>
                    </div>
                </Modal>
            )}
        </div>
    );
}

// ── Month calendar ──
function LeaveCalendar({ year, month, records, onPrev, onNext, onToday, onSelect }) {
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = todayISO();

    const cells = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);

    const leavesOn = (dayISO) => records.filter(r => r.from_date <= dayISO && r.to_date >= dayISO);

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <button onClick={onPrev} style={navBtn}>‹</button>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-main)', minWidth: 170, textAlign: 'center' }}>
                    {MONTHS[month]} {year}
                </span>
                <button onClick={onNext} style={navBtn}>›</button>
                <button onClick={onToday} style={{ ...ghostBtn, padding: '6px 14px' }}>Today</button>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, fontSize: 12, color: 'var(--text-muted)' }}>
                    <LegendDot color="#065f46" bg="#d1fae5" label="Approved" />
                    <LegendDot color="var(--on-secondary-container)" bg="var(--secondary-container)" label="Pending" />
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: 'var(--outline-variant)', border: '1px solid var(--outline-variant)', borderRadius: 10, overflow: 'hidden' }}>
                {WEEKDAYS.map(w => (
                    <div key={w} style={{ background: 'var(--surface-container-low)', padding: '8px 6px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        {w}
                    </div>
                ))}
                {cells.map((d, i) => {
                    const dayISO = d ? toISO(year, month, d) : null;
                    const dayLeaves = d ? leavesOn(dayISO) : [];
                    const isToday = dayISO === today;
                    return (
                        <div key={i} style={{
                            background: 'var(--surface)', minHeight: 96, padding: 6,
                            opacity: d ? 1 : 0.4,
                        }}>
                            {d && (
                                <>
                                    <div style={{
                                        fontSize: 12, fontWeight: 700, marginBottom: 4,
                                        color: isToday ? '#fff' : 'var(--text-muted)',
                                        background: isToday ? 'var(--primary)' : 'transparent',
                                        width: 22, height: 22, borderRadius: '50%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>{d}</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                        {dayLeaves.slice(0, 4).map(r => {
                                            const st = STATUS_STYLE[r.status] || STATUS_STYLE.pending;
                                            return (
                                                <button
                                                    key={r.id}
                                                    onClick={() => onSelect(r)}
                                                    title={`${r.member_name} · ${r.leave_type} · ${r.status}`}
                                                    style={{
                                                        border: 'none', textAlign: 'left', cursor: 'pointer',
                                                        fontSize: 10.5, fontWeight: 600, padding: '2px 6px', borderRadius: 5,
                                                        background: st.bg, color: st.color,
                                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                    }}
                                                >{firstName(r.member_name)}</button>
                                            );
                                        })}
                                        {dayLeaves.length > 4 && (
                                            <span style={{ fontSize: 10, color: 'var(--text-muted)', paddingLeft: 4 }}>
                                                +{dayLeaves.length - 4} more
                                            </span>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function LegendDot({ color, bg, label }) {
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: bg, border: `1px solid ${color}` }} />
            {label}
        </span>
    );
}

function Modal({ title, onClose, children }) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'var(--surface-container-low)', borderRadius: 14, padding: 28, width: '100%', maxWidth: 500, boxShadow: '0 8px 40px rgba(0,0,0,.3)', border: '1px solid var(--outline-variant)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-main)' }}>{title}</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>&times;</button>
                </div>
                {children}
            </div>
        </div>
    );
}

const selectStyle = { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)', color: 'var(--text-main)', fontSize: 13 };
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 };
const inputStyle = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)', color: 'var(--text-main)', fontSize: 13, boxSizing: 'border-box' };
const primaryBtn = { padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const ghostBtn = { padding: '8px 20px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' };
const actionBtn = { padding: '4px 10px', borderRadius: 7, border: 'none', background: 'var(--primary)22', color: 'var(--primary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' };
const navBtn = { width: 34, height: 34, borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'transparent', color: 'var(--text-main)', fontSize: 18, cursor: 'pointer', lineHeight: 1 };
