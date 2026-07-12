import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar, { portals } from './Sidebar';
import CommandPalette from '../CommandPalette';
import { usePermissions } from '../../context/PermissionContext';
import { useMe } from '../../context/MeContext';

const AdminLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const { hasAnyPermission, isSuperuser } = usePermissions();
  const { isMember, isLead, isAdvisory, isDeveloper, scope } = useMe();

  // Mirror the Sidebar's role gating so the palette only surfaces reachable pages.
  const commands = useMemo(() => {
    const portalVisible = (p) => {
      if (p.developerOnly) return isDeveloper;
      if (p.memberOnly) return isMember;
      if (p.advisoryOnly) return isSuperuser || isAdvisory;
      if (p.advisoryOrLead) return isSuperuser || isAdvisory || isLead;
      if (p.perms === null) return isSuperuser;
      return isSuperuser || hasAnyPermission(p.perms);
    };
    const linkVisible = (l) => {
      if (l.developerOnly) return isDeveloper;
      if (l.superuserOnly) return isSuperuser;
      if (l.advisoryOnly) return isSuperuser || isAdvisory;
      if (l.advisoryOrLead) return isSuperuser || isAdvisory || isLead;
      if (l.scopeAll) return isSuperuser || scope === 'all';
      return (l.perms || []).length === 0 || isSuperuser || hasAnyPermission(l.perms);
    };

    const seen = new Set();
    const out = [];
    portals.filter(portalVisible).forEach((p) => {
      p.links.filter(linkVisible).forEach((l) => {
        if (seen.has(l.path)) return; // e.g. Email Templates appears in two portals
        seen.add(l.path);
        out.push({
          id: l.path,
          label: l.name,
          hint: p.label,
          icon: l.icon,
          keywords: p.label,
          run: () => navigate(l.path),
        });
      });
    });
    return out;
  }, [hasAnyPermission, isSuperuser, isMember, isLead, isAdvisory, isDeveloper, scope, navigate]);

  // Global ⌘K / Ctrl+K toggle.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Close the palette on route change (e.g. after selecting a command).
  useEffect(() => { setPaletteOpen(false); }, [location.pathname]);

  const activePortal = location.pathname.startsWith('/me/')
    ? 'mywork'
    : location.pathname.startsWith('/learn')
    ? 'learn'
    : location.pathname.startsWith('/hr')
    ? 'hr'
    : location.pathname.startsWith('/career')
      ? 'career'
      : location.pathname.startsWith('/webinar')
        ? 'webinar'
        : location.pathname.startsWith('/certificates')
          ? 'certificates'
          : location.pathname.startsWith('/technical')
            ? 'technical'
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
          onOpenPalette={() => setPaletteOpen(true)}
        />
        <main className="admin-page custom-scrollbar">
          <Outlet />
        </main>
      </div>
      {paletteOpen && (
        <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />
      )}
    </div>
  );
};

export default AdminLayout;
