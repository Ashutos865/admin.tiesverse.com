import { useState, useEffect, useCallback, useRef } from 'react';
import { Mail, Save, Send, Eye, LayoutTemplate, Code, Paperclip, Plus, Trash2, X } from 'lucide-react';
import {
    getEmailTemplates, createEmailTemplate, updateEmailTemplate, deleteEmailTemplate, testEmailTemplate,
} from '../../apiClient';

const SAMPLE = {
    name: 'Alex Doe', reset_url: 'https://portal.tiesverse.com/reset-password?token=sample',
    role: 'Graphic Designer', upload_link: 'https://portal.tiesverse.com/onboarding/sample',
    username: 'alex.doe', password: 'Temp#2026', login_url: 'https://portal.tiesverse.com/login',
    document: 'Internship Certificate', issued_by: 'HR Team', portal_url: 'https://portal.tiesverse.com/login',
    subject_title: 'AI Workshop 2026', certificate_id: 'TV-CERT-SAMPLE-0001',
    department: 'Content', status: 'Selected', effective_date: '4 July 2026',
};
const fillTokens = (t) => (t || '').replace(/{{\s*(\w+)\s*}}/g, (m, k) => (k in SAMPLE ? SAMPLE[k] : m));

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
    if (sig) {
        const lines = sig.split('\n').map(ln => (ln.includes('@') && ln.includes('.')) ? `<span style="color:#9ca3af;font-size:13px;">${ln}</span>` : ln).join('<br>');
        parts.push(`<p style="margin:20px 0 0;font-size:15px;line-height:1.6;color:#374151;">${lines}</p>`);
    }
    const inner = parts.filter(Boolean).join('');
    return `<div style="background:#f3f4f6;padding:24px 12px;font-family:-apple-system,Segoe UI,sans-serif;"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);"><div style="background:linear-gradient(135deg,#4338ca,#3730a3);padding:24px 32px;"><span style="font-size:18px;font-weight:800;color:#fff;">Tiesverse</span></div><div style="padding:32px;">${inner}</div><div style="padding:20px 32px;background:#f9fafb;border-top:1px solid #eef0f3;"><p style="margin:0;font-size:12px;color:#9ca3af;">© Tiesverse. This is an automated message — please do not reply.</p></div></div></div>`;
}
const previewHtml = (d) => fillTokens(d.html_mode ? (d.body_html || '') : renderContent(d.content_json));

const EMPTY_CONTENT = { heading: '', body: '', table: [], closing: '', button: { label: '', url: '' }, signature: '' };
const normalize = (t) => ({ ...t, content_json: { ...EMPTY_CONTENT, ...(t.content_json || {}), button: { ...EMPTY_CONTENT.button, ...((t.content_json || {}).button || {}) } } });

export default function EmailTemplates() {
    const [templates, setTemplates] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [draft, setDraft] = useState(null);
    const [mode, setMode] = useState('edit');   // 'edit' | 'preview'
    const [newVar, setNewVar] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null);
    const focusRef = useRef(null);

    const showToast = (msg, err = false) => { setToast({ msg, err }); setTimeout(() => setToast(null), 3200); };

    const load = useCallback(async (selectId) => {
        setLoading(true);
        const list = await getEmailTemplates();
        const arr = Array.isArray(list) ? list : [];
        setTemplates(arr);
        setSelectedId(prev => selectId ?? prev ?? (arr[0]?.id ?? null));
        setLoading(false);
    }, []);
    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        const t = templates.find(x => x.id === selectedId);
        setDraft(t ? normalize(t) : null);
    }, [selectedId, templates]);

    const c = draft?.content_json || EMPTY_CONTENT;
    const setC = (patch) => setDraft(d => ({ ...d, content_json: { ...d.content_json, ...patch } }));
    const dirty = draft && templates.find(t => t.id === draft.id) &&
        JSON.stringify(pick(draft)) !== JSON.stringify(pick(normalize(templates.find(t => t.id === draft.id))));

    const insertVar = (v) => {
        const f = focusRef.current;
        if (!f || !f.el) { showToast('Click into a text box first, then a variable', true); return; }
        const el = f.el, s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? s, token = `{{${v}}}`;
        const nv = el.value.slice(0, s) + token + el.value.slice(e);
        f.onChange(nv);
        requestAnimationFrame(() => { el.focus(); const p = s + token.length; try { el.setSelectionRange(p, p); } catch { /* noop */ } });
    };
    const track = (onChange) => ({ onFocus: (ev) => { focusRef.current = { el: ev.target, onChange }; } });

    const setHtmlMode = (on) => setDraft(d => on
        ? { ...d, html_mode: true, body_html: d.body_html || renderContent(d.content_json) }
        : { ...d, html_mode: false });

    const createNew = async () => {
        const name = window.prompt('Name your new email template:', 'My Template');
        if (!name) return;
        const res = await createEmailTemplate({
            name, description: 'Custom template', subject: `${name}`,
            from_name: 'Tiesverse', from_email: '', is_enabled: false, allow_attachment: false,
            html_mode: false, variables: [],
            content_json: { ...EMPTY_CONTENT, body: 'Hi {{name}},\n\nWrite your message here.', signature: 'Warm regards,\nTiesverse Team' },
        });
        if (res?.id) { showToast('Template created'); await load(res.id); }
        else showToast(res?.error || 'Create failed', true);
    };
    const removeTemplate = async () => {
        if (!draft?.is_custom) return;
        if (!window.confirm(`Delete "${draft.name}"? This cannot be undone.`)) return;
        const res = await deleteEmailTemplate(draft.id);
        if (res?.success || res === '' || res?.id === undefined) { showToast('Template deleted'); setSelectedId(null); await load(); }
        else showToast(res?.error || 'Delete failed', true);
    };

    const save = async () => {
        if (!draft) return;
        setSaving(true);
        const payload = {
            subject: draft.subject, from_name: draft.from_name, from_email: draft.from_email,
            is_enabled: draft.is_enabled, html_mode: draft.html_mode, content_json: draft.content_json,
        };
        if (draft.html_mode) payload.body_html = draft.body_html;
        if (draft.is_custom) { payload.name = draft.name; payload.variables = draft.variables; payload.allow_attachment = draft.allow_attachment; }
        const res = await updateEmailTemplate(draft.id, payload);
        setSaving(false);
        if (res?.id) { setTemplates(ts => ts.map(t => t.id === res.id ? res : t)); showToast('Template saved'); }
        else showToast(res?.error || 'Save failed', true);
    };
    const sendTest = async () => {
        if (!draft) return;
        const to = window.prompt('Send a test of this template to which email?', '');
        if (!to) return;
        const res = await testEmailTemplate(draft.id, to.trim());
        if (res?.sent) showToast(`Test sent to ${res.to}`);
        else if (res && 'sent' in res) showToast('Not sent — template disabled or SES rejected it', true);
        else showToast(res?.error || 'Test failed', true);
    };

    const addVariable = () => {
        const v = newVar.trim().replace(/[^a-zA-Z0-9_]/g, '_');
        if (!v) return;
        if (!(draft.variables || []).includes(v)) setDraft(d => ({ ...d, variables: [...(d.variables || []), v] }));
        setNewVar('');
    };

    if (loading) return <div style={{ padding: 32 }}><p style={{ color: 'var(--text-muted)' }}>Loading templates…</p></div>;

    return (
        <div style={{ padding: '28px 32px' }}>
            {toast && <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: toast.err ? '#ef4444' : 'var(--primary)', color: '#fff', borderRadius: 10, padding: '10px 18px', fontSize: 13, boxShadow: '0 4px 16px rgba(0,0,0,.2)' }}>{toast.msg}</div>}

            <div style={{ marginBottom: 22, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Mail size={22} color="var(--primary)" />
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>Email Template Designer</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 3 }}>Design any email — visually or in raw HTML. Create your own templates and variables.</p>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: 20, alignItems: 'start' }}>
                {/* List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button onClick={createNew} style={{ ...primaryBtn, justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 6 }}><Plus size={15} /> New Template</button>
                    {templates.map(t => (
                        <button key={t.id} onClick={() => setSelectedId(t.id)} style={{ textAlign: 'left', padding: '11px 13px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${t.id === selectedId ? 'var(--primary)' : 'var(--outline-variant)'}`, background: t.id === selectedId ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : 'var(--surface-container-low)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.is_enabled ? '#16a34a' : '#9ca3af', flexShrink: 0 }} />
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>{t.name}</span>
                                {t.is_custom && <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 700, color: 'var(--primary)', background: 'color-mix(in srgb, var(--primary) 12%, transparent)', padding: '1px 6px', borderRadius: 4 }}>CUSTOM</span>}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, fontFamily: 'monospace' }}>{t.key}</div>
                        </button>
                    ))}
                </div>

                {/* Editor */}
                {draft && (
                    <div style={{ border: '1px solid var(--outline-variant)', borderRadius: 14, overflow: 'hidden', background: 'var(--surface-container-low)' }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--outline-variant)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <div style={{ minWidth: 0 }}>
                                {draft.is_custom
                                    ? <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} style={{ ...input, fontWeight: 700, fontSize: 15, padding: '4px 8px', width: 260 }} />
                                    : <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)' }}>{draft.name}</div>}
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{draft.description}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                                {draft.is_custom && <button onClick={removeTemplate} style={{ ...iconBtn, borderColor: 'transparent' }} title="Delete template"><Trash2 size={16} /></button>}
                                <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>HTML mode</span>
                                    <Toggle on={draft.html_mode} onChange={setHtmlMode} color="#6366f1" />
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                                    <span style={{ fontSize: 12.5, fontWeight: 600, color: draft.is_enabled ? '#16a34a' : 'var(--text-muted)' }}>{draft.is_enabled ? 'ON' : 'Off'}</span>
                                    <Toggle on={draft.is_enabled} onChange={v => setDraft(d => ({ ...d, is_enabled: v }))} />
                                </label>
                            </div>
                        </div>

                        {/* Variables */}
                        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--outline-variant)', display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
                            <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 700 }}>Variables:</span>
                            {(draft.variables || []).map(v => (
                                <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontFamily: 'monospace', background: 'color-mix(in srgb, var(--primary) 10%, transparent)', color: 'var(--primary)', padding: '3px 7px', borderRadius: 6, border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)', fontWeight: 600 }}>
                                    <button onClick={() => insertVar(v)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', font: 'inherit', padding: 0 }} title="Insert">{`{{${v}}}`}</button>
                                    {draft.is_custom && <button onClick={() => setDraft(d => ({ ...d, variables: d.variables.filter(x => x !== v) }))} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'inline-flex', opacity: .7, padding: 0 }} title="Remove"><X size={12} /></button>}
                                </span>
                            ))}
                            {draft.is_custom && (
                                <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                                    <input value={newVar} onChange={e => setNewVar(e.target.value)} onKeyDown={e => e.key === 'Enter' && addVariable()} placeholder="new_variable" style={{ ...input, width: 120, padding: '4px 8px', fontSize: 12 }} />
                                    <button onClick={addVariable} style={{ ...ghostBtn, padding: '5px 10px' }}>Add</button>
                                </span>
                            )}
                            {draft.allow_attachment && <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--primary)', fontWeight: 600 }}><Paperclip size={13} /> PDF attaches automatically</span>}
                        </div>

                        <div style={{ padding: 20 }}>
                            <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--outline-variant)', marginBottom: 18 }}>
                                <TabBtn active={mode === 'edit'} onClick={() => setMode('edit')} icon={draft.html_mode ? Code : LayoutTemplate}>{draft.html_mode ? 'HTML' : 'Design'}</TabBtn>
                                <TabBtn active={mode === 'preview'} onClick={() => setMode('preview')} icon={Eye}>Preview</TabBtn>
                            </div>

                            {mode === 'preview' ? (
                                <div>
                                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 10 }}>Subject: <strong style={{ color: 'var(--text-main)' }}>{fillTokens(draft.subject)}</strong></div>
                                    <div style={{ border: '1px solid var(--outline-variant)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                                        <iframe title="preview" srcDoc={previewHtml(draft)} style={{ width: '100%', height: 520, border: 'none', background: '#fff' }} sandbox="" />
                                    </div>
                                </div>
                            ) : draft.html_mode ? (
                                <div style={{ display: 'grid', gap: 14 }}>
                                    <SettingsRow draft={draft} setDraft={setDraft} track={track} />
                                    <Field label="Raw HTML" hint="Use {{variables}} anywhere. Inline styles recommended for email clients.">
                                        <textarea value={draft.body_html} {...track(v => setDraft(d => ({ ...d, body_html: v })))} onChange={e => setDraft(d => ({ ...d, body_html: e.target.value }))} spellCheck={false} rows={18} style={{ ...input, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5, resize: 'vertical' }} />
                                    </Field>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gap: 16 }}>
                                    <SettingsRow draft={draft} setDraft={setDraft} track={track} />
                                    <Divider>Email body</Divider>
                                    <Field label="Heading (big title — leave blank for none)"><input value={c.heading} {...track(v => setC({ heading: v }))} onChange={e => setC({ heading: e.target.value })} placeholder="e.g. Reset your password" style={input} /></Field>
                                    <Field label="Body text" hint="Leave a blank line between paragraphs."><textarea value={c.body} {...track(v => setC({ body: v }))} onChange={e => setC({ body: e.target.value })} rows={5} style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} /></Field>
                                    <Field label="Details table" hint="Rows of label → value.">
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {(c.table || []).map((row, i) => (
                                                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    <input value={row.label} {...track(v => updateRow(setC, c, i, 'label', v))} onChange={e => updateRow(setC, c, i, 'label', e.target.value)} placeholder="Label" style={{ ...input, flex: 1 }} />
                                                    <span style={{ color: 'var(--text-muted)' }}>→</span>
                                                    <input value={row.value} {...track(v => updateRow(setC, c, i, 'value', v))} onChange={e => updateRow(setC, c, i, 'value', e.target.value)} placeholder="Value or {{variable}}" style={{ ...input, flex: 1.4 }} />
                                                    <button onClick={() => setC({ table: c.table.filter((_, j) => j !== i) })} style={iconBtn} title="Remove row"><Trash2 size={15} /></button>
                                                </div>
                                            ))}
                                            <button onClick={() => setC({ table: [...(c.table || []), { label: '', value: '' }] })} style={{ ...ghostBtn, alignSelf: 'flex-start' }}><Plus size={14} style={{ verticalAlign: -2, marginRight: 5 }} />Add row</button>
                                        </div>
                                    </Field>
                                    <Field label="Closing text" hint="Appears after the table."><textarea value={c.closing} {...track(v => setC({ closing: v }))} onChange={e => setC({ closing: e.target.value })} rows={3} style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} /></Field>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                        <Field label="Button label (optional)"><input value={c.button?.label || ''} {...track(v => setC({ button: { ...c.button, label: v } }))} onChange={e => setC({ button: { ...c.button, label: e.target.value } })} placeholder="e.g. Log In" style={input} /></Field>
                                        <Field label="Button link"><input value={c.button?.url || ''} {...track(v => setC({ button: { ...c.button, url: v } }))} onChange={e => setC({ button: { ...c.button, url: e.target.value } })} placeholder="{{login_url}}" style={input} /></Field>
                                    </div>
                                    <Field label="Signature (optional)"><textarea value={c.signature} {...track(v => setC({ signature: v }))} onChange={e => setC({ signature: e.target.value })} rows={3} placeholder={'Warm regards,\nTiesverse HR Team'} style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} /></Field>
                                    {draft.is_custom && (
                                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                                            <input type="checkbox" checked={draft.allow_attachment} onChange={e => setDraft(d => ({ ...d, allow_attachment: e.target.checked }))} /> Allow a PDF attachment on this template
                                        </label>
                                    )}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center', marginTop: 18 }}>
                                {dirty && <span style={{ fontSize: 12, color: '#f59e0b', marginRight: 'auto' }}>Unsaved changes</span>}
                                <button onClick={sendTest} style={ghostBtn}><Send size={14} style={{ marginRight: 6, verticalAlign: -2 }} />Send test</button>
                                <button onClick={save} disabled={saving || !dirty} style={{ ...primaryBtn, opacity: (saving || !dirty) ? 0.6 : 1 }}>{saving ? 'Saving…' : <><Save size={14} style={{ marginRight: 6, verticalAlign: -2 }} />Save</>}</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function SettingsRow({ draft, setDraft, track }) {
    return (
        <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Sender name (alias)"><input value={draft.from_name} {...track(v => setDraft(d => ({ ...d, from_name: v })))} onChange={e => setDraft(d => ({ ...d, from_name: e.target.value }))} placeholder="Tiesverse" style={input} /></Field>
                <Field label="From email (blank = default)"><input value={draft.from_email} onChange={e => setDraft(d => ({ ...d, from_email: e.target.value }))} placeholder="mail@tiesverse.com" style={input} /></Field>
            </div>
            <Field label="Subject line"><input value={draft.subject} {...track(v => setDraft(d => ({ ...d, subject: v })))} onChange={e => setDraft(d => ({ ...d, subject: e.target.value }))} style={input} /></Field>
        </>
    );
}

const updateRow = (setC, c, i, field, value) => setC({ table: c.table.map((r, j) => j === i ? { ...r, [field]: value } : r) });
const pick = (t) => ({ subject: t.subject, from_name: t.from_name, from_email: t.from_email, is_enabled: t.is_enabled, html_mode: t.html_mode, body_html: t.body_html, content_json: t.content_json, name: t.name, variables: t.variables, allow_attachment: t.allow_attachment });

function Field({ label, hint, children }) {
    return <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 }}>{label}{hint && <span style={{ fontWeight: 400, marginLeft: 6, opacity: .8 }}>· {hint}</span>}</label>{children}</div>;
}
function Divider({ children }) {
    return <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' }}><span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{children}</span><span style={{ flex: 1, height: 1, background: 'var(--outline-variant)' }} /></div>;
}
function Toggle({ on, onChange, color = '#16a34a' }) {
    return <button type="button" onClick={() => onChange(!on)} aria-pressed={on} style={{ width: 40, height: 22, borderRadius: 999, border: 'none', cursor: 'pointer', position: 'relative', background: on ? color : '#9ca3af', flexShrink: 0 }}><span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} /></button>;
}
function TabBtn({ active, onClick, icon: Icon, children }) {
    return <button onClick={onClick} style={{ padding: '7px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none', color: active ? 'var(--primary)' : 'var(--text-muted)', borderBottom: `2px solid ${active ? 'var(--primary)' : 'transparent'}`, marginBottom: -1, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon size={14} />{children}</button>;
}

const input = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-lowest, #fff)', color: 'var(--text-main)', fontSize: 13, boxSizing: 'border-box' };
const primaryBtn = { padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const ghostBtn = { padding: '8px 14px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' };
const iconBtn = { padding: 8, borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'transparent', color: '#ef4444', cursor: 'pointer', display: 'inline-flex', flexShrink: 0 };
