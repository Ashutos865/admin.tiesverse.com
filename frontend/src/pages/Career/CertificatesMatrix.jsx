import { useEffect, useMemo, useState } from 'react';
import { getOnboardingList } from '../../apiClient';
import { Search, Check, X, Award } from 'lucide-react';

// The four documents, in column order. `key` maps to the member's cert data.
const COLUMNS = [
  { key: 'offer_letter',    label: 'Offer Letter' },
  { key: 'internship_cert', label: 'Internship Certificate' },
  { key: 'lor',             label: 'Letter of Recommendation' },
  { key: 'noc',             label: 'No Objection Certificate' },
];

// Verify page base (public). Cells with an ID link here.
const VERIFY_URL = 'https://tiesverse.com/verify';

const wrap = { padding: '28px 32px', maxWidth: 1200 };
const th = { padding: '10px 12px', textAlign: 'left', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)', borderBottom: '2px solid var(--outline-variant)', whiteSpace: 'nowrap' };
const td = { padding: '12px 12px', borderBottom: '1px solid var(--outline-variant)', fontSize: 13, verticalAlign: 'middle' };

export default function CertificatesMatrix() {
  const [members, setMembers] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    getOnboardingList()
      .then((r) => setMembers((Array.isArray(r) ? r : []).filter((m) => m.status === 'verified')))
      .catch(() => setMembers([]));
  }, []);

  // Offer-letter status lives in localStorage (tv_offers_sent) keyed by email.
  const offerMap = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('tv_offers_sent') || '{}'); } catch { return {}; }
  }, []);

  // For a member + column, return { issued: bool, id: string }.
  const cellFor = (m, key) => {
    const ids = m.certificate_ids || {};
    if (key === 'offer_letter') {
      return { issued: Boolean(offerMap[m.candidate_email] || ids.offer_letter), id: ids.offer_letter || '' };
    }
    const issuedAt = key === 'internship_cert' ? m.cert_internship_issued_at
      : key === 'lor' ? m.cert_lor_issued_at
      : key === 'noc' ? m.cert_noc_issued_at : null;
    return { issued: Boolean(issuedAt || ids[key]), id: ids[key] || '' };
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = members || [];
    if (!s) return list;
    return list.filter((m) => `${m.candidate_name || ''} ${m.candidate_email || ''} ${m.role_offered || ''}`.toLowerCase().includes(s));
  }, [members, q]);

  return (
    <div style={wrap}>
      <div style={{ marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-main)', margin: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
          <Award size={22} style={{ color: 'var(--primary)' }} /> Certificates & Documents
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
          Who has been issued which document. A green tick shows the certificate ID; a red cross means not issued yet.
        </p>
      </div>

      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 360, margin: '16px 0 18px', padding: '8px 12px', borderRadius: 10, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)' }}>
        <Search size={16} style={{ color: 'var(--text-muted)', flex: 'none' }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, email or role…"
          style={{ flex: 1, border: 0, outline: 'none', background: 'transparent', fontSize: 13.5, color: 'var(--text-main)' }}
        />
        {q && <X size={15} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setQ('')} />}
      </div>

      {members === null ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', border: '1px solid var(--outline-variant)', borderRadius: 12, background: 'var(--surface-container-low)' }}>
          {q ? 'No members match your search.' : 'No verified members yet.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--outline-variant)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
            <thead>
              <tr>
                <th style={{ ...th, position: 'sticky', left: 0, background: 'var(--surface)' }}>Person</th>
                {COLUMNS.map((c) => <th key={c.key} style={th}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id}>
                  <td style={{ ...td, position: 'sticky', left: 0, background: 'var(--surface)' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{m.candidate_name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{m.role_offered || m.candidate_email}</div>
                  </td>
                  {COLUMNS.map((c) => {
                    const { issued, id } = cellFor(m, c.key);
                    return (
                      <td key={c.key} style={td}>
                        {issued ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ display: 'grid', placeItems: 'center', width: 20, height: 20, borderRadius: '50%', background: 'color-mix(in srgb,#067a50 14%,transparent)', flex: 'none' }}>
                              <Check size={13} style={{ color: '#067a50' }} />
                            </span>
                            {id ? (
                              <a href={`${VERIFY_URL}?id=${encodeURIComponent(id)}`} target="_blank" rel="noreferrer"
                                 style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', fontFamily: 'ui-monospace, monospace', textDecoration: 'none' }}
                                 title="Open verification page">{id}</a>
                            ) : (
                              <span style={{ fontSize: 12, color: '#067a50', fontWeight: 600 }}>Issued</span>
                            )}
                          </div>
                        ) : (
                          <span style={{ display: 'grid', placeItems: 'center', width: 20, height: 20, borderRadius: '50%', background: 'color-mix(in srgb,#ba1a1a 12%,transparent)' }}>
                            <X size={13} style={{ color: '#ba1a1a' }} />
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
