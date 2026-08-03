import { useEffect, useMemo, useState } from 'react';
import { getOnboardingList } from '../../apiClient';
import { listCertificateRecords } from '../Certificates/certificateApi';
import { Search, Check, X, Award, Megaphone, ExternalLink } from 'lucide-react';

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

  // Has this person had ANY document issued (offer / internship / LOR / NOC)?
  const hasAnyDoc = (m) => {
    const ids = m.certificate_ids || {};
    return Boolean(
      ids.offer_letter || ids.internship_cert || ids.lor || ids.noc ||
      m.cert_internship_issued_at || m.cert_lor_issued_at || m.cert_noc_issued_at,
    );
  };

  useEffect(() => {
    getOnboardingList()
      // Show verified members AND anyone (e.g. still-pending candidates) who has
      // already been issued a document, so an offer sent before verification shows.
      .then((r) => setMembers((Array.isArray(r) ? r : []).filter(
        (m) => m.status === 'verified' || hasAnyDoc(m))))
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

      <CampaignIssued members={members} />
    </div>
  );
}

/* ── Issued from Mail Automation ──────────────────────────────────────────────
   Certificates sent as email campaigns are real issued documents — recorded on
   the verify page. A MEMBER's certificate already lives in the matrix above
   (their cell is ticked with the ID), so this section lists only what the
   matrix cannot show: recipients who are not members, and members issued a
   custom document type the matrix has no column for. */
function CampaignIssued({ members }) {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    listCertificateRecords({ source_type: 'campaign' })
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  const memberEmails = useMemo(() => new Set(
    (members || []).map((m) => (m.candidate_email || '').trim().toLowerCase()).filter(Boolean),
  ), [members]);
  const matrixLabels = useMemo(() => new Set(COLUMNS.map((c) => c.label.toLowerCase())), []);

  const visible = useMemo(() => (rows || []).filter((r) =>
    !memberEmails.has((r.person_email || '').trim().toLowerCase())
    // A member's custom-type document has no matrix column — keep it here,
    // or it would appear in no view at all.
    || !matrixLabels.has((r.subject_title || '').trim().toLowerCase()),
  ), [rows, memberEmails, matrixLabels]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return visible;
    return visible.filter((r) =>
      `${r.certificate_id} ${r.person_name} ${r.person_email} ${r.subject_title} ${(r.data || {}).position || ''}`
        .toLowerCase().includes(s));
  }, [visible, q]);

  const fmtDate = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '—'
      : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div style={{ marginTop: 36 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-main)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Megaphone size={18} style={{ color: 'var(--primary)' }} /> Issued from Mail Automation
        </h2>
        {visible.length > 0 && (
          <span style={{ fontSize: 11.5, fontWeight: 800, padding: '2px 9px', borderRadius: 20, background: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--primary)' }}>
            {visible.length}
          </span>
        )}
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 12.5, marginTop: 4 }}>
        Only what the matrix above cannot show: recipients outside the member list, and custom
        document types without a matrix column. A member's certificate appears as the tick in
        their row above. Each ID opens its public verification page.
      </p>

      {visible.length > 4 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 360, margin: '12px 0', padding: '7px 12px', borderRadius: 10, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)' }}>
          <Search size={15} style={{ color: 'var(--text-muted)', flex: 'none' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search ID, name, email, document…"
            style={{ flex: 1, border: 0, outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--text-main)' }} />
          {q && <X size={14} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setQ('')} />}
        </div>
      )}

      {rows === null ? (
        <p style={{ color: 'var(--text-muted)', marginTop: 12 }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <div style={{ marginTop: 12, padding: 30, textAlign: 'center', color: 'var(--text-muted)', border: '1px solid var(--outline-variant)', borderRadius: 12, background: 'var(--surface-container-low)', fontSize: 13 }}>
          {q ? 'Nothing matches that.'
            : (rows || []).length ? 'All campaign certificates so far went to members — see their rows in the matrix above.'
            : 'None yet — send one from Mail Automation with “Issue as verifiable certificates” on.'}
        </div>
      ) : (
        <div style={{ marginTop: 12, overflowX: 'auto', border: '1px solid var(--outline-variant)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
            <thead>
              <tr>
                <th style={th}>Certificate ID</th>
                <th style={th}>Recipient</th>
                <th style={th}>Document</th>
                <th style={th}>Position</th>
                <th style={th}>Template</th>
                <th style={th}>Issued</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td style={td}>
                    <a href={`${VERIFY_URL}?id=${encodeURIComponent(r.certificate_id)}`} target="_blank" rel="noreferrer"
                       style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: 'var(--primary)', fontFamily: 'ui-monospace, monospace', textDecoration: 'none' }}
                       title="Open verification page">
                      {r.certificate_id} <ExternalLink size={11} />
                    </a>
                  </td>
                  <td style={td}>
                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{r.person_name || '—'}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{r.person_email || ''}</div>
                  </td>
                  <td style={td}>{r.subject_title || '—'}</td>
                  <td style={{ ...td, color: (r.data || {}).position ? 'var(--text-main)' : 'var(--text-muted)' }}>
                    {(r.data || {}).position || '—'}
                  </td>
                  <td style={{ ...td, color: 'var(--text-muted)' }}>{r.template_name || '—'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{fmtDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
