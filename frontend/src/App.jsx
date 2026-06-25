import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { PermissionProvider } from './context/PermissionContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import AdminLayout from './components/layout/AdminLayout';

// Auth & Accounts
import Login from './pages/Login';
import UserManagement from './pages/Accounts/UserManagement';
import PermissionsManagement from './pages/Accounts/PermissionsManagement';
import ProfileSettings from './pages/Accounts/ProfileSettings';

// Dashboards
import TiesverseDashboard from './pages/Tiesverse/TiesverseDashboard';
import CareerDashboard from './pages/Career/CareerDashboard';
import WebinarDashboard from './pages/Webinar/WebinarDashboard';

// Tiesverse
import EventsManagement from './pages/Tiesverse/EventsManagement';
import { ArticlesManagement, YoutubeVideos, WorkshopList, TeamList, GuestList, Webinars } from './pages/Tiesverse/index.jsx';
import TiesverseAdminPanel from './pages/Tiesverse/Admin.jsx';

// Career
import { PositionTracker, EnrollmentTracker, OfferLetter } from './pages/Career/index.jsx';

// Webinar
import { ManagingList, ManageEvents, UserSubmissionsReview } from './pages/Webinar/index.jsx';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <PermissionProvider>
          <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Navigate to="/tiesverse/dashboard" replace />} />

            <Route element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }>
              {/* Accounts Routes */}
              <Route path="/accounts/users" element={<UserManagement />} />
              <Route path="/accounts/permissions" element={<PermissionsManagement />} />
              <Route path="/accounts/settings" element={<ProfileSettings />} />

              {/* Dashboard Routes */}
              <Route path="/tiesverse/dashboard" element={<TiesverseDashboard />} />
              <Route path="/career/dashboard" element={<CareerDashboard />} />
              <Route path="/webinar/dashboard" element={<WebinarDashboard />} />

              {/* Tiesverse Routes */}
              <Route path="/tiesverse/events" element={<EventsManagement />} />
              <Route path="/tiesverse/articles" element={<TiesverseAdminPanel tab="articles" />} />
              <Route path="/tiesverse/youtube_videos" element={<TiesverseAdminPanel tab="youtube_videos" />} />
              <Route path="/tiesverse/workshops" element={<TiesverseAdminPanel tab="workshops" />} />
              <Route path="/tiesverse/team_members" element={<TiesverseAdminPanel tab="team_members" />} />
              <Route path="/tiesverse/guests" element={<TiesverseAdminPanel tab="guests" />} />
              <Route path="/tiesverse/webinars" element={<TiesverseAdminPanel tab="webinars" />} />

              {/* Career Routes */}
              <Route path="/career/positions" element={<PositionTracker />} />
              <Route path="/career/enrollments" element={<EnrollmentTracker />} />
              <Route path="/career/offers" element={<OfferLetter />} />

              {/* Webinar Routes */}
              <Route path="/webinar/submissions" element={<ManagingList />} />
              <Route path="/webinar/events" element={<ManageEvents />} />
              <Route path="/webinar/calendar" element={<UserSubmissionsReview />} />
            </Route>
          </Routes>
        </Router>
      </PermissionProvider>
    </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
