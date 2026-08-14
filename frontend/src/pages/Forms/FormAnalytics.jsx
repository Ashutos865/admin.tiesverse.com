/**
 * Where a form's responses came from.
 *
 * Reads the campaign tags stored with each response. Untagged arrivals are
 * shown as "direct or untagged" rather than hidden, so the numbers add up to
 * the total and no channel is credited by omission.
 *
 * Charts are plain SVG and sized spans. No charting library, so nothing extra
 * ships and there is no second theme system to keep in step.
 */

const COLOURS = ['#0d0d0d', '#fe7a00', '#2563eb', '#10b981', '#a855f7', '#f43f5e', '#0891b2', '#64748b'];

function Donut({ slices, total, size = 150 }) {
    const stroke = 20;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    let offset = 0;
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Responses by source">
            <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--outline-variant,#e5e7eb)" strokeWidth={stroke} />
                {total > 0 && slices.map((s) => {
                    const len = (s.value / total) * c;
                    const el = (
                        <circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none"
                            stroke={s.colour} strokeWidth={stroke}
                            strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset}>
                            <title>{`${s.label}: ${s.value}`}</title>
                        </circle>
                    );
                    offset += len;
                    return el;
                })}
            </g>
            <text x="50%" y="47%" textAnchor="middle" fontSize="24" fontWeight="800" fill="var(--text-main,#111)">{total}</text>
            <text x="50%" y="62%" textAnchor="middle" fontSize="10" fill="var(--text-muted,#6b7280)"
                style={{ letterSpacing: '.08em', textTransform: 'uppercase' }}>responses</text>
        </svg>
    );
}

const card = { border: '1px solid var(--outline-variant,#e5e7eb)', borderRadius: 12, padding: 16, background: 'var(--surface,#fff)' };

export default function FormAnalytics({ responses }) {
    const rows = Array.isArray(responses) ? responses : [];
    if (!rows.length) return null;

    const total = rows.length;

    const tally = new Map();
    rows.forEach((r) => {
        const key = String(r.utm_source || '').trim().toLowerCase() || 'direct or untagged';
        tally.set(key, (tally.get(key) || 0) + 1);
    });
    const sources = [...tally.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([label, value], i) => ({ label, value, colour: COLOURS[i % COLOURS.length] }));
    const topCount = sources[0]?.value || 1;
    const tagged = rows.filter((r) => (r.utm_source || '').trim()).length;
    const edited = rows.filter((r) => r.edited_at).length;

    // Responses per day, most recent fortnight, so a push is visible.
    const byDay = new Map();
    rows.forEach((r) => {
        const d = String(r.submitted_at || '').slice(0, 10);
        if (d) byDay.set(d, (byDay.get(d) || 0) + 1);
    });
    const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
    const dayMax = Math.max(1, ...days.map(([, n]) => n));
    const pct = (n) => (total ? Math.round((n / total) * 100) : 0);

    // With nothing tagged there is no story to tell, and a donut of one grey
    // ring would only take up space.
    if (!tagged) {
        return (
            <div style={{ ...card, marginBottom: 14 }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted,#6b7280)', lineHeight: 1.6 }}>
                    <strong style={{ color: 'var(--text-main,#111)' }}>{total} response{total === 1 ? '' : 's'}</strong>, none of them
                    from a tagged link yet. Share a link from the panel above and the channels that produce
                    responses appear here.
                </p>
            </div>
        );
    }

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,240px) minmax(0,1fr)', gap: 14, marginBottom: 14 }}>
            <div style={card}>
                <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 800, color: 'var(--text-main,#111)' }}>Where they came from</h3>
                <div style={{ display: 'grid', placeItems: 'center' }}>
                    <Donut slices={sources} total={total} />
                </div>
                <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
                    {sources.slice(0, 8).map((s) => (
                        <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.colour, flex: 'none' }} />
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-main,#111)' }}>{s.label}</span>
                            <strong style={{ color: 'var(--text-main,#111)' }}>{s.value}</strong>
                            <span style={{ color: 'var(--text-muted,#6b7280)', minWidth: 34, textAlign: 'right' }}>{pct(s.value)}%</span>
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
                <div style={card}>
                    <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 800, color: 'var(--text-main,#111)' }}>Responses by channel</h3>
                    <div style={{ display: 'grid', gap: 8 }}>
                        {sources.map((s) => (
                            <div key={s.label} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 36px', gap: 10, alignItems: 'center' }}>
                                <span style={{ fontSize: 12, color: 'var(--text-main,#111)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                                <span style={{ height: 9, borderRadius: 6, background: 'var(--outline-variant,#e5e7eb)', overflow: 'hidden' }}>
                                    <span style={{ display: 'block', height: '100%', width: `${(s.value / topCount) * 100}%`, background: s.colour, borderRadius: 6 }} />
                                </span>
                                <strong style={{ fontSize: 12.5, textAlign: 'right', color: 'var(--text-main,#111)' }}>{s.value}</strong>
                            </div>
                        ))}
                    </div>
                    {edited > 0 && (
                        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--text-muted,#6b7280)' }}>
                            {edited} response{edited === 1 ? ' was' : 's were'} edited after submitting.
                        </p>
                    )}
                </div>

                {days.length > 1 && (
                    <div style={card}>
                        <h3 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 800, color: 'var(--text-main,#111)' }}>Responses per day</h3>
                        <p style={{ margin: '0 0 10px', fontSize: 11.5, color: 'var(--text-muted,#6b7280)' }}>Last {days.length} days with responses</p>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 100 }}>
                            {days.map(([d, n]) => (
                                <div key={d} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 0 }}>
                                    <span style={{ fontSize: 10.5, color: 'var(--text-muted,#6b7280)' }}>{n}</span>
                                    <span title={`${d}: ${n}`} style={{
                                        width: '100%', maxWidth: 32, height: `${(n / dayMax) * 66}px`, minHeight: 4,
                                        background: '#0d0d0d', borderRadius: '5px 5px 0 0',
                                    }} />
                                    <span style={{ fontSize: 9.5, color: 'var(--text-muted,#6b7280)', whiteSpace: 'nowrap' }}>{d.slice(8)}/{d.slice(5, 7)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
