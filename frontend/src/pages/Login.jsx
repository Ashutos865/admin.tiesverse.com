import { useContext, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, LoaderCircle, Lock, User } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import Turnstile, { TURNSTILE_ENABLED } from '../components/Turnstile';
import './Login.css';

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
    if (TURNSTILE_ENABLED && !captcha) {
      setError('Please complete the verification below.');
      return;
    }
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
    <main className="login-page">
      <div className="login-ambient" aria-hidden="true" />

      <section className="login-shell" aria-labelledby="login-title">
        <header className="login-brand">
          <img src="/favicon.svg" alt="Tiesverse logo" />
          <h1 id="login-title">Tiesverse Portal</h1>
        </header>

        <div className="login-card">
          <div className="login-card-heading">
            <h2>Admin Control Center</h2>
            <p>Please authenticate to access management</p>
          </div>

          {notice && <div className="login-message is-notice">{notice}</div>}
          {error && <div className="login-message is-error" role="alert">{error}</div>}

          <form className="login-form" onSubmit={handleSubmit}>
            <label className="login-field">
              <span>Username</span>
              <div className="login-input">
                <User size={18} aria-hidden="true" />
                <input
                  type="text"
                  autoComplete="username"
                  placeholder="e-mail address"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                />
              </div>
            </label>

            <label className="login-field">
              <span>Password</span>
              <div className="login-input">
                <Lock size={18} aria-hidden="true" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="password"
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
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            <Turnstile onToken={setCaptcha} resetKey={captchaReset} />

            <button className="login-submit" type="submit" disabled={submitting || (TURNSTILE_ENABLED && !captcha)}>
              <span className="login-submit-label">{submitting ? 'Authenticating…' : 'Log in'}</span>
              <span className="login-submit-arrow">
                {submitting
                  ? <LoaderCircle size={18} className="login-spinner" aria-hidden="true" />
                  : <ArrowRight size={18} aria-hidden="true" />}
              </span>
            </button>

            <Link to="/forgot-password" className="login-forgot">Forgot password?</Link>
          </form>
        </div>
      </section>
    </main>
  );
};

export default Login;
