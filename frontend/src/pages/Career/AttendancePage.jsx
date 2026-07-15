import { useState, useEffect, useCallback } from 'react';
import {
    getAttendanceList, approveAttendance, checkIn, checkOut,
    getOnboardingList,
} from '../../apiClient';
import SearchableSelect from '../../components/SearchableSelect';

// Build the {value,label,sub} option list a SearchableSelect wants from members.
const memberOptions = (members) =>
    (members || []).map(m => ({ value: m.id, label: m.candidate_name, sub: m.portal_role_label || m.member_type || '' }));

const STATUS_COLOR = {
    present: 'var(--primary)',
    absent: '#ef4444',
    late: '#f59e0b',
    half_day: '#8b5cf6',
    on_leave: '#6b7280',
    holiday: '#14b8a6',
};

const APPROVAL_BADGE = {
    pending: { bg: 'var(--secondary-container)', color: 'var(--on-secondary-container)', label: 'Pending' },
    approved: { bg: '#d1fae5', color: '#065f46', label: 'Approved' },
    rejected: { bg: '#fee2e2', color: '#991b1b', label: 'Rejected' },
};

function MemberSelect({ members, value, onChange, placeholder = 'All members' }) {
    return (
        <SearchableSelect
            options={memberOptions(members)}
            value={value}
            onChange={onChange}
            clearable
            allLabel={placeholder}
            searchPlaceholder="Search member…"
            style={{ minWidth: 210 }}
        />
    );
}

export default function AttendancePage() {
    const [records, setRecords] = useState([]);
    const [members, setMembers] = useState([]);
    const [filterMember, setFilterMember] = useState('');
    const [filterApproval, setFilterApproval] = useState('');
    const [loading, setLoading] = useState(true);

    // Checkout modal state
    const [checkoutModal, setCheckoutModal] = useState(null);
    const [workReport, setWorkReport] = useState('');
    const [approveModal, setApproveModal] = useState(null);
    const [approveNote, setApproveNote] = useState('');
    // Check-in modal state
    const [showCheckIn, setShowCheckIn] = useState(false);
    const [checkInMember, setCheckInMember] = useState('');
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null);

    const showToast = (msg, err = false) => {
        setToast({ msg, err });
        setTimeout(() => setToast(null), 3000);
    };

    const load = useCallback(async () => {
        setLoading(true);
        const params = {};
        if (filterMember) params.member = filterMember;
        if (filterApproval) params.approval = filterApproval;
        const [recs, mems] = await Promise.all([
            getAttendanceList(params),
            getOnboardingList(),
        ]);
        setRecords(Array.isArray(recs) ? recs : []);
        setMembers(Array.isArray(mems) ? mems.filter(m => m.status === 'verified') : []);
        setLoading(false);
    }, [filterMember, filterApproval]);

    useEffect(() => { load(); }, [load]);

    const handleCheckIn = async (memberId) => {
        if (!memberId) { showToast('Select a member first', true); return; }
        setSaving(true);
        const res = await checkIn(memberId);
        setSaving(false);
        if (res?.error) { showToast(res.error, true); return; }
        showToast('Checked in');
        setShowCheckIn(false);
        setCheckInMember('');
        load();
    };

    const handleCheckout = async () => {
        if (!workReport.trim()) { showToast('Work report is required', true); return; }
        setSaving(true);
        const res = await checkOut(checkoutModal.member, { work_report: workReport });
        setSaving(false);
        if (res?.error) { showToast(res.error, true); return; }
        showToast('Checked out');
        setCheckoutModal(null);
        setWorkReport('');
        load();
    };

    const handleApprove = async (decision) => {
        setSaving(true);
        const res = await approveAttendance(approveModal.id, { decision, note: approveNote });
        setSaving(false);
        if (res?.error) { showToast(res.error, true); return; }
        showToast(decision === 'approved' ? 'Approved' : 'Rejected');
        setApproveModal(null);
        setApproveNote('');
        load();
    };

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

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>Attendance</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4, maxWidth: 560 }}>
                        Daily attendance and end-of-day work reports. Check a member in below; they
                        (or you) submit the work report at check-out, and team leads review and approve.
                    </p>
                </div>
                <button onClick={() => { setCheckInMember(filterMember || ''); setShowCheckIn(true); }} style={{
                    padding: '8px 20px', borderRadius: 8, border: 'none', flexShrink: 0,
                    background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>+ Check In Member</button>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
                <MemberSelect members={members} value={filterMember} onChange={setFilterMember} />
                <select
                    value={filterApproval}
                    onChange={e => setFilterApproval(e.target.value)}
                    style={{
                        padding: '6px 10px', borderRadius: 8, border: '1px solid var(--outline-variant)',
                        background: 'var(--surface-container-low)', color: 'var(--text-main)', fontSize: 13,
                    }}
                >
                    <option value="">All approval statuses</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                </select>
                <button onClick={load} style={{
                    padding: '6px 14px', borderRadius: 8, border: '1px solid var(--outline-variant)',
                    background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
                }}>Refresh</button>
            </div>

            {/* Table */}
            {loading ? (
                <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
            ) : records.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No records found.</p>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--outline-variant)' }}>
                                {['Member', 'Date', 'Check-In', 'Check-Out', 'Status', 'Approval', 'Work Report', 'Actions'].map(h => (
                                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {records.map(r => {
                                const badge = APPROVAL_BADGE[r.approval_status] || APPROVAL_BADGE.pending;
                                return (
                                    <tr key={r.id} style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                                        <td style={{ padding: '10px 12px', color: 'var(--text-main)', fontWeight: 500 }}>{r.member_name}</td>
                                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{r.date}</td>
                                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                                            {r.check_in ? new Date(r.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                                        </td>
                                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                                            {r.check_out ? new Date(r.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                                        </td>
                                        <td style={{ padding: '10px 12px' }}>
                                            <span style={{
                                                padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                                                background: STATUS_COLOR[r.status] + '22', color: STATUS_COLOR[r.status],
                                            }}>{r.status}</span>
                                        </td>
                                        <td style={{ padding: '10px 12px' }}>
                                            <span style={{
                                                padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                                                background: badge.bg, color: badge.color,
                                            }}>{badge.label}</span>
                                        </td>
                                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)', maxWidth: 200 }}>
                                            <span title={r.work_report} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {r.work_report || '—'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '10px 12px' }}>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                {r.check_in && !r.check_out && (
                                                    <button onClick={() => { setCheckoutModal(r); setWorkReport(''); }} style={btnStyle('#f59e0b')}>
                                                        Check Out
                                                    </button>
                                                )}
                                                {r.approval_status === 'pending' && r.check_out && (
                                                    <button onClick={() => { setApproveModal(r); setApproveNote(''); }} style={btnStyle('var(--primary)')}>
                                                        Review
                                                    </button>
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

            {/* Check-In Modal */}
            {showCheckIn && (
                <Modal title="Check In Member" onClose={() => setShowCheckIn(false)}>
                    <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
                        Records today's attendance for the selected member. Work report is collected at check-out.
                    </p>
                    <label style={labelStyle}>Member *</label>
                    <SearchableSelect
                        options={memberOptions(members)}
                        value={checkInMember}
                        onChange={setCheckInMember}
                        placeholder="Select member"
                        searchPlaceholder="Search member…"
                    />
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                        <button onClick={() => setShowCheckIn(false)} style={ghostBtn}>Cancel</button>
                        <button onClick={() => handleCheckIn(checkInMember)} disabled={saving || !checkInMember} style={primaryBtn}>
                            {saving ? 'Saving...' : 'Check In Today'}
                        </button>
                    </div>
                </Modal>
            )}

            {/* Checkout Modal */}
            {checkoutModal && (
                <Modal title={`Check Out — ${checkoutModal.member_name}`} onClose={() => setCheckoutModal(null)}>
                    <label style={labelStyle}>Work Report *</label>
                    <textarea
                        value={workReport}
                        onChange={e => setWorkReport(e.target.value)}
                        rows={5}
                        placeholder="What did you work on today?"
                        style={{ ...inputStyle, resize: 'vertical' }}
                    />
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                        <button onClick={() => setCheckoutModal(null)} style={ghostBtn}>Cancel</button>
                        <button onClick={handleCheckout} disabled={saving} style={primaryBtn}>
                            {saving ? 'Saving...' : 'Submit & Check Out'}
                        </button>
                    </div>
                </Modal>
            )}

            {/* Approve Modal */}
            {approveModal && (
                <Modal title={`Review Work Report — ${approveModal.member_name}`} onClose={() => setApproveModal(null)}>
                    <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
                        {approveModal.date} &mdash; {approveModal.work_report}
                    </p>
                    <label style={labelStyle}>Note (optional)</label>
                    <input
                        value={approveNote}
                        onChange={e => setApproveNote(e.target.value)}
                        placeholder="Add a note..."
                        style={inputStyle}
                    />
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                        <button onClick={() => setApproveModal(null)} style={ghostBtn}>Cancel</button>
                        <button onClick={() => handleApprove('rejected')} disabled={saving} style={{ ...primaryBtn, background: '#ef4444' }}>
                            Reject
                        </button>
                        <button onClick={() => handleApprove('approved')} disabled={saving} style={primaryBtn}>
                            {saving ? 'Saving...' : 'Approve'}
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    );
}

function Modal({ title, onClose, children }) {
    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <div style={{
                background: 'var(--surface-container-low)', borderRadius: 14, padding: 28,
                width: '100%', maxWidth: 480, boxShadow: '0 8px 40px rgba(0,0,0,.3)',
                border: '1px solid var(--outline-variant)',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-main)' }}>{title}</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>&times;</button>
                </div>
                {children}
            </div>
        </div>
    );
}

const btnStyle = (bg) => ({
    padding: '4px 10px', borderRadius: 7, border: 'none', background: bg + '22',
    color: bg, fontSize: 11, fontWeight: 600, cursor: 'pointer',
});

const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 };

const inputStyle = {
    width: '100%', padding: '8px 12px', borderRadius: 8,
    border: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)',
    color: 'var(--text-main)', fontSize: 13, boxSizing: 'border-box',
};

const primaryBtn = {
    padding: '8px 20px', borderRadius: 8, border: 'none',
    background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const ghostBtn = {
    padding: '8px 20px', borderRadius: 8, border: '1px solid var(--outline-variant)',
    background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
};
