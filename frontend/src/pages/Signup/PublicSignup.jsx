import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { publicSignup, verifySignupOtp } from '../../apiClient';
import ImageCropper from '../../components/ImageCropper.jsx';
import Turnstile, { TURNSTILE_ENABLED } from '../../components/Turnstile';

const OTP_LEN = 6;
const RESEND_SECS = 45;

const maskEmail = (e) => {
  const [u, d] = (e || '').split('@');
  if (!u || !d) return e || '';
  const head = u.slice(0, 2);
  const tail = u.length > 4 ? u.slice(-2) : '';
  return `${head}${'*'.repeat(Math.max(3, u.length - 4))}${tail}@${d}`;
};

// Segmented OTP: auto-advance, single-press backspace (delete + retreat), full
// paste, numeric keypad. Slots are held at fixed positions (empty = ' ') so a
// mid-code delete never shifts the later digits. The parent strips the spaces.
function OtpBoxes({ value, onChange }) {
  const refs = useRef([]);
  // Fixed-length view of the code; '' marks an empty slot.
  const slots = Array.from({ length: OTP_LEN }, (_, i) => {
    const c = value[i];
    return c && c !== ' ' ? c : '';
  });
  const emit = (arr) => onChange(arr.map((c) => c || ' ').join(''));

  const setDigit = (i, raw) => {
    const v = raw.replace(/\D/g, '');
    if (!v) return;                       // deletions are handled in onKey
    const arr = slots.slice();
    arr[i] = v.slice(-1);
    emit(arr);
    if (i < OTP_LEN - 1) refs.current[i + 1]?.focus();
  };

  const onKey = (i, e) => {
    if (e.key === 'Backspace') {
      e.preventDefault();               // take full control (mobile keydown is reliable on filled numeric inputs)
      const arr = slots.slice();
      if (arr[i]) {                     // clear this box, then retreat
        arr[i] = '';
        emit(arr);
        if (i > 0) refs.current[i - 1]?.focus();
      } else if (i > 0) {               // empty box: delete the previous digit in one press
        arr[i - 1] = '';
        emit(arr);
        refs.current[i - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowRight' && i < OTP_LEN - 1) {
      refs.current[i + 1]?.focus();
    }
  };

  const onPaste = (e) => {
    const t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, OTP_LEN);
    if (!t) return;
    e.preventDefault();
    emit(Array.from({ length: OTP_LEN }, (_, k) => t[k] || ''));
    refs.current[Math.min(t.length, OTP_LEN - 1)]?.focus();
  };

  return (
    <div style={S.otpRow} onPaste={onPaste}>
      {slots.map((c, i) => (
        <input
          key={i} ref={el => (refs.current[i] = el)} value={c} className="ps-fld"
          onChange={e => setDigit(i, e.target.value)}
          onKeyDown={e => onKey(i, e)} inputMode="numeric" maxLength={1}
          style={{ ...S.otpCell, ...(c ? S.otpCellOn : {}) }} aria-label={`Digit ${i + 1}`}
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
  const [popup, setPopup] = useState(false);   // "check your mail" modal after OTP success
  const [captcha, setCaptcha] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
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
    fd.append('cf_turnstile_token', captcha);
    return publicSignup(hash, fd).catch(() => ({ error: 'Network error.' }));
  }, [hash, name, email, photo, captcha]);

  const freshCaptcha = () => { setCaptcha(''); setCaptchaReset(n => n + 1); };

  const submit = async () => {
    if (!photo) return setErr('Add a profile photo to continue.');
    if (!name.trim()) return setErr('Your full name is required.');
    if (!email.trim()) return setErr('Your email is required.');
    if (TURNSTILE_ENABLED && !captcha) return setErr('Please complete the verification below.');
    setBusy(true); setErr('');
    const res = await sendCode();
    setBusy(false);
    if (res?.status === 'otp_sent') { setStep('otp'); setOtp(''); setLeft(RESEND_SECS); freshCaptcha(); }
    else { setErr(res?.error || 'Could not submit. Please try again.'); freshCaptcha(); }
  };

  const resend = async () => {
    if (left > 0) return;
    if (TURNSTILE_ENABLED && !captcha) return setErr('Please complete the verification below.');
    setBusy(true); setErr('');
    const res = await sendCode();
    setBusy(false);
    if (res?.status === 'otp_sent') { setOtp(''); setLeft(RESEND_SECS); }
    else setErr(res?.error || 'Could not resend.');
    freshCaptcha();
  };

  const verify = async () => {
    const code = otp.replace(/\s/g, '');
    if (code.length < OTP_LEN) return setErr(`Enter the ${OTP_LEN}-digit code.`);
    setBusy(true); setErr('');
    const res = await verifySignupOtp(hash, email.trim(), code).catch(() => ({ error: 'Network error.' }));
    setBusy(false);
    if (res?.status === 'verified') { setStep('done'); setPopup(true); }
    else setErr(res?.error || 'Incorrect or expired code.');
  };

  return (
    <div style={S.page}>
      <style>{`
        .ps-fld:focus{border-color:#FE7A00 !important;box-shadow:0 0 0 3px rgba(254,122,0,.16) !important;background:#fff !important}
        .ps-fld::placeholder{color:rgba(29,22,13,.34)}
      `}</style>
      <div style={S.shell}>
        <div style={S.hero}>
          <div style={S.sheen} />
          <div style={S.wm}>.ties</div>
          <h1 style={S.display}>Join the<br />movement.</h1>
          <p style={S.heroSub}>Research, Media &amp; Technology, built by the youth, for Bharat.</p>
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
                  <button style={S.ghost} onClick={() => fileRef.current?.click()}>Upload photo<span style={S.req}> *</span></button>
                  <p style={S.hint}>Required · PNG / JPG, stored as WebP</p>
                </div>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickPhoto} />
              </div>
              <label style={S.lbl}><span>Full name<span style={S.req}> *</span></span>
                <input className="ps-fld" style={S.input} value={name} onChange={e => { setName(e.target.value); setErr(''); }} placeholder="Your name" />
              </label>
              <label style={S.lbl}><span>Email<span style={S.req}> *</span></span>
                <input className="ps-fld" style={S.input} type="email" value={email} onChange={e => { setEmail(e.target.value); setErr(''); }} placeholder="you@example.com" />
              </label>
              {err && <p style={S.err}>{err}</p>}
              <Turnstile onToken={setCaptcha} resetKey={captchaReset} />
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
              <div style={{ display: TURNSTILE_ENABLED ? 'block' : 'none' }}><Turnstile onToken={setCaptcha} resetKey={captchaReset} /></div>
              <button style={S.cta} onClick={verify} disabled={busy}>{busy ? 'Verifying…' : 'Continue'}</button>
              <button style={S.back} onClick={() => { setStep('form'); setErr(''); }}>← Change details</button>
            </>
          )}

          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={S.check}>✓</div>
              <h2 style={S.h2}>You're on the list</h2>
              <p style={S.sub}>Email verified. HR will review your request and set up your access. You'll get login details by email once approved.</p>
            </div>
          )}
        </div>
      </div>
      {cropFile && <ImageCropper file={cropFile} onCancel={() => setCropFile(null)} onCrop={onCropped} />}

      {popup && (
        <div style={S.modalOverlay} onClick={() => setPopup(false)}>
          <div style={S.modalCard} onClick={e => e.stopPropagation()}>
            <div style={S.modalIcon}>✓</div>
            <h3 style={S.modalTitle}>Email verified</h3>
            <p style={S.modalText}>
              Once HR approves your request, your login <b>ID and password</b> will be sent to your email.
              Keep an eye on your inbox, and be ready.
            </p>
            <button style={S.cta} onClick={() => setPopup(false)}>Got it</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Warm "sandstone glass" (light): the brand's paper/cream/saffron palette as
// liquid glassmorphism — a sunlit paper backdrop washed with soft saffron
// light, frosted translucent surfaces over it, saffron as the one raised voice.
const GLASS = 'rgba(255,255,255,.66)';
const GLASS_BORDER = 'rgba(29,22,13,.12)';
const TXT = '#1D160D';
const TXT_MUTE = 'rgba(29,22,13,.58)';
const S = {
  page: {
    minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: 16, boxSizing: 'border-box', overflowX: 'hidden',
    background: 'radial-gradient(56% 44% at 12% 6%, rgba(254,122,0,.18), transparent 60%), radial-gradient(42% 32% at 82% 40%, rgba(254,150,40,.16), transparent 64%), radial-gradient(46% 34% at 28% 74%, rgba(254,122,0,.12), transparent 68%), radial-gradient(95% 60% at 50% 126%, rgba(254,122,0,.16), transparent 70%), #FFF6EA',
  },
  shell: {
    width: '100%', maxWidth: 440, boxSizing: 'border-box', borderRadius: 30, overflow: 'hidden',
    background: 'rgba(255,252,246,.62)', backdropFilter: 'blur(26px) saturate(1.3)', WebkitBackdropFilter: 'blur(26px) saturate(1.3)',
    border: '1px solid rgba(255,255,255,.85)', boxShadow: '0 40px 90px -34px rgba(120,68,18,.30), 0 2px 6px rgba(120,68,18,.06), inset 0 1px 0 rgba(255,255,255,.9)',
  },
  hero: {
    position: 'relative', overflow: 'hidden', padding: 26, width: '100%', boxSizing: 'border-box',
    minHeight: '31vh', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
    background: 'radial-gradient(135% 130% at 26% -12%, #FFB459 0%, #FE7A00 46%, #D6520A 100%)',
  },
  sheen: { position: 'absolute', inset: 0, background: 'linear-gradient(120deg, rgba(255,255,255,.32) 0%, rgba(255,255,255,0) 42%)', pointerEvents: 'none' },
  wm: { position: 'absolute', top: 22, left: 26, color: '#fff', fontWeight: 800, fontSize: 20, letterSpacing: '-.02em' },
  display: { color: '#fff', fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 600, fontSize: 'clamp(32px,8.4vw,46px)', lineHeight: .96, letterSpacing: '-.02em', margin: '0 0 10px', textWrap: 'balance' },
  heroSub: { color: 'rgba(255,248,240,.94)', fontSize: 14, lineHeight: 1.45, margin: 0, maxWidth: 300 },
  body: { padding: '26px 24px 16px', boxSizing: 'border-box' },
  h2: { color: TXT, fontSize: 22, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-.01em' },
  sub: { color: TXT_MUTE, fontSize: 14.5, lineHeight: 1.5, margin: '0 0 18px' },
  req: { color: '#E56D00', fontWeight: 700 },
  photoRow: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 },
  avatar: { width: 72, height: 72, borderRadius: '50%', background: 'rgba(255,255,255,.6)', border: '1px dashed rgba(29,22,13,.22)', display: 'grid', placeItems: 'center', cursor: 'pointer', overflow: 'hidden', flex: 'none' },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  plus: { fontSize: 28, color: 'rgba(29,22,13,.32)' },
  ghost: { background: GLASS, border: `1px solid ${GLASS_BORDER}`, color: TXT, borderRadius: 12, padding: '9px 15px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  hint: { color: 'rgba(29,22,13,.46)', fontSize: 12, margin: '7px 0 0' },
  lbl: { display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13, fontWeight: 600, color: TXT_MUTE, marginBottom: 14, letterSpacing: '.02em' },
  input: { padding: '13px 15px', borderRadius: 14, border: `1px solid ${GLASS_BORDER}`, background: 'rgba(255,255,255,.72)', color: TXT, fontSize: 15, outline: 'none', transition: 'border-color .18s, box-shadow .18s, background .18s' },
  emailChip: { display: 'inline-block', background: 'rgba(254,122,0,.10)', border: '1px solid rgba(254,122,0,.30)', color: '#B4560A', borderRadius: 999, padding: '10px 18px', fontSize: 14, letterSpacing: '.02em', marginBottom: 14 },
  helper: { color: 'rgba(29,22,13,.46)', fontSize: 12.5, lineHeight: 1.5, margin: '0 0 20px' },
  otpRow: { display: 'flex', gap: 8, marginBottom: 14, width: '100%' },
  otpCell: { flex: '1 1 0', minWidth: 0, width: '100%', boxSizing: 'border-box', padding: 0, height: 56, textAlign: 'center', fontSize: 22, fontWeight: 700, color: TXT, background: 'rgba(255,255,255,.7)', border: `1px solid ${GLASS_BORDER}`, borderRadius: 16, outline: 'none', caretColor: '#FE7A00', transition: 'border-color .18s, box-shadow .18s, background .18s' },
  otpCellOn: { borderColor: '#FE7A00', background: 'rgba(254,122,0,.09)', boxShadow: '0 0 0 3px rgba(254,122,0,.16)' },
  timerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  timer: { background: 'rgba(29,22,13,.05)', color: TXT_MUTE, borderRadius: 999, padding: '4px 12px', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
  resendWrap: { color: 'rgba(29,22,13,.5)', fontSize: 13 },
  resend: { background: 'none', border: 'none', color: '#E56D00', fontWeight: 700, cursor: 'pointer', fontSize: 13, padding: 0 },
  resendOff: { color: 'rgba(29,22,13,.3)', cursor: 'not-allowed' },
  err: { color: '#C0392B', fontSize: 13, margin: '0 0 12px' },
  cta: { width: '100%', height: 56, borderRadius: 999, border: 'none', background: '#1D160D', color: '#FFF3E3', fontWeight: 700, fontSize: 15.5, cursor: 'pointer', marginTop: 4, transition: 'transform .1s, opacity .2s, box-shadow .2s', boxShadow: '0 14px 30px -12px rgba(29,22,13,.5)' },
  back: { width: '100%', background: 'none', border: 'none', color: 'rgba(29,22,13,.5)', cursor: 'pointer', marginTop: 14, fontSize: 13 },
  check: { width: 60, height: 60, borderRadius: '50%', background: 'rgba(22,163,74,.12)', color: '#16A34A', display: 'grid', placeItems: 'center', fontSize: 30, margin: '0 auto 18px', border: '1px solid rgba(22,163,74,.26)' },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(70,42,12,.28)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', display: 'grid', placeItems: 'center', padding: 20, zIndex: 3000 },
  modalCard: { width: '100%', maxWidth: 380, boxSizing: 'border-box', background: 'rgba(255,252,246,.82)', backdropFilter: 'blur(30px) saturate(1.4)', WebkitBackdropFilter: 'blur(30px) saturate(1.4)', border: '1px solid rgba(255,255,255,.9)', borderRadius: 26, padding: '32px 26px 26px', textAlign: 'center', boxShadow: '0 44px 90px -30px rgba(120,68,18,.42), inset 0 1px 0 rgba(255,255,255,.95)' },
  modalIcon: { width: 60, height: 60, borderRadius: '50%', background: 'rgba(254,122,0,.14)', color: '#E56D00', display: 'grid', placeItems: 'center', fontSize: 28, margin: '0 auto 18px', border: '1px solid rgba(254,122,0,.30)' },
  modalTitle: { color: TXT, fontSize: 21, fontWeight: 700, margin: '0 0 10px', letterSpacing: '-.01em' },
  modalText: { color: TXT_MUTE, fontSize: 14.5, lineHeight: 1.6, margin: '0 0 22px' },
};
