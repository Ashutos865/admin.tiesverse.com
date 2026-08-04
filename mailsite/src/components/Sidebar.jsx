import { NavLink, useNavigate, useParams } from 'react-router-dom';
import {
  Bell, Clock, FileText, Files, Home, Inbox, LogOut, Megaphone, PenSquare,
  Search, Send, Settings, Star, Users, CheckSquare, Contact,
} from 'lucide-react';
import { Avatar, Brand } from './common.jsx';
import { signOut } from '../auth.js';

/* The folders every mailbox has. `key` is the API's folder name. */
export const FOLDERS = [
  { key: 'inbox', label: 'Inbox', icon: Inbox, badge: 'inbox_unread' },
  { key: 'starred', label: 'Starred', icon: Star },
  { key: 'snoozed', label: 'Snoozed', icon: Clock, count: 'snoozed' },
  { key: 'drafts', label: 'Drafts', icon: FileText, count: 'drafts' },
  { key: 'scheduled', label: 'Scheduled', icon: Clock, count: 'scheduled' },
  { key: 'sent', label: 'Sent', icon: Send },
];

/* Present in the design and deliberately not wired yet — they route to a page
   that says what they will do rather than pretending to be broken. */
const UTILITY = [
  { key: 'tasks', label: 'Tasks', icon: CheckSquare },
  { key: 'contacts', label: 'Contacts', icon: Contact },
  { key: 'files', label: 'Files', icon: Files },
  { key: 'announcements', label: 'Announcements', icon: Megaphone },
];

export default function Sidebar({ me, counts, activeMailbox, onCompose, onSearch }) {
  const navigate = useNavigate();
  const { folder } = useParams();
  const boxes = me?.mailboxes || [];
  const current = activeMailbox || boxes[0];
  const my = counts?.mailboxes?.[String(current?.id)] || {};

  const personal = boxes.filter((b) => b.kind !== 'SHARED');
  const shared = boxes.filter((b) => b.kind === 'SHARED');

  const go = (key) => navigate(`/m/${current?.id}/${key}`);

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <NavLink to="/" aria-label="TIES Mail home"><Brand /></NavLink>
      </div>

      <div className="sidebar-top">
        <button className="compose-btn" onClick={onCompose}>
          <PenSquare size={16} />
          Compose
          <span className="kbd">⌘N</span>
        </button>
        <button className="search-field" onClick={onSearch} style={{ textAlign: 'left' }}>
          <Search size={15} />
          <span style={{ flex: 1, fontSize: 13, color: 'var(--muted-2)' }}>Search</span>
          <span className="kbd">⌘K</span>
        </button>
      </div>

      <div className="sidebar-scroll">
        <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Home size={16} />
          <span className="label">Home</span>
        </NavLink>

        <div className="nav-section">
          <span className="eyebrow">Mail</span>
          {FOLDERS.map((f) => {
            const badge = f.badge ? my[f.badge] : 0;
            const count = f.count ? my[f.count] : 0;
            const active = folder === f.key;
            return (
              <button key={f.key} className={`nav-item ${active ? 'active' : ''}`} onClick={() => go(f.key)}>
                <f.icon size={16} />
                <span className="label">{f.label}</span>
                {badge > 0 && <span className="badge">{badge}</span>}
                {!badge && count > 0 && <span className="count">{count}</span>}
              </button>
            );
          })}
        </div>

        {shared.length > 0 && (
          <div className="nav-section">
            <span className="eyebrow">Team inboxes</span>
            {shared.map((b) => {
              const c = counts?.mailboxes?.[String(b.id)] || {};
              const active = String(b.id) === String(current?.id);
              return (
                <button key={b.id} className={`nav-item ${active ? 'active' : ''}`}
                  onClick={() => navigate(`/m/${b.id}/inbox`)}>
                  <Users size={16} />
                  <span className="label truncate">{b.display_name || b.address.split('@')[0]}</span>
                  {c.inbox_unread > 0 && <span className="badge">{c.inbox_unread}</span>}
                </button>
              );
            })}
          </div>
        )}

        {personal.length > 1 && (
          <div className="nav-section">
            <span className="eyebrow">Mailboxes</span>
            {personal.map((b) => {
              const c = counts?.mailboxes?.[String(b.id)] || {};
              const active = String(b.id) === String(current?.id);
              return (
                <button key={b.id} className={`nav-item ${active ? 'active' : ''}`}
                  onClick={() => navigate(`/m/${b.id}/inbox`)}>
                  <Inbox size={16} />
                  <span className="label truncate">{b.address.split('@')[0]}</span>
                  {c.inbox_unread > 0 && <span className="badge">{c.inbox_unread}</span>}
                </button>
              );
            })}
          </div>
        )}

        <div className="nav-section">
          <span className="eyebrow">Workspace</span>
          {UTILITY.map((u) => (
            <NavLink key={u.key} to={`/soon/${u.key}`}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <u.icon size={16} />
              <span className="label">{u.label}</span>
            </NavLink>
          ))}
          {me?.is_superadmin && (
            <NavLink to="/admin" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Settings size={16} />
              <span className="label">Mailbox admin</span>
            </NavLink>
          )}
        </div>
      </div>

      <div className="account-card">
        <Avatar name={current?.display_name} email={current?.address}
          url={current?.avatar_url} size={30} />
        <span className="who">
          <strong className="truncate">{current?.display_name || 'Mailbox'}</strong>
          <span className="truncate">{current?.address}</span>
        </span>
        <button className="icon-btn" style={{ width: 30, height: 30 }} title="Sign out"
          aria-label="Sign out"
          onClick={() => { signOut(); window.location.assign('/'); }}>
          <LogOut size={15} />
        </button>
      </div>
    </aside>
  );
}

/* The 72px rail shown when there is no room for the full sidebar. */
export function IconRail({ me, counts, activeMailbox, onCompose }) {
  const navigate = useNavigate();
  const { folder } = useParams();
  const current = activeMailbox || me?.mailboxes?.[0];
  const my = counts?.mailboxes?.[String(current?.id)] || {};

  return (
    <div className="rail-strip">
      <button className="rail-btn" onClick={onCompose} title="Compose"
        style={{ background: 'var(--ink)', color: '#fff' }}>
        <PenSquare size={17} />
      </button>
      <div className="rail-items">
        <button className="rail-btn" onClick={() => navigate('/')} title="Home"><Home size={18} /></button>
        {FOLDERS.map((f) => (
          <button key={f.key} title={f.label}
            className={`rail-btn ${folder === f.key ? 'active' : ''}`}
            onClick={() => navigate(`/m/${current?.id}/${f.key}`)}>
            <f.icon size={18} />
            {f.badge && my[f.badge] > 0 && <span className="dot" />}
          </button>
        ))}
      </div>
      <button className="rail-btn" title="Sign out"
        onClick={() => { signOut(); window.location.assign('/'); }}>
        <LogOut size={18} />
      </button>
    </div>
  );
}
