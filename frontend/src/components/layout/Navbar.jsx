import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Menu, Moon, Settings, Sun } from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import { ThemeContext } from '../../context/ThemeContext';

const portalLabels = {
  tiesverse:    'Tiesverse Portal',
  career:       'Career Portal',
  webinar:      'Webinar Portal',
  certificates: 'Certificate Generator',
  accounts:     'Users & Permissions',
};

const Navbar = ({ activePortal, setIsSidebarOpen }) => {
  const { user, profile, logoutUser } = useContext(AuthContext);
  const { theme, toggleTheme } = useContext(ThemeContext);
  const navigate = useNavigate();

  const displayName = profile?.display_name || user?.username || 'Admin';
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
        <span className="portal-topbar-title">{portalLabels[activePortal] || 'Admin'}</span>
      </div>

      <div className="portal-topbar-actions">
        <button
          type="button"
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
        <span className="portal-user-avatar" title={displayName}>{initials || 'TV'}</span>
        <button type="button" onClick={logoutUser} aria-label="Log out" title="Log out">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
};

export default Navbar;
