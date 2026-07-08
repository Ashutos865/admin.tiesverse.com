import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Megaphone, Upload, Table, Database, Eye, Send, Plus, Trash2, ExternalLink, CheckCircle2, AlertTriangle, Award, Loader2, Save, FileEdit, FilePlus2, Clock, StopCircle, Info } from 'lucide-react';
import { getEmailTemplates, sendCampaign, sendCampaignAsync, getCampaignStatus, cancelCampaign, getCampaigns, getCampaignRecipients, getSESSenders, getDataSources, getDataSourceRows, getEmailDrafts, createEmailDraft, updateEmailDraft, deleteEmailDraft } from '../../apiClient';
import { listCertificateTemplates, getCertificateTemplate, generateCertificate } from '../Certificates/certificateApi';
import { variableNamesFromElements } from '../Certificates/certificateUtils';

// The certificate fields a sender actually needs to fill: variables that are
// PLACED on the design ({{token}} in a text element) and not auto-generated.
// Orphan variables (declared but never placed) are hidden so mail matches the
// certificate. Falls back to all manual variables if none can be detected.
const usableCertVars = (t) => {
    const used = new Set(variableNamesFromElements(t?.text_elements || []));
    const nonGen = (t?.variables || []).filter(v => !v.generator_enabled);
    const placed = nonGen.filter(v => used.has(String(v.name).toLowerCase()));
    return placed.length ? placed : nonGen;
};

// blob -> base64 (no data: prefix), for attaching generated certificate PDFs.
const blobToBase64 = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => { const s = String(r.result || ''); resolve(s.slice(s.indexOf(',') + 1)); };
    r.onerror = reject;
    r.readAsDataURL(blob);
});
const sanitizeFilename = (s) => (s || '').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();

// ── client-side render twin (matches backend render_content) ──
const paras = (text) => (text || '').trim().split(/\n\s*\n/).filter(b => b.trim())
    .map(b => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">${b.trim().replace(/\n/g, '<br>')}</p>`).join('');
function renderContent(c = {}) {
    const parts = [];
    if ((c.heading || '').trim()) parts.push(`<h1 style="margin:0 0 20px;font-size:20px;font-weight:800;color:#111827;">${c.heading}</h1>`);
    parts.push(paras(c.body));
    const rows = (c.table || []).filter(r => r.label || r.value);
    if (rows.length) {
        const cells = rows.map(r => `<tr><td style="padding:9px 14px;font-size:13px;color:#6b7280;font-weight:600;background:#f9fafb;width:42%;">${r.label || ''}</td><td style="padding:9px 14px;font-size:14px;color:#111827;font-weight:600;">${r.value || ''}</td></tr>`).join('');
        parts.push(`<table style="width:100%;margin:0 0 20px;border:1px solid #e5e7eb;border-radius:10px;border-collapse:separate;overflow:hidden;">${cells}</table>`);
    }
    parts.push(paras(c.closing));
    const b = c.button || {};
    if (b.label && b.url) parts.push(`<table style="margin:8px 0 20px;"><tr><td style="border-radius:10px;background:#4338ca;"><a href="${b.url}" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#fff;text-decoration:none;border-radius:10px;">${b.label}</a></td></tr></table>`);
    const sig = (c.signature || '').trim();
    if (sig) parts.push(`<p style="margin:20px 0 0;font-size:15px;line-height:1.6;color:#374151;">${sig.split('\n').map(ln => (ln.includes('@') && ln.includes('.')) ? `<span style="color:#9ca3af;font-size:13px;">${ln}</span>` : ln).join('<br>')}</p>`);
    const inner = parts.filter(Boolean).join('');
    return `<div style="background:#f3f4f6;padding:24px 12px;font-family:-apple-system,Segoe UI,sans-serif;"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);"><div style="background:linear-gradient(135deg,#4338ca,#3730a3);padding:24px 32px;"><span style="font-size:18px;font-weight:800;color:#fff;">Tiesverse</span></div><div style="padding:32px;">${inner}</div><div style="padding:20px 32px;background:#f9fafb;border-top:1px solid #eef0f3;"><p style="margin:0;font-size:12px;color:#9ca3af;">© Tiesverse. This is an automated message — please do not reply.</p></div></div></div>`;
}
// Row value wins; else the variable's default; else blank — never a raw {{token}}.
const merge = (text, row, defaults = {}) => (text || '').replace(/{{\s*(\w+)\s*}}/g, (m, k) =>
    (k in row && row[k] != null && row[k] !== '') ? row[k] : (defaults[k] || ''));
const templateBody = (t) => (t.html_mode ? (t.body_html || '') : renderContent(t.content_json || {}));
const normVars = (vars) => (vars || [])
    .map(v => typeof v === 'string' ? { name: v, label: '', default: '' }
        : { name: (v.name || '').trim(), label: v.label || '', default: v.default == null ? '' : String(v.default) })
    .filter(v => v.name);
const tokensIn = (...texts) => {
    const found = [];
    texts.forEach(t => { const re = /{{\s*(\w+)\s*}}/g; let m; while ((m = re.exec(t || ''))) { if (!found.includes(m[1])) found.push(m[1]); } });
    return found;
};

// ── minimal CSV parser (handles quoted fields) ──
function parseCSV(text) {
    const rows = []; let i = 0, field = '', row = [], inQ = false;
    const pushF = () => { row.push(field); field = ''; };
    const pushR = () => { rows.push(row); row = []; };
    while (i < text.length) {
        const ch = text[i];
        if (inQ) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += ch; }
        else if (ch === '"') inQ = true;
        else if (ch === ',') pushF();
        else if (ch === '\r') { /* skip */ }
        else if (ch === '\n') { pushF(); pushR(); }
        else field += ch;
        i++;
    }
    if (field.length || row.length) { pushF(); pushR(); }
    return rows.filter(r => r.some(c => (c || '').trim() !== ''));
}
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function MailAutomation() {
    const navigate = useNavigate();
    const [templates, setTemplates] = useState([]);
    const [templateId, setTemplateId] = useState('');
    const [subject, setSubject] = useState('');
    const [senders, setSenders] = useState({ emails: [], domains: [], default: '' });
    const [fromName, setFromName] = useState('');
    const [fromEmail, setFromEmail] = useState('');
    const [source, setSource] = useState('csv');           // 'csv' | 'table' | 'manual'
    const [csvHeaders, setCsvHeaders] = useState([]);
    const [csvData, setCsvData] = useState([]);
    const [emailColumn, setEmailColumn] = useState('');
    const [mapping, setMapping] = useState({});            // variable -> column
    const [manualRows, setManualRows] = useState([]);
    const [dataSources, setDataSources] = useState([]);    // connectable system tables
    const [sourceTable, setSourceTable] = useState('');
    const [sourceEvent, setSourceEvent] = useState('');
    const [tableLoading, setTableLoading] = useState(false);
    const [previewIdx, setPreviewIdx] = useState(0);
    const [sending, setSending] = useState(false);
    const [results, setResults] = useState(null);
    const [history, setHistory] = useState([]);
    const [toast, setToast] = useState(null);
    // Attach-certificate state
    const [certTemplates, setCertTemplates] = useState([]);
    const [attachCert, setAttachCert] = useState(false);
    const [certTemplateId, setCertTemplateId] = useState('');
    const [certTemplate, setCertTemplate] = useState(null);   // full template incl. variables
    const [certLoadingTpl, setCertLoadingTpl] = useState(false);
    const [certMapping, setCertMapping] = useState({});       // placeholder -> source key ('email' | variable | '')
    const [certFilename, setCertFilename] = useState('Certificate - {{name}}.pdf');
    const [genProgress, setGenProgress] = useState(null);     // {done,total}
    // Drafts
    const [drafts, setDrafts] = useState([]);
    const [currentDraftId, setCurrentDraftId] = useState(null);
    const [currentDraftName, setCurrentDraftName] = useState('');
    const [savingDraft, setSavingDraft] = useState(false);
    const restoringRef = useRef(false);          // skip the template-reset effect once when restoring
    const restoreCertMap = useRef(null);         // cert mapping to restore after the template loads
    // Campaign history viewer
    const [viewCampaign, setViewCampaign] = useState(null);   // {campaign, recipients}
    const [loadingCampaign, setLoadingCampaign] = useState(false);

    const showToast = (msg, err = false) => { setToast({ msg, err }); setTimeout(() => setToast(null), 3200); };

    const load = useCallback(async () => {
        const [tpls, camps, snd, src, certs] = await Promise.all([
            getEmailTemplates(), getCampaigns(), getSESSenders(),
            getDataSources().catch(() => ({ sources: [] })),
            listCertificateTemplates().catch(() => []),
        ]);
        setTemplates(Array.isArray(tpls) ? tpls : []);
        setHistory(Array.isArray(camps) ? camps : []);
        if (snd && !snd.error) setSenders(snd);
        setDataSources(src?.sources || []);
        setCertTemplates(Array.isArray(certs) ? certs : (certs?.templates || []));
    }, []);
    useEffect(() => { load(); }, [load]);

    const watchRef = useRef(null);   // campaign id being polled (prevents double loops)

    const fmtEta = (sec) => {
        if (sec == null || sec < 0) return '';
        if (sec < 60) return `~${Math.max(1, Math.round(sec))}s left`;
        const m = Math.round(sec / 60);
        if (m < 60) return `~${m} min left`;
        const h = Math.floor(m / 60);
        return `~${h}h ${m % 60}m left`;
    };

    // Poll a background campaign's progress. Works for a fresh send AND to
    // reconnect to one already running (e.g. after the tab was reopened). Only
    // one poll loop runs at a time, keyed by campaign id.
    const watchCampaign = useCallback((campaignId, total, notifyEmail) => {
        if (!campaignId || watchRef.current === campaignId) return;
        watchRef.current = campaignId;
        setSending(true); setResults(null);
        setGenProgress({ done: 0, total: total || 0, status: 'queued', batchIndex: 0, batchTotal: 0, eta: null, campaignId, notifyEmail: notifyEmail || '' });
        const poll = async () => {
            if (watchRef.current !== campaignId) return;   // superseded / stopped watching
            const s = await getCampaignStatus(campaignId).catch(() => null);
            if (s) setGenProgress({
                done: s.processed || 0, total: s.total || total || 0, status: s.status,
                batchIndex: s.batch_index || 0, batchTotal: s.batch_total || 0,
                eta: (s.eta_seconds ?? null), campaignId,
                notifyEmail: notifyEmail || s.notify_email || '',
                canceling: !!s.cancel_requested,
            });
            if (!s || ['done', 'error', 'canceled'].includes(s.status)) {
                watchRef.current = null;
                setGenProgress(null); setSending(false);
                if (s && s.status === 'done') { setResults({ sent: s.sent, skipped: s.skipped, failed: s.failed }); showToast(`Sent ${s.sent}, skipped ${s.skipped}, failed ${s.failed}`); }
                else if (s && s.status === 'canceled') { setResults({ sent: s.sent, skipped: s.skipped, failed: s.failed }); showToast(`Stopped — ${s.sent} sent of ${s.total}`); }
                else if (s && s.status === 'error') showToast('Campaign was interrupted. Re-run it — only the remaining recipients will be sent.', true);
                else showToast('Lost track of the campaign.', true);
                load();
                return;
            }
            setTimeout(poll, 1200);
        };
        poll();
    }, [load]);

    // Reconnect: if a campaign is still queued/running (tab reopened), pick it
    // back up and show live progress automatically.
    useEffect(() => {
        if (watchRef.current || sending || !history.length) return;
        const active = history.find(h => h.status === 'running' || h.status === 'queued');
        if (active) watchCampaign(active.id, active.recipient_count || 0, active.notify_email || active.from_email || '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [history]);

    const stopCampaign = async () => {
        const id = genProgress?.campaignId; if (!id) return;
        setGenProgress(g => (g ? { ...g, canceling: true } : g));
        await cancelCampaign(id).catch(() => {});
        showToast('Stopping after the current batch…');
    };

    const loadDrafts = useCallback(async () => {
        const d = await getEmailDrafts().catch(() => []);
        setDrafts(Array.isArray(d) ? d : (d?.results || []));
    }, []);
    useEffect(() => { loadDrafts(); }, [loadDrafts]);
    const activeSource = dataSources.find(s => s.id === sourceTable) || null;

    const template = templates.find(t => String(t.id) === String(templateId)) || null;
    const varDefs = useMemo(() => normVars(template?.variables), [template]);
    const variables = useMemo(() => varDefs.map(v => v.name), [varDefs]);        // names, for the existing UI
    const defaults = useMemo(() => Object.fromEntries(varDefs.filter(v => v.default !== '').map(v => [v.name, v.default])), [varDefs]);

    // When template changes, reset subject + sender + auto-map columns.
    useEffect(() => {
        if (!template) return;
        if (restoringRef.current) { restoringRef.current = false; return; }   // keep restored draft values
        setSubject(template.subject || '');
        setFromName(template.from_name || 'Tiesverse');
        setFromEmail(template.from_email || senders.default || 'mail@tiesverse.com');
        setManualRows(prev => prev.length ? prev : [emptyManualRow(template.variables)]);
    }, [templateId]); // eslint-disable-line

    // Certificate placeholders that need a value (placed on the design, not auto).
    const certManualVars = useMemo(() => usableCertVars(certTemplate), [certTemplate]);

    // Load the chosen certificate template's fields + auto-map by name.
    useEffect(() => {
        if (!certTemplateId) { setCertTemplate(null); return; }
        let alive = true;
        setCertLoadingTpl(true);
        getCertificateTemplate(certTemplateId).then(t => {
            if (!alive) return;
            setCertTemplate(t);
            const manual = usableCertVars(t);
            const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
            const sources = ['email', ...variables];
            const auto = Object.fromEntries(manual.map(v =>
                [v.name, sources.find(s => norm(s) === norm(v.name)) || '']));
            setCertMapping(restoreCertMap.current || auto);   // restored draft mapping wins once
            restoreCertMap.current = null;
        }).catch(() => { if (alive) setCertTemplate(null); })
          .finally(() => { if (alive) setCertLoadingTpl(false); });
        return () => { alive = false; };
    }, [certTemplateId, variables]);

    // Build the certificate data dict for one recipient. The generator REQUIRES a
    // non-empty value for EVERY declared variable (even orphans not placed on the
    // design), so we include them all: real data for mapped fields, the variable's
    // default otherwise, and finally an invisible zero-width space so unplaced
    // variables satisfy the requirement without printing anything.
    const buildCertDataFor = (row) => {
        const ZW = String.fromCharCode(0x200B);   // zero-width space: non-empty for the generator, invisible on the PDF
        const data = {};
        (certTemplate?.variables || []).forEach(v => {
            const src = certMapping[v.name];           // only shown (placed) vars are mapped
            let val = src ? row[src] : '';
            val = (val == null) ? '' : String(val);
            if (val.trim() === '') {
                const def = v.default_value == null ? '' : String(v.default_value);
                val = def.trim() !== '' ? def : ZW;
            }
            data[String(v.name).toLowerCase()] = val;
        });
        return data;
    };

    const senderVerified = (email) => {
        const e = (email || '').trim().toLowerCase();
        if (!e) return false;
        if (senders.emails.map(x => x.toLowerCase()).includes(e)) return true;
        const domain = e.split('@')[1];
        return senders.domains.map(x => x.toLowerCase()).includes(domain);
    };

    // Build normalized recipients (email + variable-named keys) from the active source.
    const recipients = useMemo(() => {
        if (source === 'manual') return manualRows.map(r => ({ ...r }));
        return csvData.map(r => {
            const out = { email: r[emailColumn] || '' };
            variables.forEach(v => {
                const val = r[mapping[v]];
                out[v] = (val !== undefined && val !== '') ? val : (defaults[v] || '');  // unmapped -> default
            });
            return out;
        });
    }, [source, manualRows, csvData, emailColumn, mapping, variables, defaults]);

    const validCount = recipients.filter(r => EMAIL_RE.test((r.email || '').trim())).length;
    const invalidCount = recipients.length - validCount;

    // Shared for CSV upload + table load: set headers/rows, auto-detect email col, auto-map variables by name.
    const applyLoadedData = (headers, data) => {
        setCsvHeaders(headers); setCsvData(data);
        const emailCol = headers.find(h => /e-?mail/i.test(h)) || headers[0] || '';
        setEmailColumn(emailCol);
        const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
        setMapping(Object.fromEntries(variables.map(v => [v, headers.find(h => norm(h) === norm(v)) || ''])));
        setPreviewIdx(0);
    };

    const onCsv = (file) => {
        const reader = new FileReader();
        reader.onload = () => {
            const rows = parseCSV(String(reader.result || ''));
            if (rows.length < 2) { showToast('CSV needs a header row and at least one data row', true); return; }
            const headers = rows[0].map(h => h.trim());
            const data = rows.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] || '').trim()])));
            applyLoadedData(headers, data);
            showToast(`Loaded ${data.length} rows`);
        };
        reader.readAsText(file);
    };

    const loadTable = async () => {
        if (!sourceTable) return;
        if (activeSource?.needs_event && !sourceEvent) { showToast('Pick an event first', true); return; }
        setTableLoading(true);
        const params = activeSource?.needs_event ? { event_key: sourceEvent } : {};
        const res = await getDataSourceRows(sourceTable, params).catch(() => ({ error: 'Failed' }));
        setTableLoading(false);
        if (!res?.rows?.length) { showToast(res?.error || 'No rows found in that table', true); return; }
        applyLoadedData(res.columns?.length ? res.columns : Object.keys(res.rows[0]), res.rows);
        showToast(`Loaded ${res.rows.length} from ${activeSource?.label}`);
    };

    const previewRow = recipients[Math.min(previewIdx, Math.max(0, recipients.length - 1))] || {};
    const previewHtml = template ? merge(templateBody(template), previewRow, defaults) : '';

    // Tokens that will be blank for EVERYONE: no default, and either undeclared or (CSV) unmapped.
    const blankTokens = useMemo(() => {
        if (!template) return [];
        return tokensIn(subject, templateBody(template)).filter(t => {
            if (defaults[t]) return false;
            if (!variables.includes(t)) return true;
            if (source === 'csv') return !mapping[t];
            return false;
        });
    }, [template, subject, defaults, variables, source, mapping]);

    const doSend = async (testTo) => {
        if (!template) { showToast('Pick a template first', true); return; }
        if (attachCert && !certTemplate) { showToast('Pick a certificate template (or turn off Attach certificate)', true); return; }
        const list = testTo ? [{ ...(recipients[0] || sampleRow(variables)), email: testTo }] : recipients;
        if (!list.length) { showToast('No recipients', true); return; }
        const attaching = attachCert && certTemplate;
        if (!testTo && !window.confirm(
            `Send this email to ${validCount} valid recipient(s)?` +
            (attaching ? `\n\nA personalized certificate will be generated and attached to each — this can take a moment.` : ''))) return;

        setSending(true); setResults(null);

        // Certificate campaigns: send only recipient DATA; the backend generates +
        // attaches + sends in the background (no huge payloads → no 413, any size).
        if (attaching) {
            const recips = list
                .filter(r => testTo || EMAIL_RE.test((r.email || '').trim()))
                .map(({ attachment, ...r }) => r);   // strip any stray attachment
            const res = await sendCampaignAsync(template.id, {
                name: testTo ? 'Test send' : `Campaign · ${template.name}`,
                email_field: 'email', subject, recipients: recips,
                from_email: fromEmail, from_name: fromName,
                certificate: { template_id: certTemplateId, mapping: certMapping, filename_pattern: certFilename },
            }).catch(() => ({ error: 'Failed' }));
            if (!res?.campaign_id) { setSending(false); showToast(res?.error || 'Send failed', true); return; }

            // The worker sends in the background (survives tab close + restart);
            // we just watch progress. Reconnects automatically if the tab reopens.
            watchCampaign(res.campaign_id, res.total || recips.length, fromEmail);
            return;
        }

        // Plain campaigns (no certificate) — small payload, sent synchronously.
        const res = await sendCampaign(template.id, {
            name: testTo ? 'Test send' : `Campaign · ${template.name}`,
            email_field: 'email', subject, recipients: list,
            from_email: fromEmail, from_name: fromName,
        });
        setSending(false);
        if (res?.results) {
            if (testTo) showToast(res.sent ? `Test sent to ${testTo}` : 'Test not sent (check SES)', !res.sent);
            else { setResults(res); showToast(`Sent ${res.sent}, skipped ${res.skipped}, failed ${res.failed}`); load(); }
        } else showToast(res?.error || 'Send failed', true);
    };

    // ── Drafts ──────────────────────────────────────────────────────────────
    const buildDraftPayload = () => ({
        templateId, subject, fromName, fromEmail, source,
        csvHeaders, csvData, emailColumn, mapping, manualRows,
        sourceTable, sourceEvent,
        attachCert, certTemplateId, certMapping, certFilename,
    });

    const applyDraft = (p = {}, id = null, name = '') => {
        restoringRef.current = true;
        restoreCertMap.current = p.certMapping || null;
        setTemplateId(p.templateId || '');
        setSubject(p.subject || '');
        setFromName(p.fromName || '');
        setFromEmail(p.fromEmail || '');
        setSource(p.source || 'csv');
        setCsvHeaders(p.csvHeaders || []);
        setCsvData(p.csvData || []);
        setEmailColumn(p.emailColumn || '');
        setMapping(p.mapping || {});
        setManualRows(Array.isArray(p.manualRows) ? p.manualRows : []);
        setSourceTable(p.sourceTable || '');
        setSourceEvent(p.sourceEvent || '');
        setAttachCert(!!p.attachCert);
        setCertTemplateId(p.certTemplateId || '');
        setCertMapping(p.certMapping || {});
        setCertFilename(p.certFilename || 'Certificate - {{name}}.pdf');
        setResults(null);
        setPreviewIdx(0);
        setCurrentDraftId(id);
        setCurrentDraftName(name);
    };

    const newCampaign = () => {
        if (currentDraftId || templateId) {
            if (!window.confirm('Start a new campaign? Unsaved changes will be lost.')) return;
        }
        applyDraft({}, null, '');
    };

    const saveDraft = async () => {
        const suggested = currentDraftName || (template ? `${template.name} — draft` : 'Untitled draft');
        const name = window.prompt('Name this draft:', suggested);
        if (name === null) return;
        setSavingDraft(true);
        const body = { name: name.trim() || suggested, payload: buildDraftPayload() };
        const res = currentDraftId
            ? await updateEmailDraft(currentDraftId, body).catch(() => ({ error: 'Failed' }))
            : await createEmailDraft(body).catch(() => ({ error: 'Failed' }));
        setSavingDraft(false);
        if (res?.id) { setCurrentDraftId(res.id); setCurrentDraftName(res.name || body.name); loadDrafts(); showToast('Draft saved'); }
        else showToast(res?.error || 'Could not save draft', true);
    };

    const openDraft = (d) => {
        if ((currentDraftId || templateId) && !window.confirm('Open this draft? Unsaved changes will be lost.')) return;
        applyDraft(d.payload || {}, d.id, d.name || '');
        showToast(`Opened “${d.name || 'draft'}”`);
    };

    const removeDraft = async (d) => {
        if (!window.confirm(`Delete draft “${d.name || 'Untitled'}”?`)) return;
        await deleteEmailDraft(d.id).catch(() => {});
        if (currentDraftId === d.id) { setCurrentDraftId(null); setCurrentDraftName(''); }
        loadDrafts();
    };

    const openCampaign = async (id) => {
        setLoadingCampaign(true);
        setViewCampaign({ loading: true });
        const res = await getCampaignRecipients(id).catch(() => null);
        setLoadingCampaign(false);
        if (res?.campaign) setViewCampaign(res);
        else { setViewCampaign(null); showToast('Could not load campaign history', true); }
    };

    return (
        <div style={{ padding: '28px 32px', maxWidth: 1100 }}>
            {toast && <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: toast.err ? '#ef4444' : 'var(--primary)', color: '#fff', borderRadius: 10, padding: '10px 18px', fontSize: 13, boxShadow: '0 4px 16px rgba(0,0,0,.2)' }}>{toast.msg}</div>}

            <div style={{ marginBottom: 22, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Megaphone size={22} color="var(--primary)" />
                <div style={{ flex: 1 }}>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>Mail Automation</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 3 }}>
                        Send a template to many people at once — upload a CSV or add recipients, and each email is personalized.
                        {currentDraftName && <span style={{ color: 'var(--primary)', fontWeight: 600 }}> · Editing draft: {currentDraftName}</span>}
                    </p>
                </div>
                <button onClick={newCampaign} style={ghostBtn} title="Start a fresh campaign"><FilePlus2 size={14} style={{ verticalAlign: -2, marginRight: 5 }} />New</button>
                <button onClick={saveDraft} disabled={savingDraft || !templateId} style={{ ...primaryBtn, opacity: (savingDraft || !templateId) ? 0.6 : 1 }} title="Save this setup to finish later">
                    <Save size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{savingDraft ? 'Saving…' : (currentDraftId ? 'Update draft' : 'Save as draft')}
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, alignItems: 'start' }}>
                {/* LEFT: builder */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Step 1: template */}
                    <Card title="1 · Choose template">
                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: 220 }}>
                                <Lbl>Template</Lbl>
                                <select value={templateId} onChange={e => setTemplateId(e.target.value)} style={input}>
                                    <option value="">Select a template…</option>
                                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_custom ? ' (custom)' : ''}</option>)}
                                </select>
                            </div>
                            {template && <button onClick={() => navigate('/accounts/email-templates')} style={ghostBtn}><ExternalLink size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Edit / add variables in Designer</button>}
                        </div>
                        {template && (
                            <>
                                <div style={{ marginTop: 12 }}><Lbl>Subject (personalizable)</Lbl><input value={subject} onChange={e => setSubject(e.target.value)} style={input} /></div>

                                {/* Sender */}
                                <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>
                                    <div><Lbl>Sender name</Lbl><input value={fromName} onChange={e => setFromName(e.target.value)} placeholder="Tiesverse" style={input} /></div>
                                    <div>
                                        <Lbl>Send from (email)</Lbl>
                                        <input list="ses-senders" value={fromEmail} onChange={e => setFromEmail(e.target.value)} placeholder="you@tiesverse.com" style={input} />
                                        <datalist id="ses-senders">
                                            {senders.emails.map(e => <option key={e} value={e} />)}
                                            {senders.domains.map(d => <option key={d} value={`hello@${d}`} />)}
                                        </datalist>
                                    </div>
                                </div>
                                {fromEmail && !senderVerified(fromEmail) ? (
                                    <div style={{ marginTop: 8, fontSize: 12, color: '#b45309', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 12px', display: 'flex', gap: 7 }}>
                                        <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                                        <span><strong>{fromEmail}</strong> isn't verified in SES — emails from it will bounce. Use a verified address below.</span>
                                    </div>
                                ) : (
                                    <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--text-muted)' }}>
                                        Verified: {senders.emails.join(', ') || '—'}{senders.domains.length ? ` · any @${senders.domains.join(', @')} address` : ''}
                                    </div>
                                )}

                                <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 700 }}>Variables filled per person:</span>
                                    {variables.length ? variables.map(v => <code key={v} style={chip}>{`{{${v}}}`}</code>) : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>none — add some in the Designer</span>}
                                </div>
                            </>
                        )}
                    </Card>

                    {/* Step 2: recipients */}
                    {template && (
                        <Card title="2 · Recipients">
                            <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--outline-variant)', marginBottom: 14 }}>
                                <Tab active={source === 'csv'} onClick={() => setSource('csv')} icon={Upload}>Upload CSV</Tab>
                                <Tab active={source === 'table'} onClick={() => setSource('table')} icon={Database}>From a table</Tab>
                                <Tab active={source === 'manual'} onClick={() => setSource('manual')} icon={Table}>Manual entry</Tab>
                            </div>

                            {source === 'csv' && (
                                <label style={{ ...ghostBtn, alignSelf: 'flex-start', cursor: 'pointer', display: 'inline-flex' }}>
                                    <Upload size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{csvData.length ? 'Replace CSV' : 'Choose CSV file'}
                                    <input type="file" accept=".csv,text/csv" hidden onChange={e => e.target.files[0] && onCsv(e.target.files[0])} />
                                </label>
                            )}

                            {source === 'table' && (
                                <div style={{ display: 'grid', gridTemplateColumns: activeSource?.needs_event ? '1fr 1fr auto' : '1fr auto', gap: 10, alignItems: 'end' }}>
                                    <div>
                                        <Lbl>Table</Lbl>
                                        <select value={sourceTable} onChange={e => { setSourceTable(e.target.value); setSourceEvent(''); }} style={input}>
                                            <option value="">Choose a table…</option>
                                            {dataSources.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                        </select>
                                    </div>
                                    {activeSource?.needs_event && (
                                        <div>
                                            <Lbl>Event</Lbl>
                                            <select value={sourceEvent} onChange={e => setSourceEvent(e.target.value)} style={input}>
                                                <option value="">Choose an event…</option>
                                                {(activeSource.events || []).map(ev => <option key={ev.key} value={ev.key}>{ev.title} ({ev.count})</option>)}
                                            </select>
                                        </div>
                                    )}
                                    <button onClick={loadTable} disabled={!sourceTable || tableLoading} style={{ ...primaryBtn, opacity: (!sourceTable || tableLoading) ? 0.6 : 1 }}>{tableLoading ? 'Loading…' : 'Load'}</button>
                                </div>
                            )}

                            {source === 'manual' && <ManualEntry rows={manualRows} setRows={setManualRows} variables={variables} />}

                            {source !== 'manual' && csvHeaders.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                        <div>
                                            <Lbl>Email column</Lbl>
                                            <select value={emailColumn} onChange={e => setEmailColumn(e.target.value)} style={input}>
                                                {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    {variables.length > 0 && (
                                        <div>
                                            <Lbl>Map variables → columns</Lbl>
                                            <div style={{ display: 'grid', gap: 8 }}>
                                                {variables.map(v => (
                                                    <div key={v} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                        <code style={{ ...chip, minWidth: 120 }}>{`{{${v}}}`}</code>
                                                        <span style={{ color: 'var(--text-muted)' }}>←</span>
                                                        <select value={mapping[v] || ''} onChange={e => setMapping(m => ({ ...m, [v]: e.target.value }))} style={{ ...input, flex: 1 }}>
                                                            <option value="">— not mapped —</option>
                                                            {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                                        </select>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {recipients.length > 0 && (
                                <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--text-muted)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                                    <span><strong style={{ color: 'var(--text-main)' }}>{recipients.length}</strong> rows</span>
                                    <span style={{ color: '#16a34a' }}>✓ {validCount} valid</span>
                                    {invalidCount > 0 && <span style={{ color: '#f59e0b' }}><AlertTriangle size={12} style={{ verticalAlign: -1 }} /> {invalidCount} invalid/blank email</span>}
                                </div>
                            )}
                        </Card>
                    )}

                    {/* Attach certificate (optional) */}
                    {template && (
                        <Card title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Award size={15} color="var(--primary)" />Attach certificate (optional)</span>}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--text-main)', cursor: 'pointer' }}>
                                <input type="checkbox" checked={attachCert} onChange={e => setAttachCert(e.target.checked)} />
                                Generate a personalized certificate and attach it to every email
                            </label>

                            {attachCert && (
                                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    <div>
                                        <Lbl>Certificate template</Lbl>
                                        <select value={certTemplateId} onChange={e => setCertTemplateId(e.target.value)} style={input}>
                                            <option value="">Select a certificate template…</option>
                                            {certTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                        </select>
                                        {certTemplates.length === 0 && (
                                            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                                                No certificate templates yet — create one in <button onClick={() => navigate('/certificates/templates')} style={{ ...ghostBtn, padding: '2px 8px', fontSize: 12 }}>Certificate Generator</button>.
                                            </div>
                                        )}
                                    </div>

                                    {certLoadingTpl && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={14} className="ma-spin" />Loading template fields…</div>}

                                    {certTemplate && !certLoadingTpl && (
                                        <>
                                            {certManualVars.length > 0 ? (
                                                <div>
                                                    <Lbl>Fill certificate fields from recipient data</Lbl>
                                                    <div style={{ display: 'grid', gap: 8 }}>
                                                        {certManualVars.map(v => (
                                                            <div key={v.name} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                                <code style={{ ...chip, minWidth: 130 }}>{v.name}</code>
                                                                <span style={{ color: 'var(--text-muted)' }}>←</span>
                                                                <select value={certMapping[v.name] || ''} onChange={e => setCertMapping(m => ({ ...m, [v.name]: e.target.value }))} style={{ ...input, flex: 1 }}>
                                                                    <option value="">{v.default_value ? `— default (${v.default_value}) —` : '— blank —'}</option>
                                                                    <option value="email">email</option>
                                                                    {variables.map(vr => <option key={vr} value={vr}>{vr}</option>)}
                                                                </select>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>This template fills all its fields automatically.</div>
                                            )}

                                            <div>
                                                <Lbl>Attachment filename (personalizable)</Lbl>
                                                <input value={certFilename} onChange={e => setCertFilename(e.target.value)} placeholder="Certificate - {{name}}.pdf" style={input} />
                                            </div>

                                            {recipients.length > 60 && (
                                                <div style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface-container,rgba(0,0,0,.03))', borderRadius: 8, padding: '8px 12px', display: 'flex', gap: 7 }}>
                                                    <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1, color: 'var(--primary)' }} />
                                                    <span>{recipients.length} certificates will be generated on the server in parallel. This runs in the background — the progress bar updates live.</span>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </Card>
                    )}

                    {/* Step 3: send */}
                    {template && recipients.length > 0 && (
                        <Card title="3 · Send">
                            {blankTokens.length > 0 && (
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
                                    <AlertTriangle size={15} style={{ color: '#c2410c', flexShrink: 0, marginTop: 1 }} />
                                    <span style={{ fontSize: 12.5, color: '#c2410c' }}>
                                        <strong>These will be blank in every email</strong> (no default, {source === 'csv' ? 'not mapped to a column' : 'not a variable'}):{' '}
                                        {blankTokens.map(t => <code key={t} style={{ ...chip, background: '#fed7aa', borderColor: '#fdba74', color: '#c2410c', marginRight: 4 }}>{`{{${t}}}`}</code>)}
                                        <br />Set a default in the Designer{source === 'csv' ? ', or map a column above.' : '.'}
                                    </span>
                                </div>
                            )}
                            {genProgress && (
                                <div style={{ marginBottom: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 12.5, color: 'var(--text-main)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                            <Loader2 size={14} className="ma-spin" />
                                            {genProgress.canceling ? 'Stopping…'
                                                : genProgress.status === 'queued' ? 'Queued — starting shortly…'
                                                    : genProgress.done === 0 ? 'Warming up…'
                                                        : `Sending… ${genProgress.done}/${genProgress.total}`}
                                        </span>
                                        {genProgress.batchTotal > 1 && (
                                            <span style={{ fontSize: 11.5, color: 'var(--text-muted)', background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 999, padding: '1px 8px' }}>
                                                Batch {genProgress.batchIndex}/{genProgress.batchTotal}
                                            </span>
                                        )}
                                        {genProgress.eta != null && !genProgress.canceling && (
                                            <span style={{ fontSize: 11.5, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                <Clock size={12} /> {fmtEta(genProgress.eta)}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ height: 6, borderRadius: 999, background: 'var(--outline-variant)', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${genProgress.total ? (genProgress.done / genProgress.total) * 100 : 0}%`, background: 'var(--primary)', transition: 'width .2s' }} />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 8, fontSize: 11.5, color: 'var(--text-muted)' }}>
                                        <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                                        <span>
                                            This runs on the server — you can safely close this tab.
                                            {genProgress.notifyEmail
                                                ? <> We'll email <strong style={{ color: 'var(--text-main)' }}>{genProgress.notifyEmail}</strong> when it's done.</>
                                                : " It will finish on its own."}
                                        </span>
                                    </div>
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                                <TestSend onSend={doSend} sending={sending} />
                                <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', alignItems: 'center' }}>
                                    {genProgress && (
                                        <button onClick={stopCampaign} disabled={genProgress.canceling}
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', fontSize: 13, fontWeight: 600, cursor: genProgress.canceling ? 'default' : 'pointer', opacity: genProgress.canceling ? 0.6 : 1 }}>
                                            <StopCircle size={14} /> {genProgress.canceling ? 'Stopping…' : 'Stop'}
                                        </button>
                                    )}
                                    <button onClick={() => doSend(null)} disabled={sending || validCount === 0} style={{ ...primaryBtn, opacity: (sending || !validCount) ? 0.6 : 1 }}>
                                        <Send size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
                                        {genProgress ? (genProgress.status === 'queued' ? 'Queued…' : `Sending ${genProgress.done}/${genProgress.total}…`) : sending ? 'Sending…' : `Send to ${validCount}${attachCert && certTemplate ? ' + cert' : ''}`}
                                    </button>
                                </div>
                            </div>
                            {results && (
                                <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><CheckCircle2 size={18} style={{ color: '#16a34a' }} /><strong style={{ fontSize: 14, color: 'var(--text-main)' }}>Campaign sent</strong></div>
                                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Sent {results.sent} · Skipped {results.skipped} · Failed {results.failed}</div>
                                </div>
                            )}
                        </Card>
                    )}
                </div>

                {/* RIGHT: live preview + history */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 12 }}>
                    <Card title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Eye size={15} /> Live preview</span>}>
                        {!template ? <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Pick a template to preview.</p> : (
                            <>
                                {recipients.length > 1 && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                        <button onClick={() => setPreviewIdx(i => Math.max(0, i - 1))} style={navBtn}>‹</button>
                                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Recipient {Math.min(previewIdx, recipients.length - 1) + 1} / {recipients.length}</span>
                                        <button onClick={() => setPreviewIdx(i => Math.min(recipients.length - 1, i + 1))} style={navBtn}>›</button>
                                    </div>
                                )}
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>To: <strong style={{ color: 'var(--text-main)' }}>{previewRow.email || '—'}</strong><br />Subject: <strong style={{ color: 'var(--text-main)' }}>{merge(subject, previewRow, defaults)}</strong></div>
                                <div style={{ border: '1px solid var(--outline-variant)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                                    <iframe title="preview" srcDoc={previewHtml} style={{ width: '100%', height: 420, border: 'none', background: '#fff' }} sandbox="" />
                                </div>
                            </>
                        )}
                    </Card>

                    <Card title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><FileEdit size={15} /> Drafts</span>}>
                        {drafts.length === 0 ? <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No drafts. Build a campaign and click “Save as draft”.</p> : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {drafts.map(d => (
                                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--outline-variant)' }}>
                                        <button onClick={() => openDraft(d)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: currentDraftId === d.id ? 'var(--primary)' : 'var(--text-main)' }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name || 'Untitled'}</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.updated_at ? new Date(d.updated_at).toLocaleString() : ''}</div>
                                        </button>
                                        <button onClick={() => removeDraft(d)} style={iconBtn} title="Delete draft"><Trash2 size={14} /></button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>

                    <Card title="Recent campaigns">
                        {history.length === 0 ? <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No campaigns yet.</p> : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                {history.slice(0, 10).map(h => (
                                    <button key={h.id} onClick={() => openCampaign(h.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '8px 6px', borderBottom: '1px solid var(--outline-variant)', background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                                        <span style={{ minWidth: 0 }}>
                                            <span style={{ color: 'var(--text-main)', fontWeight: 600, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name || h.template_name}</span>
                                            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{h.created_at ? new Date(h.created_at).toLocaleString() : ''}</span>
                                        </span>
                                        <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h.sent_count}/{h.recipient_count}{h.failed_count ? ` · ${h.failed_count}✕` : ''}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>
            </div>

            {viewCampaign && (
                <CampaignModal data={viewCampaign} loading={loadingCampaign} onClose={() => setViewCampaign(null)} />
            )}
        </div>
    );
}

const STATUS_STYLE = {
    sent:       { label: 'Sent',       bg: '#dbeafe', fg: '#1d4ed8' },
    delivered:  { label: 'Delivered',  bg: '#dcfce7', fg: '#047857' },
    bounced:    { label: 'Bounced',    bg: '#fee2e2', fg: '#b91c1c' },
    complained: { label: 'Complaint',  bg: '#ffedd5', fg: '#c2410c' },
    failed:     { label: 'Failed',     bg: '#fee2e2', fg: '#b91c1c' },
    skipped:    { label: 'Skipped',    bg: 'var(--surface-hover,#f3f4f6)', fg: 'var(--text-muted,#6b7280)' },
    stubbed:    { label: 'Not sent',   bg: '#fef3c7', fg: '#b45309' },
};
function StatusBadge({ status }) {
    const s = STATUS_STYLE[status] || STATUS_STYLE.sent;
    return <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: s.bg, color: s.fg, whiteSpace: 'nowrap' }}>{s.label}</span>;
}

function CampaignModal({ data, loading, onClose }) {
    const camp = data?.campaign;
    const recips = data?.recipients || [];
    const counts = recips.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
    return (
        <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,12,4,.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', zIndex: 1000 }}>
            <div onMouseDown={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 760, background: 'var(--surface-container-low,#fff)', borderRadius: 18, boxShadow: '0 24px 60px rgba(0,0,0,.3)', maxHeight: '86vh', overflowY: 'auto' }}>
                {loading || !camp ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div> : (
                    <>
                        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--outline-variant)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                            <div style={{ minWidth: 0 }}>
                                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text-main)' }}>{camp.name || camp.template_name}</h3>
                                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3 }}>
                                    From <strong>{camp.from_name || '—'}</strong> &lt;{camp.from_email || '—'}&gt; · {camp.created_at ? new Date(camp.created_at).toLocaleString() : ''}{camp.created_by ? ` · by ${camp.created_by}` : ''}
                                </div>
                                <div style={{ fontSize: 12.5, color: 'var(--text-main)', marginTop: 4 }}>Subject: {camp.subject}</div>
                            </div>
                            <button onClick={onClose} style={{ border: '1px solid var(--outline-variant)', background: 'transparent', color: 'var(--text-muted)', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', flex: 'none' }}>✕</button>
                        </div>

                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '12px 22px' }}>
                            <Stat label="Recipients" value={camp.recipient_count} />
                            <Stat label="Sent" value={camp.sent_count} color="#1d4ed8" />
                            {counts.delivered ? <Stat label="Delivered" value={counts.delivered} color="#047857" /> : null}
                            {(counts.bounced || 0) + (counts.complained || 0) > 0 ? <Stat label="Bounced" value={(counts.bounced || 0) + (counts.complained || 0)} color="#b91c1c" /> : null}
                            {camp.failed_count ? <Stat label="Failed" value={camp.failed_count} color="#b91c1c" /> : null}
                            {camp.skipped_count ? <Stat label="Skipped" value={camp.skipped_count} color="#6b7280" /> : null}
                        </div>

                        {camp.body_html && (
                            <div style={{ padding: '0 22px 12px' }}>
                                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', margin: '4px 0 6px' }}>Content sent</div>
                                <div style={{ border: '1px solid var(--outline-variant)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                                    <iframe title="content" srcDoc={camp.body_html} style={{ width: '100%', height: 260, border: 'none', background: '#fff' }} sandbox="" />
                                </div>
                            </div>
                        )}

                        <div style={{ padding: '4px 22px 20px' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', margin: '6px 0 8px' }}>Recipients ({recips.length})</div>
                            <div style={{ overflowX: 'auto', border: '1px solid var(--outline-variant)', borderRadius: 10 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                    <thead><tr>
                                        {['Email', 'Name', 'Status', 'Detail'].map(h => <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text-muted)', borderBottom: '1px solid var(--outline-variant)', whiteSpace: 'nowrap' }}>{h}</th>)}
                                    </tr></thead>
                                    <tbody>
                                        {recips.map(r => (
                                            <tr key={r.id} style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                                                <td style={{ padding: '8px 12px', color: 'var(--text-main)' }}>{r.recipient_email || '—'}</td>
                                                <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{r.recipient_name || '—'}</td>
                                                <td style={{ padding: '8px 12px' }}><StatusBadge status={r.status} /></td>
                                                <td style={{ padding: '8px 12px', color: r.error ? '#b91c1c' : 'var(--text-muted)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.error || ''}>{r.error || (r.certificate_id ? '📎 ' + r.certificate_id : '')}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
function Stat({ label, value, color }) {
    return (
        <div style={{ padding: '8px 14px', borderRadius: 10, background: 'var(--surface-container,rgba(0,0,0,.03))', minWidth: 84 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: color || 'var(--text-main)' }}>{value ?? 0}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
        </div>
    );
}

function ManualEntry({ rows, setRows, variables }) {
    const cols = ['email', ...variables];
    const setCell = (i, k, v) => setRows(rs => rs.map((r, j) => j === i ? { ...r, [k]: v } : r));
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
                    <thead><tr>{cols.map(k => <th key={k} style={{ textAlign: 'left', padding: '4px 6px', color: 'var(--text-muted)', fontWeight: 600 }}>{k}</th>)}<th /></tr></thead>
                    <tbody>
                        {rows.map((r, i) => (
                            <tr key={i}>
                                {cols.map(k => <td key={k} style={{ padding: '2px 4px' }}><input value={r[k] || ''} onChange={e => setCell(i, k, e.target.value)} placeholder={k} style={{ ...input, padding: '6px 8px', minWidth: 120 }} /></td>)}
                                <td><button onClick={() => setRows(rs => rs.filter((_, j) => j !== i))} style={iconBtn}><Trash2 size={14} /></button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <button onClick={() => setRows(rs => [...rs, emptyManualRow(variables)])} style={{ ...ghostBtn, alignSelf: 'flex-start' }}><Plus size={14} style={{ verticalAlign: -2, marginRight: 5 }} />Add row</button>
        </div>
    );
}

function TestSend({ onSend, sending }) {
    const [to, setTo] = useState('');
    return (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input value={to} onChange={e => setTo(e.target.value)} placeholder="test@email.com" style={{ ...input, width: 190 }} />
            <button onClick={() => to && onSend(to.trim())} disabled={sending || !to} style={ghostBtn}>Send test</button>
        </div>
    );
}

const emptyManualRow = (vars) => ({ email: '', ...Object.fromEntries((vars || []).map(v => [v, ''])) });
const sampleRow = (vars) => ({ email: '', ...Object.fromEntries((vars || []).map(v => [v, v])) });

function Card({ title, children }) {
    return (
        <div style={{ border: '1px solid var(--outline-variant)', borderRadius: 14, background: 'var(--surface-container-low)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--outline-variant)', fontSize: 13.5, fontWeight: 700, color: 'var(--text-main)' }}>{title}</div>
            <div style={{ padding: 18 }}>{children}</div>
        </div>
    );
}
function Tab({ active, onClick, icon: Icon, children }) {
    return <button onClick={onClick} style={{ padding: '7px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none', color: active ? 'var(--primary)' : 'var(--text-muted)', borderBottom: `2px solid ${active ? 'var(--primary)' : 'transparent'}`, marginBottom: -1, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon size={14} />{children}</button>;
}
const Lbl = ({ children }) => <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 }}>{children}</label>;

const input = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-lowest, #fff)', color: 'var(--text-main)', fontSize: 13, boxSizing: 'border-box' };
const chip = { fontSize: 11.5, fontFamily: 'monospace', background: 'color-mix(in srgb, var(--primary) 10%, transparent)', color: 'var(--primary)', padding: '3px 8px', borderRadius: 6, border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)', fontWeight: 600 };
const primaryBtn = { padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const ghostBtn = { padding: '8px 14px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'transparent', color: 'var(--text-main)', fontSize: 13, cursor: 'pointer', fontWeight: 600 };
const iconBtn = { padding: 7, borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'transparent', color: '#ef4444', cursor: 'pointer', display: 'inline-flex' };
const navBtn = { width: 28, height: 28, borderRadius: 7, border: '1px solid var(--outline-variant)', background: 'transparent', color: 'var(--text-main)', fontSize: 15, cursor: 'pointer', lineHeight: 1 };
