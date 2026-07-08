import { useState, useEffect, useCallback } from 'react';
import { getTasks, createTask, updateTask, deleteTask, getOnboardingList, getHRDepartments, getWebinarMyAccess, getWebinarAccessGrants, setWebinarAccess } from '../../apiClient';

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const STATUSES = ['todo', 'in_progress', 'review', 'done', 'cancelled'];

const PRIORITY_COLOR = {
    low:    '#6b7280',
    medium: 'var(--primary)',
    high:   '#f59e0b',
    urgent: '#ef4444',
};

const STATUS_STYLE = {
    todo:        { bg: '#f3f4f6',                         color: '#6b7280' },
    in_progress: { bg: 'var(--secondary-container)',      color: 'var(--on-secondary-container)' },
    review:      { bg: '#fef3c7',                         color: '#92400e' },
    done:        { bg: '#d1fae5',                         color: '#065f46' },
    cancelled:   { bg: '#fee2e2',                         color: '#991b1b' },
};

const KANBAN_COLS = [
    { key: 'todo',        label: 'To Do' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'review',      label: 'In Review' },
    { key: 'done',        label: 'Done' },
];

const cap = s => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : null;

export default function TasksPage() {
    const [tasks, setTasks] = useState([]);
    const [members, setMembers] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [view, setView] = useState('kanban'); // 'kanban' | 'list'
    const [filterMember, setFilterMember] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState(null);
    const [saving, setSaving] = useState(false);

    // Task form modal
    const [taskModal, setTaskModal] = useState(null);
    const [form, setForm] = useState({
        title: '', description: '', priority: 'medium', status: 'todo',
        assigned_to: '', assigned_to_department: '', due_date: '', estimated_hours: '',
    });

    // Webinar access delegation — the Webinar lead/admin can grant capabilities to the assignee.
    const [canGrantWebinar, setCanGrantWebinar] = useState(false);
    const [webinarCapDefs, setWebinarCapDefs] = useState([]);   // [{key,label}] excluding 'view'
    const [memberGrants, setMemberGrants] = useState({});       // { member_id: [caps] }
    const [grantCaps, setGrantCaps] = useState([]);             // selected caps for current assignee

    const showToast = (msg, err = false) => {
        setToast({ msg, err });
        setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => {
        getWebinarMyAccess().then(r => {
            setCanGrantWebinar(!!r?.can_grant);
            setWebinarCapDefs((r?.all_capabilities || []).filter(c => c.key !== 'view'));
        });
        getWebinarAccessGrants().then(r => {
            const map = {};
            (r?.grants || []).forEach(g => { map[g.member_id] = g.capabilities || []; });
            setMemberGrants(map);
        });
    }, []);

    useEffect(() => {
        setGrantCaps(form.assigned_to ? (memberGrants[form.assigned_to] || []) : []);
    }, [form.assigned_to, memberGrants]);

    const load = useCallback(async () => {
        setLoading(true);
        const params = {};
        if (filterMember) params.member = filterMember;
        if (filterStatus) params.status = filterStatus;
        const [taskList, mems, depts] = await Promise.all([
            getTasks(params),
            getOnboardingList(),
            getHRDepartments(),
        ]);
        setTasks(Array.isArray(taskList) ? taskList : []);
        setMembers(Array.isArray(mems) ? mems.filter(m => m.status === 'verified') : []);
        setDepartments(Array.isArray(depts) ? depts : []);
        setLoading(false);
    }, [filterMember, filterStatus]);

    useEffect(() => { load(); }, [load]);

    const openNew = () => {
        setForm({ title: '', description: '', priority: 'medium', status: 'todo', assigned_to: '', assigned_to_department: '', due_date: '', estimated_hours: '' });
        setTaskModal('new');
    };

    const openEdit = (task) => {
        setForm({
            title: task.title, description: task.description || '',
            priority: task.priority, status: task.status,
            assigned_to: task.assigned_to || '', assigned_to_department: task.assigned_to_department || '',
            due_date: task.due_date || '', estimated_hours: task.estimated_hours ?? '',
        });
        setTaskModal(task);
    };

    const handleSave = async () => {
        if (!form.title.trim()) { showToast('Title is required', true); return; }
        if (!form.assigned_to && !form.assigned_to_department) {
            showToast('Assign to a member or a department', true); return;
        }
        setSaving(true);
        const payload = { ...form };
        if (!payload.assigned_to) delete payload.assigned_to;
        if (!payload.assigned_to_department) delete payload.assigned_to_department;
        if (!payload.due_date) delete payload.due_date;
        payload.estimated_hours = (payload.estimated_hours === '' || payload.estimated_hours == null) ? null : Number(payload.estimated_hours);

        const res = taskModal === 'new'
            ? await createTask(payload)
            : await updateTask(taskModal.id, payload);
        if (res?.id && canGrantWebinar && form.assigned_to) {
            await setWebinarAccess(form.assigned_to, grantCaps).catch(() => {});
            setMemberGrants(m => ({ ...m, [form.assigned_to]: grantCaps }));
        }
        setSaving(false);
        if (res?.id) {
            showToast(taskModal === 'new' ? 'Task created' : 'Task updated');
            setTaskModal(null);
            load();
        } else {
            showToast(res?.error || 'Failed', true);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this task?')) return;
        const res = await deleteTask(id);
        if (res?.success) { showToast('Deleted'); load(); }
        else showToast('Delete failed', true);
    };

    const moveStatus = async (task, newStatus) => {
        const res = await updateTask(task.id, { status: newStatus });
        if (res?.id) load();
        else showToast('Failed to move task', true);
    };

    const kanbanCols = KANBAN_COLS.map(col => ({
        ...col,
        tasks: tasks.filter(t => t.status === col.key),
    }));

    return (
        <div style={{ padding: '28px 32px' }}>
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
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>Tasks</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
                        Assign and track tasks for members and departments.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--outline-variant)' }}>
                        {['kanban', 'list'].map(v => (
                            <button key={v} onClick={() => setView(v)} style={{
                                padding: '6px 14px', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                background: view === v ? 'var(--primary)' : 'transparent',
                                color: view === v ? '#fff' : 'var(--text-muted)',
                            }}>{v === 'kanban' ? 'Kanban' : 'List'}</button>
                        ))}
                    </div>
                    <button onClick={openNew} style={primaryBtn}>+ Assign Task</button>
                </div>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
                <select value={filterMember} onChange={e => setFilterMember(e.target.value)} style={selectStyle}>
                    <option value="">All members</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.candidate_name}</option>)}
                </select>
                {view === 'list' && (
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
                        <option value="">All statuses</option>
                        {STATUSES.map(s => <option key={s} value={s}>{cap(s)}</option>)}
                    </select>
                )}
            </div>

            {loading ? <p style={{ color: 'var(--text-muted)' }}>Loading...</p> : (
                view === 'kanban' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, overflowX: 'auto' }}>
                        {kanbanCols.map(col => (
                            <div key={col.key} style={{ minWidth: 200 }}>
                                <div style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '8px 12px', borderRadius: '8px 8px 0 0',
                                    background: STATUS_STYLE[col.key]?.bg, marginBottom: 8,
                                }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_STYLE[col.key]?.color }}>{col.label}</span>
                                    <span style={{ fontSize: 11, color: STATUS_STYLE[col.key]?.color, opacity: .7 }}>{col.tasks.length}</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {col.tasks.map(t => (
                                        <TaskCard key={t.id} task={t} onEdit={openEdit} onDelete={handleDelete} onMove={moveStatus} />
                                    ))}
                                    {col.tasks.length === 0 && (
                                        <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, border: '1px dashed var(--outline-variant)', borderRadius: 8 }}>
                                            No tasks
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    tasks.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No tasks found.</p> : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--outline-variant)' }}>
                                        {['Title', 'Assigned To', 'Priority', 'Status', 'Progress', 'Due', 'Actions'].map(h => (
                                            <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {tasks.map(t => {
                                        const ss = STATUS_STYLE[t.status] || STATUS_STYLE.todo;
                                        return (
                                            <tr key={t.id} style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                                                <td style={{ padding: '10px 12px', color: 'var(--text-main)', fontWeight: 500 }}>{t.title}</td>
                                                <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                                                    {t.assigned_to_name || t.assigned_to_department || '—'}
                                                </td>
                                                <td style={{ padding: '10px 12px' }}>
                                                    <span style={{ fontSize: 11, fontWeight: 700, color: PRIORITY_COLOR[t.priority] }}>{cap(t.priority)}</span>
                                                </td>
                                                <td style={{ padding: '10px 12px' }}>
                                                    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: ss.bg, color: ss.color }}>{cap(t.status)}</span>
                                                </td>
                                                <td style={{ padding: '10px 12px', minWidth: 130 }}>
                                                    {(t.progress > 0 || t.estimated_hours) ? (
                                                        <div>
                                                            <div style={{ height: 5, borderRadius: 999, background: 'var(--outline-variant)', overflow: 'hidden' }}>
                                                                <div style={{ height: '100%', width: `${Math.min(100, t.progress || 0)}%`, background: (t.progress || 0) >= 100 ? '#16a34a' : 'var(--primary)' }} />
                                                            </div>
                                                            <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{t.progress || 0}%{t.estimated_hours ? ` · ${t.actual_hours || 0}/${t.estimated_hours}h` : ''}</span>
                                                        </div>
                                                    ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                                </td>
                                                <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{fmtDate(t.due_date) || '—'}</td>
                                                <td style={{ padding: '10px 12px' }}>
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                        <button onClick={() => openEdit(t)} style={actionBtn('var(--primary)')}>Edit</button>
                                                        <button onClick={() => handleDelete(t.id)} style={actionBtn('#ef4444')}>Delete</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )
                )
            )}

            {/* Task Form Modal */}
            {taskModal && (
                <Modal title={taskModal === 'new' ? 'Assign Task' : 'Edit Task'} onClose={() => setTaskModal(null)}>
                    <div style={{ display: 'grid', gap: 12 }}>
                        <div>
                            <label style={labelStyle}>Title *</label>
                            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={{ ...inputStyle, width: '100%' }} />
                        </div>
                        <div>
                            <label style={labelStyle}>Description</label>
                            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <label style={labelStyle}>Priority</label>
                                <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} style={{ ...inputStyle, width: '100%' }}>
                                    {PRIORITIES.map(p => <option key={p} value={p}>{cap(p)}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Status</label>
                                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ ...inputStyle, width: '100%' }}>
                                    {STATUSES.map(s => <option key={s} value={s}>{cap(s)}</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label style={labelStyle}>Assign to Member (individual)</label>
                            <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value, assigned_to_department: e.target.value ? '' : f.assigned_to_department }))} style={{ ...inputStyle, width: '100%' }}>
                                <option value="">— select member —</option>
                                {members.map(m => <option key={m.id} value={m.id}>{m.candidate_name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Or Assign to Department (all members)</label>
                            <select value={form.assigned_to_department} onChange={e => setForm(f => ({ ...f, assigned_to_department: e.target.value, assigned_to: e.target.value ? '' : f.assigned_to }))} style={{ ...inputStyle, width: '100%' }}>
                                <option value="">— select department —</option>
                                {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                            </select>
                        </div>
                        {canGrantWebinar && form.assigned_to && webinarCapDefs.length > 0 && (
                            <div>
                                <label style={labelStyle}>Webinar access for this member</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {webinarCapDefs.map(c => {
                                        const on = grantCaps.includes(c.key);
                                        return (
                                            <button key={c.key} type="button"
                                                onClick={() => setGrantCaps(g => on ? g.filter(x => x !== c.key) : [...g, c.key])}
                                                style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${on ? 'var(--primary)' : 'var(--outline-variant)'}`, background: on ? 'var(--primary)' : 'transparent', color: on ? '#fff' : 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                                {on ? '✓ ' : ''}{c.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '5px 0 0' }}>Grants persist until removed. Everyone in the Webinar dept keeps view.</p>
                            </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                            <div>
                                <label style={labelStyle}>Due Date (deadline)</label>
                                <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} style={{ ...inputStyle, width: '100%' }} />
                            </div>
                            <div>
                                <label style={labelStyle}>Estimated Hours</label>
                                <input type="number" min="0" step="0.5" value={form.estimated_hours} onChange={e => setForm(f => ({ ...f, estimated_hours: e.target.value }))} placeholder="e.g. 2" style={{ ...inputStyle, width: '100%' }} />
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                        <button onClick={() => setTaskModal(null)} style={ghostBtn}>Cancel</button>
                        <button onClick={handleSave} disabled={saving} style={primaryBtn}>{saving ? 'Saving...' : 'Save'}</button>
                    </div>
                </Modal>
            )}
        </div>
    );
}

function TaskCard({ task, onEdit, onDelete, onMove }) {
    const ss = STATUS_STYLE[task.status] || STATUS_STYLE.todo;
    const nextStatuses = KANBAN_COLS.map(c => c.key).filter(s => s !== task.status && s !== 'cancelled');
    return (
        <div style={{
            background: 'var(--surface-container-low)',
            border: '1px solid var(--outline-variant)',
            borderRadius: 10, padding: '12px 14px',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: PRIORITY_COLOR[task.priority] }}>{cap(task.priority)}</span>
                {task.due_date && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Due {fmtDate(task.due_date)}</span>
                )}
            </div>
            <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--text-main)', lineHeight: 1.4 }}>{task.title}</p>
            {(task.assigned_to_name || task.assigned_to_department) && (
                <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--text-muted)' }}>
                    → {task.assigned_to_name || task.assigned_to_department}
                </p>
            )}
            {(task.progress > 0 || task.estimated_hours) && (
                <div style={{ margin: '0 0 8px' }}>
                    <div style={{ height: 5, borderRadius: 999, background: 'var(--outline-variant)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, task.progress || 0)}%`, background: (task.progress || 0) >= 100 ? '#16a34a' : 'var(--primary)', transition: 'width .3s' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                        <span>{task.progress || 0}% done</span>
                        {task.estimated_hours ? <span>{task.actual_hours || 0}/{task.estimated_hours}h</span> : null}
                    </div>
                </div>
            )}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                {nextStatuses.slice(0, 2).map(s => (
                    <button key={s} onClick={() => onMove(task, s)} style={{
                        padding: '2px 8px', borderRadius: 6, border: 'none', fontSize: 10, fontWeight: 600,
                        background: STATUS_STYLE[s]?.bg, color: STATUS_STYLE[s]?.color, cursor: 'pointer',
                    }}>→ {cap(s)}</button>
                ))}
                <button onClick={() => onEdit(task)} style={{ padding: '2px 8px', borderRadius: 6, border: '1px solid var(--outline-variant)', background: 'transparent', color: 'var(--text-muted)', fontSize: 10, cursor: 'pointer', marginLeft: 'auto' }}>Edit</button>
            </div>
        </div>
    );
}

function Modal({ title, onClose, children }) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'var(--surface-container-low)', borderRadius: 14, padding: 28, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,.3)', border: '1px solid var(--outline-variant)' }}>
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
const actionBtn = (color) => ({ padding: '4px 10px', borderRadius: 7, border: 'none', background: color + '22', color, fontSize: 11, fontWeight: 600, cursor: 'pointer' });
