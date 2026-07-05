import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Eye, EyeOff, LoaderCircle, Lock, CheckCircle2 } from 'lucide-react';
import { confirmPasswordReset } from '../apiClient';
import './Login.css';

const ResetPassword = () => {
  const [params] = useSearchParams();
  const uid = params.get('uid') || '';
  const token = params.get('token') || '';
  const linkValid = Boolean(uid && token);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  const mismatch = useMemo(
    () => confirm.length > 0 && password !== confirm,
    [password, confirm],
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setSubmitting(true);
    const res = await confirmPasswordReset({ uid, token, password });
    setSubmitting(false);
    if (res?.detail) {
      setDone(true);
      setTimeout(() => navigate('/login'), 2200);
    } else {
      setError(res?.error || 'Could not reset password. The link may have expired.');
    }
  };

  return (
    <main className="login-page">
      <div className="login-ambient" aria-hidden="true" />
      <section className="login-shell" aria-labelledby="reset-title">
        <header className="login-brand">
          <img src="/favicon.svg" alt="Tiesverse logo" />
          <h1 id="reset-title">Tiesverse Portal</h1>
        </header>

        <div className="login-card">
          <div className="login-card-heading">
            <h2>Choose a new password</h2>
            <p>Enter and confirm your new password below.</p>
          </div>

          {!linkValid ? (
            <>
              <div className="login-message is-error" role="alert">
                This reset link is missing or malformed. Please request a new one.
              </div>
              <Link to="/forgot-password" className="login-forgot">Request a new link</Link>
            </>
          ) : done ? (
            <div className="login-message is-notice" role="status" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Password updated. Redirecting you to the login page…</span>
            </div>
          ) : (
            <form className="login-form" onSubmit={handleSubmit}>
              {error && <div className="login-message is-error" role="alert">{error}</div>}

              <label className="login-field">
                <span>New password</span>
                <div className="login-input">
                  <Lock size={19} aria-hidden="true" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="login-password-toggle"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </div>
              </label>

              <label className="login-field">
                <span>Confirm password</span>
                <div className="login-input">
                  <Lock size={19} aria-hidden="true" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Re-enter password"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    required
                  />
                </div>
              </label>

              {mismatch && (
                <p style={{ margin: '-4px 0 0', fontSize: 12, color: '#a7141f' }}>Passwords don't match.</p>
              )}

              <button className="login-submit" type="submit" disabled={submitting || mismatch || !password}>
                {submitting && <LoaderCircle size={19} className="login-spinner" aria-hidden="true" />}
                {submitting ? 'Updating…' : 'Update password'}
              </button>

              <Link to="/login" className="login-forgot">Back to login</Link>
            </form>
          )}
        </div>
      </section>
    </main>
  );
};

export default ResetPassword;
