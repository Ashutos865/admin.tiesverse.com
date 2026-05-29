import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  Calendar, BookOpen, PlaySquare, Users, Briefcase, 
  FileText, CheckSquare, Video, Mail, CalendarCheck
} from 'lucide-react';

const Sidebar = ({ activePortal }) => {
  const portalLinks = {
    tiesverse: [
      { name: 'Events Management', path: '/tiesverse/events', icon: <Calendar size={18} /> },
      { name: 'Articles & Content', path: '/tiesverse/articles', icon: <BookOpen size={18} /> },
      { name: 'YouTube Videos', path: '/tiesverse/youtube', icon: <PlaySquare size={18} /> },
      { name: 'Workshop List', path: '/tiesverse/workshops', icon: <Users size={18} /> },
      { name: 'Team List', path: '/tiesverse/team', icon: <Users size={18} /> },
      { name: 'Guest List', path: '/tiesverse/guests', icon: <Users size={18} /> },
      { name: 'Webinars', path: '/tiesverse/webinars', icon: <Video size={18} /> },
    ],
    career: [
      { name: 'Position Tracker', path: '/career/positions', icon: <Briefcase size={18} /> },
      { name: 'Enrollment Tracker', path: '/career/enrollments', icon: <FileText size={18} /> },
      { name: 'Offer Letters', path: '/career/offers', icon: <Mail size={18} /> },
    ],
    webinar: [
      { name: 'Managing List', path: '/webinar/submissions', icon: <CheckSquare size={18} /> },
      { name: 'Manage Events', path: '/webinar/events', icon: <Calendar size={18} /> },
      { name: 'Calendar Sync', path: '/webinar/calendar', icon: <CalendarCheck size={18} /> },
    ],
    accounts: [
      { name: 'User Management', path: '/accounts/users', icon: <Users size={18} /> },
    ],
  };

  const links = portalLinks[activePortal] || [];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        Admin Control Center
      </div>
      <nav className="sidebar-nav">
        {links.map((link) => (
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
