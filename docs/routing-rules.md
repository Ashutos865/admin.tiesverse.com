# Routing Rules & Layout Structures

This document outlines how new pages should be integrated into the existing layout architecture of the Tiesverse Admin Panel.

## 1. Core Layout wrappers

All authenticated dashboard pages must render within the `<AdminLayout>` component. This component acts as the global wrapper and automatically provides:
- The persistent `Sidebar` (left navigation pane).
- The top `Navbar` (portal switcher, user menu, theme toggle).
- Dynamic CSS theme injections based on the root `.light` class state.

### `AdminLayout.jsx`
Located in `frontend/src/components/layout/AdminLayout.jsx`. 
It uses `<Outlet />` to render nested routes inside the main content area (`<main>`).

## 2. Route Protection

Any route that exposes sensitive admin data must be wrapped in the `<ProtectedRoute>` component.
- The `ProtectedRoute` ensures that the user possesses a valid JWT token before rendering the page.
- If unauthenticated, it redirects the user to the `/login` route.

## 3. Defining Routes (`App.jsx`)

When adding a new page, register the route within the nested tree of `AdminLayout` inside `App.jsx`.

**Example Pattern:**
```jsx
<Routes>
  {/* Public Routes */}
  <Route path="/login" element={<Login />} />

  {/* Protected Dashboard Routes wrapped in AdminLayout */}
  <Route
    path="/"
    element={
      <ProtectedRoute>
        <AdminLayout />
      </ProtectedRoute>
    }
  >
    {/* Tiesverse Sub-Routes */}
    <Route path="tiesverse/dashboard" element={<TiesverseDashboard />} />
    <Route path="tiesverse/events" element={<EventsManagement />} />
    
    {/* Career Sub-Routes */}
    <Route path="career/dashboard" element={<CareerDashboard />} />
    
    {/* ...other routes */}
  </Route>
</Routes>
```

## 4. Context Consumption

Inside your newly created pages:
- Use `useContext(AuthContext)` to access `profile` settings, user JWT claims, or the `updateProfileState` method.
- Avoid importing `ThemeContext` directly into your nested page components for UI logic, as the `AdminLayout` automatically handles background and text color variables. Instead, use standard CSS variables like `var(--bg-color)` to ensure your new page respects user theme preferences.
