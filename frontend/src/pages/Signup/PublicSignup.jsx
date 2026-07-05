import { useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { publicSignup, verifySignupOtp } from '../../apiClient';

export default function PublicSignup() {
  const { hash } = useParams();
  const [step, setStep] = useState('form'); // form | otp | done
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef();

  const pickPhoto = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhoto(f);
    setPreview(URL.createObjectURL(f));
  };

  const submit = async () => {
    if (!name.trim() || !email.trim()) return setErr('Name and email are required.');
    setBusy(true); setErr('');
    const fd = new FormData();
    fd.append('name', name.trim());
    fd.append('email', email.trim());
    if (photo) fd.append('photo', photo);
    const res = await publicSignup(hash, fd).catch(() => ({ error: 'Network error.' }));
    setBusy(false);
    if (res?.status === 'otp_sent') { setStep('otp'); setErr(''); }
    else setErr(res?.error || 'Could not submit. Please try again.');
  };

  const verify = async () => {
    if (otp.trim().length < 4) return setErr('Enter the 6-digit code from your email.');
    setBusy(true); setErr('');
    const res = await verifySignupOtp(hash, email.trim(), otp.trim()).catch(() => ({ error: 'Network error.' }));
    setBusy(false);
    if (res?.status === 'verified') setStep('done');
    else setErr(res?.error || 'Incorrect or expired code.');
  };

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.brand}><span style={S.dot}>.</span>tiesverse</div>

        {step === 'form' && (
          <>
            <h1 style={S.h1}>Join the team</h1>
            <p style={S.sub}>Add your details and we'll verify your email. HR reviews every request.</p>
            <div style={S.photoRow}>
              <div style={S.avatar} onClick={() => fileRef.current?.click()}>
                {preview ? <img src={preview} alt="" style={S.avatarImg} /> : <span style={S.avatarPlus}>+</span>}
              </div>
              <div>
                <button style={S.photoBtn} onClick={() => fileRef.current?.click()}>Upload photo</button>
                <p style={S.hint}>PNG/JPG — stored as WebP</p>
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
            <h1 style={S.h1}>Verify your email</h1>
            <p style={S.sub}>We sent a 6-digit code to <strong>{email}</strong>. Enter it below.</p>
            <input style={{ ...S.input, ...S.otpInput }} value={otp} inputMode="numeric" maxLength={6}
              onChange={e => { setOtp(e.target.value.replace(/\D/g, '')); setErr(''); }} placeholder="000000" />
            {err && <p style={S.err}>{err}</p>}
            <button style={S.cta} onClick={verify} disabled={busy}>{busy ? 'Verifying…' : 'Verify'}</button>
            <button style={S.link} onClick={() => { setStep('form'); setOtp(''); setErr(''); }}>← Back</button>
          </>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center' }}>
            <div style={S.check}>✓</div>
            <h1 style={S.h1}>You're on the list!</h1>
            <p style={S.sub}>Your email is verified. HR will review your request and set up your access — you'll get login details by email once approved.</p>
          </div>
        )}
      </div>
    </div>
  );
}

const S = {
  page: { minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0c0b08', padding: 20 },
  card: { width: '100%', maxWidth: 420, background: '#17150f', border: '1px solid rgba(255,255,255,.1)', borderRadius: 18, padding: '32px 28px', color: '#fff' },
  brand: { fontWeight: 800, fontSize: 20, marginBottom: 22, letterSpacing: '-.02em' },
  dot: { color: '#FE7A00' },
  h1: { fontSize: 22, fontWeight: 800, margin: '0 0 8px' },
  sub: { color: 'rgba(255,255,255,.6)', fontSize: 14, lineHeight: 1.5, margin: '0 0 22px' },
  photoRow: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 },
  avatar: { width: 72, height: 72, borderRadius: '50%', background: '#221f16', border: '1px dashed rgba(255,255,255,.25)', display: 'grid', placeItems: 'center', cursor: 'pointer', overflow: 'hidden', flex: 'none' },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarPlus: { fontSize: 28, color: 'rgba(255,255,255,.4)' },
  photoBtn: { background: 'transparent', border: '1px solid rgba(255,255,255,.25)', color: '#fff', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  hint: { color: 'rgba(255,255,255,.4)', fontSize: 12, margin: '6px 0 0' },
  lbl: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.7)', marginBottom: 14 },
  input: { padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,.16)', background: '#0f0e0a', color: '#fff', fontSize: 15, outline: 'none' },
  otpInput: { textAlign: 'center', letterSpacing: 8, fontSize: 24, fontWeight: 700 },
  err: { color: '#f87171', fontSize: 13, margin: '0 0 12px' },
  cta: { width: '100%', padding: '13px', borderRadius: 10, border: 'none', background: '#FE7A00', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', marginTop: 6 },
  link: { width: '100%', background: 'transparent', border: 'none', color: 'rgba(255,255,255,.5)', cursor: 'pointer', marginTop: 12, fontSize: 13 },
  check: { width: 56, height: 56, borderRadius: '50%', background: 'rgba(34,197,94,.15)', color: '#22c55e', display: 'grid', placeItems: 'center', fontSize: 28, margin: '0 auto 16px' },
};
