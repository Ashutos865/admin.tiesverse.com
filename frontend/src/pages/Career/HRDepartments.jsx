import React, { useState, useEffect, useCallback } from 'react';
import { getHRDepartments, createHRDepartment, updateHRDepartment, deleteHRDepartment, getOnboardingList } from '../../apiClient';
import { Building2, Plus, Edit2, Trash2, X, Crown, Users, Lock } from 'lucide-react';
import { usePermissions } from '../../context/PermissionContext';
import SearchableSelect from '../../components/SearchableSelect';

// Only HR/Admin (write access) may manage departments — Team Leads etc. cannot.
function NoAccess({ title }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '64px 24px', color: 'var(--text-muted)', textAlign: 'center' }}>
            <Lock size={30} />
            <h2 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.1rem' }}>{title}</h2>
            <p style={{ margin: 0, maxWidth: 380, fontSize: '0.9rem' }}>You don’t have permission to view this page. Ask an admin if you think this is a mistake.</p>
        </div>
    );
}

const fieldStyle = {
    width: '100%', padding: '10px 13px', borderRadius: 8,
    background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)',
    color: 'var(--text-main)', fontSize: '0.875rem', fontFamily: 'inherit',
    boxSizing: 'border-box', outline: 'none',
};

const EMPTY = { name: '', description: '', lead_name: '', co_lead_name: '', is_active: true };

const ROLE_LABELS = { member: 'Member', intern: 'Intern', team_lead: 'Team Lead', advisory: 'Advisory', hr: 'HR', admin: 'Admin', contractual: 'Contractual', superuser: 'Super User' };
const memberRoleLabel = (m) => ROLE_LABELS[m.portal_role] || m.role_offered || 'No role';

// Dropdown to pick a team member by name (or clear). Values are the member's
// name (lead_name / co_lead_name are stored as names, not ids).
function MemberSelect({ value, onChange, members, placeholder }) {
    return (
        <SearchableSelect
            options={members.map(m => ({ value: m.candidate_name, label: m.candidate_name, sub: memberRoleLabel(m) }))}
            value={value}
            onChange={onChange}
            clearable
            allLabel={placeholder}
            searchPlaceholder="Search member…"
        />
    );
}

export default function HRDepartments() {
    const { hasAnyPermission, isSuperuser } = usePermissions();
    const canManage = isSuperuser || hasAnyPermission(['add_hrdepartment', 'change_hrdepartment', 'delete_hrdepartment']);
    const [departments, setDepartments] = useState([]);
    const [teamMembers, setTeamMembers] = useState([]);   // verified onboarding submissions
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);
    const [notification, setNotification] = useState(null);

    const showNotice = (msg, type = 'success') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 4000);
    };

    const load = useCallback(async () => {
        setLoading(true);
        const [depts, subs] = await Promise.all([getHRDepartments(), getOnboardingList()]);
        setDepartments(Array.isArray(depts) ? depts : []);
        // Only verified members can be leads
        setTeamMembers(Array.isArray(subs) ? subs.filter(s => s.status === 'verified') : []);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const openCreate = () => { setForm(EMPTY); setModal({ mode: 'create' }); };
    const openEdit = (dept) => {
        setForm({
            name: dept.name,
            description: dept.description || '',
            lead_name: dept.lead_name || '',
            co_lead_name: dept.co_lead_name || '',
            is_active: dept.is_active,
        });
        setModal({ mode: 'edit', id: dept.id });
    };
    const closeModal = () => setModal(null);

    const handleSave = async () => {
        if (!form.name.trim()) { showNotice('Department name is required.', 'error'); return; }
        setSaving(true);
        const payload = { ...form, name: form.name.trim() };
        const res = modal.mode === 'create'
            ? await createHRDepartment(payload)
            : await updateHRDepartment(modal.id, payload);
        setSaving(false);
        if (res?.id) {
            if (modal.mode === 'create') setDepartments(prev => [...prev, res].sort((a, b) => a.name.localeCompare(b.name)));
            else setDepartments(prev => prev.map(d => d.id === res.id ? res : d).sort((a, b) => a.name.localeCompare(b.name)));
            showNotice(modal.mode === 'create' ? 'Department created.' : 'Department updated.');
            closeModal();
        } else {
            showNotice(res?.name?.[0] || res?.error || 'Save failed.', 'error');
        }
    };

    const handleDelete = async (dept) => {
        if (!window.confirm(`Delete "${dept.name}"?`)) return;
        await deleteHRDepartment(dept.id);
        setDepartments(prev => prev.filter(d => d.id !== dept.id));
        showNotice('Department deleted.');
    };

    if (!canManage) return <NoAccess title="HR Departments" />;

    return (
        <div style={{ padding: '32px 28px', minHeight: '100%' }}>
            {notification && (
                <div style={{
                    position: 'fixed', top: 24, right: 24, zIndex: 9999,
                    background: notification.type === 'error'
                        ? 'color-mix(in srgb, #ba1a1a 12%, var(--surface-container-lowest))'
                        : 'color-mix(in srgb, #067a50 12%, var(--surface-container-lowest))',
                    border: `1px solid ${notification.type === 'error' ? 'color-mix(in srgb, #ba1a1a 25%, transparent)' : 'color-mix(in srgb, #067a50 25%, transparent)'}`,
                    color: notification.type === 'error' ? '#ba1a1a' : '#067a50',
                    padding: '12px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                }}>{notification.msg}</div>
            )}

            {/* Header */}
            <div className="career-admin-header" style={{ marginBottom: 24 }}>
                <div>
                    <span className="career-admin-eyebrow">HR Operations</span>
                    <h1>HR Departments</h1>
                    <p>Create and manage departments. Assign a Team Lead and Co-Lead from your verified team members.</p>
                </div>
                <button className="career-admin-create" onClick={openCreate}>
                    <Plus size={16} /> New Department
                </button>
            </div>

            {loading ? (
                <div style={{ color: 'var(--text-muted)', padding: '64px 0', textAlign: 'center', fontSize: 13, fontWeight: 600 }}>Loading departments…</div>
            ) : departments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-muted)', fontSize: 14 }}>
                    <Building2 size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
                    No departments yet. Create your first one above.
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 }}>
                    {departments.map(dept => {
                        const memberCount = teamMembers.filter(m => (m.assigned_departments || []).includes(dept.name)).length;
                        return (
                            <div key={dept.id} style={{
                                background: 'var(--surface-container-lowest)',
                                border: '1px solid var(--outline-variant)',
                                borderRadius: 13, padding: '18px 18px 14px',
                                transition: 'border-color 180ms ease',
                            }}>
                                {/* Card header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                            <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'Hanken Grotesk, sans-serif' }}>
                                                {dept.name}
                                            </h3>
                                            <span style={{
                                                fontSize: '0.625rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.05em',
                                                background: dept.is_active ? 'color-mix(in srgb, #067a50 10%, transparent)' : 'color-mix(in srgb, var(--text-muted) 10%, transparent)',
                                                color: dept.is_active ? '#067a50' : 'var(--text-muted)',
                                            }}>{dept.is_active ? 'Active' : 'Inactive'}</span>
                                        </div>
                                        {dept.description && (
                                            <p style={{ margin: '5px 0 0', fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{dept.description}</p>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                                        <button onClick={() => openEdit(dept)} style={{ background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', color: 'var(--text-muted)', cursor: 'pointer', padding: 6, borderRadius: 7, display: 'grid', placeItems: 'center' }}>
                                            <Edit2 size={13} />
                                        </button>
                                        <button onClick={() => handleDelete(dept)} style={{ background: 'color-mix(in srgb, #ba1a1a 6%, transparent)', border: '1px solid color-mix(in srgb, #ba1a1a 15%, transparent)', color: '#ba1a1a', cursor: 'pointer', padding: 6, borderRadius: 7, display: 'grid', placeItems: 'center' }}>
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </div>

                                {/* Lead / Co-lead */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>
                                    {dept.lead_name ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.8125rem' }}>
                                            <Crown size={12} style={{ color: '#f59e0b', flexShrink: 0 }} />
                                            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Lead:</span>
                                            <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>{dept.lead_name}</span>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.8125rem' }}>
                                            <Crown size={12} style={{ color: 'var(--outline-variant)', flexShrink: 0 }} />
                                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No lead assigned</span>
                                        </div>
                                    )}
                                    {dept.co_lead_name && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.8125rem' }}>
                                            <Crown size={11} style={{ color: 'var(--primary)', flexShrink: 0, opacity: 0.7 }} />
                                            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Co-Lead:</span>
                                            <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>{dept.co_lead_name}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Member count */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--outline-variant)' }}>
                                    <Users size={12} style={{ color: 'var(--text-muted)' }} />
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                        {memberCount} {memberCount === 1 ? 'member' : 'members'}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal */}
            {modal && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(25,28,30,0.64)', backdropFilter: 'blur(9px)', display: 'grid', placeItems: 'center', padding: 24 }}>
                    <div style={{ background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)', borderRadius: 13, width: '100%', maxWidth: 480, boxShadow: '0 28px 80px rgba(15,23,42,0.2)' }}>
                        {/* Modal header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid var(--outline-variant)' }}>
                            <strong style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'Hanken Grotesk, sans-serif' }}>
                                {modal.mode === 'create' ? 'New Department' : 'Edit Department'}
                            </strong>
                            <button onClick={closeModal} style={{ background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', color: 'var(--text-muted)', cursor: 'pointer', borderRadius: 8, width: 32, height: 32, display: 'grid', placeItems: 'center' }}><X size={14} /></button>
                        </div>

                        {/* Modal body */}
                        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                            {/* Name */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Department Name *</label>
                                <input style={fieldStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Content & Media" />
                            </div>

                            {/* Description */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Description</label>
                                <textarea style={{ ...fieldStyle, resize: 'vertical' }} rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description of this department…" />
                            </div>

                            {/* Lead + Co-Lead dropdowns */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>
                                        <Crown size={9} style={{ display: 'inline', marginRight: 4, color: '#f59e0b' }} />
                                        Team Lead
                                    </label>
                                    <MemberSelect
                                        value={form.lead_name}
                                        onChange={v => setForm(f => ({ ...f, lead_name: v }))}
                                        members={teamMembers}
                                        placeholder="Select lead…"
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>
                                        <Crown size={9} style={{ display: 'inline', marginRight: 4, color: 'var(--primary)', opacity: 0.8 }} />
                                        Co-Lead
                                    </label>
                                    <MemberSelect
                                        value={form.co_lead_name}
                                        onChange={v => setForm(f => ({ ...f, co_lead_name: v }))}
                                        members={teamMembers.filter(m => m.candidate_name !== form.lead_name)}
                                        placeholder="Select co-lead…"
                                    />
                                </div>
                            </div>

                            {teamMembers.length === 0 && (
                                <p style={{ margin: 0, fontSize: '0.75rem', color: '#8a5700', background: 'color-mix(in srgb, #8a5700 8%, transparent)', border: '1px solid color-mix(in srgb, #8a5700 20%, transparent)', borderRadius: 7, padding: '8px 12px' }}>
                                    No verified team members yet. Add members in Team Directory first, then assign leads here.
                                </p>
                            )}

                            {/* Active toggle */}
                            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                                <div onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))} style={{ width: 38, height: 22, borderRadius: 11, background: form.is_active ? 'color-mix(in srgb, #067a50 60%, transparent)' : 'var(--outline-variant)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}>
                                    <div style={{ position: 'absolute', top: 3, left: form.is_active ? 19 : 3, width: 16, height: 16, borderRadius: '50%', background: form.is_active ? '#067a50' : 'var(--text-muted)', transition: 'left 0.2s' }} />
                                </div>
                                <span style={{ fontSize: '0.875rem', color: 'var(--text-main)', fontWeight: 600 }}>Active</span>
                            </label>
                        </div>

                        {/* Modal footer */}
                        <div style={{ display: 'flex', gap: 10, padding: '0 22px 20px' }}>
                            <button onClick={closeModal} style={{ flex: 1, minHeight: 42, background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 9, color: 'var(--text-muted)', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem' }}>Cancel</button>
                            <button onClick={handleSave} disabled={saving} style={{ flex: 2, minHeight: 42, background: 'var(--primary)', border: 'none', borderRadius: 9, color: '#fff', fontWeight: 800, cursor: saving ? 'wait' : 'pointer', fontSize: '0.875rem', opacity: saving ? 0.7 : 1 }}>
                                {saving ? 'Saving…' : modal.mode === 'create' ? 'Create Department' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
