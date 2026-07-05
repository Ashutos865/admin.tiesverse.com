import { useState, useEffect, useCallback } from 'react';
import {
    getOffboardingList, reviewOffboardingRequest,
    revokeOffboardingAccess, reactivateOffboardedMember,
} from '../../apiClient';
import { usePermissions } from '../../context/PermissionContext';

const STATUS_STYLE = {
    pending:   { bg: 'var(--secondary-container)', color: 'var(--on-secondary-container)' },
    approved:  { bg: '#fef3c7', color: '#92400e' },
    rejected:  { bg: '#fee2e2', color: '#991b1b' },
    cancelled: { bg: '#f3f4f6', color: '#6b7280' },
    completed: { bg: '#e0e7ff', color: '#3730a3' },
};
const TYPE_LABEL = {
    resignation: 'Resignation', end_of_internship: 'End of internship',
    termination: 'Termination', other: 'Other',
};

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function OffboardingPage() {
    const { hasPermission, isSuperuser } = usePermissions();
    // Team leads can see requests; only HR can approve/reject/revoke.
    const canReview = isSuperuser || hasPermission('can_review_offboarding');

    const [records, setRecords] = useState([]);
    const [filterStatus, setFilterStatus] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null);

    const [approveModal, setApproveModal] = useState(null);  // the request being approved
    const [lastDay, setLastDay] = useState(addDays(30));
    const [note, setNote] = useState('');

    const showToast = (msg, err = false) => { setToast({ msg, err }); setTimeout(() => setToast(null), 3000); };

    const load = useCallback(async () => {
        setLoading(true);
        const params = filterStatus ? { status: filterStatus } : {};
        const recs = await getOffboardingList(params);
        setRecords(Array.isArray(recs) ? recs : []);
        setLoading(false);
    }, [filterStatus]);
    useEffect(() => { load(); }, [load]);

    const openApprove = (r) => { setApproveModal(r); setLastDay(r.desired_last_day || addDays(30)); setNote(''); };

    const doApprove = async () => {
        setSaving(true);
        const res = await reviewOffboardingRequest(approveModal.id, { decision: 'approved', last_working_day: lastDay, note });
        setSaving(false);
        if (res?.id) { showToast('Offboarding approved'); setApproveModal(null); load(); }
        else showToast(res?.error || 'Only HR can review offboarding.', true);
    };

    const doDecision = async (r, decision) => {
        if (decision === 'rejected' && !window.confirm(`Reject ${r.member_name}'s offboarding request?`)) return;
        setSaving(true);
        const res = await reviewOffboardingRequest(r.id, { decision });
        setSaving(false);
        if (res?.id) { showToast(`Request ${decision}`); load(); }
        else showToast(res?.error || 'Action failed.', true);
    };

    const doRevoke = async (r) => {
        if (!window.confirm(`Revoke ${r.member_name}'s portal access now? Their record is kept; they will no longer be able to log in.`)) return;
        setSaving(true);
        const res = await revokeOffboardingAccess(r.id);
        setSaving(false);
        if (res?.id) { showToast('Access revoked'); load(); }
        else showToast(res?.error || 'Revoke failed.', true);
    };

    const doReactivate = async (r) => {
        if (!window.confirm(`Reactivate ${r.member_name}? This restores their login and active status.`)) return;
        setSaving(true);
        const res = await reactivateOffboardedMember(r.id);
        setSaving(false);
        if (res?.reactivated) { showToast('Member reactivated'); load(); }
        else showToast(res?.error || 'Reactivate failed.', true);
    };

    return (
        <div style={wrap}>
            {toast && <div style={{ ...toastBox, background: toast.err ? '#ef4444' : 'var(--primary)' }}>{toast.msg}</div>}

            <div style={{ marginBottom: 18 }}>
                <h1 style={h1}>Offboarding</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
                    Members request to leave here. HR sets a notice period and revokes access after the last working day — records are always kept.
                </p>
            </div>

            {!canReview && (
                <div style={banner}>
                    You can view offboarding requests for your team. Approving, rejecting and revoking access is handled by HR.
                </div>
            )}

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={input}>
                    <option value="">All statuses</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Serving notice</option>
                    <option value="completed">Former members</option>
                    <option value="rejected">Rejected</option>
                    <option value="cancelled">Cancelled</option>
                </select>
                <button onClick={load} style={ghostBtn}>↺ Refresh</button>
            </div>

            {loading ? <p style={muted}>Loading…</p> : records.length === 0 ? <p style={muted}>No offboarding requests.</p> : (
                <div style={{ overflowX: 'auto', border: '1px solid var(--outline-variant)', borderRadius: 12 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr>{['Member', 'Type', 'Reason', 'Requested', 'Status', 'Last working day', 'Reviewed by', ''].map(h => <th key={h} style={th}>{h}</th>)}</tr>
                        </thead>
                        <tbody>
                            {records.map(r => {
                                const st = STATUS_STYLE[r.status] || STATUS_STYLE.pending;
                                return (
                                    <tr key={r.id} style={{ borderTop: '1px solid var(--outline-variant)' }}>
                                        <td style={td}>
                                            <div style={{ fontWeight: 600 }}>{r.member_name}</div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                                                {(r.member_dept || []).join(', ') || (r.member_role || '').replace('_', ' ')}
                                            </div>
                                        </td>
                                        <td style={td}>{TYPE_LABEL[r.offboard_type] || r.offboard_type}</td>
                                        <td style={{ ...td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.reason}>{r.reason || '—'}</td>
                                        <td style={td}>{fmtDate(r.desired_last_day)}</td>
                                        <td style={td}><span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: st.bg, color: st.color }}>{r.status === 'approved' ? 'serving notice' : r.status === 'completed' ? 'former' : r.status}</span></td>
                                        <td style={td}>{fmtDate(r.last_working_day)}</td>
                                        <td style={td}>{r.reviewed_by_name || '—'}</td>
                                        <td style={{ ...td, whiteSpace: 'nowrap' }}>
                                            {canReview && r.status === 'pending' && (<>
                                                <button onClick={() => openApprove(r)} style={miniPrimary} disabled={saving}>Approve</button>
                                                <button onClick={() => doDecision(r, 'rejected')} style={miniGhost} disabled={saving}>Reject</button>
                                            </>)}
                                            {canReview && r.status === 'approved' && (
                                                <button onClick={() => doRevoke(r)} style={miniDanger} disabled={saving}>Revoke access</button>
                                            )}
                                            {canReview && r.status === 'completed' && (
                                                <button onClick={() => doReactivate(r)} style={miniGhost} disabled={saving}>Reactivate</button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {approveModal && (
                <div style={overlay} onClick={() => setApproveModal(null)}>
                    <div style={modal} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 4px', fontSize: 17 }}>Approve offboarding</h3>
                        <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: 13 }}>{approveModal.member_name} · set the notice period.</p>
                        <label style={label}>Notice period</label>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                            {[15, 30, 60, 90].map(d => (
                                <button key={d} onClick={() => setLastDay(addDays(d))}
                                    style={{ ...chip, ...(lastDay === addDays(d) ? chipOn : {}) }}>{d} days</button>
                            ))}
                            <button onClick={() => setLastDay(iso(new Date()))} style={{ ...chip, ...(lastDay === iso(new Date()) ? chipOn : {}) }}>Immediate</button>
                        </div>
                        <label style={label}>Last working day</label>
                        <input type="date" value={lastDay} onChange={e => setLastDay(e.target.value)} style={{ ...input, width: '100%', marginBottom: 12 }} />
                        <label style={label}>Note (optional)</label>
                        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} style={{ ...input, width: '100%', resize: 'vertical', marginBottom: 16 }} />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button onClick={() => setApproveModal(null)} style={ghostBtn}>Cancel</button>
                            <button onClick={doApprove} disabled={saving || !lastDay} style={primaryBtn}>{saving ? 'Saving…' : 'Approve & set notice'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const wrap = { padding: '28px 32px', maxWidth: 1180 };
const h1 = { fontSize: 22, fontWeight: 700, color: 'var(--text-main)', margin: 0 };
const muted = { color: 'var(--text-muted)', fontSize: 14 };
const banner = { background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16 };
const input = { padding: '8px 11px', border: '1px solid var(--outline-variant)', borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit', background: 'var(--surface, #fff)', color: 'var(--text-main)' };
const label = { display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--text-main)', marginBottom: 6 };
const th = { textAlign: 'left', padding: '11px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-muted)', background: 'var(--surface-container-low, #f8f8fb)' };
const td = { padding: '11px 14px', color: 'var(--text-main)', verticalAlign: 'top' };
const primaryBtn = { padding: '9px 16px', border: 'none', borderRadius: 8, background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const ghostBtn = { padding: '8px 14px', border: '1px solid var(--outline-variant)', borderRadius: 8, background: 'transparent', color: 'var(--text-main)', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const miniPrimary = { ...primaryBtn, padding: '5px 11px', fontSize: 12, marginRight: 6 };
const miniGhost = { ...ghostBtn, padding: '5px 11px', fontSize: 12, marginRight: 6 };
const miniDanger = { padding: '5px 11px', border: 'none', borderRadius: 8, background: '#dc2626', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const chip = { padding: '6px 12px', border: '1px solid var(--outline-variant)', borderRadius: 8, background: 'transparent', color: 'var(--text-main)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' };
const chipOn = { background: 'var(--primary)', borderColor: 'transparent', color: '#fff' };
const toastBox = { position: 'fixed', top: 20, right: 20, zIndex: 9999, color: '#fff', borderRadius: 10, padding: '10px 18px', fontSize: 13, boxShadow: '0 4px 16px rgba(0,0,0,.2)' };
const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 9998, padding: 20 };
const modal = { background: 'var(--surface, #fff)', borderRadius: 16, padding: 24, width: 'min(460px, 100%)', boxShadow: '0 20px 60px rgba(0,0,0,.3)' };
