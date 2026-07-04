import { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import {
    getAttendanceList, checkIn, checkOut,
    getLeaveList, createLeaveRequest,
    getTasks, updateTask,
    getAssets,
} from '../../apiClient';
import { useMe } from '../../context/MeContext';

const TABS = [
    { key: 'attendance', label: 'Attendance', path: '/me/attendance' },
    { key: 'leave', label: 'Leave', path: '/me/leave' },
    { key: 'tasks', label: 'Tasks', path: '/me/tasks' },
    { key: 'assets', label: 'Assets', path: '/me/assets' },
    { key: 'profile', label: 'Profile', path: '/me/profile' },
];

const LEAVE_TYPES = ['sick', 'casual', 'personal', 'unpaid', 'other'];
const TASK_STATUSES = ['todo', 'in_progress', 'review', 'done'];

const todayISO = () => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtTime = (d) => d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

const APPROVAL_BADGE = {
    pending: { bg: 'var(--secondary-container)', color: 'var(--on-secondary-container)', label: 'Pending' },
    approved: { bg: '#d1fae5', color: '#065f46', label: 'Approved' },
    rejected: { bg: '#fee2e2', color: '#991b1b', label: 'Rejected' },
};
const LEAVE_STATUS = {
    pending: { bg: 'var(--secondary-container)', color: 'var(--on-secondary-container)' },
    approved: { bg: '#d1fae5', color: '#065f46' },
    rejected: { bg: '#fee2e2', color: '#991b1b' },
    cancelled: { bg: '#f3f4f6', color: '#6b7280' },
};

export default function MyWork({ tab = 'attendance' }) {
    const { member, memberId, isMember, loading: meLoading } = useMe();
    const [toast, setToast] = useState(null);
    const showToast = (msg, err = false) => { setToast({ msg, err }); setTimeout(() => setToast(null), 3000); };

    if (meLoading) return <div style={wrap}><p style={{ color: 'var(--text-muted)' }}>Loading…</p></div>;
    if (!isMember) return (
        <div style={wrap}>
            <h1 style={h1}>My Work</h1>
            <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>
                Your account isn't linked to a member profile, so there's nothing here.
                This area is for members to manage their own attendance, leave, tasks, and assets.
            </p>
        </div>
    );

    return (
        <div style={wrap}>
            {toast && (
                <div style={{
                    position: 'fixed', top: 20, right: 20, zIndex: 9999,
                    background: toast.err ? '#ef4444' : 'var(--primary)', color: '#fff',
                    borderRadius: 10, padding: '10px 18px', fontSize: 13, boxShadow: '0 4px 16px rgba(0,0,0,.2)',
                }}>{toast.msg}</div>
            )}

            <div style={{ marginBottom: 18 }}>
                <h1 style={h1}>My Work</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
                    {member?.candidate_name} · {(member?.portal_role || 'member').replace('_', ' ')}
                    {member?.assigned_departments?.length ? ` · ${member.assigned_departments.join(', ')}` : ''}
                </p>
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 22, borderBottom: '1px solid var(--outline-variant)', flexWrap: 'wrap' }}>
                {TABS.map(t => (
                    <NavLink key={t.key} to={t.path} style={({ isActive }) => ({
                        padding: '9px 16px', fontSize: 13, fontWeight: 600, textDecoration: 'none',
                        color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                        borderBottom: isActive ? '2px solid var(--primary)' : '2px solid transparent',
                        marginBottom: -1,
                    })}>{t.label}</NavLink>
                ))}
            </div>

            {tab === 'attendance' && <AttendancePanel memberId={memberId} showToast={showToast} />}
            {tab === 'leave' && <LeavePanel showToast={showToast} />}
            {tab === 'tasks' && <TasksPanel showToast={showToast} />}
            {tab === 'assets' && <AssetsPanel />}
            {tab === 'profile' && <ProfilePanel member={member} />}
        </div>
    );
}

// ── Attendance ──
function AttendancePanel({ memberId, showToast }) {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showCheckout, setShowCheckout] = useState(false);
    const [report, setReport] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        const recs = await getAttendanceList({ member: memberId });
        setRecords(Array.isArray(recs) ? recs : []);
        setLoading(false);
    }, [memberId]);
    useEffect(() => { load(); }, [load]);

    const today = records.find(r => r.date === todayISO());

    const doCheckIn = async () => {
        setSaving(true);
        const res = await checkIn(memberId);
        setSaving(false);
        if (res?.error) return showToast(res.error, true);
        showToast('Checked in'); load();
    };
    const doCheckOut = async () => {
        if (!report.trim()) return showToast('Please write what you did today', true);
        setSaving(true);
        const res = await checkOut(memberId, { work_report: report });
        setSaving(false);
        if (res?.error) return showToast(res.error, true);
        showToast('Checked out'); setShowCheckout(false); setReport(''); load();
    };

    return (
        <div>
            {/* Today card */}
            <div style={{ ...card, marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>
                    Today · {fmtDate(todayISO())}
                </div>
                {!today || !today.check_in ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>Not checked in yet.</span>
                        <button onClick={doCheckIn} disabled={saving} style={primaryBtn}>Check In</button>
                    </div>
                ) : !today.check_out ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, color: 'var(--text-main)' }}>Checked in at <strong>{fmtTime(today.check_in)}</strong></span>
                        <button onClick={() => { setShowCheckout(true); setReport(''); }} style={{ ...primaryBtn, background: '#f59e0b' }}>Check Out & Submit Report</button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, color: 'var(--text-main)' }}>
                            {fmtTime(today.check_in)} → {fmtTime(today.check_out)}
                        </span>
                        <StatusBadge badge={APPROVAL_BADGE[today.approval_status] || APPROVAL_BADGE.pending} />
                        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Report submitted ✓</span>
                    </div>
                )}
            </div>

            {/* History */}
            <SectionTitle>My attendance history</SectionTitle>
            {loading ? <Muted>Loading…</Muted> : records.length === 0 ? <Muted>No records yet.</Muted> : (
                <TableWrap>
                    <thead><tr>{['Date', 'In', 'Out', 'Status', 'Approval', 'Report'].map(h => <Th key={h}>{h}</Th>)}</tr></thead>
                    <tbody>
                        {records.map(r => (
                            <tr key={r.id} style={rowBorder}>
                                <Td>{r.date}</Td>
                                <Td>{fmtTime(r.check_in)}</Td>
                                <Td>{fmtTime(r.check_out)}</Td>
                                <Td style={{ textTransform: 'capitalize' }}>{r.status}</Td>
                                <Td><StatusBadge badge={APPROVAL_BADGE[r.approval_status] || APPROVAL_BADGE.pending} /></Td>
                                <Td title={r.work_report} style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.work_report || '—'}</Td>
                            </tr>
                        ))}
                    </tbody>
                </TableWrap>
            )}

            {showCheckout && (
                <Modal title="Check Out — Daily Report" onClose={() => setShowCheckout(false)}>
                    <label style={label}>What did you work on today? *</label>
                    <textarea value={report} onChange={e => setReport(e.target.value)} rows={5}
                        placeholder="Summary of today's work…" style={{ ...input, resize: 'vertical' }} />
                    <ModalActions>
                        <button onClick={() => setShowCheckout(false)} style={ghostBtn}>Cancel</button>
                        <button onClick={doCheckOut} disabled={saving} style={primaryBtn}>{saving ? 'Saving…' : 'Submit & Check Out'}</button>
                    </ModalActions>
                </Modal>
            )}
        </div>
    );
}

// ── Leave ──
function LeavePanel({ showToast }) {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ leave_type: 'casual', from_date: '', to_date: '', reason: '' });

    const load = useCallback(async () => {
        setLoading(true);
        const recs = await getLeaveList();
        setRecords(Array.isArray(recs) ? recs : []);
        setLoading(false);
    }, []);
    useEffect(() => { load(); }, [load]);

    const submit = async () => {
        if (!form.from_date || !form.to_date) return showToast('Pick both dates', true);
        if (form.to_date < form.from_date) return showToast('"To" cannot be before "From"', true);
        setSaving(true);
        const res = await createLeaveRequest(form);   // backend forces member = me
        setSaving(false);
        if (res?.id) { showToast('Leave request submitted'); setShowForm(false); setForm({ leave_type: 'casual', from_date: '', to_date: '', reason: '' }); load(); }
        else showToast(res?.error || 'Failed', true);
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <SectionTitle>My leave requests</SectionTitle>
                <button onClick={() => setShowForm(true)} style={primaryBtn}>+ Request Leave</button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>All leave is unpaid. Requests are reviewed and approved by HR.</p>
            {loading ? <Muted>Loading…</Muted> : records.length === 0 ? <Muted>No requests yet.</Muted> : (
                <TableWrap>
                    <thead><tr>{['Type', 'From', 'To', 'Days', 'Reason', 'Status', 'Reviewed by'].map(h => <Th key={h}>{h}</Th>)}</tr></thead>
                    <tbody>
                        {records.map(r => {
                            const st = LEAVE_STATUS[r.status] || LEAVE_STATUS.pending;
                            return (
                                <tr key={r.id} style={rowBorder}>
                                    <Td style={{ textTransform: 'capitalize' }}>{r.leave_type}</Td>
                                    <Td>{fmtDate(r.from_date)}</Td>
                                    <Td>{fmtDate(r.to_date)}</Td>
                                    <Td>{r.duration_days}</Td>
                                    <Td title={r.reason} style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason || '—'}</Td>
                                    <Td><span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: st.bg, color: st.color }}>{r.status}</span></Td>
                                    <Td>{r.reviewed_by_name || '—'}</Td>
                                </tr>
                            );
                        })}
                    </tbody>
                </TableWrap>
            )}

            {showForm && (
                <Modal title="Request Leave" onClose={() => setShowForm(false)}>
                    <div style={{ display: 'grid', gap: 12 }}>
                        <div>
                            <label style={label}>Type</label>
                            <select value={form.leave_type} onChange={e => setForm(f => ({ ...f, leave_type: e.target.value }))} style={{ ...input, width: '100%' }}>
                                {LEAVE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div><label style={label}>From *</label><input type="date" value={form.from_date} onChange={e => setForm(f => ({ ...f, from_date: e.target.value }))} style={{ ...input, width: '100%' }} /></div>
                            <div><label style={label}>To *</label><input type="date" value={form.to_date} onChange={e => setForm(f => ({ ...f, to_date: e.target.value }))} style={{ ...input, width: '100%' }} /></div>
                        </div>
                        <div><label style={label}>Reason</label><textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={3} style={{ ...input, width: '100%', resize: 'vertical' }} /></div>
                    </div>
                    <ModalActions>
                        <button onClick={() => setShowForm(false)} style={ghostBtn}>Cancel</button>
                        <button onClick={submit} disabled={saving} style={primaryBtn}>{saving ? 'Saving…' : 'Submit'}</button>
                    </ModalActions>
                </Modal>
            )}
        </div>
    );
}

// ── Tasks ──
function TasksPanel({ showToast }) {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        const t = await getTasks();
        setTasks(Array.isArray(t) ? t : []);
        setLoading(false);
    }, []);
    useEffect(() => { load(); }, [load]);

    const setStatus = async (id, status) => {
        const res = await updateTask(id, { status });
        if (res?.id) { showToast('Task updated'); load(); }
        else showToast(res?.error || 'Failed', true);
    };

    return (
        <div>
            <SectionTitle>My tasks</SectionTitle>
            {loading ? <Muted>Loading…</Muted> : tasks.length === 0 ? <Muted>No tasks assigned to you.</Muted> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                    {tasks.map(t => (
                        <div key={t.id} style={card}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: 14 }}>{t.title}</div>
                                    {t.description && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3 }}>{t.description}</div>}
                                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>
                                        Priority: <span style={{ textTransform: 'capitalize' }}>{t.priority}</span>
                                        {t.due_date ? ` · Due ${fmtDate(t.due_date)}` : ''}
                                        {t.assigned_by_name ? ` · From ${t.assigned_by_name}` : ''}
                                    </div>
                                </div>
                                <select value={t.status} onChange={e => setStatus(t.id, e.target.value)} style={{ ...input, flexShrink: 0 }}>
                                    {TASK_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                                </select>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Assets ──
function AssetsPanel() {
    const [assets, setAssets] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        (async () => { const a = await getAssets(); setAssets(Array.isArray(a) ? a : []); setLoading(false); })();
    }, []);
    return (
        <div>
            <SectionTitle>Assets assigned to me</SectionTitle>
            {loading ? <Muted>Loading…</Muted> : assets.length === 0 ? <Muted>No assets assigned to you.</Muted> : (
                <TableWrap>
                    <thead><tr>{['Asset', 'Category', 'Serial', 'Condition', 'Assigned'].map(h => <Th key={h}>{h}</Th>)}</tr></thead>
                    <tbody>
                        {assets.map(a => (
                            <tr key={a.id} style={rowBorder}>
                                <Td style={{ fontWeight: 500, color: 'var(--text-main)' }}>{a.name}</Td>
                                <Td style={{ textTransform: 'capitalize' }}>{a.category}</Td>
                                <Td>{a.serial_number || '—'}</Td>
                                <Td style={{ textTransform: 'capitalize' }}>{a.condition}</Td>
                                <Td>{fmtDate(a.assigned_at)}</Td>
                            </tr>
                        ))}
                    </tbody>
                </TableWrap>
            )}
        </div>
    );
}

// ── Profile ──
function ProfilePanel({ member }) {
    const rows = [
        ['Name', member?.candidate_name],
        ['Email', member?.candidate_email],
        ['Role', (member?.portal_role || '').replace('_', ' ')],
        ['Employment', member?.employment_type],
        ['Departments', (member?.assigned_departments || []).join(', ')],
        ['Joining date', member?.joining_date ? fmtDate(member.joining_date) : ''],
        ['Login', member?.account_username],
    ];
    return (
        <div>
            <SectionTitle>My profile</SectionTitle>
            <div style={{ ...card, maxWidth: 520, marginTop: 8 }}>
                {rows.map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', padding: '9px 0', borderBottom: '1px solid var(--outline-variant)' }}>
                        <div style={{ width: 140, fontSize: 12.5, color: 'var(--text-muted)' }}>{k}</div>
                        <div style={{ fontSize: 13.5, color: 'var(--text-main)', fontWeight: 500 }}>{v || '—'}</div>
                    </div>
                ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
                Need a change to your details? Contact HR.
            </p>
        </div>
    );
}

// ── Shared bits ──
const StatusBadge = ({ badge }) => (
    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: badge.bg, color: badge.color }}>{badge.label}</span>
);
const SectionTitle = ({ children }) => <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)', margin: '0 0 6px' }}>{children}</h2>;
const Muted = ({ children }) => <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{children}</p>;
const Th = ({ children }) => <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '2px solid var(--outline-variant)' }}>{children}</th>;
const Td = ({ children, style: s }) => <td style={{ padding: '10px 12px', color: 'var(--text-muted)', ...s }}>{children}</td>;
const TableWrap = ({ children }) => (
    <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>{children}</table></div>
);
function Modal({ title, onClose, children }) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'var(--surface-container-low)', borderRadius: 14, padding: 28, width: '100%', maxWidth: 480, boxShadow: '0 8px 40px rgba(0,0,0,.3)', border: '1px solid var(--outline-variant)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-main)' }}>{title}</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>&times;</button>
                </div>
                {children}
            </div>
        </div>
    );
}
const ModalActions = ({ children }) => <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>{children}</div>;

const wrap = { padding: '28px 32px', maxWidth: 1000 };
const h1 = { fontSize: 22, fontWeight: 700, color: 'var(--text-main)', margin: 0 };
const rowBorder = { borderBottom: '1px solid var(--outline-variant)' };
const card = { background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 12, padding: '16px 18px' };
const label = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 };
const input = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)', color: 'var(--text-main)', fontSize: 13, boxSizing: 'border-box' };
const primaryBtn = { padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const ghostBtn = { padding: '8px 18px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' };
