import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Megaphone, Upload, Table, Eye, Send, Plus, Trash2, ExternalLink, CheckCircle2, AlertTriangle } from 'lucide-react';
import { getEmailTemplates, sendCampaign, getCampaigns, getSESSenders } from '../../apiClient';

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
const merge = (text, row) => (text || '').replace(/{{\s*(\w+)\s*}}/g, (m, k) => (k in row && row[k] != null && row[k] !== '') ? row[k] : m);
const templateBody = (t) => (t.html_mode ? (t.body_html || '') : renderContent(t.content_json || {}));

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
    const [source, setSource] = useState('csv');           // 'csv' | 'manual'
    const [csvHeaders, setCsvHeaders] = useState([]);
    const [csvData, setCsvData] = useState([]);
    const [emailColumn, setEmailColumn] = useState('');
    const [mapping, setMapping] = useState({});            // variable -> csv header
    const [manualRows, setManualRows] = useState([]);
    const [previewIdx, setPreviewIdx] = useState(0);
    const [sending, setSending] = useState(false);
    const [results, setResults] = useState(null);
    const [history, setHistory] = useState([]);
    const [toast, setToast] = useState(null);

    const showToast = (msg, err = false) => { setToast({ msg, err }); setTimeout(() => setToast(null), 3200); };

    const load = useCallback(async () => {
        const [tpls, camps, snd] = await Promise.all([getEmailTemplates(), getCampaigns(), getSESSenders()]);
        setTemplates(Array.isArray(tpls) ? tpls : []);
        setHistory(Array.isArray(camps) ? camps : []);
        if (snd && !snd.error) setSenders(snd);
    }, []);
    useEffect(() => { load(); }, [load]);

    const template = templates.find(t => String(t.id) === String(templateId)) || null;
    const variables = template?.variables || [];

    // When template changes, reset subject + sender + auto-map columns.
    useEffect(() => {
        if (!template) return;
        setSubject(template.subject || '');
        setFromName(template.from_name || 'Tiesverse');
        setFromEmail(template.from_email || senders.default || 'mail@tiesverse.com');
        setManualRows(prev => prev.length ? prev : [emptyManualRow(template.variables)]);
    }, [templateId]); // eslint-disable-line

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
            variables.forEach(v => { out[v] = r[mapping[v]] ?? ''; });
            return out;
        });
    }, [source, manualRows, csvData, emailColumn, mapping, variables]);

    const validCount = recipients.filter(r => EMAIL_RE.test((r.email || '').trim())).length;
    const invalidCount = recipients.length - validCount;

    const onCsv = (file) => {
        const reader = new FileReader();
        reader.onload = () => {
            const rows = parseCSV(String(reader.result || ''));
            if (rows.length < 2) { showToast('CSV needs a header row and at least one data row', true); return; }
            const headers = rows[0].map(h => h.trim());
            const data = rows.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] || '').trim()])));
            setCsvHeaders(headers); setCsvData(data);
            // auto-detect email column + auto-map variables by name
            const emailCol = headers.find(h => /e-?mail/i.test(h)) || headers[0];
            setEmailColumn(emailCol);
            const map = {};
            variables.forEach(v => { map[v] = headers.find(h => h.toLowerCase().replace(/[^a-z0-9]/g, '') === v.toLowerCase().replace(/[^a-z0-9]/g, '')) || ''; });
            setMapping(map);
            setPreviewIdx(0);
            showToast(`Loaded ${data.length} rows`);
        };
        reader.readAsText(file);
    };

    const previewRow = recipients[Math.min(previewIdx, Math.max(0, recipients.length - 1))] || {};
    const previewHtml = template ? merge(templateBody(template), previewRow) : '';

    const doSend = async (testTo) => {
        if (!template) { showToast('Pick a template first', true); return; }
        const list = testTo ? [{ ...(recipients[0] || sampleRow(variables)), email: testTo }] : recipients;
        if (!list.length) { showToast('No recipients', true); return; }
        if (!testTo && !window.confirm(`Send this email to ${validCount} valid recipient(s)?`)) return;
        setSending(true); setResults(null);
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

    return (
        <div style={{ padding: '28px 32px', maxWidth: 1100 }}>
            {toast && <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: toast.err ? '#ef4444' : 'var(--primary)', color: '#fff', borderRadius: 10, padding: '10px 18px', fontSize: 13, boxShadow: '0 4px 16px rgba(0,0,0,.2)' }}>{toast.msg}</div>}

            <div style={{ marginBottom: 22, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Megaphone size={22} color="var(--primary)" />
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>Mail Automation</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 3 }}>Send a template to many people at once — upload a CSV or add recipients, and each email is personalized.</p>
                </div>
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
                                <Tab active={source === 'manual'} onClick={() => setSource('manual')} icon={Table}>Manual entry</Tab>
                            </div>

                            {source === 'csv' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    <label style={{ ...ghostBtn, alignSelf: 'flex-start', cursor: 'pointer' }}>
                                        <Upload size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{csvData.length ? 'Replace CSV' : 'Choose CSV file'}
                                        <input type="file" accept=".csv,text/csv" hidden onChange={e => e.target.files[0] && onCsv(e.target.files[0])} />
                                    </label>
                                    {csvHeaders.length > 0 && (
                                        <>
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
                                        </>
                                    )}
                                </div>
                            ) : (
                                <ManualEntry rows={manualRows} setRows={setManualRows} variables={variables} />
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

                    {/* Step 3: send */}
                    {template && recipients.length > 0 && (
                        <Card title="3 · Send">
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                                <TestSend onSend={doSend} sending={sending} />
                                <button onClick={() => doSend(null)} disabled={sending || validCount === 0} style={{ ...primaryBtn, marginLeft: 'auto', opacity: (sending || !validCount) ? 0.6 : 1 }}>
                                    <Send size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{sending ? 'Sending…' : `Send to ${validCount}`}
                                </button>
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
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>To: <strong style={{ color: 'var(--text-main)' }}>{previewRow.email || '—'}</strong><br />Subject: <strong style={{ color: 'var(--text-main)' }}>{merge(subject, previewRow)}</strong></div>
                                <div style={{ border: '1px solid var(--outline-variant)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                                    <iframe title="preview" srcDoc={previewHtml} style={{ width: '100%', height: 420, border: 'none', background: '#fff' }} sandbox="" />
                                </div>
                            </>
                        )}
                    </Card>

                    <Card title="Recent campaigns">
                        {history.length === 0 ? <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No campaigns yet.</p> : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {history.slice(0, 8).map(h => (
                                    <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '6px 0', borderBottom: '1px solid var(--outline-variant)' }}>
                                        <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>{h.template_name}</span>
                                        <span style={{ color: 'var(--text-muted)' }}>{h.sent_count}/{h.recipient_count} sent</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>
            </div>
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
