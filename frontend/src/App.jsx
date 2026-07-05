import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { PermissionProvider } from './context/PermissionContext';
import { MeProvider } from './context/MeContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import AdminLayout from './components/layout/AdminLayout';

// Auth & Accounts
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import UserManagement from './pages/Accounts/UserManagement';
import PermissionsManagement from './pages/Accounts/PermissionsManagement';
import ProfileSettings from './pages/Accounts/ProfileSettings';
import EmailTemplates from './pages/Accounts/EmailTemplates';
import MailAutomation from './pages/Accounts/MailAutomation';

// Dashboards
import TiesverseDashboard from './pages/Tiesverse/TiesverseDashboard';
import CareerDashboard from './pages/Career/CareerDashboard';
import WebinarDashboard from './pages/Webinar/WebinarDashboard';
import Registrations from './pages/Webinar/Registrations.jsx';
import Coupons from './pages/Webinar/Coupons.jsx';

// Tiesverse
import EventsManagement from './pages/Tiesverse/EventsManagement';
import TiesverseAdminPanel from './pages/Tiesverse/Admin.jsx';
import FeaturedContent from './pages/Tiesverse/FeaturedContent.jsx';

// Career
import CareerAdmin from './pages/Career/Admin.jsx';
import OnboardingManagement from './pages/Career/OnboardingManagement.jsx';
import HRDepartments from './pages/Career/HRDepartments.jsx';
import TeamDirectory from './pages/Career/TeamDirectory.jsx';
import MasterDirectory from './pages/Career/MasterDirectory.jsx';
import AttendancePage from './pages/Career/AttendancePage.jsx';
import LeavePage from './pages/Career/LeavePage.jsx';
import OffboardingPage from './pages/Career/OffboardingPage.jsx';
import AssetsPage from './pages/Career/AssetsPage.jsx';
import TasksPage from './pages/Career/TasksPage.jsx';
import MyWork from './pages/MyWork/MyWork.jsx';
import AdvisoryPanel from './pages/Advisory/AdvisoryPanel.jsx';

// Certificate Generator
import CertificateTemplates from './pages/Certificates/CertificateTemplates.jsx';
import CertificateEditor from './pages/Certificates/CertificateEditor.jsx';
import CertificateGenerate from './pages/Certificates/CertificateGenerate.jsx';
import GeneratedCertificates from './pages/Certificates/GeneratedCertificates.jsx';

// Webinar
import { ManagingList, UserSubmissionsReview } from './pages/Webinar/index.jsx';
import WebinarsWorkshops from './pages/Webinar/WebinarsWorkshops.jsx';
import Speakers from './pages/Webinar/Speakers.jsx';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <PermissionProvider>
          <MeProvider>
          <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
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
              <Route path="/tiesverse/homepage" element={<FeaturedContent />} />

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

              {/* Advisory oversight + weekly updates */}
              <Route path="/advisory" element={<AdvisoryPanel />} />

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
            </Route>
          </Routes>
        </Router>
          </MeProvider>
      </PermissionProvider>
    </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
