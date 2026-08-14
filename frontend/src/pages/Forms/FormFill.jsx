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
 *   initialValues  pre-filled answers, when reopening an existing response
 *   editing        changes the wording: this replaces a response, not adds one
 */
export default function FormFill({ form, submitFn, askIdentity, initialValues, editing }) {
  const [values, setValues] = useState(initialValues || {});
  const [identity, setIdentity] = useState({ submitter_name: '', submitter_email: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [reviewing, setReviewing] = useState(false);   // the check-before-send screen
  const [submitError, setSubmitError] = useState('');
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

  // Pressing submit opens the review first. Nothing is sent until it is
  // confirmed there, so a mistyped answer can still be caught by the person
  // who typed it rather than by whoever reads the responses.
  const requestReview = () => {
    if (!validate()) {
      const first = form.schema.find(f => errors[f.id]);
      if (first) document.getElementById(`fill-${first.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setReviewing(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const confirmSubmit = async () => {
    setSubmitting(true);
    const res = await submitFn(values, identity).catch(() => ({ error: 'Network error.' }));
    setSubmitting(false);
    if (res?.ok) {
      setReviewing(false);
      setDone(editing
        ? 'Your response has been updated.'
        : (res.thank_you || 'Your response has been recorded.'));
    } else {
      // Stay on the review so nothing typed is lost to a failed request.
      setSubmitError(res?.error || 'Could not submit. Please try again.');
    }
  };

  /** A displayable answer for the review list. */
  const shown = (f) => {
    const v = values[f.id];
    if (isBlank(v)) return null;
    if (Array.isArray(v)) return v.join(', ');
    if (f.type === 'rating') return `${v} / ${f.max || 5}`;
    if (f.type === 'file' && typeof v === 'object') return v.filename || 'File attached';
    return String(v);
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
          <div style={{ background: '#fff', borderRadius: 16, padding: '40px 34px', maxWidth: 460, textAlign: 'center', border: '1px solid #e8e8ea', boxShadow: '0 18px 50px -28px rgba(0,0,0,.3)' }}>
            {s.thank_you_emoji ? (
              <div style={{ fontSize: 52, lineHeight: 1, marginBottom: 12 }}>{s.thank_you_emoji}</div>
            ) : (
              <div style={{ width: 46, height: 46, margin: '0 auto 16px', borderRadius: '50%', background: '#0d0d0d', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 22 }}>✓</div>
            )}
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px', color: '#0d0d0d', letterSpacing: '-.01em' }}>{s.thank_you_title || 'Response received'}</h2>
            <p style={{ color: '#52525b', fontSize: 15, lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap' }}>{done}</p>
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

  if (reviewing) {
    const answered = (form.schema || []).filter(f => !isStatic(f.type) && shown(f) !== null);
    const skipped = (form.schema || []).filter(f => !isStatic(f.type) && shown(f) === null);
    return (
      <div style={{ minHeight: '100vh', position: 'relative', fontFamily: fontStack(theme.font) }}>
        <div aria-hidden style={fixedBg} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 680, margin: '0 auto', padding: '40px 16px 60px' }}>
          <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 30px 80px -30px rgba(0,0,0,.45)', borderTop: `6px solid ${theme.accent}`, overflow: 'hidden' }}>
            <div style={{ padding: '26px 28px 6px' }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px', color: '#161616' }}>{editing ? 'Check your changes' : 'Check your details'}</h2>
              <p style={{ fontSize: 14.5, color: '#555', lineHeight: 1.6, margin: 0 }}>
                {editing
                  ? 'Nothing has been saved yet. Read it over, and go back if you want to change anything.'
                  : 'Nothing has been sent yet. Read it over, and go back if you want to change anything.'}
              </p>
            </div>

            <dl style={{ margin: 0, padding: '18px 28px 4px' }}>
              {answered.map(f => (
                <div key={f.id} style={{ padding: '13px 0', borderBottom: '1px solid #eceef1' }}>
                  <dt style={{ fontSize: 12.5, fontWeight: 700, color: '#6b7280', letterSpacing: '.02em', marginBottom: 4 }}>{f.label || 'Question'}</dt>
                  <dd style={{ margin: 0, fontSize: 15.5, color: '#161616', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{shown(f)}</dd>
                </div>
              ))}
              {skipped.length > 0 && (
                <div style={{ padding: '13px 0' }}>
                  <dt style={{ fontSize: 12.5, fontWeight: 700, color: '#6b7280', marginBottom: 4 }}>Left blank</dt>
                  <dd style={{ margin: 0, fontSize: 14, color: '#9aa1ab', lineHeight: 1.55 }}>
                    {skipped.map(f => f.label || 'Untitled').join(' · ')}
                  </dd>
                </div>
              )}
            </dl>

            {submitError && (
              <p style={{ margin: '0 28px 10px', padding: '10px 12px', borderRadius: 10, background: '#fef2f2', color: '#b91c1c', fontSize: 13.5, fontWeight: 600 }}>
                {submitError}
              </p>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '14px 28px 26px' }}>
              <button type="button" onClick={() => { setReviewing(false); setSubmitError(''); }} disabled={submitting}
                style={{ padding: '13px 22px', borderRadius: 12, border: '1px solid #d7d9de', background: '#fff', color: '#161616', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
                Go back and edit
              </button>
              <button type="button" onClick={confirmSubmit} disabled={submitting}
                style={{ flex: 1, minWidth: 180, padding: '13px 24px', borderRadius: 12, border: 'none', background: theme.accent, color: '#fff', fontWeight: 800, fontSize: 15, cursor: submitting ? 'wait' : 'pointer', boxShadow: `0 14px 30px -12px ${theme.accent}` }}>
                {submitting ? 'Saving…' : (editing ? 'Confirm and save changes' : 'Confirm and submit')}
              </button>
            </div>
          </div>
        </div>
        <div style={{ paddingBottom: 18, position: 'relative', zIndex: 1 }}>
          <TiesFooter show={mergeSettings(form.settings).show_footer !== false} />
        </div>
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
        onSubmit={requestReview}
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
