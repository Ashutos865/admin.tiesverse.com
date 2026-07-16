import { useState, useEffect, useRef, useCallback } from 'react';
import { Database, Search, Users, Ticket, Award, ChevronDown, Mail, CheckCircle2 } from 'lucide-react';
import { searchDirectory } from '../../apiClient';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function MasterDirectory() {
    const [q, setQ] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(null);
    const debounce = useRef(null);

    const run = useCallback(async (query) => {
        setLoading(true);
        const res = await searchDirectory(query);
        setResults(res?.results || []);
        setLoading(false);
    }, []);

    useEffect(() => { run(''); }, [run]);
    useEffect(() => {
        clearTimeout(debounce.current);
        debounce.current = setTimeout(() => run(q), 300);
        return () => clearTimeout(debounce.current);
    }, [q, run]);

    const totals = results.reduce((a, p) => ({
        members: a.members + (p.is_member ? 1 : 0),
        regs: a.regs + p.registrations,
        certs: a.certs + p.certificates,
    }), { members: 0, regs: 0, certs: 0 });

    return (
        <div style={{ padding: '28px 32px', maxWidth: 1150 }}>
            <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Database size={22} color="var(--primary)" />
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>Master Directory</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 3 }}>Search anyone by name or email to see everything — membership, event registrations, attendance, and certificates.</p>
                </div>
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 16 }}>
                <Search size={17} style={{ position: 'absolute', left: 14, top: 13, color: 'var(--text-muted)' }} />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or email…" autoFocus
                    style={{ width: '100%', padding: '11px 14px 11px 42px', borderRadius: 10, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-lowest, #fff)', color: 'var(--text-main)', fontSize: 14, boxSizing: 'border-box' }} />
            </div>

            {/* Summary chips */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
                <Stat icon={Users} label="People" value={results.length} />
                <Stat icon={Users} label="Members" value={totals.members} />
                <Stat icon={Ticket} label="Registrations" value={totals.regs} />
                <Stat icon={Award} label="Certificates" value={totals.certs} />
            </div>

            {loading ? <p style={{ color: 'var(--text-muted)' }}>Searching…</p> : results.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No matches.</p>
            ) : (
                <div style={{ border: '1px solid var(--outline-variant)', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 90px 90px 90px 32px', gap: 10, padding: '10px 16px', background: 'var(--surface-container-low)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                        <span>Person</span><span>Type</span><span style={{ textAlign: 'center' }}>Regs</span><span style={{ textAlign: 'center' }}>Attend</span><span style={{ textAlign: 'center' }}>Certs</span><span />
                    </div>
                    {results.map((p, i) => {
                        const id = p.email || `row-${i}`;
                        const open = expanded === id;
                        return (
                            <div key={id} style={{ borderTop: '1px solid var(--outline-variant)' }}>
                                <button onClick={() => setExpanded(open ? null : id)} style={{ width: '100%', display: 'grid', gridTemplateColumns: '1.6fr 1fr 90px 90px 90px 32px', gap: 10, padding: '12px 16px', background: open ? 'var(--surface-container-low)' : 'transparent', border: 'none', cursor: 'pointer', alignItems: 'center', textAlign: 'left' }}>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name || '—'}</div>
                                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email || '—'}</div>
                                    </div>
                                    <div>
                                        {p.is_member
                                            ? <Badge color="#4338ca">{cap(p.member?.portal_role || p.member?.employment_type || 'Member')}</Badge>
                                            : <Badge color="#0891b2">Registrant</Badge>}
                                    </div>
                                    <span style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: p.registrations ? 'var(--text-main)' : 'var(--text-muted)' }}>{p.registrations}</span>
                                    <span style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: p.attendance_days ? 'var(--text-main)' : 'var(--text-muted)' }}>{p.attendance_days}</span>
                                    <span style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: p.certificates ? '#067a50' : 'var(--text-muted)' }}>{p.certificates}</span>
                                    <ChevronDown size={16} style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                                </button>
                                {open && <Detail p={p} />}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function Detail({ p }) {
    const m = p.member;
    return (
        <div style={{ padding: '4px 16px 18px', background: 'var(--surface-container-low)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                    <H>Profile</H>
                    {m ? (
                        <div style={{ display: 'grid', gap: 5 }}>
                            <Row k="Role" v={m.role || cap(m.portal_role) || '—'} />
                            <Row k="Employment" v={m.employment_type || '—'} />
                            <Row k="Departments" v={(m.departments || []).join(', ') || '—'} />
                            <Row k="Status" v={cap(m.status)} />
                            <Row k="Joined" v={fmtDate(m.joined)} />
                            <Row k="Portal login" v={m.has_account ? 'Yes' : 'No'} />
                            <Row k="Attendance" v={`${p.attendance_days} day(s) present`} />
                        </div>
                    ) : <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Not an internal member — appears via event registration / certificate.</p>}
                </div>
                <div>
                    <H><Ticket size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Registrations ({p.registrations})</H>
                    {p.registered_events.length ? (
                        <ul style={{ margin: '0 0 14px', paddingLeft: 16, fontSize: 12.5, color: 'var(--text-muted)' }}>
                            {[...new Set(p.registered_events)].slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                    ) : <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 14px' }}>None.</p>}

                    <H><Award size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Certificates ({p.certificates})</H>
                    {p.certificate_list.length ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {p.certificate_list.slice(0, 10).map((cert, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, flexWrap: 'wrap' }}>
                                    <CheckCircle2 size={13} style={{ color: '#067a50', flexShrink: 0 }} />
                                    <span style={{ color: 'var(--text-main)' }}>{cert.title}</span>
                                    {cert.status && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>· {cert.status}</span>}
                                    {cert.id && <span style={{ color: 'var(--primary)', fontSize: 11, fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>· {cert.id}</span>}
                                </div>
                            ))}
                        </div>
                    ) : <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>None issued.</p>}
                </div>
            </div>
            {p.email && (
                <a href={`mailto:${p.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, fontSize: 12.5, fontWeight: 600, color: 'var(--primary)', textDecoration: 'none' }}>
                    <Mail size={13} /> {p.email}
                </a>
            )}
        </div>
    );
}

const cap = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const Stat = ({ icon: Icon, label, value }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 14px', borderRadius: 10, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)' }}>
        <Icon size={16} style={{ color: 'var(--primary)' }} />
        <div><div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-main)', lineHeight: 1 }}>{value}</div><div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 2 }}>{label}</div></div>
    </div>
);
const Badge = ({ color, children }) => <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>{children}</span>;
const H = ({ children }) => <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', marginBottom: 8 }}>{children}</div>;
const Row = ({ k, v }) => <div style={{ display: 'flex', fontSize: 12.5 }}><span style={{ width: 110, color: 'var(--text-muted)' }}>{k}</span><span style={{ color: 'var(--text-main)', fontWeight: 500 }}>{v}</span></div>;
