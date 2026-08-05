import { useContext, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, LoaderCircle, Lock, User } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import Turnstile from '../components/Turnstile';
import './Login.css';

/* A two-panel sign-in card, the same shape TIES Mail uses so the two
   properties read as one house — different logo, headline and copy.
   Below 900px the artwork is dropped rather than shrunk: a letterboxed sliver
   of a cave carries none of the image's meaning. */
const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [captcha, setCaptcha] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
  const [notice] = useState(() => {
    if (sessionStorage.getItem('sessionExpired') === 'idle') {
      sessionStorage.removeItem('sessionExpired');
      return 'You were signed out due to inactivity. Please log in again.';
    }
    return null;
  });
  const { loginUser } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await loginUser(username, password, captcha);
    if (result.success) {
      navigate('/');
      return;
    }
    setError(result.error);
    setCaptcha('');                        // token is single-use — force a fresh one on retry
    setCaptchaReset((n) => n + 1);
    setSubmitting(false);
  };

  return (
    <main className="login-page hq-login-page">
      <div className="hq-login">
        <div className="hq-login-form-pane">
          <form className="hq-login-form" onSubmit={handleSubmit}>
            <img src="/hq-logo.png" alt="Tiesverse HQ" className="hq-login-brand"
              width="400" height="97" />

            <div className="hq-login-heading">
              <h1>Sign in</h1>
              <p>This is your entry to the coolest team on the planet.</p>
            </div>

            {notice && <div className="hq-login-message is-notice">{notice}</div>}
            {error && <div className="hq-login-message is-error" role="alert">{error}</div>}

            <label className="hq-login-field">
              <span>Email or Crew ID</span>
              <span className="hq-login-input">
                <User size={16} aria-hidden="true" />
                <input
                  type="text"
                  autoComplete="username"
                  placeholder="you@tiesverse.com"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  spellCheck="false"
                  autoFocus
                  required
                />
              </span>
            </label>

            <label className="hq-login-field">
              <span>Password</span>
              <span className="hq-login-input">
                <Lock size={16} aria-hidden="true" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button
                  type="button"
                  className="hq-login-eye"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
            </label>

            {/* The bot check the API enforces on this endpoint — a login that
                skips it is refused server-side, so it is not decoration. */}
            <Turnstile onToken={setCaptcha} resetKey={captchaReset} />

            <button className="hq-login-submit" type="submit" disabled={submitting}>
              {submitting
                ? <><LoaderCircle size={16} className="hq-login-spinner" aria-hidden="true" /> Signing in…</>
                : 'Sign in'}
            </button>

            {/* The reset page is the useful destination — it does the job
                itself, where mailing support waits on a person. The address is
                offered alongside for anyone who cannot get in that way. */}
            <p className="hq-login-help">
              <Link to="/forgot-password">Forgot password?</Link>
              <span className="hq-login-help-sep">·</span>
              <a href="mailto:support@tiesverse.com">support@tiesverse.com</a>
            </p>
          </form>
        </div>

        <div className="hq-login-art" aria-hidden="true">
          <img src="/login-art.webp" alt="" width="1237" height="1400" />
          <div className="hq-login-art-copy">
            <h2>One HQ that keeps<br />the whole team<br />together.</h2>
            <p>Manage people, programs and operations—without losing context.</p>
          </div>
        </div>
      </div>
    </main>
  );
};

export default Login;
