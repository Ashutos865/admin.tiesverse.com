import { useState, useEffect, useMemo } from 'react';
import { X, FileText, Loader2, CheckCircle, Wand2, Hash, Mail } from 'lucide-react';
import { sendCertificateEmail, getEmailTemplates } from '../../apiClient';
import { listCertificateTemplates, getCertificateTemplate } from '../Certificates/certificateApi';
import { variableNamesFromElements } from '../Certificates/certificateUtils';

// Extract the {{tokens}} an email template uses (from its subject + body).
const emailTokens = (t) => {
  const src = `${t?.subject || ''} ${t?.body_html || ''}`;
  const names = new Set();
  for (const m of src.matchAll(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi)) names.add(m[1].toLowerCase());
  return [...names];
};
// Tokens the backend always fills itself — no need to ask the user for these.
const AUTO_EMAIL_TOKENS = new Set(['name', 'document', 'issued_by', 'portal_url', 'subject_title', 'certificate_id', 'role', 'department']);

// The variables a template actually PLACES on the page and expects filled — the
// non-generator ones (generator_enabled vars are produced automatically and give
// the certificate its ID). Mirrors MailAutomation's usableCertVars.
const placedNonGenVars = (t) => {
  const used = new Set(variableNamesFromElements(t?.text_elements || []));
  const nonGen = (t?.variables || []).filter((v) => !v.generator_enabled);
  const placed = nonGen.filter((v) => used.has(String(v.name).toLowerCase()));
  return placed.length ? placed : nonGen;
};
const generatorVars = (t) => (t?.variables || []).filter((v) => v.generator_enabled);

const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Generate a certificate/letter/offer letter for a member from a template and
 * send it by email. Variables auto-fill from the member (name, department, role,
 * dates); you edit only what's missing. The BACKEND does the actual generation
 * (stamps values reliably + captures the auto-generated certificate ID), so the
 * PDF is always correct. Pick which email carries it, and — if the template has
 * more than one auto-generation field — which one is the certificate ID.
 *
 * Props: member, docLabel, certKey, onClose, onSent
 */
export default function GenerateCertModal({ member, docLabel = 'Certificate', certKey = '', onClose, onSent }) {
  const [templates, setTemplates] = useState(null);
  const [templateId, setTemplateId] = useState('');
  const [template, setTemplate] = useState(null);
  const [loadingTpl, setLoadingTpl] = useState(false);
  const [values, setValues] = useState({});

  const [emailTemplates, setEmailTemplates] = useState([]);
  const [emailTemplateKey, setEmailTemplateKey] = useState('certificate_issue');
  const [emailValues, setEmailValues] = useState({});   // extra email tokens the sender fills

  const [idVar, setIdVar] = useState('');            // chosen auto-gen ID field (when >1)
  const [manualPdf, setManualPdf] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

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
      .then((list) => { if (alive) setTemplates(Array.isArray(list) ? list : (list?.templates || [])); })
      .catch(() => { if (alive) setTemplates([]); });
    getEmailTemplates()
      .then((list) => {
        if (!alive) return;
        const arr = Array.isArray(list) ? list : [];
        setEmailTemplates(arr);
        const def = arr.find((t) => t.key === 'certificate_issue') || arr[0];
        if (def) setEmailTemplateKey(def.key);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Load the chosen certificate template + auto-fill its variables from the member.
  useEffect(() => {
    if (!templateId) { setTemplate(null); setValues({}); setIdVar(''); return; }
    let alive = true;
    setLoadingTpl(true);
    getCertificateTemplate(templateId)
      .then((t) => {
        if (!alive) return;
        setTemplate(t);
        const vars = placedNonGenVars(t);
        const auto = {};
        vars.forEach((v) => {
          const key = Object.keys(memberSources).find((s) => norm(s) === norm(v.name));
          auto[v.name] = (key ? memberSources[key] : '') || (v.default_value || '');
        });
        setValues(auto);
        const gens = generatorVars(t);
        setIdVar(gens.length ? gens[0].name : '');
      })
      .catch(() => { if (alive) { setTemplate(null); setValues({}); setIdVar(''); } })
      .finally(() => { if (alive) setLoadingTpl(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const vars = useMemo(() => placedNonGenVars(template), [template]);
  const gens = useMemo(() => generatorVars(template), [template]);
  const missing = vars.filter((v) => !String(values[v.name] || '').trim());

  // The email template's {{tokens}} that AREN'T auto-filled by the backend —
  // these are the ones the sender may need to fill (e.g. a custom {{message}}).
  const selectedEmail = useMemo(() => emailTemplates.find((t) => t.key === emailTemplateKey), [emailTemplates, emailTemplateKey]);
  const emailVars = useMemo(
    () => emailTokens(selectedEmail).filter((tok) => !AUTO_EMAIL_TOKENS.has(tok)),
    [selectedEmail]);
  // Seed email values from the member where a token name matches a known field.
  useEffect(() => {
    setEmailValues((prev) => {
      const next = { ...prev };
      emailVars.forEach((tok) => {
        if (next[tok] == null) {
          const key = Object.keys(memberSources).find((s) => norm(s) === norm(tok));
          next[tok] = key ? memberSources[key] : '';
        }
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailVars]);

  const onPickPdf = (file) => {
    const r = new FileReader();
    r.onload = () => setManualPdf({ base64: String(r.result).split(',')[1] || '', name: file.name });
    r.readAsDataURL(file);
  };

  const doSend = async () => {
    setBusy(true); setResult(null);
    try {
      const payload = {
        template_key: emailTemplateKey, cert_key: certKey,
        filename: `${docLabel} - ${member.candidate_name || 'member'}.pdf`,
        email_values: emailValues,
      };
      if (manualPdf) {
        payload.pdf_base64 = manualPdf.base64;
        payload.filename = manualPdf.name;
      } else if (template) {
        // Backend generates the PDF (reliable stamping) + captures the cert ID.
        payload.certificate = {
          template_id: templateId,
          values: Object.fromEntries(vars.map((v) => [v.name, values[v.name] || ''])),
          id_var: idVar || undefined,
        };
      } else {
        setResult({ ok: false, msg: 'Pick a template or attach a PDF first.' });
        setBusy(false);
        return;
      }
      const res = await sendCertificateEmail(member.id, payload);
      if (res?.sent) {
        setResult({ ok: true, msg: `Sent to ${res.to}${res.certificate_id ? ` · ID ${res.certificate_id}` : ''}` });
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
          {/* Certificate template */}
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

          {/* Email template (which email carries the certificate) */}
          <div>
            <Lbl>Email template</Lbl>
            <select value={emailTemplateKey} onChange={(e) => setEmailTemplateKey(e.target.value)} style={{ ...F, cursor: 'pointer' }}>
              {emailTemplates.length === 0 && <option value="certificate_issue">Certificate issue (default)</option>}
              {emailTemplates.map((t) => <option key={t.id} value={t.key}>{t.name}{t.is_custom ? ' (custom)' : ''}</option>)}
            </select>
            {selectedEmail?.subject && (
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>
                <b style={{ color: 'var(--text-main)' }}>Subject:</b> {selectedEmail.subject}
              </div>
            )}
          </div>

          {/* Email variables the sender may need to fill (member name/dept/etc are
              filled automatically by the server; only the rest show here). */}
          {emailVars.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Mail size={13} style={{ color: 'var(--primary)' }} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Email fields — auto-filled where known, edit as needed.</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {emailVars.map((tok) => (
                  <div key={tok}>
                    <Lbl>{tok.replace(/_/g, ' ')}</Lbl>
                    <input value={emailValues[tok] || ''} onChange={(e) => setEmailValues((p) => ({ ...p, [tok]: e.target.value }))} placeholder={tok} style={F} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Auto-gen ID picker — only when the template has MORE THAN ONE generator field */}
          {gens.length > 1 && (
            <div>
              <Lbl><Hash size={11} style={{ verticalAlign: -1, marginRight: 3 }} />Certificate ID field</Lbl>
              <select value={idVar} onChange={(e) => setIdVar(e.target.value)} style={{ ...F, cursor: 'pointer' }}>
                {gens.map((v) => <option key={v.name} value={v.name}>{v.name}{v.generator_pattern ? ` (${v.generator_pattern})` : ''}</option>)}
              </select>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>This template has {gens.length} auto-generated fields — choose which one is the certificate’s ID.</div>
            </div>
          )}
          {gens.length === 1 && (
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Hash size={12} style={{ color: 'var(--primary)' }} /> Certificate ID auto-generated from <b style={{ color: 'var(--text-main)' }}>{gens[0].name}</b>.
            </div>
          )}

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
                      <input value={values[v.name] || ''} onChange={(e) => setValues((p) => ({ ...p, [v.name]: e.target.value }))} placeholder={v.default_value || v.name} style={{ ...F, borderColor: empty ? '#f59e0b' : 'var(--outline-variant)' }} />
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
          <button onClick={doSend} disabled={busy || (!template && !manualPdf) || !member.candidate_email} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: (busy || (!template && !manualPdf)) ? 'not-allowed' : 'pointer', opacity: (busy || (!template && !manualPdf) || !member.candidate_email) ? 0.6 : 1 }}>
            {busy ? <Loader2 size={14} className="ma-spin" /> : <FileText size={14} />} {busy ? 'Generating & sending…' : `Send ${docLabel}`}
          </button>
        </div>
      </div>
    </div>
  );
}
