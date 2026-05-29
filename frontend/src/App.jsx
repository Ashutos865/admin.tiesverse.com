import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { PermissionProvider } from './context/PermissionContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import AdminLayout from './components/layout/AdminLayout';

// Auth & Accounts
import Login from './pages/Login';
import UserManagement from './pages/Accounts/UserManagement';
import PermissionsManagement from './pages/Accounts/PermissionsManagement';

// Tiesverse
import EventsManagement from './pages/Tiesverse/EventsManagement';
import { ArticlesManagement, YoutubeVideos, WorkshopList, TeamList, GuestList, Webinars } from './pages/Tiesverse/index.jsx';

// Career
import { PositionTracker, EnrollmentTracker, OfferLetter } from './pages/Career/index.jsx';

// Webinar
import { ManagingList, ManageEvents, UserSubmissionsReview } from './pages/Webinar/index.jsx';

function App() {
  return (
    <AuthProvider>
      <PermissionProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Navigate to="/tiesverse/events" replace />} />
            
            <Route element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }>
              {/* Accounts Routes */}
              <Route path="/accounts/users" element={<UserManagement />} />
              <Route path="/accounts/permissions" element={<PermissionsManagement />} />

              {/* Tiesverse Routes */}
              <Route path="/tiesverse/events" element={<EventsManagement />} />
              <Route path="/tiesverse/articles" element={<ArticlesManagement />} />
              <Route path="/tiesverse/youtube" element={<YoutubeVideos />} />
              <Route path="/tiesverse/workshops" element={<WorkshopList />} />
              <Route path="/tiesverse/team" element={<TeamList />} />
              <Route path="/tiesverse/guests" element={<GuestList />} />
              <Route path="/tiesverse/webinars" element={<Webinars />} />

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
  );
}

export default App;
