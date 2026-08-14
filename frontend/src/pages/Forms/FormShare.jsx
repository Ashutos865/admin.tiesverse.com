import { useState } from 'react';

/**
 * Share links that say where a response came from.
 *
 * Each channel gets the form's public link with campaign tags attached. The
 * public page records them on arrival and stores them with the response, so
 * the responses screen can total them by source. Custom channels cover
 * anything not listed: a newsletter, a partner, one person's story.
 */

const CHANNELS = [
    { key: 'whatsapp', label: 'WhatsApp', medium: 'chat' },
    { key: 'instagram', label: 'Instagram', medium: 'social' },
    { key: 'linkedin', label: 'LinkedIn', medium: 'social' },
    { key: 'x', label: 'X', medium: 'social' },
    { key: 'telegram', label: 'Telegram', medium: 'chat' },
    { key: 'email', label: 'Email', medium: 'email' },
    { key: 'poster', label: 'Poster QR', medium: 'print' },
];

export const utmSlug = (s) =>
    String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function buildUtmUrl(base, { source, medium, campaign, content } = {}) {
    if (!base) return '';
    let url;
    try { url = new URL(base, window.location.origin); } catch { return base; }
    // Set rather than append: rebuilding a link that already carries tags
    // should replace them, not stack a second copy.
    if (source) url.searchParams.set('utm_source', utmSlug(source));
    if (medium) url.searchParams.set('utm_medium', utmSlug(medium));
    if (campaign) url.searchParams.set('utm_campaign', utmSlug(campaign));
    if (content) url.searchParams.set('utm_content', utmSlug(content));
    return url.toString();
}

const box = { border: '1px solid var(--outline-variant,#e5e7eb)', borderRadius: 12, padding: 16, background: 'var(--surface,#fff)' };
const input = { width: '100%', boxSizing: 'border-box', padding: '8px 11px', borderRadius: 8, border: '1px solid var(--outline-variant,#e5e7eb)', background: 'var(--surface,#fff)', color: 'var(--text-main,#111)', fontSize: 13, fontFamily: 'inherit', outline: 'none' };
const btn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 13px', borderRadius: 8, border: '1px solid var(--outline-variant,#e5e7eb)', background: 'transparent', color: 'var(--text-main,#111)', fontWeight: 700, fontSize: 12, cursor: 'pointer' };

export default function FormShare({ publicUrl, formTitle }) {
    const [campaign, setCampaign] = useState(utmSlug(formTitle || '').slice(0, 60));
    const [custom, setCustom] = useState('');
    const [extras, setExtras] = useState([]);
    const [copied, setCopied] = useState('');

    if (!publicUrl) {
        return (
            <div style={box}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted,#6b7280)' }}>
                    Publish this form as a public link to get share links you can track.
                </p>
            </div>
        );
    }

    const channels = [
        ...CHANNELS,
        ...extras.map((e) => ({ key: e, label: e, medium: 'referral', custom: true })),
    ];

    const copy = async (text, key) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(key);
            window.setTimeout(() => setCopied(''), 1600);
        } catch { /* clipboard blocked */ }
    };

    const addCustom = () => {
        const name = utmSlug(custom);
        if (!name) return;
        if (!extras.includes(name) && !CHANNELS.some((c) => c.key === name)) {
            setExtras((x) => [...x, name]);
        }
        setCustom('');
    };

    return (
        <div style={box}>
            <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 800, color: 'var(--text-main,#111)' }}>Share links</h3>
            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--text-muted,#6b7280)', lineHeight: 1.5 }}>
                Copy a channel&apos;s link and post it there. Responses that arrive through it are
                counted against that channel below.
            </p>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted,#6b7280)' }}>Campaign name</label>
                <input style={{ ...input, flex: 1, minWidth: 200 }} value={campaign}
                    onChange={(e) => setCampaign(e.target.value)} placeholder="e.g. august-intake" />
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
                {channels.map((c) => {
                    const url = buildUtmUrl(publicUrl, { source: c.key, medium: c.medium, campaign });
                    return (
                        <div key={c.key} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', border: '1px solid var(--outline-variant,#e5e7eb)', borderRadius: 9, padding: '6px 10px' }}>
                            <strong style={{ fontSize: 12.5, minWidth: 84, color: 'var(--text-main,#111)' }}>{c.label}</strong>
                            <span style={{ flex: 1, minWidth: 180, fontSize: 11.5, color: 'var(--text-muted,#6b7280)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</span>
                            <button type="button" style={btn} onClick={() => copy(url, c.key)}>
                                {copied === c.key ? 'Copied' : 'Copy'}
                            </button>
                            {c.custom && (
                                <button type="button" style={{ ...btn, color: '#dc2626', borderColor: '#dc2626' }}
                                    onClick={() => setExtras((x) => x.filter((e) => e !== c.key))}>Remove</button>
                            )}
                        </div>
                    );
                })}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <input style={{ ...input, flex: 1, minWidth: 220 }} value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
                    placeholder="Add your own source (newsletter, a partner, a person…)" />
                <button type="button" style={btn} onClick={addCustom}>Add</button>
                <button type="button" style={btn} onClick={() => copy(publicUrl, 'plain')}>
                    {copied === 'plain' ? 'Copied' : 'Copy plain link'}
                </button>
            </div>
        </div>
    );
}
