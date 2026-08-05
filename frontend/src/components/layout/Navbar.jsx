import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Menu } from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';

/* The topbar carries only where you are: a way back, and who is greeted.
 *
 * Everything that used to sit on the right has a better home. Mail is the
 * floating button at the bottom right; theme, account settings and log out are
 * in the sidebar's profile menu; search is ⌘K, which is where people who use
 * it were reaching for it anyway.
 */
const Navbar = ({ setIsSidebarOpen }) => {
  const { user, profile } = useContext(AuthContext);
  const navigate = useNavigate();

  const displayName = profile?.display_name || user?.username || 'Admin';
  const firstName = displayName.split(/\s+/)[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

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
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Go back"
          title="Back to the previous page"
          className="topbar-nav-btn"
          style={navBtn}
        >
          <ArrowLeft size={19} />
        </button>
        <span className="portal-topbar-title">{greeting}, {firstName}</span>
      </div>
    </header>
  );
};

const navBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
  border: '1px solid var(--outline-variant)', background: 'transparent',
  color: 'var(--text-muted)', flex: 'none',
};

export default Navbar;
