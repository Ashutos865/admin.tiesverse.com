import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { publicSignup, verifySignupOtp } from '../../apiClient';
import ImageCropper from '../../components/ImageCropper.jsx';

const OTP_LEN = 6;
const RESEND_SECS = 45;

const maskEmail = (e) => {
  const [u, d] = (e || '').split('@');
  if (!u || !d) return e || '';
  const head = u.slice(0, 2);
  const tail = u.length > 4 ? u.slice(-2) : '';
  return `${head}${'*'.repeat(Math.max(3, u.length - 4))}${tail}@${d}`;
};

// Segmented OTP: auto-advance, backspace-back, full paste, numeric keypad.
function OtpBoxes({ value, onChange }) {
  const refs = useRef([]);
  const setAt = (i, v) => {
    const d = (value + ' '.repeat(OTP_LEN)).slice(0, OTP_LEN).split('');
    d[i] = v;
    const next = d.join('').replace(/\s/g, '');
    onChange(next.slice(0, OTP_LEN));
    if (v && i < OTP_LEN - 1) refs.current[i + 1]?.focus();
  };
  const onKey = (i, e) => {
    if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus();
  };
  const onPaste = (e) => {
    const t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, OTP_LEN);
    if (!t) return;
    e.preventDefault();
    onChange(t);
    refs.current[Math.min(t.length, OTP_LEN - 1)]?.focus();
  };
  return (
    <div style={S.otpRow} onPaste={onPaste}>
      {Array.from({ length: OTP_LEN }).map((_, i) => (
        <input
          key={i} ref={el => (refs.current[i] = el)} value={value[i] || ''}
          onChange={e => setAt(i, e.target.value.replace(/\D/g, '').slice(-1))}
          onKeyDown={e => onKey(i, e)} inputMode="numeric" maxLength={1}
          style={{ ...S.otpCell, ...(value[i] ? S.otpCellOn : {}) }} aria-label={`Digit ${i + 1}`}
        />
      ))}
    </div>
  );
}

export default function PublicSignup() {
  const { hash } = useParams();
  const [step, setStep] = useState('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [cropFile, setCropFile] = useState(null);   // raw file awaiting crop
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [left, setLeft] = useState(0);
  const fileRef = useRef();

  useEffect(() => {
    if (left <= 0) return;
    const t = setInterval(() => setLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [left]);

  const pickPhoto = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setCropFile(f);        // open the cropper first
    e.target.value = '';
  };
  const onCropped = (croppedFile) => {
    setPhoto(croppedFile);
    setPreview(URL.createObjectURL(croppedFile));
    setCropFile(null);
  };

  const sendCode = useCallback(async () => {
    const fd = new FormData();
    fd.append('name', name.trim());
    fd.append('email', email.trim());
    if (photo) fd.append('photo', photo);
    return publicSignup(hash, fd).catch(() => ({ error: 'Network error.' }));
  }, [hash, name, email, photo]);

  const submit = async () => {
    if (!name.trim() || !email.trim()) return setErr('Name and email are required.');
    setBusy(true); setErr('');
    const res = await sendCode();
    setBusy(false);
    if (res?.status === 'otp_sent') { setStep('otp'); setOtp(''); setLeft(RESEND_SECS); }
    else setErr(res?.error || 'Could not submit. Please try again.');
  };

  const resend = async () => {
    if (left > 0) return;
    setBusy(true); setErr('');
    const res = await sendCode();
    setBusy(false);
    if (res?.status === 'otp_sent') { setOtp(''); setLeft(RESEND_SECS); }
    else setErr(res?.error || 'Could not resend.');
  };

  const verify = async () => {
    if (otp.length < OTP_LEN) return setErr(`Enter the ${OTP_LEN}-digit code.`);
    setBusy(true); setErr('');
    const res = await verifySignupOtp(hash, email.trim(), otp).catch(() => ({ error: 'Network error.' }));
    setBusy(false);
    if (res?.status === 'verified') setStep('done');
    else setErr(res?.error || 'Incorrect or expired code.');
  };

  return (
    <div style={S.page}>
      <div style={S.shell}>
        <div style={S.hero}>
          <div style={S.sheen} />
          <div style={S.wm}>.ties</div>
          <h1 style={S.display}>Join the<br />movement.</h1>
          <p style={S.heroSub}>Research, Media &amp; Technology — built by the youth, for Bharat.</p>
        </div>

        <div style={S.body}>
          {step === 'form' && (
            <>
              <h2 style={S.h2}>Create your profile</h2>
              <p style={S.sub}>Add your details. We'll email you a code to verify.</p>
              <div style={S.photoRow}>
                <div style={S.avatar} onClick={() => fileRef.current?.click()}>
                  {preview ? <img src={preview} alt="" style={S.avatarImg} /> : <span style={S.plus}>+</span>}
                </div>
                <div>
                  <button style={S.ghost} onClick={() => fileRef.current?.click()}>Upload photo</button>
                  <p style={S.hint}>PNG / JPG — stored as WebP</p>
                </div>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickPhoto} />
              </div>
              <label style={S.lbl}>Full name
                <input style={S.input} value={name} onChange={e => { setName(e.target.value); setErr(''); }} placeholder="Your name" />
              </label>
              <label style={S.lbl}>Email
                <input style={S.input} type="email" value={email} onChange={e => { setEmail(e.target.value); setErr(''); }} placeholder="you@example.com" />
              </label>
              {err && <p style={S.err}>{err}</p>}
              <button style={S.cta} onClick={submit} disabled={busy}>{busy ? 'Sending code…' : 'Continue'}</button>
            </>
          )}

          {step === 'otp' && (
            <>
              <h2 style={S.h2}>Enter verification code</h2>
              <p style={S.sub}>Enter the {OTP_LEN}-digit code sent to your mail</p>
              <div style={S.emailChip}>{maskEmail(email)}</div>
              <p style={S.helper}>Enter the verification code sent to your email address. If you can't find it, try checking your spam folder.</p>
              <OtpBoxes value={otp} onChange={v => { setOtp(v); setErr(''); }} />
              <div style={S.timerRow}>
                <span style={S.timer}>{left > 0 ? `0:${String(left).padStart(2, '0')}` : '0:00'}</span>
                <span style={S.resendWrap}>
                  Didn't get a code?{' '}
                  <button style={{ ...S.resend, ...(left > 0 ? S.resendOff : {}) }} onClick={resend} disabled={left > 0 || busy}>Resend</button>
                </span>
              </div>
              {err && <p style={S.err}>{err}</p>}
              <button style={S.cta} onClick={verify} disabled={busy}>{busy ? 'Verifying…' : 'Continue'}</button>
              <button style={S.back} onClick={() => { setStep('form'); setErr(''); }}>← Change details</button>
            </>
          )}

          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={S.check}>✓</div>
              <h2 style={S.h2}>You're on the list</h2>
              <p style={S.sub}>Email verified. HR will review your request and set up your access — you'll get login details by email once approved.</p>
            </div>
          )}
        </div>
      </div>
      {cropFile && <ImageCropper file={cropFile} onCancel={() => setCropFile(null)} onCrop={onCropped} />}
    </div>
  );
}

const S = {
  page: { minHeight: '100vh', background: '#0A0A0B', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, boxSizing: 'border-box', overflowX: 'hidden' },
  shell: { width: '100%', maxWidth: 440, boxSizing: 'border-box' },
  hero: {
    position: 'relative', overflow: 'hidden', borderRadius: 28, padding: 24, width: '100%', boxSizing: 'border-box',
    minHeight: '36vh', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
    background: 'radial-gradient(120% 120% at 30% 0%, #FF9A3D 0%, #FE7A00 42%, #E85D00 100%)',
  },
  sheen: { position: 'absolute', inset: 0, background: 'linear-gradient(115deg, rgba(255,255,255,.28) 0%, rgba(255,255,255,0) 38%)', pointerEvents: 'none' },
  wm: { position: 'absolute', top: 22, left: 26, color: '#fff', fontWeight: 800, fontSize: 20, letterSpacing: '-.02em' },
  display: { color: '#fff', fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', fontWeight: 800, fontSize: 'clamp(30px,8vw,42px)', lineHeight: .98, letterSpacing: '-.03em', margin: '0 0 10px', textWrap: 'balance' },
  heroSub: { color: 'rgba(255,255,255,.9)', fontSize: 14, lineHeight: 1.45, margin: 0, maxWidth: 300 },
  body: { padding: '24px 22px 10px', boxSizing: 'border-box' },
  h2: { color: '#fff', fontSize: 22, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-.01em' },
  sub: { color: 'rgba(255,255,255,.55)', fontSize: 14.5, lineHeight: 1.5, margin: '0 0 18px' },
  photoRow: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 },
  avatar: { width: 72, height: 72, borderRadius: '50%', background: '#1C1C20', border: '1px dashed rgba(255,255,255,.16)', display: 'grid', placeItems: 'center', cursor: 'pointer', overflow: 'hidden', flex: 'none' },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  plus: { fontSize: 28, color: 'rgba(255,255,255,.35)' },
  ghost: { background: '#141416', border: '1px solid rgba(255,255,255,.16)', color: '#fff', borderRadius: 12, padding: '9px 15px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  hint: { color: 'rgba(255,255,255,.38)', fontSize: 12, margin: '7px 0 0' },
  lbl: { display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.55)', marginBottom: 14, letterSpacing: '.02em' },
  input: { padding: '13px 15px', borderRadius: 14, border: '1px solid rgba(255,255,255,.08)', background: '#141416', color: '#fff', fontSize: 15, outline: 'none' },
  emailChip: { display: 'inline-block', background: '#1C1C20', border: '1px solid rgba(255,255,255,.08)', color: 'rgba(255,255,255,.72)', borderRadius: 999, padding: '10px 18px', fontSize: 14, letterSpacing: '.02em', marginBottom: 14 },
  helper: { color: 'rgba(255,255,255,.38)', fontSize: 12.5, lineHeight: 1.5, margin: '0 0 20px' },
  otpRow: { display: 'flex', gap: 8, marginBottom: 14, width: '100%' },
  otpCell: { flex: '1 1 0', minWidth: 0, width: '100%', boxSizing: 'border-box', padding: 0, height: 56, textAlign: 'center', fontSize: 22, fontWeight: 700, color: '#fff', background: '#1C1C20', border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, outline: 'none', caretColor: '#FE7A00' },
  otpCellOn: { borderColor: '#FE7A00', boxShadow: '0 0 0 2px rgba(254,122,0,.18)' },
  timerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  timer: { background: '#1C1C20', color: 'rgba(255,255,255,.5)', borderRadius: 999, padding: '4px 12px', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
  resendWrap: { color: 'rgba(255,255,255,.45)', fontSize: 13 },
  resend: { background: 'none', border: 'none', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, padding: 0 },
  resendOff: { color: 'rgba(255,255,255,.3)', cursor: 'not-allowed' },
  err: { color: '#F87171', fontSize: 13, margin: '0 0 12px' },
  cta: { width: '100%', height: 56, borderRadius: 999, border: 'none', background: '#fff', color: '#0A0A0B', fontWeight: 700, fontSize: 15.5, cursor: 'pointer', marginTop: 4, transition: 'transform .1s, opacity .2s' },
  back: { width: '100%', background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', cursor: 'pointer', marginTop: 14, fontSize: 13 },
  check: { width: 60, height: 60, borderRadius: '50%', background: 'rgba(34,197,94,.15)', color: '#22C55E', display: 'grid', placeItems: 'center', fontSize: 30, margin: '0 auto 18px' },
};
