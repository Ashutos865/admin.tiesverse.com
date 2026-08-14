# Changelog

All notable changes to this project will be documented in this file.

---

## [0.3.0] - Webinar Money, Attribution & Research Publishing (14-08-26) (claude)

### Added

* **Refunds from the registrations table:** Full or partial refunds on any paid registration, with the amount re-read from Razorpay rather than trusted from the browser, so a stale screen cannot over-refund. Records `refund_id`, `refund_amount` (paise), `refund_status`, `refunded_at` and `refund_notes`; a part-refunded row reads `partially_refunded` so the books still balance. `refund.*` webhooks are handled, so refunds issued from Razorpay's own dashboard land here too, and "Check with Razorpay" reconciles a drifted row on demand.
* **Campaign attribution on registrations:** New `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` and `referrer` columns. The website captures them on arrival and holds them for the session, because registration usually happens several clicks after landing; first touch wins. An untagged visit falls back to the referring domain.
* **Share links panel (webinar Details tab):** A tagged link per channel (WhatsApp, Instagram, LinkedIn, X, Telegram, email, poster QR) plus any custom source, all under one campaign name defaulted from the title.
* **Analytics tab (webinar panel):** Registered / paid / pending / attended / collected-net-of-refunds, a source donut, channel bars, sign-ups per day and a payment-status bar. Plain SVG - no charting library.
* **Paid / Not-paid-yet audiences** in the Emails tab, filtered server-side. A free session has no payment step, so its registrants count as confirmed rather than unpaid.
* **Portal Access page** (`/webinar/access`, superadmins): every verified member listed and searchable, showing which department grants read-only access and which capabilities have been granted on top. Granting is now a superadmin action (plus a portal lead for their own team) rather than anything `_is_org_admin` allowed.
* **Research reports from Google Docs:** `gdoc_import` turns a shared doc into ordered blocks - sections, sub-heads, paragraphs, tables, references - re-hosting embedded images on Cloudinary and dropping the page-numbered contents, since the reader builds its own.
* **Report block editor:** Rearrange, retype, insert sections, sub-headings, quotes and inline images, and select words for bold or italic. Emphasis is stored as `**bold**` / `*italic*`, not HTML, so the text stays readable and the reader renders it without trusting markup from a form.
* **Research Page manager** (`/tiesverse/research-page`): hero copy, desk photo and the publications register.
* **External registration for city events:** the event form asks whether registration is handled here or elsewhere; an external URL turns the website's button into a link out instead of opening a form whose list nobody would read.

### Changed

* **Webinar/Workshop departments both grant read-only portal access** (18 members), where only an exact "Webinar" department did before.
* **Registrant lookups accept every slug spelling a title has been stored under.** The browser slugifies "Pakistan's" to `pakistan-s`; Django's `slugify` gives `pakistans`. Rows written by one were invisible to the other, so the Emails tab could show an audience of zero for a webinar that had paid registrants.
* **Public webinar feed ships speakers** (name, role, org, photo) from `EventSpeaker` instead of only a single host string, falling back to the lead speaker for `host`/`host_image_url`.
* **Image uploads state their 25 MB limit up front**, name the offending file size, translate nginx's bare 413, and say plainly that nothing was saved when a save fails. The webinar Details tab warns before closing with an uploaded-but-unsaved cover.
* **Detail tabs are keyed on the event id.** Each seeds its form state on mount, so without a key React reused the previous webinar's state and fields looked empty after switching events or saving - which is why a saved description appeared blank.
* **Research page trimmed** to headline, optional photo and publications. The statement and about-columns were removed from the page, the admin form *and* `ALLOWED_KEYS`, so the fields cannot be filled with copy that nothing renders.

### Fixed

* **`generate-meeting` returned 500 on every attempt** (`NameError: timezone` - the module never imported `django.utils.timezone`). The crash happened *after* Google Calendar created the event, so each click made a real calendar entry, returned 500 and saved nothing. No Meet link ever appeared, and reminder mails went out without a join link.
* **The Razorpay webhook fell off the end returning `None`.** Razorpay reads any non-2xx as failure and retries, so every payment webhook was being retried repeatedly. It now returns 200.
* **Editing a webinar's date or time now moves everything at once:** the Calendar event is patched in place (same Meet link, so a saved link keeps working), `meeting_start` is realigned - it outranks the typed date in `event_start()`, so leaving it stale made the site disagree with the calendar - and everyone who has paid gets a "Webinar - Schedule changed" mail.
* **The paid registration path was dropping role, organisation, country and both free-text answers;** only the free path stored them.

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

## [0.2.0] - Cloudflare ATS Integration, Multi-DB Routing, & Comprehensive Architecture (25-06-26) (satyam)

### Added

* **Comprehensive End Report:** Created `docs/SATYAMS_END_REPORT.md` documenting high-level design, RBAC matrix grids, multi-database edge routing, Cloudflare ATS connectivity, and portal deep-dives.
* **Serverless Cloudflare ATS:** Built direct HTTP API providers (`career_app/providers.py`) querying edge Cloudflare D1 SQL databases for candidate evaluations and streaming resume PDFs from Cloudflare R2 storage.
* **Multi-Database Router (`config/routers.py`):** Configured automatic read/write separation between core RBAC/authentication (`default` / Supabase DB) and portal content streams (`turso_db` / Turso DB).
* **Client-Side PDF Exports:** Integrated `jspdf` and `jspdf-autotable` into the Career portal for instant formatted candidate and enrollment roster exports.
* **Form Gate Locking:** Added remote locking guards allowing administrators to toggle application visibility queues dynamically.
* **Automated Data Seeding:** Developed `seed_data.py` for one-click sample data population across departments, events, keynote speakers, and registrations.

---

## [0.1.5] - Complete UI Redesign & Dynamic Theme Engine (07-06-26) (satyam)


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

