import React, { useState, useEffect, useContext } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ThemeContext } from '../../context/ThemeContext';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

const AdminLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme } = useContext(ThemeContext);
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
      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar 
          activePortal={activePortal} 
          setActivePortal={handlePortalChange} 
          setIsSidebarOpen={setIsSidebarOpen}
        />
        <main 
          className="flex-1 overflow-y-auto"
          style={{
            padding: '24px 32px',
            background: 'var(--bg-color)',
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
