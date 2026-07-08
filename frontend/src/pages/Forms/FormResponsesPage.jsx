import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Eye, Inbox, X } from 'lucide-react';
import { getFormResponses, exportFormResponsesCsv } from '../../apiClient';
import { isStatic } from './formConfig';
import { useMe } from '../../context/MeContext';

export default function FormResponsesPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { scope } = useMe();

  const [form, setForm] = useState(null);
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getFormResponses(id).catch(() => ({ error: 'Failed' }));
    if (res?.form) { setForm(res.form); setResponses(res.responses || []); }
    else if (res?.error) { /* fall through to empty */ }
    setLoading(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (scope !== 'all') return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Only HR &amp; Advisory can view responses.</div>;
  if (loading) return <div style={{ padding: 40, color: '#9ca3af' }}>Loading…</div>;
  if (!form) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>This form is not available.</div>;

  const fields = (form.schema || []).filter(f => !isStatic(f.type));
  const cell = (r, f) => {
    const v = (r.answers || {})[f.id];
    if (Array.isArray(v)) return v.join(', ');
    return v === undefined || v === null ? '' : String(v);
  };

  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <button style={S.iconBtn} onClick={() => navigate('/hr/forms')}><ArrowLeft size={18} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={S.title}>{form.title}</h1>
          <p style={S.sub}>{responses.length} response{responses.length === 1 ? '' : 's'}</p>
        </div>
        {responses.length > 0 && (
          <button style={S.primary} onClick={() => exportFormResponsesCsv(id, `${form.title || 'form'}-responses.csv`)}>
            <Download size={15} style={{ verticalAlign: -3, marginRight: 6 }} />Export CSV
          </button>
        )}
      </div>

      {responses.length === 0 ? (
        <div style={S.empty}>
          <Inbox size={40} style={{ color: '#cbd0d8', marginBottom: 10 }} />
          <div>No responses yet.</div>
        </div>
      ) : (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Submitted</th>
                <th style={S.th}>Name</th>
                {fields.map(f => <th key={f.id} style={S.th}>{f.label || 'Untitled'}</th>)}
                <th style={S.th}></th>
              </tr>
            </thead>
            <tbody>
              {responses.map(r => (
                <tr key={r.id} style={S.tr}>
                  <td style={S.td}>{r.submitted_at ? new Date(r.submitted_at).toLocaleString() : ''}</td>
                  <td style={S.td}>{r.submitter_name || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                  {fields.map(f => <td key={f.id} style={S.td}>{cell(r, f) || <span style={{ color: '#cbd0d8' }}>—</span>}</td>)}
                  <td style={S.td}>
                    <button style={S.viewBtn} onClick={() => setViewing(r)}><Eye size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewing && (
        <div style={S.overlay} onMouseDown={() => setViewing(null)}>
          <div style={S.modal} onMouseDown={e => e.stopPropagation()}>
            <div style={S.modalHead}>
              <strong style={{ fontSize: 16 }}>Response</strong>
              <button style={S.iconBtn} onClick={() => setViewing(null)}><X size={18} /></button>
            </div>
            <div style={S.metaLine}>
              {viewing.submitted_at ? new Date(viewing.submitted_at).toLocaleString() : ''}
              {viewing.submitter_name ? ` · ${viewing.submitter_name}` : ''}
              {viewing.submitter_email ? ` · ${viewing.submitter_email}` : ''}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
              {fields.map(f => (
                <div key={f.id}>
                  <div style={S.qLabel}>{f.label || 'Untitled'}</div>
                  <div style={S.aVal}>{cell(viewing, f) || <span style={{ color: '#9ca3af' }}>No answer</span>}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  wrap: { padding: 24, maxWidth: 1100, margin: '0 auto' },
  head: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 },
  iconBtn: { border: '1px solid var(--border,#e5e7eb)', background: 'transparent', borderRadius: 9, padding: 7, cursor: 'pointer', color: 'var(--text-main,#374151)', display: 'inline-flex', flex: 'none' },
  title: { fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--text-main,#111827)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  sub: { color: 'var(--text-muted,#6b7280)', fontSize: 13, marginTop: 2 },
  primary: { padding: '9px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(180deg,#ff9a3d,#fe7a00 58%,#ef6f00)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, flex: 'none' },
  empty: { textAlign: 'center', color: 'var(--text-muted,#9ca3af)', padding: 54, background: 'var(--surface,#fff)', borderRadius: 16, border: '1px solid var(--border,#e5e7eb)' },
  tableWrap: { overflowX: 'auto', border: '1px solid var(--border,#e5e7eb)', borderRadius: 14, background: 'var(--surface,#fff)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  th: { textAlign: 'left', padding: '11px 14px', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted,#9ca3af)', borderBottom: '1px solid var(--border,#e5e7eb)', whiteSpace: 'nowrap' },
  tr: { borderBottom: '1px solid var(--border,#f0f1f3)' },
  td: { padding: '11px 14px', color: 'var(--text-main,#374151)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  viewBtn: { border: '1px solid var(--border,#e5e7eb)', background: 'transparent', borderRadius: 8, padding: 6, cursor: 'pointer', color: 'var(--text-main,#374151)', display: 'inline-flex' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(20,12,4,.4)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '8vh 16px', zIndex: 1000 },
  modal: { width: '100%', maxWidth: 560, background: 'var(--surface,#fff)', borderRadius: 18, padding: 22, boxShadow: '0 24px 60px rgba(0,0,0,.25)', maxHeight: '84vh', overflowY: 'auto' },
  modalHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  metaLine: { fontSize: 12.5, color: 'var(--text-muted,#9ca3af)', paddingBottom: 10, borderBottom: '1px solid var(--border,#f0f1f3)' },
  qLabel: { fontSize: 12.5, fontWeight: 700, color: 'var(--text-muted,#6b7280)', marginBottom: 3 },
  aVal: { fontSize: 14.5, color: 'var(--text-main,#111827)', whiteSpace: 'pre-wrap', lineHeight: 1.5 },
};
