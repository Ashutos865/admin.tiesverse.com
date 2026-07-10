import { NavLink, useNavigate } from 'react-router-dom';
import {
  Award,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Database,
  CheckSquare,
  FileSpreadsheet,
  FolderKanban,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  FileText,
  File,
  Globe,
  History,
  Image,
  LayoutDashboard,
  LayoutGrid,
  ListTree,
  LogOut,
  Mail,
  Megaphone,
  MessageSquare,
  MonitorSmartphone,
  PackageOpen,
  Server,
  Shield,
  Tag,
  TicketPercent,
  UserCheck,
  Users,
  Video,
  X,
  Image as ImageIcon,
} from 'lucide-react';
import { usePermissions } from '../../context/PermissionContext';
import { useMe } from '../../context/MeContext';
import Wordmark from '../Wordmark';

export const portals = [
  {
    key: 'mywork',
    label: 'My Work',
    icon: ClipboardCheck,
    firstPath: '/me/attendance',
    memberOnly: true,
    links: [
      { name: 'My Attendance', path: '/me/attendance', icon: CalendarDays,      perms: [] },
      { name: 'My Leave',      path: '/me/leave',      icon: ClipboardList,     perms: [] },
      { name: 'Offboarding',   path: '/me/offboarding', icon: LogOut,           perms: [] },
      { name: 'My Tasks',      path: '/me/tasks',      icon: MonitorSmartphone, perms: [] },
      { name: 'My Assets',     path: '/me/assets',     icon: PackageOpen,       perms: [] },
      { name: 'My Profile',    path: '/me/profile',    icon: UserCheck,         perms: [] },
      { name: 'Policies',      path: '/me/policies',   icon: FileText,          perms: [] },
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
      { name: 'Team Members',       path: '/tiesverse/team_members', icon: Users,           perms: ['view_teammember', 'add_teammember', 'change_teammember', 'delete_teammember'] },
      { name: 'Tech Products',      path: '/tiesverse/tech-products', icon: LayoutGrid,     perms: [] },
      { name: 'Website Images',     path: '/tiesverse/website-images', icon: ImageIcon,     perms: [] },
      { name: 'Data API',           path: '/tiesverse/data-api',     icon: Database,        perms: [], advisoryOnly: true },
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
    key: 'projects',
    label: 'Projects',
    icon: FolderKanban,
    firstPath: '/projects',
    perms: ['view_project'],   // Advisory/Team Leads/HR + members (row-scoped in the API)
    links: [
      { name: 'All Projects', path: '/projects', icon: FolderKanban, perms: ['view_project'] },
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
      'view_offboardingrequest', 'can_review_offboarding',
      'view_asset', 'add_asset', 'change_asset', 'delete_asset',
      'view_task', 'add_task', 'change_task', 'delete_task',
    ],
    links: [
      { name: 'Master Directory', path: '/hr/directory',   icon: Database,          scopeAll: true },
      { name: 'Team Directory',  path: '/hr/team',        icon: Users,             perms: ['view_onboardingsubmission'] },
      { name: 'HR Departments',  path: '/hr/departments', icon: Building2,         perms: ['add_hrdepartment', 'change_hrdepartment', 'delete_hrdepartment'] },
      { name: 'Attendance',      path: '/hr/attendance',  icon: CalendarDays,      perms: ['view_attendancerecord', 'add_attendancerecord', 'change_attendancerecord'] },
      { name: 'Leave',           path: '/hr/leave',       icon: ClipboardList,     perms: ['view_leaverequest'] },
      { name: 'Offboarding',     path: '/hr/offboarding', icon: LogOut,            perms: ['view_offboardingrequest'] },
      { name: 'Assets',          path: '/hr/assets',      icon: PackageOpen,       perms: ['view_asset'] },
      { name: 'Tasks',           path: '/hr/tasks',       icon: MonitorSmartphone, perms: ['view_task'] },
      { name: 'New Signups',     path: '/hr/signups',     icon: Users,             perms: ['add_onboardingsubmission'] },
      { name: 'Policies',        path: '/hr/policies',    icon: FileText,          scopeAll: true },
      { name: 'Forms',           path: '/hr/forms',       icon: FileSpreadsheet,   scopeAll: true },
    ],
  },
  {
    key: 'advisory',
    label: 'Advisory',
    icon: ClipboardCheck,
    firstPath: '/advisory',
    advisoryOrLead: true,
    links: [
      { name: 'Oversight & Updates', path: '/advisory', icon: ClipboardCheck, advisoryOrLead: true },
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
    key: 'wordpress',
    label: 'Articles & Reports',
    icon: Globe,
    firstPath: '/wordpress/posts',
    perms: null,   // superuser only (the server-side WP proxy is superuser-gated)
    links: [
      { name: 'Posts',              path: '/wordpress/posts',      icon: FileText,         perms: [], superuserOnly: true },
      { name: 'Pages',              path: '/wordpress/pages',      icon: File,             perms: [], superuserOnly: true },
      { name: 'Media',              path: '/wordpress/media',      icon: Image,            perms: [], superuserOnly: true },
      { name: 'Categories & Tags',  path: '/wordpress/taxonomies', icon: Tag,              perms: [], superuserOnly: true },
      { name: 'Comments',           path: '/wordpress/comments',   icon: MessageSquare,    perms: [], superuserOnly: true },
      { name: 'Users',              path: '/wordpress/users',      icon: Users,            perms: [], superuserOnly: true },
      { name: 'Website Navigation', path: '/wordpress/navigation', icon: LayoutGrid,       perms: [], superuserOnly: true },
      { name: 'Blog Menu',          path: '/wordpress/blog-menu',  icon: ListTree,         perms: [], superuserOnly: true },
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
      { name: 'Email Templates',       path: '/accounts/email-templates', icon: Mail,      perms: [], superuserOnly: true },
      { name: 'Mail Automation',       path: '/accounts/mail-automation', icon: Megaphone, perms: [], superuserOnly: true },
    ],
  },
  {
    key: 'technical',
    label: 'Technical',
    icon: Server,
    firstPath: '/technical',
    developerOnly: true,
    links: [
      { name: 'Infrastructure', path: '/technical', icon: Server, developerOnly: true },
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
  const { isMember, isLead, isAdvisory, isDeveloper, scope } = useMe();
  const navigate = useNavigate();

  const isPortalVisible = (portal) => {
    if (portal.developerOnly) return isDeveloper;
    if (portal.memberOnly) return isMember;
    if (portal.advisoryOnly) return isSuperuser || isAdvisory;
    if (portal.advisoryOrLead) return isSuperuser || isAdvisory || isLead;
    if (portal.perms === null) return isSuperuser;
    return isSuperuser || hasAnyPermission(portal.perms);
  };

  const isLinkVisible = (link) => {
    if (link.developerOnly) return isDeveloper;
    if (link.superuserOnly) return isSuperuser;
    if (link.advisoryOnly) return isSuperuser || isAdvisory;
    if (link.advisoryOrLead) return isSuperuser || isAdvisory || isLead;
    if (link.scopeAll) return isSuperuser || scope === 'all';
    return (link.perms || []).length === 0 || isSuperuser || hasAnyPermission(link.perms);
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
            <Wordmark size={24} />
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
      </aside>
    </>
  );
};

export default Sidebar;
