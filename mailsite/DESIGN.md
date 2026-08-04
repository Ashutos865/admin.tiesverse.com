# TIES Mail — production UI specification

The source of truth for the mail.tiesverse.com rebuild. Written before the code so the
implementation has something to be checked against, and so the next person changing a
colour or a breakpoint knows what it was supposed to be.

The design this describes is the supplied "TIES Mail — final production UI" set:
a light, near-white workspace — **not** the cream/glass prototype it replaces.

---

## 1. Design tokens

Declared once in `src/tokens.css` as CSS custom properties. Nothing in the app
hardcodes a hex value; if a colour is needed that is not here, it gets added here first.

### Colour

| Token | Value | Used for |
|---|---|---|
| `--page` | `#F7F8FA` | App background behind every pane |
| `--card` | `#FFFFFF` | Panes, cards, rows, menus |
| `--card-2` | `#FCFCFD` | Sunken areas: list pane, rail |
| `--line` | `#E5E7EB` | 1px borders, pane dividers |
| `--line-soft` | `#F1F2F4` | Row separators inside a card |
| `--ink` | `#111827` | Primary text, dark buttons |
| `--ink-2` | `#374151` | Body copy |
| `--muted` | `#6B7280` | Secondary text, meta |
| `--muted-2` | `#9CA3AF` | Timestamps, placeholder, eyebrow |
| `--accent` | `#FE7A00` | The one brand colour: active nav, unread dot, primary button, chips |
| `--accent-hover` | `#E86E00` | Pressed/hover on accent surfaces |
| `--accent-soft` | `rgba(254,122,0,.08)` | Active nav row, unread row tint, chip fill |
| `--accent-line` | `rgba(254,122,0,.28)` | Chip border, focus glow |
| `--ok` | `#067A50` | SLA healthy, success |
| `--warn` | `#B45309` | Due-soon, waiting |
| `--danger` | `#C02626` | Errors, destructive |
| `--info` | `#2563EB` | Links, informational chips |

Category chip colours (thread/list chips: Partnerships, Media, Careers, Support) derive
from a small map in `tokens.css` — a text colour plus an 8%-alpha fill of the same hue,
so a new category needs one line, not a new component.

### Shape, depth, motion

| Token | Value |
|---|---|
| `--r-card` | `12px` |
| `--r-control` | `8px` |
| `--r-pill` | `999px` |
| `--shadow-sm` | `0 1px 2px rgba(16,24,40,.06)` |
| `--shadow-md` | `0 4px 12px rgba(16,24,40,.08)` |
| `--shadow-lg` | `0 16px 40px rgba(16,24,40,.14)` (modals, menus) |
| `--t-fast` | `120ms cubic-bezier(.2,0,.2,1)` |
| `--t-base` | `160ms cubic-bezier(.2,0,.2,1)` |

All transitions are wrapped by `@media (prefers-reduced-motion: reduce)` which sets
durations to `0.01ms` — motion is decoration, never the only signal.

### Type

**Inter**, self-hosted at `public/fonts/inter-{400,500,600,700}.woff2` with
`font-display: swap`. Self-hosted rather than a Google Fonts link because the current
site declares a font it never loads — a network-dependent `<link>` is what let that go
unnoticed. `--font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`.

| Role | Size / weight | Notes |
|---|---|---|
| Eyebrow | 11px / 700 / `.08em` uppercase | `--muted-2`; section labels ("MAIL", "TEAM INBOXES") |
| Meta | 12px / 500 | Timestamps, counts, captions |
| Body | 13px / 400 | List snippets, secondary rows |
| Body strong | 13px / 600 | Sender names, unread rows |
| Control | 14px / 500 | Buttons, inputs, nav items |
| Title | 16px / 600 | Card titles, thread subject in list |
| Screen title | 20px / 700 | "Inbox", thread subject |
| Display | 24px / 700 | Dashboard greeting, stat values |

Numerals in stat tiles use `font-variant-numeric: tabular-nums` so the figures do not
jitter as counts change.

---

## 2. Layout system

Four panes, left to right. Widths are fixed except the thread, which takes the slack.

| Pane | Width | Contents |
|---|---|---|
| Sidebar | `264px` (rail `72px`) | Compose, search, folders, team inboxes, utility, account |
| List | `410px` | Search, filter tabs, message rows |
| Thread | `1fr` (min `520px`) | Subject, toolbar, messages, reply bar, internal notes |
| Context | `284px` | Contact, owner, status, due date, linked docs, activity |

Every icon-only control is a **40×40** hit target with a tooltip. Text buttons are 36px
tall with 12px horizontal padding. Focus is a **2px `--accent` ring at 2px offset**,
never removed — `:focus-visible` so it only shows for keyboard users.

### Breakpoints

| Width | Layout |
|---|---|
| ≥1440 | All four panes |
| 1180–1439 | Context panel hidden; reachable from the contact chip in the thread header |
| 769–1179 | Sidebar collapses to a 72px icon rail; two panes (list + thread) |
| ≤768 | **Phone** — single pane, see §6 |

---

## 3. Screens

### 3.1 Home — `/`

Greeting header (`Good morning, {first name}`) with a subline naming what needs
attention, a `Customize` ghost button and a **New message** accent button.

Four stat tiles in a row, each: eyebrow label, display-size value, caption.

| Tile | Source (phase 1) |
|---|---|
| Unread | `GET /api/mail/counts/` → sum of `inbox_unread` |
| Assigned to me | Personal-mailbox unread (team assignment is deferred) |
| Open tasks | Placeholder card stating it is not wired yet — **honest, not fake data** |
| SLA health | Same |

Below: **Needs your attention** — the newest unread senders with avatar, subject,
mailbox chip and relative time; and **Today** — a schedule column, placeholder in
phase 1. Then a **mailbox summary row**: one card per mailbox the user can open, with
open/unread counts and a thin progress bar.

Placeholders are explicitly labelled ("Not connected yet") rather than filled with
plausible numbers. A dashboard that lies is worse than one that admits a gap.

### 3.2 Mailbox — `/m/:mailboxId/:folder` (`/m/:mailboxId/t/:threadKey`)

**Sidebar.** Logo row (`.ties | Mail`, one component — swap point for the real asset).
Dark **Compose** pill (`--ink` background, white text, `⌘N` hint on the right).
Search field with `⌘K` hint. Then:

- `MAIL` — Inbox (unread count), Starred, Snoozed, Drafts (count), Scheduled (count), Sent
- `TEAM INBOXES` — the SHARED mailboxes this user may open, each with its unread count.
  **No addresses are created by this UI**; it lists what exists.
- Utility — Tasks, Contacts, Files, Announcements. Present as designed, each routing to
  a "Coming soon" state that names what it will do. Deferred scope, visible roadmap.
- Account card — avatar, name, address, menu (settings, sign out).

Active row: `--accent-soft` fill, `--accent` text, 3px accent bar on the leading edge.

**List pane.** In-mailbox search; filter tabs `Primary · Assigned to me · Unassigned`
(the latter two are inert until team inboxes land, and are hidden on personal boxes).
Rows: 40px avatar, sender (600), time right-aligned, subject (600 when unread), snippet
(one line, ellipsis), category chips, star toggle. Unread rows get the `--accent-soft`
tint and a 6px accent dot. Selected row gets a white card + `--shadow-sm`.

**Thread pane.** Subject as screen title with its chips. Toolbar of 40×40 icon buttons:
back, archive, delete, snooze, star, label, more; prev/next on the right. Then message
cards — sender row (avatar, name, address, time), body, attachment chips (icon,
filename, size, download). Reply / Reply all / Forward buttons under the last message.

**Rendering an email body is the one genuinely hostile input in this app.** Inbound
`body_html` is written by strangers. It renders inside `<iframe sandbox srcdoc=…>` with
no `allow-scripts` and no `allow-same-origin` — scripts cannot run, forms cannot post,
and the sender's CSS cannot reach the app's DOM. It is never passed to
`dangerouslySetInnerHTML`. Plain-text bodies render as `white-space: pre-wrap`.

Below that, the **internal comment composer** — visually distinct (tinted, "Internal
comment · only your TIES team") because the one unforgivable bug here is an internal
note leaving the building. It posts to `/api/mail/notes/`, never to `send/`.

**Context panel.** Contact card (avatar, name, org, email), relationship owner, status
select, due date, linked documents, and an activity feed built from message events and
audit rows (`Email opened`, `Replied to email`, `Status changed`).

### 3.3 Compose — modal, and `/compose` for deep links

From (only mailboxes the user may send from — never a free-text address), To/Cc/Bcc as
removable chips with typeahead over contacts, subject, body. Attachments by drag-drop
or picker: chips with filename, size and remove, a running total, and a hard stop at
**10 MB combined** (the SES raw-message ceiling — refused in the client with a clear
message rather than failing at the API).

Footer: **Send** (accent), a schedule button opening a date/time picker, attach, discard.
Autosave to Drafts every 3s while dirty and on close; the draft id is held so repeated
saves update one row rather than littering.

### 3.4 States

| State | Behaviour |
|---|---|
| Loading | Skeleton rows after **250ms** only (faster responses never flash a skeleton); row shapes preserved |
| Empty | Illustration + "You're all caught up" + Clear filters when filters are active |
| Offline | Banner "No connection — changes sync when you're back online"; Retry; server actions disabled; drafts stay local |
| Sent | Dark toast "Message sent · Undo", visible **6s**, `role="status"` polite |
| Send failure | Inline red card "Message could not be sent. Your draft is safe." + Try again / Save draft — **never clears the editor** |
| Discard | Confirm dialog naming what is lost; Keep editing is the default action |

### 3.5 Login

Two tabs, as today: **My account** (portal credentials — work email or Crew ID) and
**Team mailbox** (address + shared password). Restyled to the new tokens. Arriving with
a valid SSO ticket skips this screen entirely (§5).

---

## 4. Responsive — phone (≤768)

Designed fresh; the mockups stop at desktop.

- **Bottom tab bar**, fixed, safe-area aware: Home · Mail · Compose (accent FAB, raised)
  · Search · Account. 56px tall, 44px minimum targets.
- **Single pane stack**: folder list → message list → thread full-screen (back chevron
  in the header) → compose as a full-height sheet. Browser back maps to the same
  hierarchy, so the OS gesture does the expected thing.
- Context panel becomes a bottom sheet, opened from the contact chip in the thread header.
- All inputs are **16px** — anything smaller makes iOS zoom on focus.
- Sidebar sections (team inboxes, utility) live behind the Account tab rather than
  being cut, so nothing is unreachable on a phone.

---

## 5. Auth & SSO

Two existing modes are preserved: portal JWT (`Authorization: Bearer`) and the scoped
shared-mailbox token (`X-Mail-Token`, 12h, one mailbox).

**New: silent sign-in from the admin panel.** Clicking Mail in the panel navbar must
land the user in their mailbox, not on a login form.

1. Panel calls `POST /api/mail/sso-ticket/` with its own JWT → `{code}`, valid **30s**,
   single use, carrying only the user id.
2. Panel opens `https://mail.tiesverse.com/#sso=<code>`.
3. The mail site sees the fragment on boot, calls `POST /api/mail/sso-redeem/`, receives
   a fresh access/refresh pair, stores it, and **strips the fragment** from the URL so
   the code cannot be re-shared from the address bar.

The code is single-use (redemption is recorded) and short-lived, so a leaked URL is
worthless seconds later. Redemption writes an audit row. Direct visitors to
mail.tiesverse.com still get the login screen — SSO grants nothing that a password
would not.

The refresh token is finally used: a 401 triggers one refresh attempt before sign-out,
so sessions stop dying silently at 24 hours.

---

## 6. API contract

Full request/response detail lives in `admin/mail_app/API.md`. Summary of what the
frontend depends on:

| Purpose | Endpoint |
|---|---|
| Session bootstrap | `GET /api/mail/me/` |
| Badges + dashboard | `GET /api/mail/counts/` |
| List | `GET /api/mail/messages/?mailbox=&folder=&search=` — folders `inbox·sent·trash·starred·snoozed·drafts·scheduled` |
| Thread | `GET /api/mail/messages/:id/` |
| Flags | `POST /api/mail/messages/:id/flags/` `{starred?, snoozed_until?, read?}` |
| Trash / restore | `DELETE` / `POST /api/mail/messages/:id/` |
| Send | `POST /api/mail/send/` `{mailbox,to,cc,subject,body,attachments[],send_at?}` |
| Undo / cancel | `POST /api/mail/messages/:id/cancel/` |
| Drafts | `GET·POST /api/mail/drafts/`, `PATCH·DELETE /api/mail/drafts/:id/`, `POST /api/mail/drafts/:id/send/` |
| Attachments | `POST /api/mail/attachments/`, `GET /api/mail/attachments/:id/download/` |
| Internal notes | `GET /api/mail/notes/?thread_key=`, `POST /api/mail/notes/` |
| SSO | `POST /api/mail/sso-ticket/`, `POST /api/mail/sso-redeem/` |

The client keeps its existing convention: **`request()` never throws**; every failure
resolves to `{error, status}`. Twelve call sites depend on it and it stays.

---

## 7. Out of scope (deferred by the user)

Team-inbox addresses and their assignment/SLA workflow · mailbox sending rules
(the admin@ restriction) · the real logo asset · Tasks/Contacts/Files/Announcements
data · retiring the stale `mail/` copy at the workspace root.
