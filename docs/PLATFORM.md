# Tiesverse Platform — Developer Reference

Living document. Updated as development progresses.
Last updated: 2026-06-26 (session 3)

---

## Table of Contents
1. [Platform Overview](#1-platform-overview)
2. [Repos & Deployment](#2-repos--deployment)
3. [Database Architecture](#3-database-architecture)
4. [Admin Panel (this repo)](#4-admin-panel-this-repo)
5. [Landing Site (tiesversewebsitev0.2)](#5-landing-site-tiesversewebsitev02)
6. [Career Page (tiesverse-career-page)](#6-career-page-tiesverse-career-page)
7. [API Reference](#7-api-reference)
8. [Data Flow: Admin → Public Sites](#8-data-flow-admin--public-sites)
9. [Environment Variables Reference](#9-environment-variables-reference)
10. [Supabase Tables](#10-supabase-tables)
11. [Turso Schema](#11-turso-schema)
12. [Cloudflare D1 Schema](#12-cloudflare-d1-schema)
13. [Local Development Quickstart](#13-local-development-quickstart)
14. [Progress Log](#14-progress-log)

---

## 1. Platform Overview

Tiesverse is a youth-led research, media and tech organisation. The platform consists of:

| Property | URL | Purpose |
|---|---|---|
| Landing site | tiesverse.com | Main public face — events, articles, guests, webinars |
| Career page | careers.tiesverse.com | Open positions, applications |
| Admin panel | admin.tiesverse.com | Privileged write access to all properties |

The admin panel is the **single write surface**. Public sites are **read-only** against their respective databases.

---

## 2. Repos & Deployment

| Repo | Stack | Hosted on |
|---|---|---|
| `Admin-panel-ties` | Django 5 + React/Vite (Tailwind CSS) | AWS EC2 |
| `tiesversewebsitev0.2` | React 18 + Vite 8 | Hostinger |
| `tiesverse-career-page` | Django 5 backend + Google Apps Script | AWS EC2 + Hostinger |

---

## 3. Database Architecture

| Property | Database | Provider | Notes |
|---|---|---|---|
| Landing site content | PostgreSQL | Supabase | Project: `ppvoqabsdundeyseqrxd` |
| Event/webinar registrations | libSQL | Turso | `eventstiesverse-tiesverse.aws-ap-south-1.turso.io` |
| Career applications | D1 (SQLite) | Cloudflare | DB ID: `9673d804-a5fc-4bf7-8590-6936f5a1b7e7` |
| Resume files | R2 | Cloudflare | Bucket: `career-tiesverse` |

### Access pattern

```
Admin panel (Django)
  ├─ Supabase service_role key  →  read/write landing tables (bypasses RLS)
  ├─ Cloudflare API token       →  read/write D1 (career) via REST API
  └─ Turso HTTP API             →  read/write registrations via Bearer token

Landing site (React)
  └─ Supabase anon key          →  read-only (RLS: SELECT USING true)

Career page backend (Django)
  └─ Cloudflare API token       →  read/write D1 directly
```

### Admin's local databases + router ⚠️ IMPORTANT

The admin panel does **not** use one SQLite file. It runs **two** local SQLite
databases with a router (`config/routers.py`):

| Django DB alias | File | Holds |
|---|---|---|
| `default` | `supabase_db.sqlite3` | auth, accounts, sessions, admin, contenttypes |
| `turso_db` | `turso_db.sqlite3` | `tiesverse_app`, `career_app`, `webinar_app` models |

`config/routers.py::AppRouter` routes those three app labels to `turso_db`
for read **and** write; everything else goes to `default`. The local DB is the
admin's **source of truth**; Supabase/D1/Turso are downstream replicas.

**Consequence for migrations** — plain `python manage.py migrate` only touches
`default`. The routed apps must be migrated explicitly:

```bash
python manage.py migrate                       # default DB (auth/accounts)
python manage.py migrate --database=turso_db   # tiesverse/career/webinar apps
```

If the routed tables are missing ("no such table …"), the cause is almost
always that `--database=turso_db` was never run.

### Security rules
- `SUPABASE_SERVICE_KEY` lives **only** in `Admin-panel-ties/.env`. Never in any frontend.
- `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` live **only** in `Admin-panel-ties/.env`.
- `RAZORPAY_KEY_ID` is safe to expose to the frontend (it goes in the Razorpay checkout script).
- `tiesverse-career-page/backend/env` contains real Cloudflare tokens — **gitignored, never commit**.

---

## 4. Admin Panel (this repo)

### Structure

```
Admin-panel-ties/
├── config/              Django project settings & URLs
├── tiesverse_app/       Landing site CRUD (Events, Articles, TeamMembers, etc.)
├── career_app/          Career admin (Positions, Enrollments from D1, Offer Letters)
├── webinar_app/         Webinar admin + Registration endpoints + Razorpay
├── accounts_app/        Auth, JWT, user management
├── frontend/            React + Vite admin dashboard
│   └── src/
│       ├── pages/
│       │   ├── Tiesverse/      Landing content management
│       │   ├── Career/         Career dashboard + position/enrollment management
│       │   └── Webinar/        Webinar dashboard + registrations table
│       └── apiClient.js        All API call functions (JWT-authenticated)
└── docs/
```

### Django apps & models

| App | Key models | Notes |
|---|---|---|
| `tiesverse_app` | Department (Articles), Event, EventSpeaker, EventRegistration, TeamMember, TeamMemberSocial, WebinarListing | All sync to Supabase via `SupabaseSyncMixin` |
| `career_app` | Position, Enrollment, OfferLetter | Cloudflare D1 via REST API |
| `webinar_app` | WebinarEvent, RegistrationForm, CalendarEvent | Registrations stored in Turso |
| `accounts_app` | Django User | JWT via `djangorestframework-simplejwt` |

**Model name mapping** (old name → current class → Supabase table):

| Old name | Current class | db_table | Supabase table |
|---|---|---|---|
| Article | Department | departments | articles |
| Guest | EventSpeaker | event_speakers | guests |
| Workshop | EventRegistration | event_registrations | workshops |
| YouTubeVideo | TeamMemberSocial | team_member_socials | youtube_videos |

Aliases (`Article = Department`, `Guest = EventSpeaker`, etc.) keep old code working.

### Supabase sync

Every write through `tiesverse_app` ViewSets mirrors to Supabase:

```python
# tiesverse_app/supabase_sync.py
upsert(instance)   # called on perform_create / perform_update
delete(instance)   # called on perform_destroy
```

- Uses `django_id` (Django PK) as upsert conflict key in Supabase. Every synced
  Supabase table therefore needs a `django_id` column (+ a unique index) so the
  `on_conflict='django_id'` upsert updates the right row instead of duplicating.
- Each model implements `to_supabase_dict()` → Supabase column names (1:1).
- Silent no-op if credentials not set.

### Backfilling the admin from Supabase

Seed content loaded straight into Supabase never existed in the admin's local
DB, so admin lists showed empty. The management command pulls each Supabase row
into the matching Django model **and** stamps the Supabase row's `django_id`
with the new PK, so later admin edits/deletes target the same row (no dupes):

```bash
python manage.py import_from_supabase                       # all collections
python manage.py import_from_supabase --models events team_members departments
```

Idempotent — a Supabase row already linked to a live Django object is skipped.
Source: `tiesverse_app/management/commands/import_from_supabase.py`.

### Authentication

JWT-based. `POST /api/token/` → access + refresh tokens. React frontend stores token in localStorage, sends as `Authorization: Bearer <token>`.

---

## 5. Landing Site (tiesversewebsitev0.2)

### Stack
React 18 + Vite 8 + `@supabase/supabase-js`

### Live vs static data

All dynamic pages use `useLiveData(apiFn, staticFallback)` — shows static data immediately, replaces with Supabase data when ready. Falls back to static if Supabase empty.

### Pages with live data

| Page | Supabase table | Static fallback |
|---|---|---|
| Home | webinars, events, guests | site.js |
| Newsroom | articles | site.js WORK array |
| Research | articles (kind = Report/Brief/Analysis) | site.js REPORTS |
| Events | events | site.js EVENTS |
| Webinars | webinars | site.js WEBINARS |
| Guests | guests | site.js GUESTS |

### Webinars field mapping

Supabase schema (canonical): `title`, `speaker`, `org`, `date`, `time_tz`, `cover_url`, `registration_link`, `status`

The `Webinars.jsx` normalization handles both Supabase and the old Turso field names as fallback.

---

## 6. Career Page (tiesverse-career-page)

### Stack
Django 5 backend + Google Apps Script

### Data storage
- **Cloudflare D1** — candidate applications (39+ records live)
- **Cloudflare R2** — resume file uploads
- **Admin panel** reads D1 via `career_app/cloudflare_proxy.py` (REST API)

### Email on application
AWS SES sends "Thank you for applying" email from `careers@tiesverse.com` on every successful application (via `careers/ses_email.py`).

### Key files
- `backend/careers/providers.py` — `CloudflareD1Provider` (full CRUD against D1)
- `backend/careers/ses_email.py` — `send_application_confirmation()`
- `backend/env` — Cloudflare + AWS SES credentials (**gitignored**)

---

## 7. API Reference

### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/token/` | None | Get JWT access + refresh tokens |
| POST | `/api/token/refresh/` | None | Refresh access token |

### Tiesverse (landing site content) — all require JWT
| Method | Path | Description |
|---|---|---|
| GET/POST | `/api/landing/events/` | Events CRUD |
| GET/POST | `/api/landing/departments/` | Articles CRUD |
| GET/POST | `/api/landing/team_members/` | Team members CRUD |
| GET/POST | `/api/landing/event_speakers/` | Guests CRUD |
| GET/POST | `/api/landing/event_registrations/` | Workshops CRUD |
| GET/POST | `/api/landing/team_member_socials/` | YouTube videos CRUD |
| GET/POST | `/api/landing/webinars/` | Webinar listings CRUD |

### Career — require JWT (except public gates)
| Method | Path | Description |
|---|---|---|
| GET | `/api/career/enrollments/` | All D1 candidates |
| PATCH | `/api/career/enrollments/{id}/update_status/` | Update interview status / decision |
| GET | `/api/career/candidates/` | Same (alternate endpoint) |
| GET | `/api/career/form-gates/` | Dept open/closed status |
| GET | `/api/career/resume/{id}/` | Download resume from R2 |

### Webinar / Events registration
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/webinar/register/` | None (public) | Free registration → Turso + SES email |
| GET | `/api/webinar/registrations/` | JWT | Admin: list all Turso registrations |
| POST | `/api/webinar/create-order/` | None (public) | **Razorpay**: create order for paid event |
| POST | `/api/webinar/verify-payment/` | None (public) | **Razorpay**: verify HMAC after checkout |
| POST | `/api/webinar/razorpay-webhook/` | Webhook sig | **Razorpay**: server-side event handler |

### Registration flow decision tree

```
User clicks Register
        │
        ▼
    price > 0?
    ├── No  → POST /api/webinar/register/
    │           → save to Turso (payment_status='free')
    │           → SES confirmation email
    │           → done ✓
    │
    └── Yes → POST /api/webinar/create-order/
                → Razorpay order created
                → pending row saved to Turso
                → return { order_id, amount, currency, key_id }
                        │
                        ▼
                Razorpay checkout modal opens in browser
                        │
                User pays (card / UPI / netbanking)
                        │
                        ▼
                POST /api/webinar/verify-payment/
                { razorpay_order_id, razorpay_payment_id, razorpay_signature }
                        │
                Backend HMAC-SHA256 verify
                        │
                    Valid?
                    ├── No  → 400 Payment verification failed
                    └── Yes → UPDATE Turso row (payment_status='paid')
                              → SES confirmation email
                              → done ✓
```

---

## 8. Data Flow: Admin → Public Sites

```
Admin creates/edits content in Django dashboard
        │
        ▼
Django ViewSet (e.g. EventViewSet)
  └─ SupabaseSyncMixin
        ├─ Saves to local SQLite (source of truth for admin)
        └─ supabase_sync.upsert(instance)
              └─ Supabase REST (service_role key, bypasses RLS)
                    └─ Table updated with django_id conflict key
                              │
                              ▼
                    tiesverse.com reads on next page load
                    (React → Supabase anon key → read-only)
```

---

## 9. Environment Variables Reference

### Admin panel (`Admin-panel-ties/.env`) — gitignored

```env
# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Auth
JWT_SECRET=
FRONTEND_URL=http://localhost:5173/

# Supabase — service key ONLY, never expose to frontend
SUPABASE_URL=https://ppvoqabsdundeyseqrxd.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_...

# Turso — event/webinar registrations
TURSO_DATABASE_URL=https://eventstiesverse-tiesverse.aws-ap-south-1.turso.io
TURSO_AUTH_TOKEN=eyJhbGci...

# AWS SES — event registration confirmation emails
AWS_SES_ACCESS_KEY_ID=
AWS_SES_SECRET_ACCESS_KEY=
AWS_SES_REGION=us-east-1
SES_FROM_EMAIL=mail@tiesverse.com

# Cloudflare — career D1 / R2
TV_DATA_PROVIDER=cloudflare
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_D1_DATABASE_ID=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET=career-tiesverse

# Razorpay — paid event/webinar payments
RAZORPAY_KEY_ID=rzp_...          # safe to expose to frontend
RAZORPAY_KEY_SECRET=             # backend only, never expose
RAZORPAY_WEBHOOK_SECRET=         # dashboard.razorpay.com → Webhooks
```

### Landing site (`tiesversewebsitev0.2/.env`) — gitignored

```env
VITE_SUPABASE_URL=https://ppvoqabsdundeyseqrxd.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...    # read-only, safe to expose
VITE_RAZORPAY_KEY_ID=rzp_...          # same as RAZORPAY_KEY_ID above (safe to expose)
```

### Career backend (`tiesverse-career-page/backend/env`) — gitignored, never commit

```env
TV_DATA_PROVIDER=cloudflare
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_D1_DATABASE_ID=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET=career-tiesverse
AWS_SES_ACCESS_KEY_ID=
AWS_SES_SECRET_ACCESS_KEY=
AWS_SES_REGION=us-east-1
SES_CAREERS_FROM_EMAIL=careers@tiesverse.com
```

---

## 10. Supabase Tables

Project: `https://ppvoqabsdundeyseqrxd.supabase.co`

RLS enabled on all tables. Public `SELECT USING (true)`. Admin writes via service_role (bypasses RLS). `django_id` = upsert conflict key.

| Table | Key columns | Notes |
|---|---|---|
| `webinars` | title, speaker, date, time_tz, status, cover_url, registration_link, kind | status: upcoming/past |
| `events` | title, category, date, city, venue, cover_url, register_url, past, flagship | past=true for past events |
| `articles` | slug (unique), title, dek, cat, topic, kind, cover_url, published, featured | kind: Article/Report/Brief/Analysis |
| `youtube_videos` | title, video_id, thumbnail_url, category | 4 placeholder video_ids to update |
| `workshops` | title, description, date, time_tz, host, cover_url, register_url, status | |
| `team_members` | name, role, bio, photo_url, department, is_founder, display_order | |
| `guests` | name, role, org, photo_url, quote, featured | |

---

## 11. Turso Schema

Database: `eventstiesverse-tiesverse.aws-ap-south-1.turso.io`
Protocol: HTTPS pipeline API (`/v2/pipeline`)

### `registrations` table

```sql
CREATE TABLE registrations (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id            TEXT,
    event_title         TEXT NOT NULL,
    event_type          TEXT DEFAULT 'event',   -- 'event' | 'webinar'
    name                TEXT NOT NULL,
    email               TEXT NOT NULL,
    phone               TEXT,
    city                TEXT,
    registered_at       TEXT NOT NULL,          -- ISO datetime
    email_sent          INTEGER DEFAULT 0,      -- 1 after SES confirmation sent
    -- Payment fields (added 2026-06-26)
    payment_required    INTEGER DEFAULT 0,      -- 0=free, 1=paid
    amount              INTEGER DEFAULT 0,      -- in paise (₹100 = 10000)
    razorpay_order_id   TEXT,
    razorpay_payment_id TEXT,
    payment_status      TEXT DEFAULT 'free'     -- 'free' | 'pending' | 'paid' | 'failed'
);
```

---

## 12. Cloudflare D1 Schema

Database ID: `9673d804-a5fc-4bf7-8590-6936f5a1b7e7`
Access: REST API `https://api.cloudflare.com/client/v4/accounts/{id}/d1/database/{db_id}/query`

### `candidates` table (39+ live records)

Key columns: `id`, `timestamp`, `department`, `roles`, `first_name`, `last_name`, `email`, `phone`, `city`, `linkedin`, `portfolio`, `why_join`, `resume_name`, `resume_key`, `interview_status`, `interviewer`, `rating`, `final_decision`, `request_id`, `created_at`

`interview_status` values: `Pending Setup` | `Interview Scheduled` | `Interview Done` | `On Hold`
`final_decision` values: `Under Review` | `Shortlisted` | `Accepted` | `Rejected`

---

## 13. Local Development Quickstart

### Port map (run each in its own terminal)

| Service | Command dir | URL | Notes |
|---|---|---|---|
| Admin backend (Django) | `Admin-panel-ties` | http://localhost:8000 | API only |
| Admin dashboard (Vite) | `Admin-panel-ties/frontend` | http://localhost:5173 | login `admin` / `admin123` |
| Landing site (Vite) | `tiesversewebsitev0.2` | http://localhost:3000 | port pinned in `vite.config.js` |
| Career (Django, all-in-one) | `tiesverse-career-page/backend` | http://localhost:8001 | serves pages **and** `/api/` |

> The admin backend is hardcoded to `:8000` in the admin frontend + landing
> `.env`, so keep it there and run the career backend on `:8001`.

### Admin panel

```bash
cd Admin-panel-ties
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate                       # default DB (auth/accounts)
python manage.py migrate --database=turso_db   # routed apps (tiesverse/career/webinar)
python manage.py runserver 8000                # API on :8000

# Frontend (separate terminal)
cd frontend && npm install && npm run dev      # dashboard on :5173

# Create admin user (first time only)
python manage.py shell -c "
from django.contrib.auth.models import User
User.objects.create_superuser('admin','admin@tiesverse.com','admin123')
"

# First-time content backfill (pull Supabase seed data into the admin)
python manage.py import_from_supabase
```

### Landing site

```bash
cd tiesversewebsitev0.2
npm install
npm run dev     # :3000
# .env needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
#           VITE_ADMIN_API_URL (http://localhost:8000), VITE_RAZORPAY_KEY_ID
```

### Career page (single Django process — serves frontend + API)

```bash
cd tiesverse-career-page/backend
source .venv/bin/activate
python manage.py runserver 8001
# Open http://localhost:8001/  (index, portals, /api/ all on this one port)
# Needs ../backend/env with Cloudflare + SES credentials
# Do NOT also run `python -m http.server` — Django already serves the pages.
```

### Stop everything

```bash
pkill -f "manage.py runserver"
for p in 5173 3000; do fuser -k ${p}/tcp; done
```

---

## 14. Progress Log

### 2026-06-25 — Session 1

**Landing site (tiesversewebsitev0.2)**
- Connected to new Supabase project (`ppvoqabsdundeyseqrxd`)
- Created 7 Supabase tables with `django_id` upsert conflict column
- Wired all dynamic pages to live Supabase fetch with static fallback
- Fixed `Webinars.jsx` field mapping (old Turso schema → Supabase schema)

**Admin panel**
- Added `to_supabase_dict()` to all 7 tiesverse_app models
- Merged teammate's schema rewrite (Department, EventSpeaker, EventRegistration, TeamMemberSocial)
- New migration `0002_webinarlisting_and_more.py` — adds WebinarListing, removes bad constraints
- Fixed all old-name aliases (Article, Guest, Workshop, YouTubeVideo) in models, serializers, views
- Fixed `supabase_sync.TABLE_MAP` for new model names
- Fixed duplicate/missing exports in `frontend/src/apiClient.js`
- Added `CareerAdmin` export to `Career/index.jsx`
- Verified both dashboards load correctly with live data

**Integrations wired**

| Integration | Status | From address / endpoint |
|---|---|---|
| Supabase sync | ✅ Working | service_role key, bypasses RLS |
| Cloudflare D1 (career) | ✅ Working | 41 candidates live |
| Turso (registrations) | ✅ Working | `registrations` table created |
| AWS SES — events | ✅ Working | `mail@tiesverse.com` |
| AWS SES — careers | ✅ Working | `careers@tiesverse.com` |

**Tests run**
- Webinar registration end-to-end: row saved to Turso, email delivered to `krishkumar6566@gmail.com`
- Career application end-to-end: row saved to D1 (id=147), confirmation email sent
- Admin dashboards: Webinar shows 2 registrations, Career shows 41 applicants

---

### 2026-06-26 — Session 2

**Razorpay payment gateway**
- Installed `razorpay>=2.0.1` Python package
- Created `webinar_app/razorpay_client.py`:
  - `create_order(amount_inr, receipt, notes)` — creates Razorpay order
  - `verify_payment_signature(order_id, payment_id, signature)` — HMAC-SHA256 check
  - `verify_webhook_signature(body_bytes, received_signature)` — webhook verification
- Added 3 new endpoints to `webinar_app/views.py`:
  - `POST /api/webinar/create-order/` — step 1 for paid events (public, no JWT)
  - `POST /api/webinar/verify-payment/` — step 2, verifies signature + marks paid (public)
  - `POST /api/webinar/razorpay-webhook/` — Razorpay server webhook, CSRF-exempt
- Updated Turso `registrations` schema: added `payment_required`, `amount`, `razorpay_order_id`, `razorpay_payment_id`, `payment_status` columns (idempotent ALTER TABLE)
- Settings: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` from env

**Pending — Razorpay**
- [ ] Add keys to `.env` (user adding manually: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`)
- [ ] Add Razorpay checkout JS to landing site registration form
- [ ] Set webhook URL in Razorpay dashboard: `https://admin.tiesverse.com/api/webinar/razorpay-webhook/`

**Pending — General**
- [ ] Update 4 YouTube placeholder `video_id` values from admin page
- [ ] Fill guest/team `photo_url` fields from admin page
- [ ] Deploy admin panel to AWS EC2
- [ ] Razorpay live keys after KYC verification

---

### 2026-06-26 — Session 3

**Razorpay frontend (landing site)**
- Razorpay test keys added to `.env` (admin backend); both create-order and
  verify-payment verified live (real `order_…` returned).
- New `tiesversewebsitev0.2/src/components/RegisterModal.jsx`: in-page
  registration form. Free → `/api/webinar/register/`; paid → create-order →
  Razorpay checkout → verify-payment. `key_id` comes from the backend response,
  so no secret touches the frontend. Loads `checkout.js` on demand.
- `EventDetail.jsx` register CTA opens the modal (was an external link).
- `apiClient.js`: `registerForEvent` / `createPaymentOrder` / `verifyPayment`
  posting to `VITE_ADMIN_API_URL`.

**Admin 500s — broken DB state fixed**
- Root cause: routed apps (`tiesverse_app`/`career_app`/`webinar_app`) live in
  `turso_db` (see §3), but `turso_db.sqlite3` was never migrated → every
  ORM-backed endpoint 500'd ("no such table"). Fixed with
  `migrate --database=turso_db`.
- `tiesverse_app/migrations/0001_initial.py` carried `UniqueConstraint`s on
  non-existent fields (`EventRegistration.event`, `TeamMemberSocial.team_member`)
  from the merge → table creation crashed. Dropped them; removed the matching
  `RemoveConstraint` ops from `0002`.

**Form ↔ model alignment (the "created but empty" bug)**
- `adminFetch` returns the DRF 400 body (field-keyed errors) with no `error`
  key, so `if (!res.error)` reported success on validation failures. Both
  `EventsManagement.jsx` and `Admin.jsx` now detect success via `res.id` and
  surface the first field error.
- All Tiesverse forms were posting stale schemas and 400ing. Rewrote them to
  mirror the models exactly:
  - Events: `date` (required) + category/city/venue/time/host/price/…
  - Departments → Articles editor: title, slug, dek, cat, topic, kind, cover_url…
  - Speakers → name, role, org, quote, photo_url, featured
  - Workshops → title, description, date, time_tz, host, cover_url, register_url, status
  - Team Members → department, display_order, is_founder

**Supabase backfill**
- Added `import_from_supabase` management command (see §4). Imported and linked
  by `django_id`: events 7, articles 12, team_members 5, guests 12, workshops 3,
  youtube_videos 4, webinars 11. No duplicates; admin now displays all of it.
- Added missing `django_id` column (+ unique index) to the Supabase `webinars`
  table so webinar edits sync cleanly.

**Career page**
- `tv-config.js` hardcoded the API to `:8000`; the career Django serves pages
  and `/api/` from the same origin, so it now uses `window.location.origin`.
  Form submission works on any port (fixes the 404 on submit).
- Added missing `import base64` in `careers/views.py` (silent resume-save fail).

**Infra**
- CORS: added `http://localhost:3000` (landing) to admin `CORS_ALLOWED_ORIGINS`
  (registration POSTs were blocked → "NetworkError").

**Verified working end-to-end**
- Tiesverse portal: events, articles, team, speakers, workshops, webinars all
  display live and CRUD round-trips to Supabase.
- Event/webinar registration (free + paid) and career application + SES email.
