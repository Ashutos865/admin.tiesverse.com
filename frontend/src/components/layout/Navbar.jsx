import React, { useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { LogOut } from 'lucide-react';

const Navbar = ({ activePortal, setActivePortal }) => {
  const { user, logoutUser } = useContext(AuthContext);

  return (
    <header className="navbar">
      <div className="portal-selector">
        <button 
          className={`portal-btn ${activePortal === 'tiesverse' ? 'active' : ''}`}
          onClick={() => setActivePortal('tiesverse')}
        >
          Tiesverse Portal
        </button>
        <button 
          className={`portal-btn ${activePortal === 'career' ? 'active' : ''}`}
          onClick={() => setActivePortal('career')}
        >
          Career Portal
        </button>
        <button 
          className={`portal-btn ${activePortal === 'webinar' ? 'active' : ''}`}
          onClick={() => setActivePortal('webinar')}
        >
          Webinar Portal
        </button>
        {user?.user_id === 1 && ( // Using a simple check; better to check is_superuser from token if embedded
          <button 
            className={`portal-btn ${activePortal === 'accounts' ? 'active' : ''}`}
            onClick={() => setActivePortal('accounts')}
          >
            Users
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
