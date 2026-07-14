import { useState } from 'react';
import FormRenderer, { TiesFooter } from './FormRenderer';
import { mergeTheme, mergeSettings, fontStack, isStatic } from './formConfig';

/**
 * Shared fill experience. Manages answer state, required-field validation,
 * submission and the thank-you screen. Used by both the internal (logged-in)
 * and public (token) fill pages.
 *
 * Props:
 *   form      the form to render (title, description, schema, theme)
 *   submitFn  (answers, identity) => Promise<{ok, thank_you, error, missing}>
 *   askIdentity  when true, collect name + email before the questions (public)
 */
export default function FormFill({ form, submitFn, askIdentity }) {
  const [values, setValues] = useState({});
  const [identity, setIdentity] = useState({ submitter_name: '', submitter_email: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);   // thank-you message once submitted

  const onChange = (fid, v) => {
    setValues(s => ({ ...s, [fid]: v }));
    if (errors[fid]) setErrors(e => ({ ...e, [fid]: false }));
  };

  const isBlank = (v) => v === undefined || v === '' || v === null || (Array.isArray(v) && v.length === 0);

  const validate = () => {
    const errs = {};
    for (const f of (form.schema || [])) {
      if (isStatic(f.type) || !f.required) continue;
      if (isBlank(values[f.id])) errs[f.id] = true;
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Validate only the fields on the current page before advancing (Next).
  const validatePage = (fieldIds) => {
    const errs = { ...errors };
    let ok = true;
    for (const f of (form.schema || [])) {
      if (!fieldIds.includes(f.id) || isStatic(f.type) || !f.required) continue;
      if (isBlank(values[f.id])) { errs[f.id] = true; ok = false; }
      else delete errs[f.id];
    }
    setErrors(errs);
    if (!ok) {
      const first = (form.schema || []).find(f => fieldIds.includes(f.id) && errs[f.id]);
      if (first) setTimeout(() => document.getElementById(`fill-${first.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 30);
    }
    return ok;
  };

  const submit = async () => {
    if (!validate()) {
      // scroll to first error
      const first = form.schema.find(f => errors[f.id]);
      if (first) document.getElementById(`fill-${first.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSubmitting(true);
    const res = await submitFn(values, identity).catch(() => ({ error: 'Network error.' }));
    setSubmitting(false);
    if (res?.ok) setDone(res.thank_you || 'Thanks — your response has been recorded.');
    else alert(res?.error || 'Could not submit. Please try again.');
  };

  const theme = mergeTheme(form.theme);
  const bg = theme.bg_type === 'image' && theme.bg_image
    ? { backgroundImage: `url(${theme.bg_image})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : theme.bg_type === 'gradient' ? { background: theme.bg_gradient } : { background: theme.bg_color };
  // The background sits on a fixed, full-viewport layer so it stays put while the
  // questions scroll over it (an uploaded picture no longer scrolls with content).
  const fixedBg = { position: 'fixed', inset: 0, zIndex: 0, ...bg };

  if (done) {
    const s = mergeSettings(form.settings);
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: fontStack(theme.font), position: 'relative' }}>
        <div aria-hidden style={fixedBg} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, position: 'relative', zIndex: 1 }}>
          <div style={{ background: '#fff', borderRadius: 24, padding: '44px 36px', maxWidth: 480, textAlign: 'center', boxShadow: '0 30px 80px -30px rgba(0,0,0,.45)', borderTop: `6px solid ${theme.accent}` }}>
            <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 10 }}>{s.thank_you_emoji || '🎉'}</div>
            <h2 style={{ fontSize: 25, fontWeight: 800, margin: '0 0 10px', color: '#161616' }}>{s.thank_you_title || 'All done!'}</h2>
            <p style={{ color: '#555', fontSize: 15.5, lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap' }}>{done}</p>
            {s.thank_you_button_text && s.thank_you_button_url ? (
              <a href={s.thank_you_button_url} target="_blank" rel="noreferrer"
                style={{ display: 'inline-block', marginTop: 24, background: theme.accent, color: '#fff', padding: '13px 28px', borderRadius: 12, fontWeight: 700, fontSize: 15, textDecoration: 'none', boxShadow: `0 14px 30px -12px ${theme.accent}` }}>
                {s.thank_you_button_text}
              </a>
            ) : null}
          </div>
        </div>
        <div style={{ paddingBottom: 18, position: 'relative', zIndex: 1 }}><TiesFooter show={s.show_footer !== false} /></div>
      </div>
    );
  }

  return (
    // Background is painted ONCE here on the outer wrapper so it stays a single,
    // continuous image. The identity block and FormRenderer below are transparent.
    <div style={{ minHeight: '100vh', position: 'relative' }}>
      <div aria-hidden style={fixedBg} />
      <div style={{ position: 'relative', zIndex: 1 }}>
      {askIdentity && (
        <div style={{ paddingTop: 40, fontFamily: fontStack(theme.font) }}>
          <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 16px' }}>
            <div style={{ background: 'rgba(255,255,255,.92)', border: '1px solid rgba(0,0,0,.06)', borderRadius: 16, padding: 18, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label style={idLbl}>Your name
                <input style={idInput} value={identity.submitter_name} onChange={e => setIdentity(i => ({ ...i, submitter_name: e.target.value }))} placeholder="Full name" />
              </label>
              <label style={idLbl}>Your email
                <input type="email" style={idInput} value={identity.submitter_email} onChange={e => setIdentity(i => ({ ...i, submitter_email: e.target.value }))} placeholder="name@example.com" />
              </label>
            </div>
          </div>
        </div>
      )}
      <FormRenderer
        form={form}
        values={values}
        onChange={onChange}
        onSubmit={submit}
        onValidatePage={validatePage}
        submitting={submitting}
        errors={errors}
        embedded
      />
      </div>
    </div>
  );
}

const idLbl = { flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600, color: '#444' };
const idInput = { padding: '10px 12px', border: '1px solid #d7d9de', borderRadius: 10, fontSize: 15, outline: 'none' };
