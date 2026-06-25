import React, { useState, useEffect, useContext } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ThemeContext } from '../../context/ThemeContext';
import { usePermissions } from '../../context/PermissionContext';
import { Globe, Briefcase, Video, Shield } from 'lucide-react';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

const AdminLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme } = useContext(ThemeContext);
  const { hasAnyPermission, isSuperuser } = usePermissions();
  const [activePortal, setActivePortal] = useState('tiesverse');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Sync active portal with URL
  useEffect(() => {
    if (location.pathname.startsWith('/career')) {
      setActivePortal('career');
    } else if (location.pathname.startsWith('/webinar')) {
      setActivePortal('webinar');
    } else if (location.pathname.startsWith('/accounts')) {
      setActivePortal('accounts');
    } else {
      setActivePortal('tiesverse');
    }
  }, [location]);

  // When portal changes via navbar, redirect to its first link
  const handlePortalChange = (portal) => {
    setActivePortal(portal);
    if (portal === 'tiesverse') navigate('/tiesverse/dashboard');
    if (portal === 'career') navigate('/career/dashboard');
    if (portal === 'webinar') navigate('/webinar/dashboard');
    if (portal === 'accounts') navigate('/accounts/users');
  };

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
    { key: 'tiesverse', label: 'Tiesverse', icon: <Globe size={20} />, show: canSeeTiesverse },
    { key: 'career', label: 'Career', icon: <Briefcase size={20} />, show: canSeeCareer },
    { key: 'webinar', label: 'Webinar', icon: <Video size={20} />, show: canSeeWebinar },
    { key: 'accounts', label: 'System', icon: <Shield size={20} />, show: isSuperuser },
  ];

  return (
    <div 
      className="flex h-screen overflow-hidden"
      style={{
        background: 'var(--bg-color)',
        color: 'var(--text-main)',
        transition: 'background 0.3s ease, color 0.3s ease',
      }}
    >
      <Sidebar 
        activePortal={activePortal} 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
      />
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <Navbar 
          activePortal={activePortal} 
          setActivePortal={handlePortalChange} 
          setIsSidebarOpen={setIsSidebarOpen}
        />
        <main 
          className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 pb-28 sm:pb-8"
          style={{
            background: 'var(--bg-color)',
          }}
        >
          <Outlet />
        </main>

        {/* Mobile Bottom Navigation Bar */}
        <div className="sm:hidden absolute bottom-0 left-0 right-0 border-t flex justify-around items-center h-[70px] z-40"
             style={{ 
               background: 'var(--surface)',
               borderColor: 'var(--border)'
             }}>
          {portalButtons.filter(p => p.show).map(portal => (
            <button 
              key={portal.key}
              onClick={() => handlePortalChange(portal.key)}
              className="flex flex-col items-center justify-center w-full h-full gap-1 cursor-pointer border-none bg-transparent"
              style={{
                color: activePortal === portal.key ? 'var(--primary)' : 'var(--text-muted)',
                transition: 'all 0.2s',
              }}
            >
              {portal.icon}
              <span style={{ fontSize: '0.65rem', fontWeight: 600 }}>{portal.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminLayout;
