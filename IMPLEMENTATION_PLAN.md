# Granular Permissions & Authorization System

Build a Django-Admin-style permissions layer into the React dashboard so a superuser can assign specific permissions (view, add, change, delete) per module to each staff user — all from the UI, no Python admin needed.

## How It Works (Summary)

Django already auto-creates permissions for every model (e.g. `tiesverse_app.add_event`, `career_app.delete_position`). We will:
1. **Expose** those permissions via a new API endpoint.
2. **Let superusers assign** permissions to staff users from a new "Permissions" page.
3. **Embed** the user's permissions into the JWT token.
4. **Enforce** permissions on both backend (DRF) and frontend (React context + route guards).

---

## Proposed Changes

### Backend (Django)

#### [MODIFY] `accounts_app/serializers.py`
- Add a `PermissionSerializer` to serialize Django's built-in `Permission` model.
- Update `UserSerializer` to include a writable `permissions` field (list of permission codenames).
- Update `CustomTokenObtainPairSerializer` to embed the user's permission codenames list into the JWT payload.

#### [MODIFY] `accounts_app/views.py`
- Add a `PermissionViewSet` (read-only) that lists all available permissions, filtered to only show our app-level permissions (tiesverse, career, webinar, accounts).
- Update `UserViewSet.create()` and `update()` to handle assigning permissions to users.

#### [MODIFY] `accounts_app/urls.py`
- Register the new `PermissionViewSet` route (`/api/accounts/permissions/`).

#### [MODIFY] `tiesverse_app/views.py`, `career_app/views.py`, `webinar_app/views.py`
- Add `DjangoModelPermissions` (from DRF) to all ViewSets so the backend enforces the assigned permissions. Superusers bypass all permission checks automatically.

---

### Frontend (React)

#### [NEW] `frontend/src/context/PermissionContext.jsx`
- A React context that reads the decoded JWT and exposes a `hasPermission(codename)` helper.
- Example: `hasPermission('tiesverse_app.add_event')` → `true/false`.

#### [MODIFY] `frontend/src/context/AuthContext.jsx`
- After login, store the decoded `permissions` array from the token.

#### [MODIFY] `frontend/src/components/layout/Navbar.jsx`
- Hide portal tabs the user has zero permissions for (e.g. if a user has no tiesverse permissions, hide that tab).

#### [MODIFY] `frontend/src/components/layout/Sidebar.jsx`
- Hide individual sidebar links the user can't view.

#### [NEW] `frontend/src/pages/Accounts/PermissionsManagement.jsx`
- **The main new UI page** — a matrix/grid where the superuser can:
  - See all staff users as rows.
  - See all modules (Events, Articles, Positions, etc.) as columns.
  - Toggle permissions (View / Add / Change / Delete) per user per module.
  - Save changes with a single click.

#### [MODIFY] `frontend/src/pages/Accounts/UserManagement.jsx`
- The "Add/Edit User" modal will also include a permissions section for quick inline assignment.
- Add/Edit/Delete buttons will be hidden if the current user doesn't have the matching permission.

#### [MODIFY] `frontend/src/App.jsx`
- Add route for `/accounts/permissions` → `PermissionsManagement`.
- Wrap the app with the new `PermissionProvider`.

#### [MODIFY] `frontend/src/components/layout/Sidebar.jsx`
- Add "Permissions" link under the Accounts portal.

---

## Verification Plan

### Automated Tests
- Run `python manage.py check` to verify no Django errors after model changes.
- Build the React frontend to verify no compilation errors.

### Manual Verification
1. Log in as superuser → navigate to Users → create a staff user.
2. Navigate to Permissions → assign specific permissions to the new staff user.
3. Log out → log in as the new staff user → verify they can only see the portals/pages they have permission for.
4. Verify the staff user gets a 403 from the backend if they try to hit an API they don't have permission for.
