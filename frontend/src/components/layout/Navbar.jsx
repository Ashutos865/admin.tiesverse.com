import React, { useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { ThemeContext } from '../../context/ThemeContext';
import { usePermissions } from '../../context/PermissionContext';
import { LogOut, Sun, Moon, Menu } from 'lucide-react';

const Navbar = ({ activePortal, setActivePortal, setIsSidebarOpen }) => {
  const { user, logoutUser } = useContext(AuthContext);
  const { theme, toggleTheme } = useContext(ThemeContext);
  const { hasAnyPermission, isSuperuser } = usePermissions();

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

  const portalButtons = [
    { key: 'tiesverse', label: 'Tiesverse Portal', show: canSeeTiesverse },
    { key: 'career', label: 'Career Portal', show: canSeeCareer },
    { key: 'webinar', label: 'Webinar Portal', show: canSeeWebinar },
    { key: 'accounts', label: 'Users & Permissions', show: isSuperuser },
  ];

  return (
    <header 
      className="h-[70px] w-full flex items-center justify-between px-4 md:px-8 transition-colors duration-200"
      style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center gap-3">
        {/* Hamburger Menu on Mobile */}
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="md:hidden p-2 rounded-lg cursor-pointer"
          style={{
            color: 'var(--text-muted)',
          }}
        >
          <Menu size={22} />
        </button>

        {/* Portal Switchers */}
        <div className="hidden sm:flex gap-2">
          {portalButtons.filter(p => p.show).map(portal => (
            <button 
              key={portal.key}
              className="cursor-pointer"
              style={{
                padding: '8px 16px',
                borderRadius: '10px',
                fontSize: '0.875rem',
                fontWeight: 600,
                transition: 'all 0.2s ease',
                border: 'none',
                ...(activePortal === portal.key ? {
                  background: 'var(--primary)',
                  color: '#FFFFFF',
                  boxShadow: '0 4px 12px color-mix(in srgb, var(--primary) 35%, transparent)',
                } : {
                  background: 'transparent',
                  color: 'var(--text-muted)',
                })
              }}
              onMouseEnter={(e) => {
                if (activePortal !== portal.key) {
                  e.currentTarget.style.color = 'var(--primary)';
                  e.currentTarget.style.background = 'color-mix(in srgb, var(--primary) 8%, transparent)';
                }
              }}
              onMouseLeave={(e) => {
                if (activePortal !== portal.key) {
                  e.currentTarget.style.color = 'var(--text-muted)';
                  e.currentTarget.style.background = 'transparent';
                }
              }}
              onClick={() => setActivePortal(portal.key)}
            >
              {portal.label}
            </button>
          ))}
        </div>

        {/* Portal title indicator for very small screens */}
        <span 
          className="sm:hidden font-bold uppercase tracking-wider"
          style={{ 
            color: 'var(--primary)',
            fontSize: '0.875rem',
          }}
        >
          {activePortal}
        </span>
      </div>

      {/* Profile & Dark/Light Mode Actions */}
      <div className="flex items-center gap-4">
        {/* Theme Toggler */}
        <button 
          onClick={toggleTheme}
          className="p-2 rounded-lg cursor-pointer"
          style={{
            color: 'var(--text-muted)',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--primary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {/* User Details */}
        <div 
          className="flex items-center gap-3 pl-3"
          style={{ borderLeft: '1px solid var(--border)' }}
        >
          <span 
            className="hidden md:inline font-medium"
            style={{ 
              fontSize: '0.9375rem',
              color: 'var(--text-main)',
            }}
          >
            {user?.username || 'Admin'}
          </span>
          <button 
            className="p-2 rounded-lg cursor-pointer"
            onClick={logoutUser}
            title="Log Out"
            style={{
              color: 'var(--text-muted)',
              transition: 'color 0.2s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#EF4444'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
