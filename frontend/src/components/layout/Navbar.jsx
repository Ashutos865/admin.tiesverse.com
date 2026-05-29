import React, { useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { usePermissions } from '../../context/PermissionContext';
import { LogOut } from 'lucide-react';

const Navbar = ({ activePortal, setActivePortal }) => {
  const { user, logoutUser } = useContext(AuthContext);
  const { hasAnyPermission, isSuperuser } = usePermissions();

  // Define which permissions belong to each portal
  const canSeeTiesverse = hasAnyPermission([
    'view_event', 'add_event', 'change_event', 'delete_event',
    'view_article', 'add_article', 'change_article', 'delete_article',
    'view_youtubevideo', 'view_workshop', 'view_teammember', 'view_guest',
  ]);

  const canSeeCareer = hasAnyPermission([
    'view_position', 'add_position', 'change_position', 'delete_position',
    'view_enrollment', 'view_offerletter',
  ]);

  const canSeeWebinar = hasAnyPermission([
    'view_webinarevent', 'add_webinarevent', 'change_webinarevent',
    'view_registrationform', 'view_calendarevent',
  ]);

  return (
    <header className="navbar">
      <div className="portal-selector">
        {canSeeTiesverse && (
          <button 
            className={`portal-btn ${activePortal === 'tiesverse' ? 'active' : ''}`}
            onClick={() => setActivePortal('tiesverse')}
          >
            Tiesverse Portal
          </button>
        )}
        {canSeeCareer && (
          <button 
            className={`portal-btn ${activePortal === 'career' ? 'active' : ''}`}
            onClick={() => setActivePortal('career')}
          >
            Career Portal
          </button>
        )}
        {canSeeWebinar && (
          <button 
            className={`portal-btn ${activePortal === 'webinar' ? 'active' : ''}`}
            onClick={() => setActivePortal('webinar')}
          >
            Webinar Portal
          </button>
        )}
        {isSuperuser && (
          <button 
            className={`portal-btn ${activePortal === 'accounts' ? 'active' : ''}`}
            onClick={() => setActivePortal('accounts')}
          >
            Users & Permissions
          </button>
        )}
      </div>
      <div className="user-profile" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span style={{ fontWeight: '500', color: 'var(--text-main)' }}>
          {user?.username || 'Admin'}
        </span>
        <button className="btn" onClick={logoutUser} style={{ background: 'transparent', color: 'var(--text-muted)' }}>
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
};

export default Navbar;
