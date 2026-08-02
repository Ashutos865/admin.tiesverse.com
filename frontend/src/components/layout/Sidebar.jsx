import { useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
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
  Fingerprint,
  File,
  Globe,
  History,
  Image,
  Home,
  LayoutDashboard,
  LayoutGrid,
  ListTree,
  LogOut,
  Mail,
  Megaphone,
  MessageSquare,
  MonitorSmartphone,
  Radar,
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
  BookOpen,
  BarChart3,
} from 'lucide-react';
import { usePermissions } from '../../context/PermissionContext';
import { useMe } from '../../context/MeContext';
import Wordmark from '../Wordmark';

// The main dashboard "home" — where `/` redirects (see App.jsx).
export const HOME_PATH = '/tiesverse/dashboard';

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
    key: 'learn',
    label: 'Learn Portal',
    icon: BookOpen,
    firstPath: '/learn/dashboard',
    everyone: true,                    // Learn Portal is open to every authenticated member
    links: [
      { name: 'Dashboard',       path: '/learn/dashboard',    icon: LayoutDashboard, perms: [] },
      { name: 'Program',         path: '/learn/program',      icon: CalendarDays,    perms: [] },
      { name: 'Courses',         path: '/learn/courses',      icon: LayoutGrid,      perms: [] },
      { name: 'Certificates',    path: '/learn/certificates', icon: Award,           perms: [] },
      { name: 'Leaderboard',     path: '/learn/leaderboard',  icon: BarChart3,       perms: [] },
      { name: 'Manage Learning', path: '/learn/manage',       icon: Video,           perms: ['add_course', 'change_course'] },
    ],
  },
  {
    key: 'docs',
    label: 'TIES Docs',
    icon: BookOpen,
    firstPath: '/docs',
    everyone: true,                    // knowledge base is readable by every member
    links: [
      { name: 'Knowledge Base', path: '/docs', icon: BookOpen, perms: [] },
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
      { name: 'Brands / Mastheads', path: '/tiesverse/brands',       icon: LayoutGrid,     perms: [] },
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
      { name: 'Crew Identity',   path: '/hr/crew-identity', icon: Fingerprint,     perms: ['change_onboardingsubmission'] },
      { name: 'HR Departments',  path: '/hr/departments', icon: Building2,         perms: ['add_hrdepartment', 'change_hrdepartment', 'delete_hrdepartment'] },
      { name: 'Certificates',    path: '/hr/certificates', icon: Award,            perms: ['view_onboardingsubmission'] },
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
    contentAccess: true,   // superuser + content writers/leads (proxy enforces draft-only)
    links: [
      { name: 'Posts',              path: '/wordpress/posts',      icon: FileText,         contentAccess: true },
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
    key: 'nimble',
    label: 'Watchdog',
    icon: Radar,
    firstPath: '/nimble/monitor',
    nimbleAccess: true,   // Nimble-department members + leads + org-wide staff + superusers
    links: [
      { name: 'Watchdog', path: '/nimble/monitor', icon: Radar, nimbleAccess: true },
    ],
  },
  {
    key: 'mail',
    label: 'TIES Mail',
    icon: Mail,
    firstPath: '/mail',
    mailAccess: true,     // anyone a superadmin has given a mailbox (+ superadmins)
    links: [
      { name: 'Mailbox', path: '/mail', icon: Mail, mailAccess: true },
      { name: 'Manage mailboxes', path: '/mail/admin', icon: Shield, superuserOnly: true },
    ],
  },
  {
    key: 'content-calendar',
    label: 'Content Calendar',
    icon: CalendarDays,
    firstPath: '/content/calendar',
    // NOTE: `calendarAccess`, not `contentAccess` — the latter already means
    // "may write WordPress articles" on the Articles portal above.
    calendarAccess: true,
    links: [
      { name: 'Calendar', path: '/content/calendar', icon: CalendarDays, calendarAccess: true },
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
  const { isMember, isLead, isAdvisory, isDeveloper, scope, articleAccess, nimbleAccess, mailAccess, contentAccess } = useMe();
  // Content writers/leads (or superusers) may see Articles & Reports.
  const hasArticleAccess = isSuperuser || articleAccess === 'full' || articleAccess === 'draft';
  // Nimble-department members (or superusers/org-wide staff) may see Nimble Monitor.
  const hasNimbleAccess = isSuperuser || nimbleAccess === 'full';
  const hasMailAccess = isSuperuser || mailAccess === 'admin' || mailAccess === 'user';
  const hasCalendarAccess = isSuperuser || contentAccess === 'full' || contentAccess === 'member';

  // Which portal folder is expanded. Follows the current page by default, but the
  // user can freely open/collapse any folder by clicking its header.
  const [expandedKey, setExpandedKey] = useState(activePortal);
  // When navigation changes the active portal, open that folder.
  useEffect(() => { setExpandedKey(activePortal); }, [activePortal]);

  const isPortalVisible = (portal) => {
    if (portal.everyone) return true;   // open to every authenticated member (e.g. Learn Portal)
    if (portal.developerOnly) return isDeveloper;
    if (portal.memberOnly) return isMember;
    if (portal.contentAccess) return hasArticleAccess;
    if (portal.nimbleAccess) return hasNimbleAccess;
    if (portal.mailAccess) return hasMailAccess;
    if (portal.calendarAccess) return hasCalendarAccess;
    if (portal.advisoryOnly) return isSuperuser || isAdvisory;
    if (portal.advisoryOrLead) return isSuperuser || isAdvisory || isLead;
    if (portal.perms === null) return isSuperuser;
    return isSuperuser || hasAnyPermission(portal.perms);
  };

  const isLinkVisible = (link) => {
    if (link.developerOnly) return isDeveloper;
    if (link.contentAccess) return hasArticleAccess;
    if (link.nimbleAccess) return hasNimbleAccess;
    if (link.mailAccess) return hasMailAccess;
    if (link.calendarAccess) return hasCalendarAccess;
    if (link.superuserOnly) return isSuperuser;
    if (link.advisoryOnly) return isSuperuser || isAdvisory;
    if (link.advisoryOrLead) return isSuperuser || isAdvisory || isLead;
    if (link.scopeAll) return isSuperuser || scope === 'all';
    return (link.perms || []).length === 0 || isSuperuser || hasAnyPermission(link.perms);
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
          <Link
            to={HOME_PATH}
            onClick={onClose}
            aria-label="Go to dashboard (home)"
            style={{ display: 'inline-flex', textDecoration: 'none', cursor: 'pointer' }}
          >
            <Wordmark size={24} />
          </Link>
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
          {/* Persistent Home — always one click back to the main dashboard. */}
          <div className="portal-nav-section">
            <NavLink
              to={HOME_PATH}
              onClick={onClose}
              className={({ isActive }) => `portal-nav-header ${isActive ? 'is-active' : ''}`}
              style={{ textDecoration: 'none' }}
            >
              <Home size={17} strokeWidth={1.9} />
              <span>Home</span>
            </NavLink>
          </div>
          {portals.filter(isPortalVisible).map((portal) => {
            const PortalIcon = portal.icon;
            const isOnPortal = activePortal === portal.key;   // current page belongs here
            const isExpanded = expandedKey === portal.key;    // folder open state (user-controlled)
            const visibleLinks = portal.links.filter(isLinkVisible);

            return (
              <div key={portal.key} className="portal-nav-section">
                <button
                  type="button"
                  className={`portal-nav-header ${isOnPortal ? 'is-active' : ''}`}
                  onClick={() => setExpandedKey((k) => (k === portal.key ? null : portal.key))}
                  aria-expanded={isExpanded}
                >
                  <PortalIcon size={17} strokeWidth={1.9} />
                  <span>{portal.label}</span>
                  <ChevronDown
                    size={13}
                    className={`portal-nav-chevron ${isExpanded ? 'is-open' : ''}`}
                  />
                </button>

                {isExpanded && (
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
