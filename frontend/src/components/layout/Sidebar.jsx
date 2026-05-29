import React from 'react';
import { NavLink } from 'react-router-dom';
import { usePermissions } from '../../context/PermissionContext';
import { 
  Calendar, BookOpen, PlaySquare, Users, Briefcase, 
  FileText, CheckSquare, Video, Mail, CalendarCheck, Shield
} from 'lucide-react';

const Sidebar = ({ activePortal }) => {
  const { hasAnyPermission, isSuperuser } = usePermissions();

  // Each link has a list of permissions — if the user has ANY of them, they see it
  const portalLinks = {
    tiesverse: [
      { name: 'Events Management', path: '/tiesverse/events', icon: <Calendar size={18} />, perms: ['view_event', 'add_event', 'change_event', 'delete_event'] },
      { name: 'Articles & Content', path: '/tiesverse/articles', icon: <BookOpen size={18} />, perms: ['view_article', 'add_article', 'change_article', 'delete_article'] },
      { name: 'YouTube Videos', path: '/tiesverse/youtube', icon: <PlaySquare size={18} />, perms: ['view_youtubevideo', 'add_youtubevideo', 'change_youtubevideo', 'delete_youtubevideo'] },
      { name: 'Workshop List', path: '/tiesverse/workshops', icon: <Users size={18} />, perms: ['view_workshop', 'add_workshop', 'change_workshop', 'delete_workshop'] },
      { name: 'Team List', path: '/tiesverse/team', icon: <Users size={18} />, perms: ['view_teammember', 'add_teammember', 'change_teammember', 'delete_teammember'] },
      { name: 'Guest List', path: '/tiesverse/guests', icon: <Users size={18} />, perms: ['view_guest', 'add_guest', 'change_guest', 'delete_guest'] },
      { name: 'Webinars', path: '/tiesverse/webinars', icon: <Video size={18} />, perms: ['view_event'] },
    ],
    career: [
      { name: 'Position Tracker', path: '/career/positions', icon: <Briefcase size={18} />, perms: ['view_position', 'add_position', 'change_position', 'delete_position'] },
      { name: 'Enrollment Tracker', path: '/career/enrollments', icon: <FileText size={18} />, perms: ['view_enrollment', 'add_enrollment', 'change_enrollment', 'delete_enrollment'] },
      { name: 'Offer Letters', path: '/career/offers', icon: <Mail size={18} />, perms: ['view_offerletter', 'add_offerletter', 'change_offerletter', 'delete_offerletter'] },
    ],
    webinar: [
      { name: 'Managing List', path: '/webinar/submissions', icon: <CheckSquare size={18} />, perms: ['view_registrationform', 'change_registrationform'] },
      { name: 'Manage Events', path: '/webinar/events', icon: <Calendar size={18} />, perms: ['view_webinarevent', 'add_webinarevent', 'change_webinarevent', 'delete_webinarevent'] },
      { name: 'Calendar Sync', path: '/webinar/calendar', icon: <CalendarCheck size={18} />, perms: ['view_calendarevent', 'change_calendarevent'] },
    ],
    accounts: [
      { name: 'User Management', path: '/accounts/users', icon: <Users size={18} />, perms: [] },
      { name: 'Permissions', path: '/accounts/permissions', icon: <Shield size={18} />, perms: [] },
    ],
  };

  const allLinks = portalLinks[activePortal] || [];

  // Filter links based on permissions (accounts links are superuser-only, handled by Navbar)
  const visibleLinks = allLinks.filter(link => {
    if (activePortal === 'accounts') return isSuperuser;
    if (link.perms.length === 0) return true;
    return hasAnyPermission(link.perms);
  });

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        Admin Control Center
      </div>
      <nav className="sidebar-nav">
        {visibleLinks.map((link) => (
          <NavLink 
            to={link.path} 
            key={link.path}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            {link.icon}
            {link.name}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
