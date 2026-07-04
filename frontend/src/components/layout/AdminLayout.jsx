import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

const AdminLayout = () => {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const activePortal = location.pathname.startsWith('/me/')
    ? 'mywork'
    : location.pathname.startsWith('/hr')
    ? 'hr'
    : location.pathname.startsWith('/career')
      ? 'career'
      : location.pathname.startsWith('/webinar')
        ? 'webinar'
        : location.pathname.startsWith('/certificates')
          ? 'certificates'
          : location.pathname.startsWith('/accounts')
            ? 'accounts'
            : 'tiesverse';

  return (
    <div className="admin-shell">
      <Sidebar
        activePortal={activePortal}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      <div className="admin-main">
        <Navbar
          activePortal={activePortal}
          setIsSidebarOpen={setIsSidebarOpen}
        />
        <main className="admin-page custom-scrollbar">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
