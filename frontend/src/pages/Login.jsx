import { useContext, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, LoaderCircle, Lock, User } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import './Login.css';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
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
    const result = await loginUser(username, password);
    if (result.success) {
      navigate('/');
      return;
    }
    setError(result.error);
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
                <User size={19} aria-hidden="true" />
                <input
                  type="text"
                  autoComplete="username"
                  placeholder="your username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                />
              </div>
            </label>

            <label className="login-field">
              <span>Password</span>
              <div className="login-input">
                <Lock size={19} aria-hidden="true" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
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

            <button className="login-submit" type="submit" disabled={submitting}>
              {submitting && <LoaderCircle size={19} className="login-spinner" aria-hidden="true" />}
              {submitting ? 'Authenticating…' : 'Log In'}
            </button>

            <Link to="/forgot-password" className="login-forgot">Forgot password?</Link>
          </form>
        </div>
      </section>
    </main>
  );
};

export default Login;
