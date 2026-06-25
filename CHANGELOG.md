# Changelog

All notable changes to this project will be documented in this file.

---

## [0.0.1] - Project Initialization & Base Architecture (25-05-26) 

### Added

* **Django Workspace Initialization:** Created the primary Django backend workspace structure with modular settings splits (`config.settings`).
* **Database Layer Connection:** Wired up standard PostgreSQL backend connections utilizing `psycopg2` base adaptors.
* **Core Application Modularity:** Created the initial core applications including `accounts_app` to isolate future authentication components.
* **Documentation Scaffold:** Created the system configuration reference guides and initialized the root `docs/` architecture workspace directory to maintain structural HLD/LLD mappings.

---

## [0.1.0] - Granular Permissions & Authorization System (29-05-26) (satyam)

### Added

* **Granular Permissions Engine:** Built a comprehensive, model-level authentication and authorization layer matching Django Admin's permission capabilities directly inside the React interface.
* **Permissions Management View:** Created a brand new interface featuring a dedicated left-side user selection list and a structured right-side portal mapping grid.
* **Pop-up Configuration Modal:** Transitioned the complex permission matrix from a flat, compressed row layout to a clean, focused pop-up box modal overlay to manage per-model permissions cleanly.
* **Permission Token Embedding:** Customized the Django backend JWT implementation (`CustomTokenObtainPairSerializer`) to safely bundle user roles and full permission codenames into token claims.
* **Global Security Context:** Built `PermissionContext` on the client side exposing quick verification utilities (`hasPermission`, `hasAnyPermission`).
* **Unified API Metadata Endpoint:** Implemented a new backend route at `/api/accounts/permissions/` to deliver all available core permissions to the client view dynamically.

### Changed

* **Responsive Layout Constraints:** Restructured portal rows with rigid spacing and applied `flexShrink: 0` constraints across container items to prevent the browser from squishing content fields.
* **Conditional UI Pruning:** Configured the global `Navbar` and section `Sidebar` links to conditionally evaluate token claims, completely hiding unprivileged views.
* **Data Mutation Layer:** Swapped traditional `PUT` requests for optimized `PATCH` handlers in `UserManagement.jsx` to preserve backend permission arrays during regular account revisions.

### Fixed

* **Notification Z-Index Collisions:** Repositioned action toast elements to a fixed top alignment backed by an absolute `z-index: 9999` rule to prevent success statuses from clipping beneath layout panels.
* **Grid Item Alignment:** Rectified vertical misalignment inside model entries by organizing attributes under a standardized CSS grid structure mapped with explicit column distributions.

---

## [Unreleased] (satyam) (07-06-26)

### Added

* **UI Architecture:** Complete overhaul of Tiesverse Admin Tabs. Replaced the 50/50 split-panel layout with a responsive, full-width content grid across all sections (Events, Articles, YouTube Videos, Workshops, Team Members, Guests, Webinar Listings).
* **Modal System:** Implemented a unified modal pattern for Create/Edit forms across all content management pages to maximize screen real estate.
* **Theme Support:** Added dynamic theme configuration allowing admins to toggle between "Classic Light" and "Premium Dark" themes and select custom Accent Focus Colors (e.g., Orange, Blue, Green, Indigo, Red, Violet).
* **Context Synchronization:** Improved `.light` and `.dark` class toggling across `ThemeContext.jsx` and `AuthContext.jsx` to prevent theme desync.
* **Image Handling:** Fully integrated Cloudinary upload support with multi-image batch selection (e.g., adding multiple Team Members at once) and aspect ratio discrepancy warnings.

### Changed

* **CSS Variable Standardization:** Eliminated hardcoded JavaScript inline colors (`#FF6B00`, `#0A0A0A`) throughout `Navbar.jsx`, `Sidebar.jsx`, `EventsManagement.jsx`, and `Admin.jsx`. Implemented `var(--primary)`, `var(--bg-color)`, and `var(--surface)` standard CSS variables.
* **Hover & Opacity Effects:** Transitioned from static `rgba(255,107,0,0.1)` backgrounds to dynamic `color-mix(in srgb, var(--primary) 10%, transparent)` to support user-selected accent colors natively across all components.
* **Design Tokens:** Refined the dark mode color palette away from muted slates toward strict deep blacks (`#0A0A0A`) and highly contrasting surfaces (`#141414`).
* **Sidebar UX:** Sidebar navigation now dynamically highlights based on user-selected accent colors instead of being fixed to orange.

### Fixed

* **Typography Sizing:** Resolved issues where dynamic font scaling resulted in overly small text. Replaced container-based font clamping with strict structural typographies to ensure clear legibility.
* **Database Auth Timeout:** Addressed `ECIRCUITBREAKER` and `too many authentication failures` errors when connecting to the Supabase PostgreSQL database pool.

---

