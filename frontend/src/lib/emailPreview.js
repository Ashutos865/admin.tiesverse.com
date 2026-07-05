// Client-side twin of the backend render_content() + token merge — used for
// live email previews across the designer, campaigns, and certificate sending.

const paras = (text) => (text || '').trim().split(/\n\s*\n/).filter(b => b.trim())
    .map(b => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">${b.trim().replace(/\n/g, '<br>')}</p>`).join('');

export function renderContent(c = {}) {
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

export const mergeTokens = (text, row) => (text || '').replace(/{{\s*(\w+)\s*}}/g, (m, k) => (k in row && row[k] != null && row[k] !== '') ? row[k] : m);
export const templateBody = (t) => (t?.html_mode ? (t.body_html || '') : renderContent(t?.content_json || {}));
export const previewTemplate = (t, row = {}) => mergeTokens(templateBody(t), row);
