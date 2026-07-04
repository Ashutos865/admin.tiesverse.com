import { NavLink, useNavigate } from 'react-router-dom';
import {
  Award,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Globe,
  History,
  LayoutDashboard,
  Mail,
  MonitorSmartphone,
  PackageOpen,
  Shield,
  TicketPercent,
  UserCheck,
  Users,
  Video,
  X,
} from 'lucide-react';
import { usePermissions } from '../../context/PermissionContext';
import { useMe } from '../../context/MeContext';

const portals = [
  {
    key: 'mywork',
    label: 'My Work',
    icon: ClipboardCheck,
    firstPath: '/me/attendance',
    memberOnly: true,
    links: [
      { name: 'My Attendance', path: '/me/attendance', icon: CalendarDays,      perms: [] },
      { name: 'My Leave',      path: '/me/leave',      icon: ClipboardList,     perms: [] },
      { name: 'My Tasks',      path: '/me/tasks',      icon: MonitorSmartphone, perms: [] },
      { name: 'My Assets',     path: '/me/assets',     icon: PackageOpen,       perms: [] },
      { name: 'My Profile',    path: '/me/profile',    icon: UserCheck,         perms: [] },
    ],
  },
  {
    key: 'tiesverse',
    label: 'Tiesverse Portal',
    icon: Globe,
    firstPath: '/tiesverse/dashboard',
    perms: [
      'view_event', 'add_event', 'change_event', 'delete_event',
      'view_department', 'add_department', 'change_department', 'delete_department',
      'view_teammember', 'add_teammember', 'change_teammember', 'delete_teammember',
    ],
    links: [
      { name: 'Dashboard',          path: '/tiesverse/dashboard',    icon: LayoutDashboard, perms: [] },
      { name: 'Articles & Reports', path: '/tiesverse/articles',     icon: FileText,        perms: ['view_department', 'add_department', 'change_department', 'delete_department'] },
      { name: 'Team Members',       path: '/tiesverse/team_members', icon: Users,           perms: ['view_teammember', 'add_teammember', 'change_teammember', 'delete_teammember'] },
    ],
  },
  {
    key: 'career',
    label: 'Career Portal',
    icon: BriefcaseBusiness,
    firstPath: '/career/dashboard',
    perms: [
      'view_position', 'add_position', 'change_position', 'delete_position',
      'view_enrollment', 'add_enrollment', 'change_enrollment',
      'view_offerletter', 'add_offerletter', 'change_offerletter', 'delete_offerletter',
      'view_onboardingsubmission', 'add_onboardingsubmission', 'change_onboardingsubmission',
    ],
    links: [
      { name: 'Dashboard',           path: '/career/dashboard',    icon: LayoutDashboard,   perms: [] },
      { name: 'Position Tracker',    path: '/career/positions',    icon: BriefcaseBusiness, perms: ['view_position'] },
      { name: 'Application Tracker', path: '/career/applications', icon: FileText,          perms: ['view_enrollment'] },
      { name: 'Offer Letters',       path: '/career/offers',       icon: Mail,              perms: ['view_offerletter'] },
      { name: 'Form Gates',          path: '/career/form_gates',   icon: CheckSquare,       perms: ['view_onboardingsubmission', 'change_onboardingsubmission'] },
      { name: 'Onboarding',          path: '/career/onboarding',   icon: ClipboardCheck,    perms: ['view_onboardingsubmission'] },
    ],
  },
  {
    key: 'hr',
    label: 'HR Portal',
    icon: UserCheck,
    firstPath: '/hr/team',
    perms: [
      'view_onboardingsubmission',
      'view_hrdepartment', 'add_hrdepartment', 'change_hrdepartment', 'delete_hrdepartment',
      'view_attendancerecord', 'add_attendancerecord', 'change_attendancerecord',
      'view_leaverequest', 'add_leaverequest', 'change_leaverequest',
      'view_asset', 'add_asset', 'change_asset', 'delete_asset',
      'view_task', 'add_task', 'change_task', 'delete_task',
    ],
    links: [
      { name: 'Team Directory',  path: '/hr/team',        icon: Users,             perms: ['view_onboardingsubmission'] },
      { name: 'HR Departments',  path: '/hr/departments', icon: Building2,         perms: ['view_hrdepartment'] },
      { name: 'Attendance',      path: '/hr/attendance',  icon: CalendarDays,      perms: ['view_attendancerecord', 'add_attendancerecord', 'change_attendancerecord'] },
      { name: 'Leave',           path: '/hr/leave',       icon: ClipboardList,     perms: ['view_leaverequest'] },
      { name: 'Assets',          path: '/hr/assets',      icon: PackageOpen,       perms: ['view_asset'] },
      { name: 'Tasks',           path: '/hr/tasks',       icon: MonitorSmartphone, perms: ['view_task'] },
    ],
  },
  {
    key: 'webinar',
    label: 'Webinar Portal',
    icon: Video,
    firstPath: '/webinar/dashboard',
    perms: [
      'view_webinarevent', 'add_webinarevent', 'change_webinarevent',
      'view_registrationform', 'view_calendarevent',
      'view_eventregistration', 'add_eventregistration',
      'view_eventspeaker', 'add_eventspeaker',
    ],
    links: [
      { name: 'Dashboard',            path: '/webinar/dashboard',          icon: LayoutDashboard, perms: [] },
      { name: 'Events',               path: '/webinar/events',             icon: CalendarDays,    perms: ['view_event', 'add_event', 'change_event', 'delete_event'] },
      { name: 'Webinars & Workshops', path: '/webinar/webinars-workshops', icon: Video,           perms: ['view_eventregistration', 'add_eventregistration'] },
      { name: 'Speakers',             path: '/webinar/event_speakers',     icon: Users,           perms: ['view_eventspeaker', 'add_eventspeaker'] },
      { name: 'Registrations',        path: '/webinar/registrations',      icon: FileText,        perms: ['view_registrationform'] },
      { name: 'Coupons',              path: '/webinar/coupons',            icon: TicketPercent,   perms: ['view_webinarevent'] },
    ],
  },
  {
    key: 'certificates',
    label: 'Certificates & Email',
    icon: Award,
    firstPath: '/certificates/templates',
    perms: null,
    links: [
      { name: 'Certificate Templates', path: '/certificates/templates', icon: Award,   perms: [] },
      { name: 'Generated Files',       path: '/certificates/generated', icon: History, perms: [] },
      { name: 'Email Templates',       path: '/accounts/email-templates', icon: Mail,  perms: [], superuserOnly: true },
    ],
  },
  {
    key: 'accounts',
    label: 'Users & Permissions',
    icon: Shield,
    firstPath: '/accounts/settings',
    // Visible to superusers OR anyone with delegation capability
    perms: ['can_delegate_permissions'],
    links: [
      { name: 'User Management', path: '/accounts/users',           icon: Users,     perms: [],                          superuserOnly: true },
      { name: 'Permissions',     path: '/accounts/permissions',     icon: Shield,    perms: ['can_delegate_permissions'] },
      { name: 'Email Templates', path: '/accounts/email-templates', icon: Mail,      perms: [],                          superuserOnly: true },
      { name: 'Profile',         path: '/accounts/settings',       icon: UserCheck, perms: [] },
    ],
  },
];

const Sidebar = ({ activePortal, isOpen, onClose }) => {
  const { hasAnyPermission, isSuperuser } = usePermissions();
  const { isMember } = useMe();
  const navigate = useNavigate();

  const isPortalVisible = (portal) => {
    if (portal.memberOnly) return isMember;
    if (portal.perms === null) return isSuperuser;
    return isSuperuser || hasAnyPermission(portal.perms);
  };

  const isLinkVisible = (link) => {
    if (link.superuserOnly) return isSuperuser;
    return link.perms.length === 0 || isSuperuser || hasAnyPermission(link.perms);
  };

  const handlePortalClick = (portal) => {
    navigate(portal.firstPath);
    onClose();
  };

  return (
    <>
      {isOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="portal-sidebar-backdrop"
          onClick={onClose}
        />
      )}
      <aside className={`portal-sidebar ${isOpen ? 'is-open' : ''}`}>
        <div className="portal-sidebar-brand">
          <div>
            <strong>Tiesverse</strong>
            <span>Admin Control Center</span>
          </div>
          <button
            type="button"
            className="portal-sidebar-close"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="portal-sidebar-nav custom-scrollbar" aria-label="Main navigation">
          {portals.filter(isPortalVisible).map((portal) => {
            const PortalIcon = portal.icon;
            const isActive = activePortal === portal.key;
            const visibleLinks = portal.links.filter(isLinkVisible);

            return (
              <div key={portal.key} className="portal-nav-section">
                <button
                  type="button"
                  className={`portal-nav-header ${isActive ? 'is-active' : ''}`}
                  onClick={() => handlePortalClick(portal)}
                  aria-expanded={isActive}
                >
                  <PortalIcon size={17} strokeWidth={1.9} />
                  <span>{portal.label}</span>
                  <ChevronDown
                    size={13}
                    className={`portal-nav-chevron ${isActive ? 'is-open' : ''}`}
                  />
                </button>

                {isActive && (
                  <div className="portal-nav-links">
                    {visibleLinks.map((link) => {
                      const LinkIcon = link.icon;
                      return (
                        <NavLink
                          to={link.path}
                          key={link.path}
                          onClick={onClose}
                          className={({ isActive: linkActive }) =>
                            `portal-sidebar-link ${linkActive ? 'is-active' : ''}`
                          }
                        >
                          <LinkIcon size={16} strokeWidth={1.8} />
                          <span>{link.name}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="portal-sidebar-status">
          <span />
          System online
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
