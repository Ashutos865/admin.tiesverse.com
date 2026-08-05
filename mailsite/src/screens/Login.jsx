import { useState } from 'react';
import { Eye, EyeOff, Loader2, Lock, User } from 'lucide-react';
import { signIn } from '../auth.js';
import { Brand, ErrorNotice } from '../components/common.jsx';

/* A two-panel sign-in card floating on the page: the form on the left, the
   Elephanta Trimurti on the right. The artwork is the same plate the website's
   brand page uses, so the two properties read as one house. Below 900px the art
   panel is dropped rather than shrunk — a letterboxed sliver of a cave is worse
   than none. */
export default function Login({ onSignedIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await signIn(username.trim(), password);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    onSignedIn();
  };

  return (
    <div className="login-page">
     <div className="login">
      <div className="login-form-pane">
        <form className="login-form" onSubmit={submit}>
          <Brand width={132} className="login-brand" />

          <div className="login-heading">
            <h1>Sign in</h1>
            <p>Use your Tiesverse account to continue.</p>
          </div>

          <label className="login-field">
            <span>Email or Crew ID</span>
            <span className="login-input">
              <User size={16} aria-hidden="true" />
              <input value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder="you@tiesverse.com" autoComplete="username"
                autoFocus spellCheck="false" />
            </span>
          </label>

          <label className="login-field">
            <span>Password</span>
            <span className="login-input">
              <Lock size={16} aria-hidden="true" />
              <input type={showPw ? 'text' : 'password'} value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password" autoComplete="current-password" />
              <button type="button" className="login-eye" onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}>
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </label>

          <ErrorNotice>{error}</ErrorNotice>

          <button type="submit" className="login-submit" disabled={busy || !password || !username}>
            {busy ? <><Loader2 size={16} className="spin" /> Signing in…</> : 'Sign in'}
          </button>

          <p className="login-help">
            <a href="https://admin.tiesverse.com/forgot-password">Forgot password?</a>
          </p>
        </form>
      </div>

      <div className="login-art" aria-hidden="true">
        <img src="/login-art.webp" alt="" width="1237" height="1400" />
        <div className="login-art-copy">
          <h2>Our mail keeps<br />the whole team<br />moving.</h2>
          <p>
            Assign conversations, turn emails into tasks, and schedule
            follow-ups—without losing context.
          </p>
        </div>
      </div>
     </div>
    </div>
  );
}
