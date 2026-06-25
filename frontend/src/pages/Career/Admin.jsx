import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import {
    getPositions, createPosition, updatePosition, deletePosition,
    getEnrollments, updateEnrollment, deleteEnrollment,
    getOfferLetters, createOfferLetter, updateOfferLetter, deleteOfferLetter,
    getCandidates, updateCandidate, getFormGates, updateFormGates,
    downloadFile
} from '../../apiClient';
import { Plus, Edit2, Trash2, X, Sparkles, Briefcase, FileText, Mail, Users, ToggleRight, CheckCircle, ExternalLink, Search, Download, Eye } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// ===== SHARED STYLES =====
const inputStyle = {
    width: '100%', padding: '12px 16px', borderRadius: '10px',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    color: '#fff', fontSize: '0.875rem', fontFamily: 'inherit',
    transition: 'all 0.2s', outline: 'none', boxSizing: 'border-box',
};
const selectStyle = { ...inputStyle, cursor: 'pointer', appearance: 'auto' };

const FieldLabel = ({ children }) => (
    <label style={{
        display: 'block', fontSize: '0.6875rem', fontWeight: 800,
        textTransform: 'uppercase', letterSpacing: '0.1em',
        color: 'rgba(255,255,255,0.35)', marginBottom: '8px',
    }}>{children}</label>
);

const FormField = ({ label, name, value, onChange, placeholder, required, type = 'text', disabled }) => (
    <div>
        <FieldLabel>{label}</FieldLabel>
        <input type={type} name={name} value={value || ''} onChange={onChange}
            placeholder={placeholder} required={required} disabled={disabled}
            style={{ ...inputStyle, opacity: disabled ? 0.5 : 1 }}
            onFocus={e => { e.target.style.borderColor = 'color-mix(in srgb, var(--primary) 40%, transparent)'; e.target.style.background = 'rgba(255,255,255,0.06)'; }}
            onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; e.target.style.background = 'rgba(255,255,255,0.04)'; }}
        />
    </div>
);

const TAB_CONFIG = {
    positions: {
        title: 'Positions', subtitle: 'Manage job postings.', icon: <Briefcase size={20} />, itemLabel: 'Position',
        fetchFn: getPositions, createFn: createPosition, updateFn: updatePosition, deleteFn: deletePosition,
        defaultForm: { is_open: true },
    },
    enrollments: {
        title: 'Enrollments', subtitle: 'Manage job applications.', icon: <FileText size={20} />, itemLabel: 'Enrollment',
        fetchFn: getEnrollments, createFn: null, updateFn: updateEnrollment, deleteFn: deleteEnrollment,
        defaultForm: { status: 'Pending' },
    },
    offers: {
        title: 'Offer Letters', subtitle: 'Manage and generate offer letters.', icon: <Mail size={20} />, itemLabel: 'Offer Letter',
        fetchFn: getOfferLetters, createFn: createOfferLetter, updateFn: updateOfferLetter, deleteFn: deleteOfferLetter,
        defaultForm: {},
    },
    candidates: {
        title: 'Candidates', subtitle: 'Manage candidate applications from Cloudflare.', icon: <Users size={20} />, itemLabel: 'Candidate',
        fetchFn: getCandidates, createFn: null, updateFn: updateCandidate, deleteFn: null,
        defaultForm: {},
    },
    form_gates: {
        title: 'Form Gates', subtitle: 'Manage application form visibility.', icon: <ToggleRight size={20} />, itemLabel: 'Form Gates',
        fetchFn: getFormGates, createFn: null, updateFn: updateFormGates, deleteFn: null,
        defaultForm: {},
    },
};

const CareerAdmin = ({ tab = 'positions' }) => {
    const { user } = useContext(AuthContext);
    const config = TAB_CONFIG[tab];

    const [items, setItems] = useState([]);
    const [enrollmentsList, setEnrollmentsList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({});
    const [editingId, setEditingId] = useState(null);
    const [formModalOpen, setFormModalOpen] = useState(false);
    const [deleteModal, setDeleteModal] = useState({ open: false, id: null, title: '' });
    const [notification, setNotification] = useState(null);

    // Filter states
    const [searchQuery, setSearchQuery] = useState('');
    const [filterDepartment, setFilterDepartment] = useState('All');
    const [filterStatus, setFilterStatus] = useState('All');

    // Modals
    const [pdfModalOpen, setPdfModalOpen] = useState(false);
    const [pdfConfig, setPdfConfig] = useState({ department: 'All', status: 'All' });
    const [detailsModal, setDetailsModal] = useState({ open: false, candidate: null });

    const showNotice = (msg, type = 'success') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 4000);
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const data = await config.fetchFn();
            if (tab === 'form_gates') {
                // For form gates, data is an object. We'll turn it into an array of key-value pairs for list rendering.
                const gatesArray = Object.entries(data || {}).map(([key, value]) => ({ id: key, name: key, is_open: value }));
                setItems(gatesArray);
            } else if (tab === 'candidates') {
                setItems(data.data || data || []);
            } else {
                setItems(data || []);
            }
            if (tab === 'offers') {
                const enrData = await getEnrollments();
                setEnrollmentsList(enrData || []);
            }
        } catch (err) {
            console.error('Fetch error:', err);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (user) {
            fetchData();
            setFormModalOpen(false);
            setEditingId(null);
            setFormData({});
            setSearchQuery('');
            setFilterDepartment('All');
            setFilterStatus('All');
        }
    }, [tab, user]);

    const filteredItems = items.filter(item => {
        if (tab !== 'candidates' && tab !== 'enrollments') return true;

        const s = searchQuery.toLowerCase();
        let name = '';
        let email = '';
        let role = '';
        let dept = '';
        let stat = '';

        if (tab === 'candidates') {
            name = `${item.first_name || ''} ${item.last_name || ''}`.toLowerCase();
            email = (item.email || '').toLowerCase();
            role = (item.roles || '').toLowerCase();
            dept = item.department || 'Unknown';
            stat = item.final_decision || 'Under Review';
        } else if (tab === 'enrollments') {
            name = (item.applicant_name || '').toLowerCase();
            email = (item.email || '').toLowerCase();
            role = (item.position?.title || '').toLowerCase();
            dept = item.position?.department || 'Unknown';
            stat = item.status || 'Pending';
        }

        const matchSearch = name.includes(s) || email.includes(s) || role.includes(s);
        const matchDept = filterDepartment === 'All' || dept === filterDepartment;
        const matchStatus = filterStatus === 'All' || stat === filterStatus;

        return matchSearch && matchDept && matchStatus;
    });

    const handleGeneratePDF = () => {
        const doc = new jsPDF('landscape');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.text('Tiesverse Admin Report', 14, 22);
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);
        doc.text(`Source: ${tab === 'candidates' ? 'Cloudflare ATS' : 'Enrollments DB'}`, 14, 36);
        doc.text(`Filters applied -> Department: ${pdfConfig.department} | Status: ${pdfConfig.status}`, 14, 42);

        let exportItems = items.filter(item => {
            let dept = tab === 'candidates' ? item.department : item.position?.department;
            let stat = tab === 'candidates' ? item.final_decision : item.status;
            const matchDept = pdfConfig.department === 'All' || dept === pdfConfig.department;
            const matchStatus = pdfConfig.status === 'All' || stat === pdfConfig.status;
            return matchDept && matchStatus;
        });

        let tableColumns = [];
        let tableRows = [];

        if (tab === 'candidates') {
            tableColumns = ['Name', 'Email', 'Role', 'Dept', 'Interviewer', 'Rating', 'Decision'];
            tableRows = exportItems.map(i => [
                `${i.first_name || ''} ${i.last_name || ''}`, i.email || '-', i.roles || '-', i.department || '-',
                i.interviewer || '-', i.rating || '-', i.final_decision || 'Under Review'
            ]);
        } else {
            tableColumns = ['Applicant', 'Email', 'Position', 'Dept', 'Status'];
            tableRows = exportItems.map(i => [
                i.applicant_name || '-', i.email || '-', i.position?.title || '-', i.position?.department || '-', i.status || 'Pending'
            ]);
        }

        doc.autoTable({
            startY: 50,
            head: [tableColumns],
            body: tableRows,
            theme: 'grid',
            headStyles: { fillColor: [254, 122, 0] },
            styles: { fontSize: 9 }
        });

        doc.save(`tiesverse_${tab}_report.pdf`);
        setPdfModalOpen(false);
        showNotice('PDF generated successfully!');
    };

    const openCreateModal = () => {
        setFormData({ ...config.defaultForm });
        setEditingId(null);
        setFormModalOpen(true);
    };

    const openEditModal = (item) => {
        if (tab === 'candidates') {
            setEditingId(item.row_index || item.id);
        } else {
            setEditingId(item.id);
        }
        setFormData({ ...item });
        setFormModalOpen(true);
    };

    const closeFormModal = () => {
        setFormModalOpen(false);
        setFormData({});
        setEditingId(null);
    };

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleFormGateToggle = async (key, currentValue) => {
        setLoading(true);
        try {
            const updatedGates = {};
            items.forEach(item => { updatedGates[item.name] = item.is_open; });
            updatedGates[key] = !currentValue;
            await updateFormGates(updatedGates);
            showNotice('Form gate updated!');
            fetchData();
        } catch (err) {
            showNotice('Failed to update form gate.', 'error');
        }
        setLoading(false);
    };

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        setLoading(true);

        try {
            if (editingId) {
                const res = await config.updateFn(editingId, formData);
                if (res?.error) showNotice('Error: ' + res.error, 'error');
                else { showNotice('Updated successfully!'); closeFormModal(); fetchData(); }
            } else {
                const res = await config.createFn(formData);
                if (res?.error) showNotice('Error: ' + res.error, 'error');
                else { showNotice('Created successfully!'); closeFormModal(); fetchData(); }
            }
        } catch (err) {
            showNotice('Error: ' + err.message, 'error');
        }
        setLoading(false);
    };

    const handleDelete = async () => {
        const { id } = deleteModal;
        setLoading(true);
        const res = await config.deleteFn(id);
        if (res?.error) showNotice('Error: ' + res.error, 'error');
        else { showNotice('Removed successfully.'); fetchData(); }
        setLoading(false);
        setDeleteModal({ open: false, id: null, title: '' });
    };

    const renderFormFields = () => {
        if (tab === 'positions') return (
            <>
                <FormField label="Job Title" name="title" value={formData.title} onChange={handleInputChange} required />
                <FormField label="Department" name="department" value={formData.department} onChange={handleInputChange} required />
                <div><FieldLabel>Description</FieldLabel><textarea name="description" value={formData.description || ''} onChange={handleInputChange} style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} required /></div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem' }}>
                    <input type="checkbox" name="is_open" checked={formData.is_open !== false} onChange={handleInputChange} /> Position Open
                </label>
            </>
        );

        if (tab === 'enrollments') return (
            <>
                <FormField label="Applicant Name" name="applicant_name" value={formData.applicant_name} onChange={handleInputChange} disabled />
                <FormField label="Email" name="email" value={formData.email} onChange={handleInputChange} disabled />
                <div>
                    <FieldLabel>Status</FieldLabel>
                    <select name="status" value={formData.status || 'Pending'} onChange={handleInputChange} style={selectStyle}>
                        <option value="Pending">Pending</option>
                        <option value="Reviewed">Reviewed</option>
                        <option value="Accepted">Accepted</option>
                        <option value="Rejected">Rejected</option>
                    </select>
                </div>
            </>
        );

        if (tab === 'offers') return (
            <>
                <div>
                    <FieldLabel>Applicant (Enrollment)</FieldLabel>
                    <select name="applicant" value={formData.applicant || ''} onChange={handleInputChange} style={selectStyle} required>
                        <option value="">Select Applicant...</option>
                        {enrollmentsList.map(e => (
                            <option key={e.id} value={e.id}>{e.applicant_name} - {e.position?.title || 'Unknown Position'}</option>
                        ))}
                    </select>
                </div>
                <FormField label="Salary" name="salary" value={formData.salary} onChange={handleInputChange} required type="number" step="0.01" />
                <FormField label="Joining Date" name="joining_date" value={formData.joining_date} onChange={handleInputChange} required type="date" />
            </>
        );

        if (tab === 'candidates') return (
            <>
                <FormField label="First Name" name="first_name" value={formData.first_name} disabled />
                <FormField label="Last Name" name="last_name" value={formData.last_name} disabled />
                <FormField label="Department" name="department" value={formData.department} disabled />
                <FormField label="Roles" name="roles" value={formData.roles} disabled />
                
                <div>
                    <FieldLabel>Interview Status</FieldLabel>
                    <select name="interview_status" value={formData.interview_status || 'Pending Setup'} onChange={handleInputChange} style={selectStyle}>
                        <option value="Pending Setup">Pending Setup</option>
                        <option value="Interview Scheduled">Interview Scheduled</option>
                        <option value="Interviewed">Interviewed</option>
                        <option value="Offer Extended">Offer Extended</option>
                        <option value="Rejected">Rejected</option>
                    </select>
                </div>
                <FormField label="Interviewer Name" name="interviewer" value={formData.interviewer} onChange={handleInputChange} />
                <FormField label="Rating (0-10)" name="rating" value={formData.rating} onChange={handleInputChange} type="number" min="0" max="10" />
                <div>
                    <FieldLabel>Final Decision</FieldLabel>
                    <select name="final_decision" value={formData.final_decision || 'Under Review'} onChange={handleInputChange} style={selectStyle}>
                        <option value="Under Review">Under Review</option>
                        <option value="Selected">Selected</option>
                        <option value="Not Selected">Not Selected</option>
                        <option value="Waitlisted">Waitlisted</option>
                    </select>
                </div>
            </>
        );

        return null;
    };

    const renderItemCard = (item) => {
        if (tab === 'form_gates') {
            return (
                <div key={item.id} style={{
                    background: 'rgba(20,20,20,0.6)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px',
                    padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1rem', color: '#fff' }}>{item.name}</h3>
                        <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
                            {item.is_open ? 'Currently accepting applications' : 'Applications closed'}
                        </p>
                    </div>
                    <button onClick={() => handleFormGateToggle(item.name, item.is_open)} style={{
                        background: item.is_open ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                        color: item.is_open ? '#10B981' : '#EF4444', border: `1px solid ${item.is_open ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                        padding: '8px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
                    }}>
                        {item.is_open ? 'OPEN' : 'CLOSED'}
                    </button>
                </div>
            );
        }

        const title = item.title || item.applicant_name || (item.first_name ? `${item.first_name} ${item.last_name}` : '') || `Offer #${item.id}`;
        const subtitle = item.department || item.status || item.interview_status || `Salary: $${item.salary}`;

        return (
            <div key={item.id || item.row_index} style={{
                background: 'rgba(20,20,20,0.6)', backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px',
                padding: '20px', display: 'flex', flexDirection: 'column',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}>
                <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '0.625rem', fontWeight: 800, letterSpacing: '0.1em', padding: '3px 8px', borderRadius: '5px', background: 'color-mix(in srgb, var(--primary) 10%, transparent)', color: 'var(--primary)', border: '1px solid color-mix(in srgb, var(--primary) 15%, transparent)', display: 'inline-block', marginBottom: '10px' }}>
                        {subtitle}
                    </span>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', margin: 0 }}>{title}</h3>
                    
                    {tab === 'positions' && (
                        <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.3)', marginTop: '6px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.description}</p>
                    )}
                    
                    {tab === 'candidates' && (
                        <div style={{ marginTop: '12px', fontSize: '0.8125rem', color: 'rgba(255,255,255,0.5)' }}>
                            <p style={{ margin: '2px 0' }}><strong>Role:</strong> {item.roles}</p>
                            <p style={{ margin: '2px 0' }}><strong>Email:</strong> {item.email}</p>
                            {item.resume_link && (
                                <button type="button" onClick={() => downloadFile(item.resume_link, `resume_${item.first_name}_${item.last_name}.pdf`)} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#3B82F6', marginTop: '8px', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontSize: 'inherit' }}>
                                    <ExternalLink size={14} /> View Resume
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '14px', marginTop: '14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'rgba(255,255,255,0.3)' }}>
                        {tab === 'candidates' ? `Rating: ${item.rating || 0}/10` : (item.is_open === false ? 'Closed' : '')}
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {tab === 'candidates' && (
                            <button onClick={() => setDetailsModal({ open: true, candidate: item })} title="Review Application"
                                style={{ padding: '8px', borderRadius: '8px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', color: '#3B82F6', cursor: 'pointer', display: 'flex', transition: 'all 0.2s' }}
                            ><Eye size={14} /></button>
                        )}
                        {config.updateFn && (
                            <button onClick={() => openEditModal(item)} title="Edit"
                                style={{ padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex', transition: 'all 0.2s' }}
                            ><Edit2 size={14} /></button>
                        )}
                        {config.deleteFn && (
                            <button onClick={() => setDeleteModal({ open: true, id: item.id, title: title })} title="Delete"
                                style={{ padding: '8px', borderRadius: '8px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)', color: 'rgba(239,68,68,0.5)', cursor: 'pointer', display: 'flex', transition: 'all 0.2s' }}
                            ><Trash2 size={14} /></button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {config.icon} {config.title}
                    </h1>
                    <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.4)', marginTop: '6px' }}>{config.subtitle}</p>
                </div>
                {config.createFn && (
                    <button onClick={openCreateModal}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.02em', boxShadow: '0 8px 20px color-mix(in srgb, var(--primary) 30%, transparent)' }}
                    >
                        <Plus size={18} /> Add New {config.itemLabel}
                    </button>
                )}
            </div>

            {notification && (
                <div style={{
                    marginBottom: '20px', padding: '14px 20px', borderRadius: '12px', fontSize: '0.875rem', fontWeight: 600,
                    background: notification.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                    border: `1px solid ${notification.type === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`,
                    color: notification.type === 'error' ? '#EF4444' : '#10B981',
                }}>
                    {notification.msg}
                </div>
            )}

            {loading && items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '80px 0', color: 'rgba(255,255,255,0.3)' }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, letterSpacing: '0.1em' }}>LOADING...</div>
                </div>
            ) : (
                <>
                    {(tab === 'candidates' || tab === 'enrollments') && (
                        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '16px', marginBottom: '24px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', flex: 1 }}>
                                <div style={{ position: 'relative', flex: '1 1 240px' }}>
                                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)' }} />
                                    <input type="text" placeholder="Search name, email, or role..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ ...inputStyle, paddingLeft: '38px', height: '42px' }} />
                                </div>
                                <select value={filterDepartment} onChange={e => setFilterDepartment(e.target.value)} style={{ ...selectStyle, height: '42px', flex: '0 1 180px' }}>
                                    <option value="All">All Departments</option>
                                    <option value="Tech">Tech</option>
                                    <option value="Content">Content</option>
                                    <option value="Media">Media</option>
                                    <option value="Operations">Operations</option>
                                </select>
                                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...selectStyle, height: '42px', flex: '0 1 180px' }}>
                                    <option value="All">All Decisions</option>
                                    {tab === 'candidates' ? (
                                        <>
                                            <option value="Under Review">Under Review</option>
                                            <option value="Selected">Selected</option>
                                            <option value="Not Selected">Not Selected</option>
                                            <option value="Waitlisted">Waitlisted</option>
                                        </>
                                    ) : (
                                        <>
                                            <option value="Pending">Pending</option>
                                            <option value="Reviewed">Reviewed</option>
                                            <option value="Accepted">Accepted</option>
                                            <option value="Rejected">Rejected</option>
                                        </>
                                    )}
                                </select>
                            </div>
                            <button onClick={() => setPdfModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '42px', padding: '0 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', transition: '0.2s' }}>
                                <Download size={16} /> Export PDF
                            </button>
                        </div>
                    )}
                    
                    {filteredItems.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '80px 0', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
                            {config.icon && React.cloneElement(config.icon, { size: 40, style: { color: 'rgba(255,255,255,0.15)', marginBottom: '12px' } })}
                            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem', fontWeight: 600 }}>No {config.itemLabel.toLowerCase()}s found.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: tab === 'form_gates' ? 'repeat(auto-fill, minmax(400px, 1fr))' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                            {filteredItems.map(item => renderItemCard(item))}
                        </div>
                    )}
                </>
            )}

            {formModalOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
                    <div style={{ background: '#111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', padding: '32px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Sparkles size={20} style={{ color: 'var(--primary)' }} />
                                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                                    {editingId ? `Edit ${config.itemLabel}` : `New ${config.itemLabel}`}
                                </h2>
                            </div>
                            <button onClick={closeFormModal} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '8px', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {renderFormFields()}
                            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                                <button type="button" onClick={closeFormModal} style={{ flex: 1, padding: '14px', borderRadius: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                                <button type="submit" disabled={loading} style={{ flex: 2, padding: '14px', borderRadius: '12px', background: 'var(--primary)', color: '#fff', border: 'none', fontSize: '0.875rem', fontWeight: 800, cursor: 'pointer' }}>{loading ? 'Saving...' : 'Save'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {deleteModal.open && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
                    <div style={{ background: '#111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', maxWidth: '420px', width: '100%', padding: '32px' }}>
                        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                            <Trash2 size={40} style={{ color: '#EF4444', marginBottom: '16px' }} />
                            <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>Delete {config.itemLabel}?</h3>
                            <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.4)' }}>Remove "{deleteModal.title}"? This cannot be undone.</p>
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={() => setDeleteModal({ open: false, id: null, title: '' })} style={{ flex: 1, padding: '14px', borderRadius: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleDelete} disabled={loading} style={{ flex: 1, padding: '14px', borderRadius: '12px', background: '#EF4444', color: '#fff', border: 'none', fontSize: '0.875rem', fontWeight: 800, cursor: 'pointer' }}>Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {pdfModalOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
                    <div style={{ background: '#111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', maxWidth: '420px', width: '100%', padding: '32px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#fff', margin: 0 }}>Export Data to PDF</h2>
                            <button onClick={() => setPdfModalOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}><X size={18} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <FieldLabel>Filter by Department</FieldLabel>
                                <select value={pdfConfig.department} onChange={e => setPdfConfig(p => ({...p, department: e.target.value}))} style={selectStyle}>
                                    <option value="All">All Departments</option>
                                    <option value="Tech">Tech</option>
                                    <option value="Content">Content</option>
                                    <option value="Media">Media</option>
                                    <option value="Operations">Operations</option>
                                </select>
                            </div>
                            <div>
                                <FieldLabel>Filter by Decision</FieldLabel>
                                <select value={pdfConfig.status} onChange={e => setPdfConfig(p => ({...p, status: e.target.value}))} style={selectStyle}>
                                    <option value="All">All Applications</option>
                                    {tab === 'candidates' ? (
                                        <>
                                            <option value="Under Review">Under Review</option>
                                            <option value="Selected">Selected</option>
                                            <option value="Not Selected">Not Selected</option>
                                            <option value="Waitlisted">Waitlisted</option>
                                        </>
                                    ) : (
                                        <>
                                            <option value="Pending">Pending</option>
                                            <option value="Reviewed">Reviewed</option>
                                            <option value="Accepted">Accepted</option>
                                            <option value="Rejected">Rejected</option>
                                        </>
                                    )}
                                </select>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                            <button onClick={() => setPdfModalOpen(false)} style={{ flex: 1, padding: '14px', borderRadius: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleGeneratePDF} style={{ flex: 1, padding: '14px', borderRadius: '12px', background: 'var(--primary)', border: 'none', color: '#000', fontWeight: 800, cursor: 'pointer' }}>Generate PDF</button>
                        </div>
                    </div>
                </div>
            )}

            {detailsModal.open && detailsModal.candidate && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
                    <div style={{ background: '#111', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '24px', maxWidth: '800px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
                        <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'rgba(255,255,255,0.02)' }}>
                            <div>
                                <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fff', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>{detailsModal.candidate.first_name} {detailsModal.candidate.last_name}</h2>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.6875rem', fontWeight: 800, color: 'var(--primary)', background: 'color-mix(in srgb, var(--primary) 15%, transparent)', padding: '4px 10px', borderRadius: '999px', textTransform: 'uppercase' }}>{detailsModal.candidate.roles}</span>
                                    <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.06)', padding: '4px 10px', borderRadius: '999px' }}>{detailsModal.candidate.department}</span>
                                </div>
                            </div>
                            <button onClick={() => setDetailsModal({ open: false, candidate: null })} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', borderRadius: '12px', padding: '10px', cursor: 'pointer', transition: '0.2s' }}><X size={20} /></button>
                        </div>
                        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
                                    <FieldLabel>Email</FieldLabel>
                                    <div style={{ fontSize: '0.875rem', color: '#e2e8f0', wordBreak: 'break-all' }}>{detailsModal.candidate.email}</div>
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
                                    <FieldLabel>Phone / Contact</FieldLabel>
                                    <div style={{ fontSize: '0.875rem', color: '#e2e8f0' }}>{detailsModal.candidate.phone || 'N/A'}</div>
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
                                    <FieldLabel>Portfolio</FieldLabel>
                                    <div style={{ fontSize: '0.875rem', color: '#3B82F6', wordBreak: 'break-all' }}>
                                        {detailsModal.candidate.portfolio_link ? <a href={detailsModal.candidate.portfolio_link} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>View Portfolio <ExternalLink size={12}/></a> : 'N/A'}
                                    </div>
                                </div>
                            </div>
                            
                            {detailsModal.candidate.why_join && (
                                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <FieldLabel>Why Join Us?</FieldLabel>
                                    <p style={{ fontSize: '0.875rem', color: '#cbd5e1', lineHeight: '1.6', margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>
                                        {detailsModal.candidate.why_join}
                                    </p>
                                </div>
                            )}

                            {detailsModal.candidate.answers && (
                                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <FieldLabel>Application Answers</FieldLabel>
                                    <pre style={{ fontSize: '0.8125rem', color: '#94a3b8', margin: '8px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit' }}>
                                        {typeof detailsModal.candidate.answers === 'string' ? detailsModal.candidate.answers : JSON.stringify(detailsModal.candidate.answers, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'flex-end' }}>
                            {detailsModal.candidate.resume_link && (
                                <button onClick={() => downloadFile(detailsModal.candidate.resume_link, `resume_${detailsModal.candidate.first_name}.pdf`)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--primary)', color: '#000', padding: '10px 20px', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 800, cursor: 'pointer', border: 'none' }}>
                                    <Download size={16} /> Download Resume
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CareerAdmin;
