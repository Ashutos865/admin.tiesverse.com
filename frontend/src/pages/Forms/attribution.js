// Where the person filling a form came from.
//
// The campaign parameters are on the link they clicked, but a form can take a
// while to fill and the query string is easy to lose on the way, so capture
// once on arrival and keep it for the session. First touch wins: the link that
// actually brought someone in is the one worth crediting.

const KEY = 'ties_form_attribution';
const FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];

function read() {
    try {
        const raw = sessionStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

/** Call once when a public form opens. */
export function captureFormAttribution() {
    try {
        const params = new URLSearchParams(window.location.search);
        const found = {};
        FIELDS.forEach((f) => {
            const v = (params.get(f) || '').trim();
            if (v) found[f] = v.slice(0, 120);
        });

        const existing = read();
        if (existing && !Object.keys(found).length) return existing;

        if (!Object.keys(found).length) {
            // No tags: credit the referring site instead, so an untagged share
            // still says something. Our own pages are not a source.
            const ref = document.referrer || '';
            if (ref) {
                try {
                    const host = new URL(ref).hostname.replace(/^www\./, '');
                    if (host && !host.endsWith('tiesverse.com')) {
                        found.utm_source = host;
                        found.utm_medium = 'referral';
                    }
                } catch { /* malformed referrer */ }
            }
        }
        if (!Object.keys(found).length) return existing;

        const record = { ...found, referrer: (document.referrer || '').slice(0, 300) };
        sessionStorage.setItem(KEY, JSON.stringify(record));
        return record;
    } catch { return null; }
}

/** The stored attribution, shaped for the submission payload. */
export function getFormAttribution() {
    const a = read() || {};
    return {
        utm_source: a.utm_source || '',
        utm_medium: a.utm_medium || '',
        utm_campaign: a.utm_campaign || '',
        utm_content: a.utm_content || '',
        referrer: a.referrer || '',
    };
}
