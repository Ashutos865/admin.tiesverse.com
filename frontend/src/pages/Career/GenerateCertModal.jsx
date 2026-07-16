import { useState, useEffect, useMemo, useRef } from 'react';
import { X, FileText, Loader2, CheckCircle, Wand2, Download } from 'lucide-react';
import { sendCertificateEmail } from '../../apiClient';
import { listCertificateTemplates, getCertificateTemplate, generateCertificate } from '../Certificates/certificateApi';
import { variableNamesFromElements } from '../Certificates/certificateUtils';

// The variables a template actually PLACES on the page (the ones worth filling),
// mirroring MailAutomation's usableCertVars so behaviour is consistent.
const usableVars = (t) => {
  const used = new Set(variableNamesFromElements(t?.text_elements || []));
  const nonGen = (t?.variables || []).filter((v) => !v.generator_enabled);
  const placed = nonGen.filter((v) => used.has(String(v.name).toLowerCase()));
  return placed.length ? placed : nonGen;
};

const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// A blob → base64 (no data: prefix), for the send endpoint.
const blobToB64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] || '');
  r.onerror = reject;
  r.readAsDataURL(blob);
});

/**
 * Generate a certificate/letter/offer-letter for a member from a template and
 * send it by email. The template's variables auto-fill from the member's known
 * fields (name, email, department, role, joining date); you only edit whatever
 * couldn't be matched. A manual PDF upload is kept as a fallback.
 *
 * Props:
 *   member    : { id, candidate_name, candidate_email, assigned_departments, role_offered, member_type, joining_date, verified_at }
 *   docLabel  : e.g. "Offer Letter" / "Internship Certificate"
 *   certKey   : the backend cert_key ('internship_cert'|'lor'|'noc'|'offer_letter'|'') — passed through to the send endpoint
 *   templateKey : email template key hint (default 'certificate_issue')
 *   onClose, onSent
 */
export default function GenerateCertModal({ member, docLabel = 'Certificate', certKey = '', onClose, onSent }) {
  const [templates, setTemplates] = useState(null);   // null = loading
  const [templateId, setTemplateId] = useState('');
  const [template, setTemplate] = useState(null);
  const [loadingTpl, setLoadingTpl] = useState(false);
  const [values, setValues] = useState({});           // { varName: value }
  const [manualPdf, setManualPdf] = useState(null);    // { base64, name } fallback
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const restore = useRef(false);

  // The member fields available to auto-fill from.
  const memberSources = useMemo(() => ({
    name: member.candidate_name || '',
    full_name: member.candidate_name || '',
    email: member.candidate_email || '',
    department: (member.assigned_departments || []).join(', '),
    role: member.role_offered || '',
    position: member.role_offered || '',
    member_type: member.member_type || '',
    date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
    joining_date: member.joining_date
      ? new Date(member.joining_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
      : '',
  }), [member]);

  useEffect(() => {
    let alive = true;
    listCertificateTemplates()
      .then((list) => {
        if (!alive) return;
        const arr = Array.isArray(list) ? list : (list?.templates || []);
        setTemplates(arr);
      })
      .catch(() => { if (alive) setTemplates([]); });
    return () => { alive = false; };
  }, []);

  // Load the chosen template + auto-fill its variables from the member.
  useEffect(() => {
    if (!templateId) { setTemplate(null); setValues({}); return; }
    let alive = true;
    setLoadingTpl(true);
    getCertificateTemplate(templateId)
      .then((t) => {
        if (!alive) return;
        setTemplate(t);
        const vars = usableVars(t);
        const auto = {};
        vars.forEach((v) => {
          // match the variable name to a member source field by normalized name
          const key = Object.keys(memberSources).find((s) => norm(s) === norm(v.name));
          const fromMember = key ? memberSources[key] : '';
          auto[v.name] = fromMember || (v.default_value || '');
        });
        setValues(auto);
      })
      .catch(() => { if (alive) { setTemplate(null); setValues({}); } })
      .finally(() => { if (alive) setLoadingTpl(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const vars = useMemo(() => usableVars(template), [template]);
  const missing = vars.filter((v) => !String(values[v.name] || '').trim());

  // Build the generator data dict (every declared variable needs a non-empty value).
  const buildData = () => {
    const ZW = String.fromCharCode(0x200B);
    const data = {};
    (template?.variables || []).forEach((v) => {
      let val = String(values[v.name] ?? '');
      if (val.trim() === '') {
        const def = v.default_value == null ? '' : String(v.default_value);
        val = def.trim() !== '' ? def : ZW;
      }
      data[String(v.name).toLowerCase()] = val;
    });
    return data;
  };

  const onPickPdf = (file) => {
    const r = new FileReader();
    r.onload = () => setManualPdf({ base64: String(r.result).split(',')[1] || '', name: file.name });
    r.readAsDataURL(file);
  };

  // Generate the PDF (from template) and download it, without sending.
  const doGenerateOnly = async () => {
    if (!template) return;
    setBusy(true); setResult(null);
    try {
      const { blob } = await generateCertificate(templateId, buildData());
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${docLabel} - ${member.candidate_name || 'member'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setResult({ ok: true, msg: 'Generated & downloaded.' });
    } catch (e) {
      setResult({ ok: false, msg: e?.message || 'Could not generate the PDF.' });
    }
    setBusy(false);
  };

  const doSend = async () => {
    setBusy(true); setResult(null);
    try {
      let pdf_base64 = '';
      let filename = `${docLabel}.pdf`;
      if (manualPdf) {
        pdf_base64 = manualPdf.base64;
        filename = manualPdf.name;
      } else if (template) {
        const { blob } = await generateCertificate(templateId, buildData());
        pdf_base64 = await blobToB64(blob);
        filename = `${docLabel} - ${member.candidate_name || 'member'}.pdf`;
      } else {
        setResult({ ok: false, msg: 'Pick a template or attach a PDF first.' });
        setBusy(false);
        return;
      }
      const res = await sendCertificateEmail(member.id, {
        template_key: 'certificate_issue',
        cert_key: certKey,
        pdf_base64,
        filename,
      });
      if (res?.sent) {
        setResult({ ok: true, msg: `Sent to ${res.to}` });
        onSent && onSent(res);
      } else if (res && 'sent' in res) {
        setResult({ ok: false, msg: 'Not sent — check the address or SES sender.' });
      } else {
        setResult({ ok: false, msg: res?.error || 'Send failed.' });
      }
    } catch (e) {
      setResult({ ok: false, msg: e?.message || 'Send failed.' });
    }
    setBusy(false);
  };

  const F = { width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)', color: 'var(--text-main)', fontSize: 13.5, fontFamily: 'inherit', boxSizing: 'border-box' };
  const Lbl = ({ children }) => <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', marginBottom: 5 }}>{children}</div>;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 10300, background: 'rgba(15,20,25,0.72)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 620, background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)', borderRadius: 16, boxShadow: '0 32px 80px rgba(0,0,0,0.28)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid var(--outline-variant)' }}>
          <div>
            <strong style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>Generate & send {docLabel}</strong>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>To {member.candidate_name} · {member.candidate_email || 'no email'}</p>
          </div>
          <button onClick={onClose} style={{ background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', color: 'var(--text-muted)', cursor: 'pointer', borderRadius: 8, width: 32, height: 32, display: 'grid', placeItems: 'center' }}><X size={14} /></button>
        </div>

        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Template dropdown */}
          <div>
            <Lbl>Certificate template</Lbl>
            {templates === null ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', gap: 6, alignItems: 'center' }}><Loader2 size={14} className="ma-spin" /> Loading templates…</div>
            ) : templates.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>No certificate templates found. Create one in the Certificates section, or attach a PDF below.</div>
            ) : (
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} style={{ ...F, cursor: 'pointer' }}>
                <option value="">— Select a template —</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
          </div>

          {/* Auto-filled variables */}
          {loadingTpl ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', gap: 6, alignItems: 'center' }}><Loader2 size={14} className="ma-spin" /> Loading fields…</div>
          ) : template && vars.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Wand2 size={13} style={{ color: 'var(--primary)' }} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Auto-filled from this member. {missing.length ? <b style={{ color: '#b45309' }}>{missing.length} field{missing.length === 1 ? '' : 's'} need attention.</b> : 'All fields ready.'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {vars.map((v) => {
                  const empty = !String(values[v.name] || '').trim();
                  return (
                    <div key={v.name}>
                      <Lbl>{v.name}{empty ? ' *' : ''}</Lbl>
                      <input
                        value={values[v.name] || ''}
                        onChange={(e) => setValues((p) => ({ ...p, [v.name]: e.target.value }))}
                        placeholder={v.default_value || v.name}
                        style={{ ...F, borderColor: empty ? '#f59e0b' : 'var(--outline-variant)' }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Manual PDF fallback */}
          <div>
            <Lbl>…or attach a PDF instead</Lbl>
            {manualPdf ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-main)' }}>
                <FileText size={15} style={{ color: 'var(--primary)' }} /> {manualPdf.name}
                <button onClick={() => setManualPdf(null)} style={{ background: 'none', border: 'none', color: '#ba1a1a', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>Remove</button>
              </div>
            ) : (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--outline-variant)', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>
                <FileText size={14} /> Attach a PDF
                <input type="file" accept="application/pdf,.pdf" hidden onChange={(e) => e.target.files[0] && onPickPdf(e.target.files[0])} />
              </label>
            )}
          </div>

          {result && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: result.ok ? '#067a50' : '#ba1a1a', background: result.ok ? 'color-mix(in srgb,#067a50 8%,transparent)' : 'color-mix(in srgb,#ba1a1a 8%,transparent)', border: `1px solid ${result.ok ? 'color-mix(in srgb,#067a50 22%,transparent)' : 'color-mix(in srgb,#ba1a1a 22%,transparent)'}`, borderRadius: 9, padding: '9px 12px' }}>
              {result.ok ? <CheckCircle size={15} /> : <X size={15} />} {result.msg}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 22px', borderTop: '1px solid var(--outline-variant)' }}>
          <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 9, border: '1px solid var(--outline-variant)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          {template && !manualPdf && (
            <button onClick={doGenerateOnly} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)', color: 'var(--text-main)', fontSize: 13, fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }}>
              <Download size={14} /> Preview PDF
            </button>
          )}
          <button onClick={doSend} disabled={busy || (!template && !manualPdf) || !member.candidate_email} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: (busy || (!template && !manualPdf)) ? 'not-allowed' : 'pointer', opacity: (busy || (!template && !manualPdf)) ? 0.6 : 1 }}>
            {busy ? <Loader2 size={14} className="ma-spin" /> : <FileText size={14} />} {busy ? 'Working…' : `Send ${docLabel}`}
          </button>
        </div>
      </div>
    </div>
  );
}
