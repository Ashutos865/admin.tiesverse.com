import { useState, useEffect, useCallback } from 'react';
import { getAssets, createAsset, updateAsset, deleteAsset, assignAsset, getOnboardingList } from '../../apiClient';
import SearchableSelect from '../../components/SearchableSelect';

const CATEGORIES = ['laptop', 'phone', 'id_card', 'charger', 'headset', 'monitor', 'other'];
const CONDITIONS = ['new', 'good', 'fair', 'poor'];
const STATUSES = ['available', 'assigned', 'under_repair', 'retired'];

const STATUS_STYLE = {
    available:    { bg: '#d1fae5', color: '#065f46' },
    assigned:     { bg: 'var(--secondary-container)', color: 'var(--on-secondary-container)' },
    under_repair: { bg: '#fef3c7', color: '#92400e' },
    retired:      { bg: '#f3f4f6', color: '#6b7280' },
};

const cap = s => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export default function AssetsPage() {
    const [assets, setAssets] = useState([]);
    const [members, setMembers] = useState([]);
    const [filterStatus, setFilterStatus] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState(null);
    const [saving, setSaving] = useState(false);

    // Asset form modal
    const [assetModal, setAssetModal] = useState(null); // null | 'new' | asset obj
    const [form, setForm] = useState({ name: '', category: 'laptop', serial_number: '', condition: 'good', notes: '' });

    // Assign modal
    const [assignModal, setAssignModal] = useState(null);
    const [assignMember, setAssignMember] = useState('');

    const showToast = (msg, err = false) => {
        setToast({ msg, err });
        setTimeout(() => setToast(null), 3000);
    };

    const load = useCallback(async () => {
        setLoading(true);
        const params = {};
        if (filterStatus) params.status = filterStatus;
        if (filterCategory) params.category = filterCategory;
        const [assetList, mems] = await Promise.all([
            getAssets(params),
            getOnboardingList(),
        ]);
        setAssets(Array.isArray(assetList) ? assetList : []);
        setMembers(Array.isArray(mems) ? mems.filter(m => m.status === 'verified') : []);
        setLoading(false);
    }, [filterStatus, filterCategory]);

    useEffect(() => { load(); }, [load]);

    const openNew = () => {
        setForm({ name: '', category: 'laptop', serial_number: '', condition: 'good', notes: '' });
        setAssetModal('new');
    };

    const openEdit = (asset) => {
        setForm({ name: asset.name, category: asset.category, serial_number: asset.serial_number || '', condition: asset.condition, notes: asset.notes || '', status: asset.status });
        setAssetModal(asset);
    };

    const handleSave = async () => {
        if (!form.name.trim()) { showToast('Asset name is required', true); return; }
        setSaving(true);
        const res = assetModal === 'new'
            ? await createAsset(form)
            : await updateAsset(assetModal.id, form);
        setSaving(false);
        if (res?.id) {
            showToast(assetModal === 'new' ? 'Asset created' : 'Asset updated');
            setAssetModal(null);
            load();
        } else {
            showToast(res?.error || 'Failed', true);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this asset?')) return;
        const res = await deleteAsset(id);
        if (res?.success) { showToast('Deleted'); load(); }
        else showToast('Delete failed', true);
    };

    const handleAssign = async () => {
        setSaving(true);
        const res = await assignAsset(assignModal.id, assignMember ? { member_id: assignMember } : {});
        setSaving(false);
        if (res?.id) {
            showToast(assignMember ? `Assigned to member` : 'Asset returned');
            setAssignModal(null);
            setAssignMember('');
            load();
        } else {
            showToast(res?.error || 'Failed', true);
        }
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
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>Asset Management</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>Track and assign company assets to team members.</p>
                </div>
                <button onClick={openNew} style={primaryBtn}>+ Add Asset</button>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
                    <option value="">All statuses</option>
                    {STATUSES.map(s => <option key={s} value={s}>{cap(s)}</option>)}
                </select>
                <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={selectStyle}>
                    <option value="">All categories</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{cap(c)}</option>)}
                </select>
            </div>

            {/* Table */}
            {loading ? (
                <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
            ) : assets.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No assets found.</p>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--outline-variant)' }}>
                                {['Name', 'Category', 'Serial #', 'Condition', 'Status', 'Assigned To', 'Actions'].map(h => (
                                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {assets.map(a => {
                                const st = STATUS_STYLE[a.status] || STATUS_STYLE.available;
                                return (
                                    <tr key={a.id} style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                                        <td style={{ padding: '10px 12px', fontWeight: 500, color: 'var(--text-main)' }}>{a.name}</td>
                                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{cap(a.category)}</td>
                                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{a.serial_number || '—'}</td>
                                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{a.condition}</td>
                                        <td style={{ padding: '10px 12px' }}>
                                            <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: st.bg, color: st.color }}>
                                                {cap(a.status)}
                                            </span>
                                        </td>
                                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{a.assigned_to_name || '—'}</td>
                                        <td style={{ padding: '10px 12px' }}>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button onClick={() => openEdit(a)} style={actionBtn('var(--primary)')}>Edit</button>
                                                <button onClick={() => { setAssignModal(a); setAssignMember(a.assigned_to || ''); }} style={actionBtn('#f59e0b')}>
                                                    {a.status === 'assigned' ? 'Return' : 'Assign'}
                                                </button>
                                                <button onClick={() => handleDelete(a.id)} style={actionBtn('#ef4444')}>Delete</button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Asset Form Modal */}
            {assetModal && (
                <Modal title={assetModal === 'new' ? 'Add Asset' : 'Edit Asset'} onClose={() => setAssetModal(null)}>
                    <div style={{ display: 'grid', gap: 12 }}>
                        <div>
                            <label style={labelStyle}>Name *</label>
                            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ ...inputStyle, width: '100%' }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <label style={labelStyle}>Category</label>
                                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={{ ...inputStyle, width: '100%' }}>
                                    {CATEGORIES.map(c => <option key={c} value={c}>{cap(c)}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Condition</label>
                                <select value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))} style={{ ...inputStyle, width: '100%' }}>
                                    {CONDITIONS.map(c => <option key={c} value={c}>{cap(c)}</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label style={labelStyle}>Serial Number</label>
                            <input value={form.serial_number} onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))} style={{ ...inputStyle, width: '100%' }} />
                        </div>
                        <div>
                            <label style={labelStyle}>Notes</label>
                            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                        <button onClick={() => setAssetModal(null)} style={ghostBtn}>Cancel</button>
                        <button onClick={handleSave} disabled={saving} style={primaryBtn}>{saving ? 'Saving...' : 'Save'}</button>
                    </div>
                </Modal>
            )}

            {/* Assign Modal */}
            {assignModal && (
                <Modal title={`${assignModal.status === 'assigned' ? 'Return / Reassign' : 'Assign'} — ${assignModal.name}`} onClose={() => setAssignModal(null)}>
                    <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
                        Currently: {assignModal.assigned_to_name || 'unassigned'}
                    </p>
                    <label style={labelStyle}>Assign to member (leave blank to return)</label>
                    <SearchableSelect
                        options={members.map(m => ({ value: m.id, label: m.candidate_name }))}
                        value={assignMember}
                        onChange={setAssignMember}
                        clearable
                        allLabel="— Return asset —"
                        searchPlaceholder="Search member…"
                    />
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                        <button onClick={() => setAssignModal(null)} style={ghostBtn}>Cancel</button>
                        <button onClick={handleAssign} disabled={saving} style={primaryBtn}>{saving ? 'Saving...' : assignMember ? 'Assign' : 'Return'}</button>
                    </div>
                </Modal>
            )}
        </div>
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
const actionBtn = (color) => ({ padding: '4px 10px', borderRadius: 7, border: 'none', background: color + '22', color, fontSize: 11, fontWeight: 600, cursor: 'pointer' });
