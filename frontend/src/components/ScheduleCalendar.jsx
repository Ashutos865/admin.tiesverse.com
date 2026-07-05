import React, { useMemo, useState } from 'react';

/**
 * Reusable month calendar. `events` = [{ id, date (ISO or YYYY-MM-DD), title, subtitle, link, tag }].
 * Used for both the interview calendar and the webinar calendar.
 */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function ScheduleCalendar({ events = [], emptyLabel = 'Nothing scheduled.', accent = '#6366f1' }) {
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth());

    // Bucket events by local day key
    const byDay = useMemo(() => {
        const map = {};
        for (const e of events) {
            if (!e || !e.date) continue;
            const d = new Date(e.date);
            if (isNaN(d)) continue;
            (map[dayKey(d)] = map[dayKey(d)] || []).push({ ...e, _d: d });
        }
        Object.values(map).forEach((list) => list.sort((a, b) => a._d - b._d));
        return map;
    }, [events]);

    const first = new Date(year, month, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);

    const shift = (delta) => {
        let m = month + delta, y = year;
        if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
        setMonth(m); setYear(y);
    };
    const goToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth()); };
    const todayKey = dayKey(now);
    const monthCount = events.filter((e) => { const d = new Date(e.date); return !isNaN(d) && d.getFullYear() === year && d.getMonth() === month; }).length;

    return (
        <div style={S.wrap}>
            <div style={S.head}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button type="button" onClick={() => shift(-1)} style={S.navBtn} aria-label="Previous month">‹</button>
                    <div style={S.title}>{MONTHS[month]} {year}</div>
                    <button type="button" onClick={() => shift(1)} style={S.navBtn} aria-label="Next month">›</button>
                    <button type="button" onClick={goToday} style={S.todayBtn}>Today</button>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{monthCount} this month</div>
            </div>

            <div style={S.grid}>
                {WEEKDAYS.map((w) => <div key={w} style={S.weekday}>{w}</div>)}
                {cells.map((d, i) => {
                    if (!d) return <div key={`e${i}`} style={{ ...S.cell, background: 'transparent', border: 'none' }} />;
                    const key = dayKey(d);
                    const list = byDay[key] || [];
                    const isToday = key === todayKey;
                    return (
                        <div key={key} style={{ ...S.cell, ...(isToday ? S.cellToday : {}) }}>
                            <div style={{ ...S.dayNum, ...(isToday ? { color: accent, fontWeight: 800 } : {}) }}>{d.getDate()}</div>
                            <div style={S.events}>
                                {list.slice(0, 4).map((e) => {
                                    const time = e._d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                    const inner = (
                                        <>
                                            <span style={S.evTime}>{time}</span>
                                            <span style={S.evTitle}>{e.title}</span>
                                            {e.subtitle && <span style={S.evSub}>{e.subtitle}</span>}
                                        </>
                                    );
                                    return e.link
                                        ? <a key={e.id} href={e.link} target="_blank" rel="noreferrer" title={`${e.title}${e.subtitle ? ' · ' + e.subtitle : ''}`} style={{ ...S.event, borderLeftColor: accent }}>{inner}</a>
                                        : <div key={e.id} title={`${e.title}${e.subtitle ? ' · ' + e.subtitle : ''}`} style={{ ...S.event, borderLeftColor: accent, cursor: 'default' }}>{inner}</div>;
                                })}
                                {list.length > 4 && <div style={S.more}>+{list.length - 4} more</div>}
                            </div>
                        </div>
                    );
                })}
            </div>
            {events.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 12 }}>{emptyLabel}</p>}
        </div>
    );
}

const S = {
    wrap: { background: 'var(--surface, #fff)', border: '1px solid var(--border, #e6e6ef)', borderRadius: 14, padding: 16 },
    head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 },
    title: { fontSize: 16, fontWeight: 800, color: 'var(--text-main)', minWidth: 150, textAlign: 'center' },
    navBtn: { width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border, #e6e6ef)', background: 'transparent', color: 'var(--text-main)', cursor: 'pointer', fontSize: 18, lineHeight: 1 },
    todayBtn: { padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border, #e6e6ef)', background: 'transparent', color: 'var(--text-main)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 },
    weekday: { fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'center', padding: '4px 0' },
    cell: { minHeight: 96, border: '1px solid var(--border, #eceaf5)', borderRadius: 10, padding: 6, background: 'var(--surface-container-low, #fbfbfe)', overflow: 'hidden' },
    cellToday: { borderColor: 'color-mix(in srgb, var(--primary, #6366f1) 55%, transparent)', background: 'color-mix(in srgb, var(--primary, #6366f1) 6%, transparent)' },
    dayNum: { fontSize: 12.5, fontWeight: 600, color: 'var(--text-main)', marginBottom: 4 },
    events: { display: 'flex', flexDirection: 'column', gap: 4 },
    event: { display: 'block', textDecoration: 'none', background: 'var(--surface, #fff)', border: '1px solid var(--border, #eceaf5)', borderLeft: '3px solid', borderRadius: 6, padding: '3px 6px', lineHeight: 1.25 },
    evTime: { display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' },
    evTitle: { display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    evSub: { display: 'block', fontSize: 10.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    more: { fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 600 },
};
