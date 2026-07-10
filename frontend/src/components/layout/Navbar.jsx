import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { HelpCircle, LogOut, Menu, Moon, Search, Settings, Sun } from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import { ThemeContext } from '../../context/ThemeContext';
import NotificationsBell from './NotificationsBell.jsx';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');

const Navbar = ({ activePortal, setIsSidebarOpen, onOpenPalette }) => {
  const { user, profile, logoutUser } = useContext(AuthContext);
  const { theme, toggleTheme } = useContext(ThemeContext);
  const navigate = useNavigate();

  const displayName = profile?.display_name || user?.username || 'Admin';
  const firstName = displayName.split(/\s+/)[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <header className="portal-topbar">
      <div className="portal-topbar-left">
        <button
          type="button"
          onClick={() => setIsSidebarOpen(true)}
          className="portal-menu-button"
          aria-label="Open navigation"
        >
          <Menu size={22} />
        </button>
        <span className="portal-topbar-title">{greeting}, {firstName}</span>
      </div>

      <div className="portal-topbar-actions">
        {onOpenPalette && (
          <button
            type="button"
            className="palette-trigger"
            onClick={onOpenPalette}
            aria-label="Search"
            title="Search pages and actions"
            style={paletteBtn}
          >
            <Search size={16} />
            <span className="palette-trigger-label" style={paletteBtnText}>Search</span>
            <kbd className="palette-trigger-label" style={paletteBtnKbd}>{isMac ? '⌘' : 'Ctrl'} K</kbd>
          </button>
        )}
        <NotificationsBell />
        <button
          type="button"
          onClick={() => navigate('/help')}
          aria-label="Help"
          title="Help & documentation"
        >
          <HelpCircle size={19} />
        </button>
        <button
          type="button"
          className="hide-narrow"
          onClick={() => navigate('/accounts/settings')}
          aria-label="Profile settings"
          title="Settings"
        >
          <Settings size={19} />
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
        </button>
        <span className="portal-user-avatar" title={displayName}>
          {profile?.avatar_url
            ? <img src={profile.avatar_url} alt={displayName} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
            : (initials || 'TV')}
        </span>
        <button type="button" onClick={logoutUser} aria-label="Log out" title="Log out">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
};

const paletteBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 8, width: 'auto',
  padding: '7px 10px', borderRadius: 10, cursor: 'pointer',
  border: '1px solid var(--border,#e5e7eb)', background: 'transparent',
  color: 'var(--text-muted,#6b7280)',
};
const paletteBtnText = { fontSize: 13, fontWeight: 500 };
const paletteBtnKbd = {
  fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 6,
  border: '1px solid var(--border,#e5e7eb)', color: 'var(--text-muted,#9ca3af)',
};

export default Navbar;
