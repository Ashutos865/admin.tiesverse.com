# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- **UI Architecture:** Complete overhaul of Tiesverse Admin Tabs. Replaced the 50/50 split-panel layout with a responsive, full-width content grid across all sections (Events, Articles, YouTube Videos, Workshops, Team Members, Guests, Webinar Listings).
- **Modal System:** Implemented a unified modal pattern for Create/Edit forms across all content management pages to maximize screen real estate.
- **Theme Support:** Added dynamic theme configuration allowing admins to toggle between "Classic Light" and "Premium Dark" themes and select custom Accent Focus Colors (e.g., Orange, Blue, Green, Indigo, Red, Violet).
- **Context Synchronization:** Improved `.light` and `.dark` class toggling across `ThemeContext.jsx` and `AuthContext.jsx` to prevent theme desync.
- **Image Handling:** Fully integrated Cloudinary upload support with multi-image batch selection (e.g., adding multiple Team Members at once) and aspect ratio discrepancy warnings.

### Changed
- **CSS Variable Standardization:** Eliminated hardcoded JavaScript inline colors (`#FF6B00`, `#0A0A0A`) throughout `Navbar.jsx`, `Sidebar.jsx`, `EventsManagement.jsx`, and `Admin.jsx`. Implemented `var(--primary)`, `var(--bg-color)`, and `var(--surface)` standard CSS variables.
- **Hover & Opacity Effects:** Transitioned from static `rgba(255,107,0,0.1)` backgrounds to dynamic `color-mix(in srgb, var(--primary) 10%, transparent)` to support user-selected accent colors natively across all components.
- **Design Tokens:** Refined the dark mode color palette away from muted slates toward strict deep blacks (`#0A0A0A`) and highly contrasting surfaces (`#141414`).
- **Sidebar UX:** Sidebar navigation now dynamically highlights based on user-selected accent colors instead of being fixed to orange.

### Fixed
- **Typography Sizing:** Resolved issues where dynamic font scaling resulted in overly small text. Replaced container-based font clamping with strict structural typographies to ensure clear legibility.
- **Database Auth Timeout:** Addressed `ECIRCUITBREAKER` and `too many authentication failures` errors when connecting to the Supabase PostgreSQL database pool.
