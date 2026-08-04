import { useState } from 'react';
import { Eye, EyeOff, Loader2, Lock, Mail, User } from 'lucide-react';
import { signIn, signInShared } from '../auth.js';
import { Brand, ErrorNotice } from '../components/common.jsx';

/* Two ways to sign in, because two kinds of people arrive here: someone with a
   portal account, and a team who only ever share a mailbox password. */
export default function Login({ onSignedIn }) {
  const [tab, setTab] = useState('account');
  const [username, setUsername] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = tab === 'account'
      ? await signIn(username.trim(), password)
      : await signInShared(address.trim(), password);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    onSignedIn();
  };

  return (
    <div style={{
      minHeight: '100%', display: 'grid', placeItems: 'center',
      padding: 24, background: 'var(--page)',
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'grid', justifyItems: 'center', gap: 6, marginBottom: 22 }}>
          <Brand />
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
            Sign in to your Tiesverse mailbox
          </p>
        </div>

        <form className="card" style={{ padding: 20, display: 'grid', gap: 14 }} onSubmit={submit}>
          <div className="tabs" style={{ background: 'var(--card-2)', padding: 3, borderRadius: 'var(--r-control)' }}>
            <button type="button" className={`tab ${tab === 'account' ? 'active' : ''}`}
              style={{ flex: 1 }} onClick={() => { setTab('account'); setError(''); }}>
              My account
            </button>
            <button type="button" className={`tab ${tab === 'shared' ? 'active' : ''}`}
              style={{ flex: 1 }} onClick={() => { setTab('shared'); setError(''); }}>
              Team mailbox
            </button>
          </div>

          {tab === 'account' ? (
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="eyebrow">Work email or Crew ID</span>
              <span className="search-field" style={{ height: 40 }}>
                <User size={15} />
                <input value={username} onChange={(e) => setUsername(e.target.value)}
                  placeholder="you@tiesverse.com" autoComplete="username" autoFocus />
              </span>
            </label>
          ) : (
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="eyebrow">Mailbox address</span>
              <span className="search-field" style={{ height: 40 }}>
                <Mail size={15} />
                <input value={address} onChange={(e) => setAddress(e.target.value)}
                  placeholder="team@mail.tiesverse.com" autoComplete="off" autoFocus />
              </span>
            </label>
          )}

          <label style={{ display: 'grid', gap: 6 }}>
            <span className="eyebrow">Password</span>
            <span className="search-field" style={{ height: 40 }}>
              <Lock size={15} />
              <input type={showPw ? 'text' : 'password'} value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password" />
              <button type="button" onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                style={{ color: 'var(--muted-2)', display: 'grid', placeItems: 'center' }}>
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </span>
          </label>

          <ErrorNotice>{error}</ErrorNotice>

          <button type="submit" className="btn btn-primary" style={{ height: 40 }}
            disabled={busy || !password || !(tab === 'account' ? username : address)}>
            {busy ? <><Loader2 size={15} className="spin" /> Signing in…</> : 'Sign in'}
          </button>

          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-2)', textAlign: 'center' }}>
            {tab === 'account'
              ? 'The same account you use for the admin panel.'
              : 'Signs you into that one mailbox only.'}
          </p>
        </form>
      </div>
    </div>
  );
}
