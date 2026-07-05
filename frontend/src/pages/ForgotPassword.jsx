import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LoaderCircle, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { requestPasswordReset } from '../apiClient';
import './Login.css';

const ForgotPassword = () => {
  const [identifier, setIdentifier] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    await requestPasswordReset(identifier.trim());
    // The API always returns the same generic response — never reveal whether
    // an account exists. Show the confirmation regardless.
    setSubmitting(false);
    setDone(true);
  };

  return (
    <main className="login-page">
      <div className="login-ambient" aria-hidden="true" />
      <section className="login-shell" aria-labelledby="forgot-title">
        <header className="login-brand">
          <img src="/favicon.svg" alt="Tiesverse logo" />
          <h1 id="forgot-title">Tiesverse Portal</h1>
        </header>

        <div className="login-card">
          <div className="login-card-heading">
            <h2>Reset your password</h2>
            <p>Enter your username or email and we'll send you a reset link.</p>
          </div>

          {done ? (
            <>
              <div className="login-message is-notice" role="status" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>If an account matches that address, a password reset link is on its way. Check your inbox (and spam).</span>
              </div>
              <Link to="/login" className="login-forgot" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                <ArrowLeft size={15} /> Back to login
              </Link>
            </>
          ) : (
            <form className="login-form" onSubmit={handleSubmit}>
              <label className="login-field">
                <span>Username or Email</span>
                <div className="login-input">
                  <Mail size={19} aria-hidden="true" />
                  <input
                    type="text"
                    autoComplete="username"
                    placeholder="you@example.com"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    required
                  />
                </div>
              </label>

              <button className="login-submit" type="submit" disabled={submitting || !identifier.trim()}>
                {submitting && <LoaderCircle size={19} className="login-spinner" aria-hidden="true" />}
                {submitting ? 'Sending…' : 'Send reset link'}
              </button>

              <Link to="/login" className="login-forgot" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
                <ArrowLeft size={15} /> Back to login
              </Link>
            </form>
          )}
        </div>
      </section>
    </main>
  );
};

export default ForgotPassword;
