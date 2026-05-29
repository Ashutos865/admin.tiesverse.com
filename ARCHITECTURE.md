# Admin Panel Architecture (HLD & LLD)

This document provides High-Level Design (HLD) and Low-Level Design (LLD) details for the Tiesverse Admin Panel, specifically focusing on the Authentication, Authorization, and Permissions workflows.

---

## 1. High-Level Design (HLD)

### 1.1 Tech Stack
- **Frontend**: React (Vite), React Router for client-side navigation.
- **Backend**: Django (Python), Django REST Framework (DRF) for API endpoints.
- **Database**: SQLite (default Django DB, easily swappable to PostgreSQL).
- **Authentication**: JSON Web Tokens (JWT) using `djangorestframework-simplejwt`.
- **Authorization**: Django's built-in `auth.Permission` model + DRF's `DjangoModelPermissions`.

### 1.2 System Architecture
The application follows a client-server architecture.
1. The **React Frontend** serves as a Single Page Application (SPA).
2. The **Django Backend** acts as a stateless RESTful API.
3. **Authentication** is handled via JWT tokens (Access and Refresh tokens).
4. **Authorization** is enforced at both the API layer (DRF permissions) and the UI layer (React context).

### 1.3 Authentication & Authorization Workflow

```
┌──────────────┐     POST /api/token/      ┌──────────────┐
│  React App   │ ─────────────────────────► │  Django API  │
│  (Frontend)  │ ◄───────────────────────── │  (Backend)   │
│              │   JWT with permissions     │              │
│              │                            │              │
│  Decodes JWT │                            │  Validates   │
│  PermContext │     GET/POST/PUT/DELETE     │  Token +     │
│  checks      │ ─────────────────────────► │  Checks      │
│  hasPermission│ ◄───────────────────────── │  DjangoModel │
│              │   200 OK / 403 Forbidden   │  Permissions │
└──────────────┘                            └──────────────┘
```

1. **Login**: User submits `username` and `password` to `/api/token/`.
2. **Token Generation**: Backend verifies credentials and issues a JWT token containing custom claims (`username`, `is_staff`, `is_superuser`, `permissions[]`).
3. **Storage**: Frontend stores the tokens in `localStorage` and decodes the access token to get user roles and permissions.
4. **Protected Routes**: React Router checks for token validity before allowing access to internal pages.
5. **UI Enforcement**: `PermissionContext` provides `hasPermission()`, `hasAnyPermission()`, and `hasAllPermissions()` helpers. Navbar hides entire portals, Sidebar hides individual links, and page components hide buttons.
6. **API Enforcement**: All ViewSets use `StaffModelPermissions` (custom `DjangoModelPermissions`) which checks Django's `auth.Permission` on every request. Superusers automatically bypass all checks.

---

## 2. Low-Level Design (LLD)

### 2.1 Permission Model

We use Django's **built-in `auth.Permission`** system. Django auto-generates 4 permissions per model:

| Action   | Codename Pattern    | Example                    |
|----------|---------------------|----------------------------|
| View     | `view_<model>`      | `view_event`               |
| Add      | `add_<model>`       | `add_event`                |
| Change   | `change_<model>`    | `change_event`             |
| Delete   | `delete_<model>`    | `delete_event`             |

**Full list of models and their permissions:**

| App            | Model             | Permissions                                                  |
|----------------|-------------------|--------------------------------------------------------------|
| tiesverse_app  | Event             | `view_event`, `add_event`, `change_event`, `delete_event`     |
| tiesverse_app  | Article           | `view_article`, `add_article`, `change_article`, `delete_article` |
| tiesverse_app  | YouTubeVideo      | `view_youtubevideo`, `add_youtubevideo`, `change_youtubevideo`, `delete_youtubevideo` |
| tiesverse_app  | Workshop          | `view_workshop`, `add_workshop`, `change_workshop`, `delete_workshop` |
| tiesverse_app  | TeamMember        | `view_teammember`, `add_teammember`, `change_teammember`, `delete_teammember` |
| tiesverse_app  | Guest             | `view_guest`, `add_guest`, `change_guest`, `delete_guest` |
| career_app     | Position          | `view_position`, `add_position`, `change_position`, `delete_position` |
| career_app     | Enrollment        | `view_enrollment`, `add_enrollment`, `change_enrollment`, `delete_enrollment` |
| career_app     | OfferLetter       | `view_offerletter`, `add_offerletter`, `change_offerletter`, `delete_offerletter` |
| webinar_app    | WebinarEvent      | `view_webinarevent`, `add_webinarevent`, `change_webinarevent`, `delete_webinarevent` |
| webinar_app    | RegistrationForm  | `view_registrationform`, `add_registrationform`, `change_registrationform`, `delete_registrationform` |
| webinar_app    | CalendarEvent     | `view_calendarevent`, `add_calendarevent`, `change_calendarevent`, `delete_calendarevent` |

### 2.2 Backend Modules

#### `accounts_app`
Handles user management, permissions, and authentication.

- **Serializers**:
  - `PermissionSerializer`: Read-only. Exposes `id`, `codename`, `name`, `app_label`, `model`.
  - `UserSerializer`: Full CRUD with writable `permissions` field (list of codenames). Handles password hashing. Returns `user_permissions` (list of assigned codenames).
  - `CustomTokenObtainPairSerializer`: Embeds `username`, `is_superuser`, `is_staff`, and `permissions[]` into the JWT payload.

- **Views**:
  - `UserViewSet`: Full CRUD. Protected by `IsSuperUser`.
  - `PermissionViewSet`: Read-only. Lists all app-level permissions. Protected by `IsSuperUser`.
  - `CustomTokenObtainPairView`: Issues JWT tokens with custom claims.

- **Permissions**:
  - `IsSuperUser`: Custom permission class — only superusers can manage users and permissions.

#### `tiesverse_app`, `career_app`, `webinar_app`
All ViewSets now use `StaffModelPermissions` which:
- Requires `view_<model>` for GET requests.
- Requires `add_<model>` for POST requests.
- Requires `change_<model>` for PUT/PATCH requests.
- Requires `delete_<model>` for DELETE requests.
- **Superusers bypass all checks automatically** (Django's built-in behavior).

### 2.3 Frontend Components

#### Context: `AuthContext.jsx`
- Manages global state for `user` and `authTokens`.
- Provides `loginUser` and `logoutUser` functions.
- Decodes the JWT token on load and updates the `user` state (now includes `permissions` array).

#### Context: `PermissionContext.jsx`
- Reads the decoded JWT from `AuthContext`.
- Exposes:
  - `hasPermission(codename)` — check a single permission.
  - `hasAnyPermission(codenames[])` — check if the user has any of the listed permissions.
  - `hasAllPermissions(codenames[])` — check if the user has all of the listed permissions.
  - `isSuperuser` — boolean shortcut.

#### Layout: `Navbar.jsx`
- Conditionally renders portal buttons based on `hasAnyPermission()` for that portal's models.
- "Users & Permissions" tab is only visible to superusers.

#### Layout: `Sidebar.jsx`
- Each link has a `perms` array. Links are filtered out if the user has none of the specified permissions.
- Accounts links (User Management, Permissions) are superuser-only.

#### Page: `PermissionsManagement.jsx`
- **Matrix/Grid UI**: Staff users as rows, models as columns, checkboxes for each action.
- Fetches all users and all available permissions on mount.
- "Toggle All" button per model to quickly grant/revoke all 4 actions.
- "Save" button per user row — sends a PATCH with the updated permissions list.

#### Page: `UserManagement.jsx`
- Full CRUD for users with modal form.
- Uses PATCH for updates to avoid overwriting permissions.

### 2.4 API Endpoints

| Method | Endpoint                          | Description                     | Access        |
|--------|-----------------------------------|---------------------------------|---------------|
| POST   | `/api/token/`                     | Login, get JWT tokens           | Public        |
| POST   | `/api/token/refresh/`             | Refresh access token            | Public        |
| GET    | `/api/accounts/users/`            | List all users                  | Superuser     |
| POST   | `/api/accounts/users/`            | Create a user                   | Superuser     |
| PATCH  | `/api/accounts/users/{id}/`       | Update user (+ permissions)     | Superuser     |
| DELETE | `/api/accounts/users/{id}/`       | Delete a user                   | Superuser     |
| GET    | `/api/accounts/permissions/`      | List available permissions      | Superuser     |
| GET    | `/api/tiesverse/*`                | Tiesverse CRUD                  | Per-permission|
| GET    | `/api/career/*`                   | Career CRUD                     | Per-permission|
| GET    | `/api/webinar/*`                  | Webinar CRUD                    | Per-permission|
