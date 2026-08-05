import { useEffect, useState } from 'react';
import { Fingerprint, Users, ShieldCheck, AlertTriangle } from 'lucide-react';
import { getCrewReporting } from '../../apiClient';

const wrap = { padding: '28px 32px', maxWidth: 1100 };
const card = { border: '1px solid var(--outline-variant)', borderRadius: 12, padding: 16, background: 'var(--surface-container-lowest)' };
const STATUS_COLOR = {
    ACTIVE: '#067a50', PENDING: '#b45309', SUSPENDED: '#b91c1c', EXPIRED: '#92400e',
    OFFBOARDED: '#6b7280', ARCHIVED: '#6b7280', CANCELLED: '#6b7280', UNSET: '#9ca3af',
};
const CLASS_LABEL = {
    EMP: 'Employee', INT: 'Intern', TRN: 'Trainee', CON: 'Contractor', FRL: 'Freelancer',
    CNS: 'Consultant', CLI: 'Client', PRT: 'Partner', INS: 'Instructor', GST: 'Guest', ALM: 'Alumni',
};

function Stat({ label, value, color }) {
    return (
        <div style={card}>
            <div style={{ fontSize: 26, fontWeight: 900, color: color || 'var(--text-main)', fontFamily: "'Google Sans', sans-serif" }}>{value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
        </div>
    );
}

function Breakdown({ title, data, colorFor, labelFor }) {
    const entries = Object.entries(data || {}).sort((a, b) => b[1] - a[1]);
    const max = entries.reduce((m, [, v]) => Math.max(m, v), 1);
    return (
        <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-main)', marginBottom: 12 }}>{title}</div>
            {entries.length === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>No data.</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {entries.map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 110, fontSize: 12.5, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelFor ? labelFor(k) : k}</div>
                            <div style={{ flex: 1, height: 8, borderRadius: 999, background: 'var(--surface-container-low)', overflow: 'hidden' }}>
                                <div style={{ width: `${(v / max) * 100}%`, height: '100%', background: colorFor ? colorFor(k) : 'var(--primary)', borderRadius: 999 }} />
                            </div>
                            <div style={{ width: 34, textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: 'var(--text-main)' }}>{v}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function CrewIdentity() {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        getCrewReporting()
            .then((r) => { if (r?.error) setError(r.error); else setData(r); })
            .catch((e) => setError(e?.message || 'Failed to load.'));
    }, []);

    if (error) return <div style={wrap}><div style={{ ...card, color: '#dc2626' }}>{error}</div></div>;
    if (!data) return <div style={wrap}><p style={{ color: 'var(--text-muted)' }}>Loading…</p></div>;

    const cap = data.series_capacity;

    return (
        <div style={wrap}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-main)', margin: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
                <Fingerprint size={22} style={{ color: 'var(--primary)' }} /> Crew ID · Identity
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4, marginBottom: 22 }}>
                Permanent identities across Ties HQ — status, class, and series capacity.
            </p>

            {/* Top stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 14 }}>
                <Stat label="Total members" value={data.total_members} />
                <Stat label="With Crew ID" value={data.with_crew_id} color="var(--primary)" />
                <Stat label="Active" value={data.active} color="#067a50" />
                <Stat label="Pending" value={data.pending} color="#b45309" />
                <Stat label="Suspended" value={data.suspended} color="#b91c1c" />
                <Stat label="Offboarded" value={data.offboarded} color="#6b7280" />
                <Stat label="Privileged" value={data.privileged} color="#7c3aed" />
            </div>

            {/* Series capacity meter */}
            {cap && (
                <div style={{ ...card, marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-main)' }}>Series capacity — {cap.series_code}</div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: cap.at_threshold ? '#b91c1c' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                            {cap.at_threshold && <AlertTriangle size={13} />} {cap.current_number}/{cap.max} ({cap.percent}%)
                        </div>
                    </div>
                    <div style={{ height: 10, borderRadius: 999, background: 'var(--surface-container-low)', overflow: 'hidden' }}>
                        <div style={{ width: `${cap.percent}%`, height: '100%', background: cap.at_threshold ? '#b91c1c' : 'var(--primary)', borderRadius: 999, transition: 'width .3s' }} />
                    </div>
                    {cap.at_threshold && <div style={{ fontSize: 11.5, color: '#b91c1c', marginTop: 6 }}>Series is at 90%+ — the next series will be prepared automatically.</div>}
                </div>
            )}

            {/* Breakdowns */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                <Breakdown title="By account status" data={data.by_status} colorFor={(k) => STATUS_COLOR[k] || 'var(--primary)'} />
                <Breakdown title="By identity class" data={data.by_class} labelFor={(k) => CLASS_LABEL[k] ? `${k} · ${CLASS_LABEL[k]}` : k} />
                <Breakdown title="By department" data={data.by_department} />
            </div>
        </div>
    );
}
