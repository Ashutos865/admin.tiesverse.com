import React from 'react';
import { NavLink } from 'react-router-dom';
import { usePermissions } from '../../context/PermissionContext';
import { 
  Calendar, BookOpen, PlaySquare, Users, Briefcase, 
  FileText, CheckSquare, Video, Mail, CalendarCheck, Shield, LayoutDashboard, Settings, X
} from 'lucide-react';

const Sidebar = ({ activePortal, isOpen, onClose }) => {
  const { hasAnyPermission, isSuperuser } = usePermissions();

  const portalLinks = {
    tiesverse: [
      { name: 'Dashboard', path: '/tiesverse/dashboard', icon: <LayoutDashboard size={20} />, perms: [] },
      { name: 'Events', path: '/tiesverse/events', icon: <Calendar size={20} />, perms: ['view_event', 'add_event', 'change_event', 'delete_event'] },
      { name: 'Articles', path: '/tiesverse/articles', icon: <BookOpen size={20} />, perms: ['view_article', 'add_article', 'change_article', 'delete_article'] },
      { name: 'YouTube Videos', path: '/tiesverse/youtube_videos', icon: <PlaySquare size={20} />, perms: ['view_youtubevideo', 'add_youtubevideo', 'change_youtubevideo', 'delete_youtubevideo'] },
      { name: 'Workshops', path: '/tiesverse/workshops', icon: <Users size={20} />, perms: ['view_workshop', 'add_workshop', 'change_workshop', 'delete_workshop'] },
      { name: 'Team', path: '/tiesverse/team_members', icon: <Users size={20} />, perms: ['view_teammember', 'add_teammember', 'change_teammember', 'delete_teammember'] },
      { name: 'Guests', path: '/tiesverse/guests', icon: <Users size={20} />, perms: ['view_guest', 'add_guest', 'change_guest', 'delete_guest'] },
      { name: 'Webinar Listings', path: '/tiesverse/webinars', icon: <Video size={20} />, perms: ['view_webinarlisting'] },
    ],
    career: [
      { name: 'Dashboard', path: '/career/dashboard', icon: <LayoutDashboard size={20} />, perms: [] },
      { name: 'Position Tracker', path: '/career/positions', icon: <Briefcase size={20} />, perms: ['view_position', 'add_position', 'change_position', 'delete_position'] },
      { name: 'Enrollment Tracker', path: '/career/enrollments', icon: <FileText size={20} />, perms: ['view_enrollment', 'add_enrollment', 'change_enrollment', 'delete_enrollment'] },
      { name: 'Offer Letters', path: '/career/offers', icon: <Mail size={20} />, perms: ['view_offerletter', 'add_offerletter', 'change_offerletter', 'delete_offerletter'] },
    ],
    webinar: [
      { name: 'Dashboard', path: '/webinar/dashboard', icon: <LayoutDashboard size={20} />, perms: [] },
      { name: 'Managing List', path: '/webinar/submissions', icon: <CheckSquare size={20} />, perms: ['view_registrationform', 'change_registrationform'] },
      { name: 'Manage Events', path: '/webinar/events', icon: <Calendar size={20} />, perms: ['view_webinarevent', 'add_webinarevent', 'change_webinarevent', 'delete_webinarevent'] },
      { name: 'Calendar Sync', path: '/webinar/calendar', icon: <CalendarCheck size={20} />, perms: ['view_calendarevent', 'change_calendarevent'] },
    ],
    accounts: [
      { name: 'User Management', path: '/accounts/users', icon: <Users size={20} />, perms: [] },
      { name: 'Permissions', path: '/accounts/permissions', icon: <Shield size={20} />, perms: [] },
    ],
  };

  const portalNameMap = {
    tiesverse: 'Tiesverse Admin',
    career: 'Career Admin',
    webinar: 'Webinar Admin',
    accounts: 'System Control'
  };

  const allLinks = [
    ...(portalLinks[activePortal] || []),
    { name: 'Settings', path: '/accounts/settings', icon: <Settings size={20} />, perms: [] }
  ];

  const visibleLinks = allLinks.filter(link => {
    if (activePortal === 'accounts') return isSuperuser;
    if (link.perms.length === 0) return true;
    return hasAnyPermission(link.perms);
  });

  return (
    <>
      {/* Mobile Sidebar Backdrop */}
      {isOpen && (
        <div 
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden transition-opacity duration-200"
        />
      )}

      {/* Sidebar Shell — Deep Black */}
      <aside 
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col w-[260px] border-r transition-all duration-300 md:static ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
        style={{
          background: 'var(--bg-color)',
          borderColor: 'var(--border)',
        }}
      >
        {/* Header */}
        <div 
          className="h-[70px] flex items-center justify-between px-6"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <div 
              className="w-2.5 h-2.5 rounded-full"
              style={{ 
                background: 'var(--primary)', 
                boxShadow: '0 0 10px var(--primary), 0 0 20px color-mix(in srgb, var(--primary) 30%, transparent)' 
              }}
            />
            <span 
              className="font-extrabold tracking-wide"
              style={{ 
                color: 'var(--primary)', 
                fontSize: '1.125rem',
                letterSpacing: '0.05em'
              }}
            >
              {portalNameMap[activePortal] || 'Admin Portal'}
            </span>
          </div>
          <button 
            onClick={onClose}
            className="md:hidden p-1.5 rounded-lg cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Links Navigation */}
        <nav className="flex-1 py-5 px-3 overflow-y-auto flex flex-col gap-1">
          {visibleLinks.map((link) => (
            <NavLink 
              to={link.path} 
              key={link.path}
              onClick={onClose}
              className={({ isActive }) => 'sidebar-nav-link'}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '12px 16px',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '0.9375rem',
                lineHeight: '1.4',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                textDecoration: 'none',
                ...(isActive ? {
                  background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                  color: 'var(--primary)',
                  boxShadow: 'inset 3px 0 0 var(--primary)',
                } : {
                  background: 'transparent',
                  color: 'var(--text-muted)',
                })
              })}
              onMouseEnter={(e) => {
                if (!e.currentTarget.classList.contains('active')) {
                  e.currentTarget.style.background = 'var(--surface-hover)';
                  e.currentTarget.style.color = 'var(--text-main)';
                  e.currentTarget.style.transform = 'translateX(4px)';
                }
              }}
              onMouseLeave={(e) => {
                const isActive = e.currentTarget.getAttribute('aria-current') === 'page';
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-muted)';
                  e.currentTarget.style.transform = 'translateX(0)';
                }
              }}
            >
              {link.icon}
              {link.name}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div 
          className="px-5 py-4 flex items-center gap-2"
          style={{ 
            borderTop: '1px solid var(--border)',
            fontSize: '0.6875rem',
            color: 'var(--text-muted)',
            fontWeight: 700,
            letterSpacing: '0.05em'
          }}
        >
          <div 
            className="w-1.5 h-1.5 rounded-full"
            style={{ 
              background: '#4caf50',
              animation: 'pulseGlow 1.5s infinite'
            }}
          />
          SYSTEM ONLINE
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
