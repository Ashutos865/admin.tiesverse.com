import { useCallback, useEffect, useState } from 'react';
import {
  BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams,
} from 'react-router-dom';
import { Home as HomeIcon, Inbox, Loader2, PenSquare, Search, User } from 'lucide-react';
import { consumeSsoFromUrl, isSignedIn, signOut } from './auth.js';
import { cancelSend, getCounts, getMe, releaseSend } from './api/mail.js';
import Sidebar, { IconRail } from './components/Sidebar.jsx';
import { Brand, EmptyState, OfflineBanner, Toast } from './components/common.jsx';
import Login from './screens/Login.jsx';
import Home from './screens/Home.jsx';
import Mailbox from './screens/Mailbox.jsx';
import Compose from './screens/Compose.jsx';
import Admin from './screens/Admin.jsx';
import Automation from './screens/Automation.jsx';
import './styles/tokens.css';
import './styles/app.css';

const UNDO_SECONDS = 6;

export default function App() {
  return (
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  );
}

function Root() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [me, setMe] = useState(null);
  const [counts, setCounts] = useState(null);
  const [compose, setCompose] = useState(null);      // null | {reply|forward|draft}
  const [toast, setToast] = useState(null);          // {message, messageId?}

  const refreshCounts = useCallback(async () => {
    const res = await getCounts();
    if (!res.error) setCounts(res);
  }, []);

  const loadMe = useCallback(async () => {
    const res = await getMe();
    if (res.error) { setMe(null); return false; }
    setMe(res);
    refreshCounts();
    return true;
  }, [refreshCounts]);

  // Boot: redeem an SSO code if we arrived with one, then load the session.
  useEffect(() => {
    (async () => {
      await consumeSsoFromUrl();
      if (isSignedIn()) {
        const ok = await loadMe();
        setSignedIn(ok);
      }
      setReady(true);
    })();
  }, [loadMe]);

  useEffect(() => {
    if (!signedIn) return undefined;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') refreshCounts();
    }, 60000);
    return () => clearInterval(t);
  }, [signedIn, refreshCounts]);

  const onSignedIn = async () => {
    const ok = await loadMe();
    setSignedIn(ok);
    if (!ok) signOut();
  };

  /* A sent message sits queued for a few seconds. The toast is that window made
     visible: undo cancels it, and letting the toast lapse releases it rather
     than waiting on the next cron tick. */
  const onSent = (msg, scheduled) => {
    setCompose(null);
    refreshCounts();
    if (scheduled) {
      setToast({ message: 'Message scheduled.', seconds: 4 });
      return;
    }
    setToast({ message: 'Message sent', messageId: msg.id, seconds: UNDO_SECONDS });
  };

  const undoSend = async () => {
    const id = toast?.messageId;
    setToast(null);
    if (!id) return;
    const res = await cancelSend(id);
    refreshCounts();
    if (res.error) { setToast({ message: res.error, seconds: 5 }); return; }
    setCompose({ draft: res.draft });
  };

  const finishSend = async () => {
    const id = toast?.messageId;
    setToast(null);
    if (id) { await releaseSend(id); refreshCounts(); }
  };

  if (!ready) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', gap: 10 }}>
        <Brand />
        <Loader2 size={18} className="spin" style={{ color: 'var(--muted-2)' }} />
      </div>
    );
  }

  if (!signedIn) return <Login onSignedIn={onSignedIn} />;

  if (!me?.mailboxes?.length) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 24 }}>
        <EmptyState icon={<Inbox size={30} style={{ color: 'var(--muted-2)' }} />}
          title="No mailbox yet"
          action={(
            <button className="btn" onClick={() => { signOut(); window.location.reload(); }}>
              Sign out
            </button>
          )}>
          A superadmin has not given this account a TIES Mail mailbox.
        </EmptyState>
      </div>
    );
  }

  return (
    <Shell me={me} counts={counts} onCompose={(seed) => setCompose(seed || {})}>
      <Routes>
        <Route path="/" element={<Home me={me} counts={counts} onCompose={() => setCompose({})} />} />
        <Route path="/m/:mailboxId/:folder" element={(
          <Mailbox me={me} counts={counts} refreshCounts={refreshCounts}
            onCompose={(seed) => setCompose(seed || {})}
            onEditDraft={(d) => setCompose({ draft: d })} />
        )} />
        <Route path="/m/:mailboxId/:folder/:messageId" element={(
          <Mailbox me={me} counts={counts} refreshCounts={refreshCounts}
            onCompose={(seed) => setCompose(seed || {})}
            onEditDraft={(d) => setCompose({ draft: d })} />
        )} />
        <Route path="/admin/*" element={<Admin me={me} />} />
        <Route path="/bulk" element={<Automation me={me} />} />
        <Route path="/soon/:feature" element={<ComingSoon />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {compose && (
        <Compose me={me} seed={compose}
          onClose={() => { setCompose(null); refreshCounts(); }}
          onSent={onSent} />
      )}
      {toast && (
        <Toast message={toast.message} seconds={toast.seconds}
          onUndo={toast.messageId ? undoSend : undefined}
          onDone={toast.messageId ? finishSend : () => setToast(null)} />
      )}
    </Shell>
  );
}

function Shell({ me, counts, onCompose, children }) {
  const location = useLocation();
  const navigate = useNavigate();

  // The mailbox in the URL, or the first one this person can open.
  const idFromPath = location.pathname.match(/^\/m\/(\d+)/)?.[1];
  const activeMailbox = (me.mailboxes || []).find((b) => String(b.id) === String(idFromPath))
    || me.mailboxes[0];

  const focusSearch = useCallback(() => {
    const el = document.querySelector('.pane-list input');
    if (el) el.focus();
    else navigate(`/m/${activeMailbox.id}/inbox`);
  }, [navigate, activeMailbox]);

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === 'k') { e.preventDefault(); focusSearch(); }
      if (e.key === 'n') { e.preventDefault(); onCompose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusSearch, onCompose]);

  return (
    <div className="shell">
      <Sidebar me={me} counts={counts} activeMailbox={activeMailbox}
        onCompose={() => onCompose()} onSearch={focusSearch} />
      <IconRail me={me} counts={counts} activeMailbox={activeMailbox}
        onCompose={() => onCompose()} />
      <main className="main">
        <OfflineBanner />
        {children}
      </main>
      <BottomNav activeMailbox={activeMailbox} counts={counts} onCompose={() => onCompose()} />
    </div>
  );
}

/* Phone navigation. Five targets, the composer raised in the middle where a
   thumb naturally lands. */
function BottomNav({ activeMailbox, counts, onCompose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const unread = counts?.mailboxes?.[String(activeMailbox?.id)]?.inbox_unread || 0;
  const at = (p) => location.pathname.startsWith(p);

  return (
    <nav className="bottom-nav" aria-label="Main">
      <button className={`bnav-item ${location.pathname === '/' ? 'active' : ''}`}
        onClick={() => navigate('/')}>
        <HomeIcon size={19} />
        Home
      </button>
      <button className={`bnav-item ${at('/m/') ? 'active' : ''}`}
        onClick={() => navigate(`/m/${activeMailbox?.id}/inbox`)}>
        <span style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
          <Inbox size={19} />
          {unread > 0 && (
            <span style={{
              position: 'absolute', top: -3, right: -6, minWidth: 15, height: 15,
              padding: '0 4px', borderRadius: 999, background: 'var(--accent)', color: '#fff',
              fontSize: 9.5, fontWeight: 700, display: 'grid', placeItems: 'center',
            }}>{unread > 99 ? '99+' : unread}</span>
          )}
        </span>
        Mail
      </button>
      <button className="bnav-fab" onClick={onCompose} aria-label="Compose">
        <PenSquare size={20} />
      </button>
      <button className="bnav-item" onClick={() => {
        navigate(`/m/${activeMailbox?.id}/inbox`);
        setTimeout(() => document.querySelector('.pane-list input')?.focus(), 60);
      }}>
        <Search size={19} />
        Search
      </button>
      <button className={`bnav-item ${at('/soon') || at('/admin') ? 'active' : ''}`}
        onClick={() => navigate('/soon/account')}>
        <User size={19} />
        More
      </button>
    </nav>
  );
}

function ComingSoon() {
  const { feature } = useParams();
  const navigate = useNavigate();
  const copy = {
    tasks: 'Your tasks from the TIES task tracker, so replying and following up happen in one place.',
    contacts: 'Everyone you correspond with, matched to the member directory.',
    files: 'Every attachment sent and received, searchable.',
    announcements: 'Team-wide notices without an email thread.',
    account: 'Mailbox settings, picture and signature.',
  };
  const title = (feature || '').replace(/^\w/, (c) => c.toUpperCase());
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 24 }}>
      <EmptyState title={`${title} is coming`}
        action={<button className="btn" onClick={() => navigate('/')}>Back to home</button>}>
        {copy[feature] || 'This part of TIES Mail is still being built.'}
      </EmptyState>
    </div>
  );
}
