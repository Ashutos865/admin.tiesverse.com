import React, { useState, useEffect, useContext, useRef } from 'react';
import { AuthContext } from '../../context/AuthContext';
import {
    getPositions, createPosition, updatePosition, deletePosition,
    getOfferLetters, createOfferLetter, updateOfferLetter, deleteOfferLetter,
    getCandidates, updateCandidateStatus, scheduleInterview, getFormGates, updateFormGates,
    getOnboardingList, downloadFile, sendOffer, initiateOnboarding
} from '../../apiClient';
import { Plus, Edit2, Trash2, X, Sparkles, Briefcase, FileText, Mail, ToggleRight, CheckCircle, ExternalLink, Search, Download, Eye, UserCheck, Award, Send, CalendarDays, List as ListIcon } from 'lucide-react';
import ScheduleCalendar from '../../components/ScheduleCalendar.jsx';
import jsPDF from 'jspdf';

const viewToggleStyle = (active) => ({
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: 'none',
    borderRadius: 6, background: active ? 'var(--primary)' : 'transparent',
    color: active ? '#fff' : 'var(--text-main)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
});
import autoTable from 'jspdf-autotable';
import './CareerPositions.css';
import './ApplicationTracker.css';
import './FormGates.css';

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

const parseAssessmentAnswers = (rawAnswers) => {
    if (!rawAnswers) return [];

    if (Array.isArray(rawAnswers)) {
        return rawAnswers.map((item, index) => ({
            question: item?.question || item?.label || `Question ${index + 1}`,
            answer: item?.answer || item?.value || JSON.stringify(item),
        }));
    }

    if (typeof rawAnswers === 'object') {
        return Object.entries(rawAnswers).map(([question, answer]) => ({
            question,
            answer: typeof answer === 'string' ? answer : JSON.stringify(answer, null, 2),
        }));
    }

    const text = String(rawAnswers).replace(/\r\n/g, '\n').trim();
    if (!text) return [];

    try {
        const parsed = JSON.parse(text);
        if (parsed !== text) return parseAssessmentAnswers(parsed);
    } catch {
        // Plain-text assessments are parsed below.
    }

    const tiles = [];
    let question = '';
    let answers = [];
    const pushTile = () => {
        if (!question && answers.length === 0) return;
        tiles.push({
            question: question || 'Assessment',
            answer: answers.join('\n').trim() || '—',
        });
    };

    text.split('\n').map((line) => line.trim()).filter(Boolean).forEach((line) => {
        const isAnswer = /^->\s*/.test(line);
        const isQuestion = /^\[.*?\]\s*/.test(line) || (!isAnswer && line.endsWith('?'));
        if (isQuestion) {
            pushTile();
            question = line.replace(/^\[.*?\]\s*/, '').trim();
            answers = [];
        } else {
            if (!question) question = 'Assessment';
            answers.push(line.replace(/^->\s*/, ''));
        }
    });
    pushTile();
    return tiles;
};

const FORM_GATE_CATEGORIES = {
    Tech: ['tech_roles'],
    Content: ['content_editor', 'content_writer_upsc', 'upsc_strategist', 'graphic_designer_canva', 'uiux_designer'],
    Media: ['video_editor_reels_yt', 'social_media_manager_ig', 'youtube_manager'],
    Operations: ['hr', 'marketing_outreach', 'management_coordination', 'collab_outreach'],
};

const FORM_GATE_CATEGORY_HINTS = {
    Tech: 'All developer roles',
    Content: 'Editorial & research',
    Media: 'Video & social',
    Operations: 'HR & management',
};

const FORM_GATE_GROUPS = [
    { title: 'Content', keys: ['content_editor', 'content_writer_upsc', 'upsc_strategist'] },
    { title: 'Design', keys: ['graphic_designer_canva', 'uiux_designer'] },
    { title: 'Media', keys: ['video_editor_reels_yt', 'social_media_manager_ig', 'youtube_manager'] },
    { title: 'Operations', keys: ['hr', 'marketing_outreach', 'management_coordination', 'collab_outreach'] },
    { title: 'Tech', keys: ['tech_roles'] },
];

const FORM_GATE_LABELS = {
    Tech: 'Tech',
    Content: 'Content',
    Media: 'Media',
    Operations: 'Operations',
    content_editor: 'Content Editor',
    content_writer_upsc: 'Content Writer (UPSC)',
    upsc_strategist: 'UPSC Content Researcher and Strategist',
    graphic_designer_canva: 'Graphic Designer (Canva)',
    uiux_designer: 'UI/UX Designer',
    video_editor_reels_yt: 'Video Editor (Reels + YouTube)',
    social_media_manager_ig: 'Social Media Manager (Instagram)',
    youtube_manager: 'YouTube Manager',
    hr: 'Human Resource (HR)',
    marketing_outreach: 'Marketing & Outreach Specialist',
    management_coordination: 'Management / Team Co-ordination',
    collab_outreach: 'Collaboration & Outreach Manager',
    tech_roles: 'Tech Roles',
};

const TAB_CONFIG = {
    positions: {
        title: 'Positions', subtitle: 'Manage job postings.', icon: <Briefcase size={20} />, itemLabel: 'Position',
        fetchFn: getPositions, createFn: createPosition, updateFn: updatePosition, deleteFn: deletePosition,
        defaultForm: { is_open: true },
    },
    applications: {
        title: 'Application Tracker', subtitle: 'Review applications and manage every hiring decision in one place.', icon: <FileText size={20} />, itemLabel: 'Application',
        fetchFn: getCandidates, createFn: null, updateFn: updateCandidateStatus, deleteFn: null,
        defaultForm: {},
    },
    offers: {
        title: 'Offer Letters', subtitle: 'Manage and generate offer letters.', icon: <Mail size={20} />, itemLabel: 'Offer Letter',
        fetchFn: getOfferLetters, createFn: createOfferLetter, updateFn: updateOfferLetter, deleteFn: deleteOfferLetter,
        defaultForm: {},
    },
    form_gates: {
        title: 'Form Gates', subtitle: 'Manage application form visibility.', icon: <ToggleRight size={20} />, itemLabel: 'Form Gates',
        fetchFn: getFormGates, createFn: null, updateFn: updateFormGates, deleteFn: null,
        defaultForm: {},
    },
};

// ── Certificate canvas (drawn once candidate is known) ──────────────────────
function CertCanvas({ candidate }) {
    const ref = useRef(null);
    useEffect(() => {
        const canvas = ref.current;
        if (!canvas || !candidate) return;
        const ctx = canvas.getContext('2d');
        const W = 700, H = 490;
        ctx.clearRect(0, 0, W, H);

        // Background
        ctx.fillStyle = '#fdfcf8';
        ctx.fillRect(0, 0, W, H);

        // Outer border
        ctx.strokeStyle = '#3525cd';
        ctx.lineWidth = 4;
        ctx.strokeRect(14, 14, W - 28, H - 28);
        // Inner border
        ctx.strokeStyle = '#c9a84c';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(22, 22, W - 44, H - 44);

        // Corner ornaments
        [[ 14, 14], [W-14, 14], [14, H-14], [W-14, H-14]].forEach(([x, y]) => {
            ctx.fillStyle = '#3525cd';
            ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
        });

        // Header block
        ctx.fillStyle = '#3525cd';
        ctx.fillRect(0, 0, W, 72);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.letterSpacing = '0.25em';
        ctx.fillText('T I E S V E R S E', W / 2, 32);
        ctx.font = '11px "Inter", sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText('CERTIFICATE OF SELECTION', W / 2, 52);

        // Body text
        ctx.fillStyle = '#5a5a7a';
        ctx.font = '13px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('This is to certify that', W / 2, 120);

        // Name
        ctx.fillStyle = '#1a1a3e';
        ctx.font = 'bold 34px Georgia, serif';
        const fullName = `${candidate.first_name || ''} ${candidate.last_name || ''}`.trim();
        ctx.fillText(fullName, W / 2, 168);

        // Divider
        const grad = ctx.createLinearGradient(140, 180, W - 140, 180);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(0.3, '#c9a84c');
        grad.addColorStop(0.7, '#c9a84c');
        grad.addColorStop(1, 'transparent');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(140, 186); ctx.lineTo(W - 140, 186); ctx.stroke();

        ctx.fillStyle = '#5a5a7a';
        ctx.font = '13px "Inter", sans-serif';
        ctx.fillText('has been selected for the role of', W / 2, 220);

        ctx.fillStyle = '#3525cd';
        ctx.font = 'bold 22px Georgia, serif';
        ctx.fillText(candidate.roles || 'Intern / Associate', W / 2, 258);

        ctx.fillStyle = '#6b6b8a';
        ctx.font = '12px "Inter", sans-serif';
        ctx.fillText(`Department: ${candidate.department || 'General'}`, W / 2, 290);

        const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
        ctx.fillText(`Effective Date: ${today}`, W / 2, 313);

        // Seal circle
        ctx.strokeStyle = '#c9a84c';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(W / 2, 375, 38, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(W / 2, 375, 32, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#3525cd';
        ctx.font = 'bold 11px "Inter", sans-serif';
        ctx.fillText('OFFICIAL', W / 2, 371);
        ctx.fillText('SEAL', W / 2, 385);

        // Signature lines
        [[175, 440, 'Authorized Signatory', 'HR Team'], [525, 440, 'Date', today]].forEach(([x, y, label, val]) => {
            ctx.strokeStyle = '#aaa';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x - 70, y - 18); ctx.lineTo(x + 70, y - 18); ctx.stroke();
            ctx.fillStyle = '#9a9ab0';
            ctx.font = '10px "Inter", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(label, x, y - 4);
            ctx.fillStyle = '#555';
            ctx.font = 'bold 10px "Inter", sans-serif';
            ctx.fillText(val, x, y + 10);
        });

        ctx.textAlign = 'left';
    }, [candidate]);

    return <canvas ref={ref} width={700} height={490} style={{ width: '100%', borderRadius: 8, display: 'block' }} />;
}

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

    // Offer letter sending
    const [sendingOffer, setSendingOffer] = useState(null);
    const [offerSent, setOfferSentRaw] = useState(() => {
        try { return JSON.parse(localStorage.getItem('tv_offers_sent') || '{}'); } catch { return {}; }
    });

    // Onboarding initiation
    const [initiatingOnboarding, setInitiatingOnboarding] = useState(null);
    const [onboardingInitiated, setOnboardingInitiatedRaw] = useState(() => {
        try { return JSON.parse(localStorage.getItem('tv_onboarding_init') || '{}'); } catch { return {}; }
    });

    // localStorage-backed setters — email is the stable key for sheet-based candidates
    const setOfferSent = (updater) => setOfferSentRaw(prev => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        try { localStorage.setItem('tv_offers_sent', JSON.stringify(next)); } catch {}
        return next;
    });
    const setOnboardingInitiated = (updater) => setOnboardingInitiatedRaw(prev => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        try { localStorage.setItem('tv_onboarding_init', JSON.stringify(next)); } catch {}
        return next;
    });

    // Offer Letters sub-tab + preview modals
    const [offerSubTab, setOfferSubTab] = useState('pending'); // 'pending' | 'sent'
    const [previewModal, setPreviewModal] = useState({ open: false, type: null, candidate: null });

    // Modals
    const [pdfModalOpen, setPdfModalOpen] = useState(false);
    const [pdfConfig, setPdfConfig] = useState({ department: 'All', status: 'All' });
    const [detailsModal, setDetailsModal] = useState({ open: false, candidate: null });
    const [detailsTab, setDetailsTab] = useState('summary');
    const [applicationDrafts, setApplicationDrafts] = useState({});
    const [savingApplication, setSavingApplication] = useState(null);
    const [schedulingId, setSchedulingId] = useState(null);
    const [hrList, setHrList] = useState([]);   // interviewer options (verified HR/lead members)
    const [appView, setAppView] = useState('list');   // 'list' | 'calendar' (applications tab)

    useEffect(() => {
        getOnboardingList().then((list) => {
            const arr = Array.isArray(list) ? list : [];
            const verified = arr.filter((m) => m.status === 'verified' && m.candidate_email);
            const roled = verified.filter((m) => ['hr', 'admin', 'advisory', 'team_lead'].includes(m.portal_role));
            const use = roled.length ? roled : verified;
            setHrList(use.map((m) => ({ name: m.candidate_name, email: m.candidate_email, role: m.portal_role || '' })));
        }).catch(() => {});
    }, []);
    const [gateDraft, setGateDraft] = useState({});
    const [savingGates, setSavingGates] = useState(false);

    const showNotice = (msg, type = 'success') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 4000);
    };

    const buildOfferPdf = (candidate) => {
        const doc = new jsPDF();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.text('Offer Letter', 105, 30, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        doc.text(`Dear ${candidate.first_name} ${candidate.last_name},`, 20, 55);
        doc.text('We are pleased to offer you a position at Tiesverse. Please find the details below:', 20, 70, { maxWidth: 170 });
        const offerTable = autoTable(doc, {
            startY: 90,
            head: [['Field', 'Details']],
            body: [
                ['Full Name', `${candidate.first_name} ${candidate.last_name}`],
                ['Role', candidate.roles || 'N/A'],
                ['Department', candidate.department || 'N/A'],
                ['Status', 'Selected'],
                ['Date', new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })],
            ],
            theme: 'grid',
            headStyles: { fillColor: [53, 37, 205] },
            styles: { fontSize: 10 },
        });
        const finalY = (offerTable?.finalY ?? doc.lastAutoTable?.finalY ?? 130) + 20;
        doc.text('Congratulations on being selected! Our team will be in touch shortly with next steps.', 20, finalY, { maxWidth: 170 });
        doc.text('Warm regards,\nTiesverse HR Team', 20, finalY + 25);
        return doc;
    };

    const handleSendOffer = async (candidate) => {
        const cKey = candidate.email;
        setSendingOffer(cKey);
        setPreviewModal({ open: false, type: null, candidate: null });
        try {
            const doc = buildOfferPdf(candidate);
            const pdfBase64 = doc.output('datauristring').split(',')[1];
            await sendOffer({
                email: candidate.email,
                name: `${candidate.first_name} ${candidate.last_name}`,
                pdf_base64: pdfBase64,
                subject: `Offer Letter — ${candidate.roles || 'Tiesverse'} | Tiesverse`,
                role: candidate.roles || 'Tiesverse',
                department: candidate.department || 'N/A',
                status: 'Selected',
                effective_date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
            });
            const sentDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            setOfferSent(prev => ({ ...prev, [cKey]: sentDate }));
            showNotice(`Offer letter sent to ${candidate.email}!`);
            // Auto-initiate onboarding
            try {
                const onbRes = await initiateOnboarding({
                    candidate_id: String(candidate.row_index || candidate.id || candidate.email),
                    candidate_name: `${candidate.first_name || ''} ${candidate.last_name || ''}`.trim(),
                    candidate_email: candidate.email,
                    role_offered: candidate.roles || '',
                });
                if (onbRes?.error) {
                    console.warn('[Onboarding] initiate error:', onbRes.error);
                    showNotice(`Offer sent, but onboarding initiation failed: ${onbRes.error}`, 'error');
                } else if (onbRes?.id || onbRes?.token) {
                    setOnboardingInitiated(prev => ({ ...prev, [cKey]: true }));
                }
            } catch (onbErr) {
                console.warn('[Onboarding] initiate exception:', onbErr);
                showNotice(`Offer sent, but onboarding initiation failed: ${onbErr?.message || 'Unknown error'}`, 'error');
            }
        } catch (err) {
            showNotice('Failed to send offer letter: ' + (err?.message || 'Unknown error'), 'error');
        }
        setSendingOffer(null);
    };

    const handleInitiateOnboarding = async (candidate) => {
        const cKey = candidate.email;
        setInitiatingOnboarding(cKey);
        try {
            const result = await initiateOnboarding({
                candidate_id: String(candidate.row_index || candidate.id || candidate.email),
                candidate_name: `${candidate.first_name || ''} ${candidate.last_name || ''}`.trim(),
                candidate_email: candidate.email,
                role_offered: candidate.roles || '',
            });
            if (result?.error) throw new Error(result.error);
            setOnboardingInitiated(prev => ({ ...prev, [cKey]: result.upload_link || true }));
            showNotice(`Onboarding initiated for ${candidate.first_name}! Upload link sent to ${candidate.email}.`);
        } catch (err) {
            showNotice('Failed to initiate onboarding: ' + (err?.message || 'Unknown error'), 'error');
        }
        setInitiatingOnboarding(null);
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            if (tab === 'offers') {
                // Show selected applications in the offer-letter roster.
                const cands = await getCandidates();
                const selected = (cands?.data || cands || []).filter(c => c.final_decision === 'Selected' || c.final_decision === 'Accepted');
                setItems(selected);
            } else {
                const data = await config.fetchFn();
                if (tab === 'form_gates') {
                    // getFormGates returns { status, gates: {...} } — iterate the gates map.
                    const gates = data?.gates || {};
                    const gatesArray = Object.entries(gates).map(([key, value]) => ({ id: key, name: key, is_open: value }));
                    setItems(gatesArray);
                    setGateDraft(gates);
                } else if (tab === 'applications') {
                    setItems(data.data || data || []);
                } else {
                    setItems(data || []);
                }
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
            setApplicationDrafts({});
        }
    }, [tab, user]);

    // Auto-reconcile: when offers tab loads, silently create onboarding records for
    // any candidate who was sent an offer (localStorage) but has no onboarding entry yet.
    // This repairs the gap from offer sends that happened before the DB table existed.
    useEffect(() => {
        if (tab !== 'offers' || !user || items.length === 0) return;
        const needsSync = items.filter(c => offerSent[c.email] && !onboardingInitiated[c.email]);
        if (needsSync.length === 0) return;
        needsSync.forEach(async (c) => {
            try {
                const res = await initiateOnboarding({
                    candidate_id: String(c.row_index || c.id || c.email),
                    candidate_name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
                    candidate_email: c.email,
                    role_offered: c.roles || '',
                });
                if (res?.id || res?.token) {
                    setOnboardingInitiated(prev => ({ ...prev, [c.email]: true }));
                }
            } catch (_) {}
        });
    }, [tab, items, user]);

    const filteredItems = items.filter(item => {
        if (tab !== 'applications') return true;

        const s = searchQuery.toLowerCase();
        const name = `${item.first_name || ''} ${item.last_name || ''}`.toLowerCase();
        const email = (item.email || '').toLowerCase();
        const role = (item.roles || '').toLowerCase();
        const dept = item.department || 'Unknown';
        const stat = item.final_decision || 'Under Review';

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
        doc.text('Source: Career applications', 14, 36);
        doc.text(`Filters applied -> Department: ${pdfConfig.department} | Status: ${pdfConfig.status}`, 14, 42);

        let exportItems = items.filter(item => {
            let dept = item.department;
            let stat = item.final_decision;
            const matchDept = pdfConfig.department === 'All' || dept === pdfConfig.department;
            const matchStatus = pdfConfig.status === 'All' || stat === pdfConfig.status;
            return matchDept && matchStatus;
        });

        const tableColumns = ['Name', 'Email', 'Role', 'Dept', 'Interviewer', 'Rating', 'Decision'];
        const tableRows = exportItems.map(i => [
            `${i.first_name || ''} ${i.last_name || ''}`, i.email || '-', i.roles || '-', i.department || '-',
            i.interviewer || '-', i.rating || '-', i.final_decision || 'Under Review'
        ]);

        autoTable(doc, {
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
        if (tab === 'applications') {
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

    const handleFormGateToggle = (key, isOpen) => {
        setGateDraft((current) => {
            const next = { ...current, [key]: isOpen };
            if (FORM_GATE_CATEGORIES[key]) {
                FORM_GATE_CATEGORIES[key].forEach((positionKey) => {
                    next[positionKey] = isOpen;
                });
            }
            if (!FORM_GATE_CATEGORIES[key] && isOpen) {
                const category = Object.entries(FORM_GATE_CATEGORIES)
                    .find(([, positionKeys]) => positionKeys.includes(key))?.[0];
                if (category) next[category] = true;
            }
            return next;
        });
    };

    const setAllFormGates = (isOpen) => {
        setGateDraft((current) => Object.keys(current).reduce((next, key) => {
            next[key] = isOpen;
            return next;
        }, {}));
    };

    const saveFormGates = async () => {
        setSavingGates(true);
        try {
            const response = await updateFormGates({ gates: gateDraft });
            if (response?.error || response?.status === 'error') {
                throw new Error(response?.error || response?.message || 'Update failed');
            }
            showNotice('Application form settings saved.');
            await fetchData();
        } catch (error) {
            showNotice(`Failed to save form settings: ${error?.message || 'Unknown error'}`, 'error');
        } finally {
            setSavingGates(false);
        }
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

        if (tab === 'applications') return (
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

    const openApplicationDetails = (candidate) => {
        setDetailsTab('summary');
        setDetailsModal({ open: true, candidate });
    };

    const closeApplicationDetails = () => {
        setDetailsModal({ open: false, candidate: null });
        setDetailsTab('summary');
    };

    const getApplicationId = (application) => application.id ?? application.row_index;

    const draftDefaults = (application) => ({
        interview_status: application.interview_status || 'Pending Setup',
        interviewer: application.interviewer || '',
        interviewer_email: application.interviewer_email || '',
        interview_at: application.interview_at ? String(application.interview_at).slice(0, 16) : '',
        rating: Number(application.rating || 0),
        final_decision: application.final_decision || 'Under Review',
    });

    const getApplicationDraft = (application) => {
        const id = getApplicationId(application);
        return applicationDrafts[id] || draftDefaults(application);
    };

    const updateApplicationDraft = (application, field, value) => {
        const id = getApplicationId(application);
        setApplicationDrafts((current) => ({
            ...current,
            [id]: {
                ...draftDefaults(application),
                ...(current[id] || {}),
                [field]: value,
            },
        }));
    };

    const handleScheduleInterview = async (application) => {
        const id = getApplicationId(application);
        const draft = getApplicationDraft(application);
        if (!draft.interview_at) { showNotice('Pick an interview date and time first.', 'error'); return; }
        setSchedulingId(id);
        try {
            const res = await scheduleInterview(id, {
                interview_at: draft.interview_at,
                interviewer: draft.interviewer || '',
                interviewer_email: draft.interviewer_email || '',
                duration_min: 30,
                interview_status: 'Interview Scheduled',
            });
            if (res?.status !== 'scheduled') throw new Error(res?.error || 'Could not schedule');
            setItems((current) => current.map((it) => (
                String(getApplicationId(it)) === String(id)
                    ? { ...it, interview_status: 'Interview Scheduled', interview_at: res.interview_at, meeting_link: res.meet_link, interviewer: draft.interviewer, interviewer_email: draft.interviewer_email }
                    : it
            )));
            showNotice(res.meet_link
                ? 'Interview scheduled — Google Meet link created and invites emailed.'
                : (res.note || 'Interview date saved (Google Calendar not configured, so no Meet link/invite).'));
        } catch (error) {
            showNotice(`Could not schedule: ${error?.message || 'Unknown error'}`, 'error');
        } finally {
            setSchedulingId(null);
        }
    };

    const resetFormGates = () => {
        setGateDraft(items.reduce((next, item) => {
            next[item.name] = item.is_open;
            return next;
        }, {}));
        showNotice('Unsaved form changes were discarded.');
    };

    const saveApplicationEvaluation = async (application) => {
        const id = getApplicationId(application);
        const draft = getApplicationDraft(application);
        setSavingApplication(id);
        try {
            const result = await updateCandidateStatus(id, draft);
            if (result?.error) throw new Error(result.error);
            setItems((current) => current.map((item) => (
                String(getApplicationId(item)) === String(id) ? { ...item, ...draft } : item
            )));
            setApplicationDrafts((current) => {
                const next = { ...current };
                delete next[id];
                return next;
            });
            showNotice(`Evaluation saved for ${application.first_name || 'applicant'}.`);
        } catch (error) {
            showNotice(`Could not save evaluation: ${error?.message || 'Unknown error'}`, 'error');
        } finally {
            setSavingApplication(null);
        }
    };

    const renderFormGateCard = (key, isCategory = false) => {
        const isOpen = gateDraft[key] !== false;
        return (
            <article className={`form-gate-card ${isCategory ? 'is-category' : 'is-position'} ${isOpen ? 'is-open' : 'is-closed'}`} key={key}>
                <div>
                    <h3>{FORM_GATE_LABELS[key] || key}</h3>
                    <p>{isCategory ? FORM_GATE_CATEGORY_HINTS[key] : `Key: ${key}`}</p>
                </div>
                <div className="form-gate-card-actions">
                    <span className={`form-gate-badge ${isOpen ? 'is-open' : 'is-closed'}`}>{isOpen ? 'Open' : 'Closed'}</span>
                    <label className="form-gate-switch">
                        <input
                            type="checkbox"
                            checked={isOpen}
                            onChange={(event) => handleFormGateToggle(key, event.target.checked)}
                            aria-label={`${isOpen ? 'Close' : 'Open'} ${FORM_GATE_LABELS[key] || key} applications`}
                        />
                        <span />
                    </label>
                </div>
            </article>
        );
    };

    const renderFormGateSettings = () => (
        <section className="form-gate-settings">
            <div className="form-gate-callout">
                Toggle which forms are <strong>Open</strong> or <strong>Closed</strong>. Changes go live after you select <strong>Save changes</strong>.
            </div>

            <div className="form-gate-category-panel">
                <header className="form-gate-panel-heading">
                    <div>
                        <h2>Category Access Controls</h2>
                        <p>Override visibility settings for entire departments.</p>
                    </div>
                    <div>
                        <button type="button" onClick={() => setAllFormGates(false)}>Close all</button>
                        <button type="button" className="is-primary" onClick={() => setAllFormGates(true)}>Open all</button>
                    </div>
                </header>

                <div className="form-gate-grid is-categories">
                    {Object.keys(FORM_GATE_CATEGORIES).map((key) => renderFormGateCard(key, true))}
                </div>
            </div>

            <div className="form-gate-detailed">
                <header className="form-gate-detailed-heading">
                    <h2>Detailed Position Toggles</h2>
                    <span>Global list ({Object.keys(gateDraft).length} forms)</span>
                </header>

                <div className="form-gate-position-groups">
                    {FORM_GATE_GROUPS.map((group) => (
                        <section className="form-gate-group" key={group.title}>
                            <div className="form-gate-group-heading">
                                <h3>{group.title === 'Tech' ? 'Technology' : group.title}</h3>
                                <span />
                            </div>
                            <div className="form-gate-grid">
                                {group.keys.map((key) => renderFormGateCard(key))}
                            </div>
                        </section>
                    ))}
                </div>
            </div>

            <footer className="form-gate-footer">
                <div className="form-gate-open-count">
                    <i />
                    <span><strong>{Object.values(gateDraft).filter((value) => value !== false).length} of {Object.keys(gateDraft).length}</strong> forms open</span>
                </div>
                <div>
                    <button type="button" className="is-secondary" onClick={resetFormGates} disabled={savingGates}>Cancel changes</button>
                    <button type="button" onClick={saveFormGates} disabled={savingGates}>
                        {savingGates ? 'Saving…' : 'Save changes'}
                    </button>
                </div>
            </footer>
        </section>
    );

    const renderItemCard = (item) => {
        const title = item.title || item.applicant_name || (item.first_name ? `${item.first_name} ${item.last_name}` : '') || `Offer #${item.id}`;
        const subtitle = item.department || item.status || item.interview_status || `Salary: $${item.salary}`;

        if (tab === 'positions') {
            return (
                <article className="career-position-card" key={item.id}>
                    <div className="career-position-topline">
                        <span className={`career-position-department dept-${String(item.department || 'general').toLowerCase().replace(/\s+/g, '-')}`}>
                            {item.department || 'General'}
                        </span>
                        <span className={`career-position-status ${item.is_open === false ? 'is-closed' : 'is-active'}`}>
                            <i /> {item.is_open === false ? 'Closed' : 'Active'}
                        </span>
                    </div>
                    <h2>{title}</h2>
                    <p>{item.description || 'No role description has been added yet.'}</p>
                    <footer>
                        <span><Briefcase size={15} /> {item.is_open === false ? 'Not accepting applications' : 'Accepting applications'}</span>
                        <div>
                            <button type="button" onClick={() => openEditModal(item)} aria-label={`Edit ${title}`}><Edit2 size={17} /></button>
                            <button type="button" className="is-danger" onClick={() => setDeleteModal({ open: true, id: item.id, title })} aria-label={`Delete ${title}`}><Trash2 size={17} /></button>
                        </div>
                    </footer>
                </article>
            );
        }

        if (tab === 'applications') {
            const id = getApplicationId(item);
            const draft = getApplicationDraft(item);
            const appliedDate = item.timestamp || item.created_at;
            const fullName = `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'Unnamed applicant';
            const portfolioUrl = item.portfolio_link || item.portfolio;
            const rating = Math.max(0, Math.min(5, Number(draft.rating || 0)));

            return (
                <article className="application-card" key={id}>
                    <section className="application-card-info">
                        <div className="application-card-heading">
                            <div className="application-avatar">{fullName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</div>
                            <div>
                                <h2>{fullName}</h2>
                                <time>Applied on {appliedDate ? new Date(appliedDate).toLocaleDateString('en-IN') : 'an unavailable date'}</time>
                            </div>
                        </div>
                        <div className="application-tags">
                            <span className="application-role">{item.roles || 'Role not specified'}</span>
                            <span className="application-department">{item.department || 'General'}</span>
                        </div>
                        <dl className="application-contact">
                            <div><dt>Email</dt><dd>{item.email || 'Not provided'}</dd></div>
                            <div><dt>City</dt><dd>{item.city || 'Not provided'}</dd></div>
                            <div><dt>Phone</dt><dd>{item.phone || 'Not provided'}</dd></div>
                        </dl>
                        <div className="application-links">
                            {item.resume_link && <button type="button" onClick={() => downloadFile(item.resume_link, `resume_${item.first_name || 'applicant'}.pdf`)}>Resume <Download size={13} /></button>}
                            {item.linkedin && <a href={item.linkedin} target="_blank" rel="noreferrer">LinkedIn <ExternalLink size={12} /></a>}
                            {portfolioUrl && <a href={portfolioUrl} target="_blank" rel="noreferrer">Portfolio <ExternalLink size={12} /></a>}
                        </div>
                        <button type="button" className="application-details-button" onClick={() => openApplicationDetails(item)}>
                            <Eye size={15} /> View application details
                        </button>
                    </section>

                    <section className="application-card-evaluation">
                        <label>
                            <span>Interview status</span>
                            <select value={draft.interview_status} onChange={(event) => updateApplicationDraft(item, 'interview_status', event.target.value)}>
                                <option value="Pending Setup">Pending Setup</option>
                                <option value="Scheduled">Scheduled</option>
                                <option value="Interview Scheduled">Interview Scheduled</option>
                                <option value="Completed">Completed</option>
                                <option value="Interviewed">Interviewed</option>
                            </select>
                        </label>
                        <label>
                            <span>Interviewer</span>
                            <select
                                value={hrList.some((h) => h.email === draft.interviewer_email) ? draft.interviewer_email : (draft.interviewer ? '__current__' : '')}
                                onChange={(event) => {
                                    const val = event.target.value;
                                    if (val === '__current__') return;
                                    const m = hrList.find((h) => h.email === val);
                                    updateApplicationDraft(item, 'interviewer_email', val);
                                    updateApplicationDraft(item, 'interviewer', m ? m.name : '');
                                }}
                            >
                                <option value="">Select interviewer…</option>
                                {draft.interviewer && !hrList.some((h) => h.email === draft.interviewer_email) && (
                                    <option value="__current__">{draft.interviewer} (current)</option>
                                )}
                                {hrList.map((h) => (
                                    <option key={h.email} value={h.email}>{h.name}{h.role ? ` · ${h.role.replace('_', ' ')}` : ''}</option>
                                ))}
                            </select>
                        </label>
                        {(draft.interview_status === 'Scheduled' || draft.interview_status === 'Interview Scheduled') && (
                            <div style={{ display: 'grid', gap: 8, marginTop: 4, paddingTop: 12, borderTop: '1px dashed color-mix(in srgb, var(--text-main) 15%, transparent)' }}>
                                <label>
                                    <span>Interview date &amp; time</span>
                                    <input type="datetime-local" value={draft.interview_at || ''} onChange={(event) => updateApplicationDraft(item, 'interview_at', event.target.value)} />
                                </label>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                    Invite goes to the candidate{draft.interviewer_email ? ` and ${draft.interviewer_email}` : ' — pick an interviewer above to invite them too'}.
                                </div>
                                <button type="button" className="application-save-button" disabled={schedulingId === id} onClick={() => handleScheduleInterview(item)}>
                                    <Send size={13} /> {schedulingId === id ? 'Scheduling…' : 'Create Meet & send invites'}
                                </button>
                                {item.meeting_link && (
                                    <a href={item.meeting_link} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>
                                        Google Meet ↗{item.interview_at ? ` · ${new Date(item.interview_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                                    </a>
                                )}
                            </div>
                        )}
                        <fieldset>
                            <legend>Rating</legend>
                            <div className="application-stars">
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <button type="button" key={star} className={star <= rating ? 'is-active' : ''} onClick={() => updateApplicationDraft(item, 'rating', star)} aria-label={`Rate ${star} out of 5`}>★</button>
                                ))}
                            </div>
                        </fieldset>
                    </section>

                    <section className="application-card-decision">
                        <label>
                            <span>Final decision</span>
                            <select value={draft.final_decision} onChange={(event) => updateApplicationDraft(item, 'final_decision', event.target.value)}>
                                <option value="Under Review">Under Review</option>
                                <option value="Selected">Selected</option>
                                <option value="Rejected">Rejected</option>
                                <option value="Not Selected">Not Selected</option>
                                <option value="Waitlisted">Waitlisted</option>
                            </select>
                        </label>
                        <div className={`application-decision-badge decision-${draft.final_decision.toLowerCase().replace(/\s+/g, '-')}`}>
                            <span /> {draft.final_decision}
                        </div>
                        <button type="button" className="application-save-button" disabled={savingApplication === id} onClick={() => saveApplicationEvaluation(item)}>
                            {savingApplication === id ? 'Saving…' : 'Save Evaluation'}
                        </button>
                        {(draft.final_decision === 'Selected' || item.final_decision === 'Selected') && (
                            onboardingInitiated[item.email] ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: 9, background: 'color-mix(in srgb, #067a50 8%, transparent)', border: '1px solid color-mix(in srgb, #067a50 20%, transparent)', color: '#067a50', fontSize: 11, fontWeight: 800 }}>
                                    <CheckCircle size={13} /> Onboarding Initiated
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    disabled={initiatingOnboarding === item.email}
                                    onClick={() => handleInitiateOnboarding(item)}
                                    style={{ minHeight: 40, border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)', borderRadius: 9, background: 'color-mix(in srgb, var(--primary) 8%, transparent)', color: 'var(--primary)', cursor: initiatingOnboarding === item.email ? 'wait' : 'pointer', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: initiatingOnboarding === item.email ? 0.65 : 1, transition: 'all 150ms ease' }}
                                >
                                    <UserCheck size={13} /> {initiatingOnboarding === item.email ? 'Sending…' : 'Initiate Onboarding'}
                                </button>
                            )
                        )}
                    </section>
                </article>
            );
        }

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
                    
                    {tab === 'applications' && (
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
                        {tab === 'applications' ? `Rating: ${item.rating || 0}/5` : (item.is_open === false ? 'Closed' : '')}
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {tab === 'applications' && (
                            <button onClick={() => openApplicationDetails(item)} title="Review Application"
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

    const detailCandidate = detailsModal.candidate;
    const detailFullName = detailCandidate
        ? `${detailCandidate.first_name || ''} ${detailCandidate.last_name || ''}`.trim() || 'Unnamed applicant'
        : '';
    const detailAppliedAt = detailCandidate?.timestamp || detailCandidate?.created_at;
    const detailPortfolio = detailCandidate?.portfolio_link || detailCandidate?.portfolio;
    const detailAssessmentTiles = parseAssessmentAnswers(detailCandidate?.answers);

    return (
        <div className={`career-admin-page ${tab === 'positions' ? 'career-positions-page' : ''} ${tab === 'applications' ? 'career-applications-page' : ''}`}>
            <div className="career-admin-header">
                <div>
                    <span className="career-admin-eyebrow">{tab === 'positions' ? 'Talent operations' : 'Career management'}</span>
                    <h1>{config.title}</h1>
                    <p>{tab === 'positions'
                        ? 'Manage and track open job postings across all departments. Monitor status and update role requirements in real time.'
                        : config.subtitle}</p>
                </div>
                {config.createFn && (
                    <button className="career-admin-create" onClick={openCreateModal}>
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
                    {tab === 'applications' && (
                        <div className="application-toolbar">
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', flex: 1 }}>
                                <div style={{ position: 'relative', flex: '1 1 240px' }}>
                                    <Search size={16} className="application-search-icon" />
                                    <input className="application-filter-control application-search" type="text" placeholder="Search name, email, or role..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                                </div>
                                <select className="application-filter-control" value={filterDepartment} onChange={e => setFilterDepartment(e.target.value)}>
                                    <option value="All">All Departments</option>
                                    <option value="Tech">Tech</option>
                                    <option value="Content">Content</option>
                                    <option value="Media">Media</option>
                                    <option value="Operations">Operations</option>
                                </select>
                                <select className="application-filter-control" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                                    <option value="All">All Decisions</option>
                                    <option value="Under Review">Under Review</option>
                                    <option value="Selected">Selected</option>
                                    <option value="Rejected">Rejected</option>
                                    <option value="Not Selected">Not Selected</option>
                                    <option value="Waitlisted">Waitlisted</option>
                                </select>
                            </div>
                            <div style={{ display: 'inline-flex', gap: 2, border: '1px solid var(--border, #e6e6ef)', borderRadius: 8, padding: 2 }}>
                                <button type="button" onClick={() => setAppView('list')} style={viewToggleStyle(appView === 'list')}><ListIcon size={14} /> List</button>
                                <button type="button" onClick={() => setAppView('calendar')} style={viewToggleStyle(appView === 'calendar')}><CalendarDays size={14} /> Calendar</button>
                            </div>
                            <button className="application-export-button" onClick={() => setPdfModalOpen(true)}>
                                <Download size={16} /> Export PDF
                            </button>
                        </div>
                    )}
                    
                    {filteredItems.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '80px 0', background: 'var(--surface-container-low)', borderRadius: '16px', border: '1px solid var(--outline-variant)' }}>
                            {config.icon && React.cloneElement(config.icon, { size: 40, style: { color: 'var(--text-muted)', opacity: 0.4, marginBottom: '12px' } })}
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: 600 }}>No {config.itemLabel.toLowerCase()}s found.</p>
                        </div>
                    ) : tab === 'form_gates' ? (
                        renderFormGateSettings()
                    ) : tab === 'offers' ? (
                        <div>
                            {/* Sub-tabs: Pending / Sent */}
                            <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--outline-variant)' }}>
                                {[['pending', 'Pending'], ['sent', 'Sent']].map(([key, label]) => {
                                    const count = key === 'pending'
                                        ? filteredItems.filter(c => !offerSent[c.email]).length
                                        : filteredItems.filter(c => offerSent[c.email]).length;
                                    return (
                                        <button key={key} onClick={() => setOfferSubTab(key)} style={{ padding: '9px 20px', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 700, background: 'transparent', borderRadius: '8px 8px 0 0', color: offerSubTab === key ? 'var(--primary)' : 'var(--text-muted)', borderBottom: offerSubTab === key ? '2px solid var(--primary)' : '2px solid transparent' }}>
                                            {label} <span style={{ fontSize: '0.6875rem', background: 'color-mix(in srgb, var(--primary) 10%, transparent)', color: 'var(--primary)', padding: '1px 7px', borderRadius: 10, marginLeft: 4 }}>{count}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            <div style={{ overflowX: 'auto', border: '1px solid var(--outline-variant)', borderRadius: 13, background: 'var(--surface-container-lowest)' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)' }}>
                                            {(offerSubTab === 'pending'
                                                ? ['Name', 'Email', 'Department', 'Role', 'Preview', 'Action']
                                                : ['Name', 'Email', 'Department', 'Role', 'Preview', 'Sent On', 'Onboarding']
                                            ).map(h => (
                                                <th key={h} style={{ padding: '11px 16px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredItems
                                            .filter(c => offerSubTab === 'pending' ? !offerSent[c.email] : !!offerSent[c.email])
                                            .map((c, idx, arr) => (
                                                <tr key={c.id} style={{ borderBottom: idx < arr.length - 1 ? '1px solid var(--outline-variant)' : 'none', transition: 'background 150ms ease' }}>
                                                    <td style={{ padding: '13px 16px', fontWeight: 700, whiteSpace: 'nowrap', fontFamily: 'Hanken Grotesk, sans-serif', color: 'var(--text-main)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                                                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--primary-fixed)', display: 'grid', placeItems: 'center', fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary)', flexShrink: 0 }}>
                                                                {`${c.first_name?.[0] || ''}${c.last_name?.[0] || ''}`.toUpperCase()}
                                                            </div>
                                                            {c.first_name} {c.last_name}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '13px 16px', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{c.email}</td>
                                                    <td style={{ padding: '13px 16px' }}>
                                                        <span style={{ fontSize: '0.625rem', fontWeight: 700, background: 'color-mix(in srgb, var(--primary) 8%, transparent)', color: 'var(--primary)', border: '1px solid color-mix(in srgb, var(--primary) 18%, transparent)', padding: '3px 9px', borderRadius: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.department}</span>
                                                    </td>
                                                    <td style={{ padding: '13px 16px', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{c.roles}</td>

                                                    {offerSubTab === 'pending' ? (
                                                        <>
                                                            {/* Preview column (Pending) */}
                                                            <td style={{ padding: '13px 16px' }}>
                                                                <div style={{ display: 'flex', gap: 6 }}>
                                                                    <button
                                                                        title="Preview Mail Template"
                                                                        onClick={() => setPreviewModal({ open: true, type: 'mail', candidate: c })}
                                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', background: 'color-mix(in srgb, var(--primary) 8%, transparent)', color: 'var(--primary)', border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)', borderRadius: 7, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                                                                        <Eye size={12} /> Mail
                                                                    </button>
                                                                    <button
                                                                        title="Preview Selection Certificate"
                                                                        onClick={() => setPreviewModal({ open: true, type: 'cert', candidate: c })}
                                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', background: 'color-mix(in srgb, #8a5700 8%, transparent)', color: '#8a5700', border: '1px solid color-mix(in srgb, #8a5700 20%, transparent)', borderRadius: 7, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                                                                        <Award size={12} /> Cert
                                                                    </button>
                                                                </div>
                                                            </td>
                                                            {/* Send action column (Pending) */}
                                                            <td style={{ padding: '13px 16px' }}>
                                                                <button
                                                                    disabled={sendingOffer === c.email}
                                                                    onClick={() => handleSendOffer(c)}
                                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.8125rem', fontWeight: 800, cursor: sendingOffer === c.email ? 'wait' : 'pointer', opacity: sendingOffer === c.email ? 0.65 : 1, transition: 'opacity 150ms ease' }}>
                                                                    <Send size={13} /> {sendingOffer === c.email ? 'Sending…' : 'Send Offer'}
                                                                </button>
                                                            </td>
                                                        </>
                                                    ) : (
                                                        <>
                                                            {/* Preview column (Sent) — re-preview after sending */}
                                                            <td style={{ padding: '13px 16px' }}>
                                                                <div style={{ display: 'flex', gap: 6 }}>
                                                                    <button
                                                                        title="Re-preview Mail"
                                                                        onClick={() => setPreviewModal({ open: true, type: 'mail', candidate: c })}
                                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', background: 'color-mix(in srgb, var(--primary) 8%, transparent)', color: 'var(--primary)', border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)', borderRadius: 7, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                                                                        <Eye size={12} /> Mail
                                                                    </button>
                                                                    <button
                                                                        title="Re-preview Certificate"
                                                                        onClick={() => setPreviewModal({ open: true, type: 'cert', candidate: c })}
                                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', background: 'color-mix(in srgb, #8a5700 8%, transparent)', color: '#8a5700', border: '1px solid color-mix(in srgb, #8a5700 20%, transparent)', borderRadius: 7, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                                                                        <Award size={12} /> Cert
                                                                    </button>
                                                                </div>
                                                            </td>
                                                            {/* Sent date */}
                                                            <td style={{ padding: '13px 16px' }}>
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#067a50', fontSize: '0.8125rem', fontWeight: 700 }}>
                                                                    <CheckCircle size={13} /> {offerSent[c.email]}
                                                                </span>
                                                            </td>
                                                            {/* Onboarding status */}
                                                            <td style={{ padding: '13px 16px' }}>
                                                                {onboardingInitiated[c.email] ? (
                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#067a50', fontSize: '0.8125rem', fontWeight: 700 }}>
                                                                        <UserCheck size={13} /> In Onboarding
                                                                    </span>
                                                                ) : (
                                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>—</span>
                                                                )}
                                                            </td>
                                                        </>
                                                    )}
                                                </tr>
                                            ))}
                                        {filteredItems.filter(c => offerSubTab === 'pending' ? !offerSent[c.email] : !!offerSent[c.email]).length === 0 && (
                                            <tr><td colSpan={offerSubTab === 'sent' ? 7 : 6} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                                                {offerSubTab === 'pending' ? 'No pending offers — all offers have been sent.' : 'No offers sent yet.'}
                                            </td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (tab === 'applications' && appView === 'calendar') ? (
                        <ScheduleCalendar
                            events={filteredItems.filter((c) => c.interview_at).map((c) => ({
                                id: c.id,
                                date: c.interview_at,
                                title: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Interview',
                                subtitle: c.roles || c.department || '',
                                link: c.meeting_link || '',
                            }))}
                            emptyLabel="No interviews scheduled yet. Set an interview date on an applicant, then it appears here."
                        />
                    ) : (
                        <div className={`career-admin-grid ${tab === 'form_gates' ? 'is-wide' : ''} ${tab === 'applications' ? 'is-applications' : ''}`}>
                            {filteredItems.map(item => renderItemCard(item))}
                            {tab === 'positions' && (
                                <button type="button" className="career-position-new-card" onClick={openCreateModal}>
                                    <Plus size={33} />
                                    <strong>Create New Position</strong>
                                    <span>Add another role to the Career portal.</span>
                                </button>
                            )}
                        </div>
                    )}
                </>
            )}

            {formModalOpen && (
                <div className="career-admin-modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
                    <div className="career-admin-modal" style={{ background: '#111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', padding: '32px' }}>
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
                <div className="career-admin-modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
                    <div className="career-admin-modal" style={{ background: '#111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', maxWidth: '420px', width: '100%', padding: '32px' }}>
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
                <div className="app-modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
                    <div className="app-modal" style={{ background: '#111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', maxWidth: '420px', width: '100%', padding: '32px' }}>
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
                                    {tab === 'applications' ? (
                                        <>
                                            <option value="Under Review">Under Review</option>
                                            <option value="Selected">Selected</option>
                                            <option value="Rejected">Rejected</option>
                                            <option value="Not Selected">Not Selected</option>
                                            <option value="Waitlisted">Waitlisted</option>
                                        </>
                                    ) : (
                                        <>
                                            <option value="Pending">Pending</option>
                                            <option value="Reviewed">Reviewed</option>
                                            <option value="Selected">Selected</option>
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
                <div className="application-detail-overlay" onMouseDown={(event) => {
                    if (event.target === event.currentTarget) closeApplicationDetails();
                }}>
                    <div className="application-detail-modal" role="dialog" aria-modal="true" aria-labelledby="application-detail-title">
                        <header className="application-detail-topbar">
                            <strong>Application Details</strong>
                            <button type="button" onClick={closeApplicationDetails} aria-label="Close application details"><X size={20} /></button>
                        </header>

                        <div className="application-detail-body">
                            <div className="application-detail-hero">
                                <div className="application-detail-identity">
                                    <div className="application-detail-avatar">
                                        {detailFullName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}
                                    </div>
                                    <div>
                                        <h2 id="application-detail-title">{detailFullName}</h2>
                                        <p>{detailCandidate.roles || 'Role not specified'}{detailCandidate.department ? ` · ${detailCandidate.department}` : ''}</p>
                                    </div>
                                </div>
                                <div className="application-detail-pills">
                                    {detailCandidate.department && <span>{detailCandidate.department}</span>}
                                    <span className={`decision-${String(detailCandidate.final_decision || 'Under Review').toLowerCase().replace(/\s+/g, '-')}`}>
                                        {detailCandidate.final_decision || 'Under Review'}
                                    </span>
                                </div>
                            </div>

                            <div className="application-detail-grid">
                                <div className="application-detail-tile">
                                    <span>Applied</span>
                                    <strong>{detailAppliedAt ? new Date(detailAppliedAt).toLocaleString('en-IN') : '—'}</strong>
                                </div>
                                <div className="application-detail-tile">
                                    <span>City</span>
                                    <strong>{detailCandidate.city || '—'}</strong>
                                </div>
                                <div className="application-detail-tile">
                                    <span>Email</span>
                                    <strong>{detailCandidate.email ? <a href={`mailto:${detailCandidate.email}`}>{detailCandidate.email}</a> : '—'}</strong>
                                </div>
                                <div className="application-detail-tile">
                                    <span>Phone</span>
                                    <strong>{detailCandidate.phone || '—'}</strong>
                                </div>
                                <div className="application-detail-tile is-wide">
                                    <span>Links</span>
                                    <strong className="application-detail-links">
                                        {detailCandidate.resume_link && <button type="button" onClick={() => downloadFile(detailCandidate.resume_link, `resume_${detailCandidate.first_name || 'applicant'}.pdf`)}>Resume</button>}
                                        {detailCandidate.linkedin && <a href={detailCandidate.linkedin} target="_blank" rel="noreferrer">LinkedIn <ExternalLink size={12} /></a>}
                                        {detailPortfolio && <a href={detailPortfolio} target="_blank" rel="noreferrer">Portfolio <ExternalLink size={12} /></a>}
                                        {!detailCandidate.resume_link && !detailCandidate.linkedin && !detailPortfolio && '—'}
                                    </strong>
                                </div>
                            </div>

                            <div className="application-detail-tabs" role="tablist" aria-label="Application detail sections">
                                <button type="button" role="tab" aria-selected={detailsTab === 'summary'} className={detailsTab === 'summary' ? 'is-active' : ''} onClick={() => setDetailsTab('summary')}>Summary</button>
                                <button type="button" role="tab" aria-selected={detailsTab === 'assessment'} className={detailsTab === 'assessment' ? 'is-active' : ''} onClick={() => setDetailsTab('assessment')}>Assessment</button>
                            </div>

                            {detailsTab === 'summary' ? (
                                <section className="application-detail-panel" role="tabpanel">
                                    <div className="application-detail-tile is-wide">
                                        <span>Why join Tiesverse?</span>
                                        <p>{detailCandidate.why_join || 'No summary was provided.'}</p>
                                    </div>
                                </section>
                            ) : (
                                <section className="application-detail-panel application-assessment-list" role="tabpanel">
                                    {detailAssessmentTiles.length ? detailAssessmentTiles.map((tile, index) => (
                                        <div className="application-detail-tile is-wide" key={`${tile.question}-${index}`}>
                                            <span className="application-assessment-question">{tile.question}</span>
                                            <p>{tile.answer}</p>
                                        </div>
                                    )) : (
                                        <div className="application-detail-tile is-wide">
                                            <span>Assessment</span>
                                            <p>No assessment data was provided.</p>
                                        </div>
                                    )}
                                </section>
                            )}
                        </div>

                        <footer className="application-detail-footer">
                            <span>Rating: {detailCandidate.rating || 0}/5</span>
                            {detailCandidate.resume_link && (
                                <button type="button" onClick={() => downloadFile(detailCandidate.resume_link, `resume_${detailCandidate.first_name || 'applicant'}.pdf`)}>
                                    <Download size={16} /> Download Resume
                                </button>
                            )}
                        </footer>
                    </div>
                </div>
            )}

            {/* ── Mail Template Preview Modal ──────────────────────────────────── */}
            {previewModal.open && previewModal.type === 'mail' && previewModal.candidate && (() => {
                const c = previewModal.candidate;
                const fullName = `${c.first_name} ${c.last_name}`;
                const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
                return (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(25,28,30,0.72)', backdropFilter: 'blur(10px)', display: 'grid', placeItems: 'center', padding: 24 }}>
                        <div style={{ background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)', borderRadius: 14, width: '100%', maxWidth: 600, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(15,23,42,0.3)' }}>
                            {/* Modal top bar */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px', borderBottom: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)', borderRadius: '14px 14px 0 0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Eye size={15} style={{ color: 'var(--primary)' }} />
                                    <strong style={{ fontSize: '0.9375rem', color: 'var(--text-main)', fontFamily: 'Hanken Grotesk, sans-serif' }}>Mail Template Preview</strong>
                                </div>
                                <button onClick={() => setPreviewModal({ open: false, type: null, candidate: null })} style={{ background: 'var(--surface-container)', border: '1px solid var(--outline-variant)', color: 'var(--text-muted)', cursor: 'pointer', borderRadius: 8, width: 32, height: 32, display: 'grid', placeItems: 'center' }}><X size={14} /></button>
                            </div>

                            {/* Email chrome */}
                            <div style={{ overflowY: 'auto', padding: '20px 22px', flex: 1 }}>
                                {/* Email headers */}
                                {[
                                    { label: 'From', value: 'careers@tiesverse.com' },
                                    { label: 'To', value: c.email },
                                    { label: 'Subject', value: `Offer Letter — ${c.roles || 'Tiesverse'} | Tiesverse` },
                                    { label: 'Date', value: today },
                                ].map(({ label, value }) => (
                                    <div key={label} style={{ display: 'flex', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--outline-variant)', fontSize: '0.8125rem' }}>
                                        <span style={{ width: 60, color: 'var(--text-muted)', fontWeight: 700, flexShrink: 0 }}>{label}</span>
                                        <span style={{ color: 'var(--text-main)' }}>{value}</span>
                                    </div>
                                ))}

                                {/* Email body */}
                                <div style={{ marginTop: 20, padding: 20, background: 'var(--surface-container-low)', borderRadius: 10, border: '1px solid var(--outline-variant)', fontSize: '0.875rem', color: 'var(--text-main)', lineHeight: 1.75 }}>
                                    <p>Dear <strong>{fullName}</strong>,</p>
                                    <br />
                                    <p>We are delighted to extend this offer of selection to join <strong>Tiesverse</strong>. Please find the details of your offer below:</p>
                                    <br />
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', margin: '8px 0' }}>
                                        <tbody>
                                            {[['Role', c.roles || 'N/A'], ['Department', c.department || 'N/A'], ['Status', 'Selected'], ['Effective Date', today]].map(([k, v]) => (
                                                <tr key={k} style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                                                    <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text-muted)', width: '40%', background: 'var(--surface-container)' }}>{k}</td>
                                                    <td style={{ padding: '8px 12px', color: 'var(--text-main)' }}>{v}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <br />
                                    <p>Congratulations on your selection! Our team will be in touch shortly with the next steps for your onboarding.</p>
                                    <br />
                                    <p>Please find the official offer letter attached to this email as a PDF.</p>
                                    <br />
                                    <p>Warm regards,<br /><strong>Tiesverse HR Team</strong><br /><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>careers@tiesverse.com</span></p>
                                </div>

                                {/* Attachment */}
                                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 8 }}>
                                    <FileText size={18} style={{ color: 'var(--primary)' }} />
                                    <div>
                                        <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-main)' }}>Offer-Letter.pdf</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Generated PDF attachment</div>
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--outline-variant)', display: 'flex', gap: 10, background: 'var(--surface-container-low)', borderRadius: '0 0 14px 14px' }}>
                                <button onClick={() => setPreviewModal({ open: false, type: null, candidate: null })} style={{ flex: 1, minHeight: 40, background: 'var(--surface-container)', border: '1px solid var(--outline-variant)', borderRadius: 8, color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer' }}>Close Preview</button>
                                <button onClick={() => handleSendOffer(c)} disabled={sendingOffer === c.email} style={{ flex: 2, minHeight: 40, background: 'var(--primary)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 800, fontSize: '0.875rem', cursor: sendingOffer === c.email ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: sendingOffer === c.email ? 0.65 : 1 }}>
                                    <Send size={14} /> {sendingOffer === c.email ? 'Sending…' : offerSent[c.email] ? 'Resend Offer' : 'Send This Offer'}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ── Certificate Preview Modal ─────────────────────────────────────── */}
            {previewModal.open && previewModal.type === 'cert' && previewModal.candidate && (() => {
                const c = previewModal.candidate;
                return (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(25,28,30,0.72)', backdropFilter: 'blur(10px)', display: 'grid', placeItems: 'center', padding: 24 }}>
                        <div style={{ background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)', borderRadius: 14, width: '100%', maxWidth: 760, boxShadow: '0 32px 80px rgba(15,23,42,0.3)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px', borderBottom: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)', borderRadius: '14px 14px 0 0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Award size={15} style={{ color: '#8a5700' }} />
                                    <strong style={{ fontSize: '0.9375rem', color: 'var(--text-main)', fontFamily: 'Hanken Grotesk, sans-serif' }}>Certificate of Selection — Preview</strong>
                                </div>
                                <button onClick={() => setPreviewModal({ open: false, type: null, candidate: null })} style={{ background: 'var(--surface-container)', border: '1px solid var(--outline-variant)', color: 'var(--text-muted)', cursor: 'pointer', borderRadius: 8, width: 32, height: 32, display: 'grid', placeItems: 'center' }}><X size={14} /></button>
                            </div>
                            <div style={{ padding: 24 }}>
                                <CertCanvas candidate={c} />
                                <p style={{ marginTop: 12, fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>This certificate is for preview only. It can be sent as part of the selection package.</p>
                            </div>
                            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--outline-variant)', display: 'flex', gap: 10, background: 'var(--surface-container-low)', borderRadius: '0 0 14px 14px' }}>
                                <button onClick={() => setPreviewModal({ open: false, type: null, candidate: null })} style={{ flex: 1, minHeight: 40, background: 'var(--surface-container)', border: '1px solid var(--outline-variant)', borderRadius: 8, color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer' }}>Close</button>
                                <button onClick={() => handleSendOffer(c)} disabled={sendingOffer === c.email} style={{ flex: 2, minHeight: 40, background: 'var(--primary)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 800, fontSize: '0.875rem', cursor: sendingOffer === c.email ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: sendingOffer === c.email ? 0.65 : 1 }}>
                                    <Send size={14} /> {sendingOffer === c.email ? 'Sending…' : offerSent[c.email] ? 'Resend Offer Letter' : 'Send Offer Letter'}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

        </div>
    );
};

export default CareerAdmin;
