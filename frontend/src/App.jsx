import { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { PermissionProvider } from './context/PermissionContext';
import { MeProvider } from './context/MeContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import DarkReaderGuard from './components/DarkReaderGuard';
import ChunkErrorBoundary from './components/ChunkErrorBoundary';
// Use a resilient lazy(): if a route chunk 404s after a new deploy (stale
// index.html referencing an old hash), it retries once then hard-reloads so the
// user gets fresh chunks instead of a blank page. Aliased to `lazy` so the
// existing lazy(() => import(...)) calls below all get this behaviour.
import lazyWithReload from './lib/lazyWithReload';
const lazy = lazyWithReload;

// Route pages are lazy-loaded (code-split) so first-load pages like /login and
// /signup only download their own small chunk instead of the whole admin app.
// Each route renders the same component as before; it is just fetched on demand.
const AdminLayout = lazy(() => import('./components/layout/AdminLayout'));

// Auth & Accounts
const Login = lazy(() => import('./pages/Login'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const UserManagement = lazy(() => import('./pages/Accounts/UserManagement'));
const PermissionsManagement = lazy(() => import('./pages/Accounts/PermissionsManagement'));
const ProfileSettings = lazy(() => import('./pages/Accounts/ProfileSettings'));
const EmailTemplates = lazy(() => import('./pages/Accounts/EmailTemplates'));
const MailAutomation = lazy(() => import('./pages/Accounts/MailAutomation'));

// Dashboards
const TiesverseDashboard = lazy(() => import('./pages/Tiesverse/TiesverseDashboard'));
const CareerDashboard = lazy(() => import('./pages/Career/CareerDashboard'));
const WebinarDashboard = lazy(() => import('./pages/Webinar/WebinarDashboard'));
const Registrations = lazy(() => import('./pages/Webinar/Registrations.jsx'));
const Coupons = lazy(() => import('./pages/Webinar/Coupons.jsx'));

// Tiesverse
const EventsManagement = lazy(() => import('./pages/Tiesverse/EventsManagement'));
const TiesverseAdminPanel = lazy(() => import('./pages/Tiesverse/Admin.jsx'));
const TechProducts = lazy(() => import('./pages/Tiesverse/TechProducts.jsx'));
const WebsiteImages = lazy(() => import('./pages/Tiesverse/WebsiteImages.jsx'));
const DataApi = lazy(() => import('./pages/Tiesverse/DataApi.jsx'));

// Career
const CareerAdmin = lazy(() => import('./pages/Career/Admin.jsx'));
const OnboardingManagement = lazy(() => import('./pages/Career/OnboardingManagement.jsx'));
const HRDepartments = lazy(() => import('./pages/Career/HRDepartments.jsx'));
const TeamDirectory = lazy(() => import('./pages/Career/TeamDirectory.jsx'));
const MasterDirectory = lazy(() => import('./pages/Career/MasterDirectory.jsx'));
const AttendancePage = lazy(() => import('./pages/Career/AttendancePage.jsx'));
const LeavePage = lazy(() => import('./pages/Career/LeavePage.jsx'));
const OffboardingPage = lazy(() => import('./pages/Career/OffboardingPage.jsx'));
const AssetsPage = lazy(() => import('./pages/Career/AssetsPage.jsx'));
const TasksPage = lazy(() => import('./pages/Career/TasksPage.jsx'));
const ProjectsPage = lazy(() => import('./pages/Career/ProjectsPage.jsx'));
const ProjectDetail = lazy(() => import('./pages/Career/ProjectDetail.jsx'));

// Learn Portal
const LearnDashboard = lazy(() => import('./pages/Learn/LearnDashboard.jsx'));
const LearnProgram = lazy(() => import('./pages/Learn/LearnProgram.jsx'));
const CourseCatalog = lazy(() => import('./pages/Learn/CourseCatalog.jsx'));
const CoursePlayer = lazy(() => import('./pages/Learn/CoursePlayer.jsx'));
const LearnCertificates = lazy(() => import('./pages/Learn/LearnCertificates.jsx'));
const LearnLeaderboard = lazy(() => import('./pages/Learn/LearnLeaderboard.jsx'));
const ManageLearning = lazy(() => import('./pages/Learn/ManageLearning.jsx'));

// TIES Docs
const TiesDocs = lazy(() => import('./pages/Docs/TiesDocs.jsx'));
const MyWork = lazy(() => import('./pages/MyWork/MyWork.jsx'));
const AdvisoryPanel = lazy(() => import('./pages/Advisory/AdvisoryPanel.jsx'));
const TechnicalDashboard = lazy(() => import('./pages/Technical/TechnicalDashboard.jsx'));
const PoliciesPage = lazy(() => import('./pages/Career/PoliciesPage.jsx'));
const HelpCenter = lazy(() => import('./pages/Help/HelpCenter.jsx'));
const SignupApprovals = lazy(() => import('./pages/Career/SignupApprovals.jsx'));
const PublicSignup = lazy(() => import('./pages/Signup/PublicSignup.jsx'));

// Forms (custom form builder)
const FormsListPage = lazy(() => import('./pages/Forms/FormsListPage.jsx'));
const FormBuilder = lazy(() => import('./pages/Forms/FormBuilder.jsx'));
const FormFillPage = lazy(() => import('./pages/Forms/FormFillPage.jsx'));
const FormResponsesPage = lazy(() => import('./pages/Forms/FormResponsesPage.jsx'));
const PublicFormPage = lazy(() => import('./pages/Forms/PublicFormPage.jsx'));

// Certificate Generator
const CertificateTemplates = lazy(() => import('./pages/Certificates/CertificateTemplates.jsx'));
const CertificateEditor = lazy(() => import('./pages/Certificates/CertificateEditor.jsx'));
const CertificateGenerate = lazy(() => import('./pages/Certificates/CertificateGenerate.jsx'));
const GeneratedCertificates = lazy(() => import('./pages/Certificates/GeneratedCertificates.jsx'));

// Webinar (named exports need a small default-wrapper for React.lazy)
const ManagingList = lazy(() => import('./pages/Webinar/index.jsx').then(m => ({ default: m.ManagingList })));
const UserSubmissionsReview = lazy(() => import('./pages/Webinar/index.jsx').then(m => ({ default: m.UserSubmissionsReview })));
const WebinarsWorkshops = lazy(() => import('./pages/Webinar/WebinarsWorkshops.jsx'));
const Speakers = lazy(() => import('./pages/Webinar/Speakers.jsx'));

// Articles & Reports (WordPress) Portal
const WPPosts = lazy(() => import('./pages/WordPress/Posts.jsx'));
const SiteNavManager = lazy(() => import('./pages/WordPress/SiteNavManager.jsx'));
const SiteMenuManager = lazy(() => import('./pages/WordPress/SiteMenuManager.jsx'));
const WPMedia = lazy(() => import('./pages/WordPress/MediaLibrary.jsx'));
const WPTaxonomies = lazy(() => import('./pages/WordPress/Taxonomies.jsx'));
const WPComments = lazy(() => import('./pages/WordPress/CommentsManager.jsx'));
const WPUsers = lazy(() => import('./pages/WordPress/Users.jsx'));

// Lightweight fallback shown while a route chunk is fetched.
const RouteFallback = () => (
  <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}>
    <div style={{ width: 26, height: 26, border: '3px solid var(--outline-variant)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'route-spin 0.7s linear infinite' }} />
    <style>{'@keyframes route-spin{to{transform:rotate(360deg)}}'}</style>
  </div>
);

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <PermissionProvider>
          <MeProvider>
          <Router>
          <DarkReaderGuard />
          <ChunkErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup/:hash" element={<PublicSignup />} />
            <Route path="/f/:token" element={<PublicFormPage />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/" element={<Navigate to="/tiesverse/dashboard" replace />} />

            <Route element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }>
              {/* My Work — member self-service */}
              <Route path="/me/attendance" element={<MyWork tab="attendance" />} />
              <Route path="/me/leave" element={<MyWork tab="leave" />} />
              <Route path="/me/offboarding" element={<MyWork tab="offboarding" />} />
              <Route path="/me/tasks" element={<MyWork tab="tasks" />} />
              <Route path="/me/assets" element={<MyWork tab="assets" />} />
              <Route path="/me/profile" element={<MyWork tab="profile" />} />

              {/* Learn Portal Routes */}
              <Route path="/learn/dashboard" element={<LearnDashboard />} />
              <Route path="/learn/program" element={<LearnProgram />} />
              <Route path="/learn/courses" element={<CourseCatalog />} />
              <Route path="/learn/courses/:id" element={<CoursePlayer />} />
              <Route path="/learn/certificates" element={<LearnCertificates />} />
              <Route path="/learn/leaderboard" element={<LearnLeaderboard />} />
              <Route path="/learn/manage" element={<ManageLearning />} />

              {/* TIES Docs Route */}
              <Route path="/docs" element={<TiesDocs />} />

              {/* Accounts Routes */}
              <Route path="/accounts/users" element={<UserManagement />} />
              <Route path="/accounts/permissions" element={<PermissionsManagement />} />
              <Route path="/accounts/email-templates" element={<EmailTemplates />} />
              <Route path="/accounts/mail-automation" element={<MailAutomation />} />
              <Route path="/accounts/settings" element={<ProfileSettings />} />

              {/* Dashboard Routes */}
              <Route path="/tiesverse/dashboard" element={<TiesverseDashboard />} />
              <Route path="/career/dashboard" element={<CareerDashboard />} />
              <Route path="/webinar/dashboard" element={<WebinarDashboard />} />

              {/* Tiesverse Routes */}
              <Route path="/tiesverse/events" element={<Navigate to="/webinar/events" replace />} />
              <Route path="/tiesverse/articles" element={<TiesverseAdminPanel tab="departments" />} />
              <Route path="/tiesverse/departments" element={<Navigate to="/tiesverse/articles" replace />} />
              <Route path="/tiesverse/team_members" element={<TiesverseAdminPanel tab="team_members" />} />
              <Route path="/tiesverse/homepage" element={<Navigate to="/tiesverse/website-images" replace />} />
              <Route path="/tiesverse/tech-products" element={<TechProducts />} />
              <Route path="/tiesverse/website-images" element={<WebsiteImages />} />
              <Route path="/tiesverse/data-api" element={<DataApi />} />

              {/* Career Routes */}
              <Route path="/career/positions" element={<CareerAdmin tab="positions" />} />
              <Route path="/career/applications" element={<CareerAdmin tab="applications" />} />
              <Route path="/career/enrollments" element={<Navigate to="/career/applications" replace />} />
              <Route path="/career/offers" element={<CareerAdmin tab="offers" />} />
              <Route path="/career/candidates" element={<Navigate to="/career/applications" replace />} />
              <Route path="/career/form_gates" element={<CareerAdmin tab="form_gates" />} />
              <Route path="/career/onboarding" element={<OnboardingManagement />} />
              {/* Backward-compat redirects → HR Portal */}
              <Route path="/career/team" element={<Navigate to="/hr/team" replace />} />
              <Route path="/career/hr-departments" element={<Navigate to="/hr/departments" replace />} />
              <Route path="/career/attendance" element={<Navigate to="/hr/attendance" replace />} />
              <Route path="/career/leave" element={<Navigate to="/hr/leave" replace />} />
              <Route path="/career/assets" element={<Navigate to="/hr/assets" replace />} />
              <Route path="/career/tasks" element={<Navigate to="/hr/tasks" replace />} />

              {/* HR Portal Routes */}
              <Route path="/hr/directory" element={<MasterDirectory />} />
              <Route path="/hr/team" element={<TeamDirectory />} />
              <Route path="/hr/departments" element={<HRDepartments />} />
              <Route path="/hr/attendance" element={<AttendancePage />} />
              <Route path="/hr/leave" element={<LeavePage />} />
              <Route path="/hr/offboarding" element={<OffboardingPage />} />
              <Route path="/hr/assets" element={<AssetsPage />} />
              <Route path="/hr/tasks" element={<TasksPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/hr/signups" element={<SignupApprovals />} />

              {/* Advisory oversight + weekly updates */}
              <Route path="/advisory" element={<AdvisoryPanel />} />

              {/* Developer / infrastructure dashboard */}
              <Route path="/technical" element={<TechnicalDashboard />} />

              {/* Policies — HR manages at /hr, members read at /me */}
              <Route path="/hr/policies" element={<PoliciesPage />} />
              <Route path="/me/policies" element={<PoliciesPage />} />

              {/* Built-in Help Center (everyone) */}
              <Route path="/help" element={<HelpCenter />} />

              {/* Forms — HR/Advisory build & manage; members fill internal forms */}
              <Route path="/hr/forms" element={<FormsListPage />} />
              <Route path="/hr/forms/:id/edit" element={<FormBuilder />} />
              <Route path="/hr/forms/:id/responses" element={<FormResponsesPage />} />
              <Route path="/forms/:id" element={<FormFillPage />} />

              {/* Certificate Generator Routes */}
              <Route path="/certificates/templates" element={<CertificateTemplates />} />
              <Route path="/certificates/templates/:id/editor" element={<CertificateEditor />} />
              <Route path="/certificates/templates/:id/generate" element={<CertificateGenerate />} />
              <Route path="/certificates/generated" element={<GeneratedCertificates />} />

              {/* Webinar Routes */}
              <Route path="/webinar/submissions" element={<ManagingList />} />
              <Route path="/webinar/events" element={<EventsManagement />} />
              <Route path="/webinar/calendar" element={<UserSubmissionsReview />} />
              <Route path="/webinar/event_speakers" element={<Speakers />} />
              <Route path="/webinar/webinars-workshops" element={<WebinarsWorkshops />} />
              <Route path="/webinar/registrations" element={<Registrations />} />
              <Route path="/webinar/coupons" element={<Coupons />} />
              <Route path="/webinar/event_registrations" element={<WebinarsWorkshops />} />

              {/* Articles & Reports (WordPress) Portal */}
              <Route path="/wordpress" element={<Navigate to="/wordpress/posts" replace />} />
              <Route path="/wordpress/posts" element={<WPPosts type="posts" label="Posts" />} />
              <Route path="/wordpress/pages" element={<WPPosts type="pages" label="Pages" />} />
              <Route path="/wordpress/media" element={<WPMedia />} />
              <Route path="/wordpress/taxonomies" element={<WPTaxonomies />} />
              <Route path="/wordpress/comments" element={<WPComments />} />
              <Route path="/wordpress/users" element={<WPUsers />} />
              <Route path="/wordpress/navigation" element={<SiteNavManager />} />
              <Route path="/wordpress/blog-menu" element={<SiteMenuManager />} />
            </Route>
          </Routes>
          </Suspense>
          </ChunkErrorBoundary>
        </Router>
          </MeProvider>
      </PermissionProvider>
    </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
