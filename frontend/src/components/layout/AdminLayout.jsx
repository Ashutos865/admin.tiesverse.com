import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

const AdminLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [activePortal, setActivePortal] = useState('tiesverse');

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
    if (portal === 'tiesverse') navigate('/tiesverse/events');
    if (portal === 'career') navigate('/career/positions');
    if (portal === 'webinar') navigate('/webinar/submissions');
    if (portal === 'accounts') navigate('/accounts/users');
  };

  return (
    <div className="admin-layout">
      <Sidebar activePortal={activePortal} />
      <div className="main-content">
        <Navbar activePortal={activePortal} setActivePortal={handlePortalChange} />
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
