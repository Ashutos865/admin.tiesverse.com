# TIES Mail API

Everything under `/api/mail/`. The frontend contract for `admin/mailsite/`;
see `admin/mailsite/DESIGN.md` for the UI these serve.

## Authentication

Two credentials are accepted on every non-admin endpoint:

| Mode | Header | Scope | Lifetime |
|---|---|---|---|
| Portal JWT | `Authorization: Bearer <access>` | Every mailbox the user owns or is granted; superadmins may **read** any | access 1d / refresh 7d |
| Shared mailbox | `X-Mail-Token: <signed>` | Exactly one SHARED mailbox | 12h |

`X-Mail-Token` wins when both are present. Admin endpoints (`admin/*`) require
`is_superuser` and ignore the shared token entirely.

**Reading someone else's mail is allowed for superadmins and always audited** — every
cross-mailbox list, read, delete, restore and avatar change writes a `MailAuditLog` row.
**Sending as someone else is not allowed, for anyone**, superadmin included.

---

## Session

### `GET /me/`
```json
{ "mode": "portal|shared_token", "is_superadmin": false,
  "user": {"name": "...", "email": "..."},
  "mailboxes": [{"id": 3, "address": "x@mail.tiesverse.com", "display_name": "...",
                 "kind": "PERSONAL|SHARED|SYSTEM", "avatar_url": "", "can_send": true}] }
```

### `GET /counts/`
Badge and dashboard source. One call, all mailboxes the caller can open.
```json
{ "total_unread": 12,
  "mailboxes": {"3": {"inbox_unread": 12, "drafts": 2, "scheduled": 1, "snoozed": 0}} }
```

---

## Messages

### `GET /messages/?mailbox=<id>&folder=<f>&search=<q>`
`folder` ∈ `inbox · sent · trash · starred · snoozed · drafts · scheduled`.
Capped at 200 rows, newest first. `drafts` returns draft rows (see Drafts) in the same
row shape so the list pane needs no special case.

Row: `id, direction, peer, peer_name, to, cc, subject, snippet, starred, snoozed_until,
send_at, is_read, has_attachments, thread_key, created_at, status`.

### `GET /messages/<id>/`
Returns the message **and its thread** (all messages sharing `thread_key`, oldest
first), each with `body_html`, `body_text` and `attachments[]`. Marks the message read
as a side effect — the one intentional GET mutation, matching how every mail client
behaves.

### `POST /messages/<id>/flags/`
`{starred?: bool, snoozed_until?: iso8601|null, read?: bool}` — any subset. `read:false`
returns a message to unread. Returns the updated row.

### `DELETE /messages/<id>/` → soft delete to Trash.
### `POST /messages/<id>/` → restore from Trash.

### `POST /messages/<id>/cancel/`
Voids a message still queued for a future `send_at`. Powers **Undo send**: the row moves
to `canceled` and its content returns as a draft, so "undo" lands you back in the
composer rather than losing the message. Returns 409 if it has already gone out — the
honest answer, since an email cannot be recalled.

### `POST /messages/<id>/release/`
Sends a queued message immediately. The composer calls this once the 6-second undo
window closes, so a normal send does not wait for the next cron tick.

Both this and the cron flusher acquire the message through the same
compare-and-set — `filter(pk=…, status='queued').update(status='sending')` — and only
proceed if it changed one row. That single guard is what makes a double send
impossible when the worker and a browser reach for the same message at once.

---

## Sending

### `POST /send/`
```json
{ "mailbox": 3, "to": "a@x.com, b@y.com", "cc": "", "subject": "...",
  "body": "...", "attachments": [11, 12], "send_at": null,
  "in_reply_to": "", "thread_key": "" }
```
- `to`/`cc` accept a comma string or a list.
- `attachments` are ids from the upload endpoint, owned by the caller and not yet
  attached to another message. Combined size ceiling **10 MB** (SES raw limit).
- `send_at` omitted → sent on the next worker tick with a **6-second undo grace**;
  `send_at` in the future → scheduled. Either way the row is created immediately with
  `status='queued'`, which is what makes Undo possible.
- Restrictions enforced: mailbox must be usable, caller must own or be granted it
  (superadmin status does **not** bypass this), daily send cap respected.

Returns the created message row.

---

## Drafts

Autosave target for the composer.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/drafts/?mailbox=` | Newest first |
| `POST` | `/drafts/` | Create; returns id for subsequent autosaves |
| `PATCH` | `/drafts/<id>/` | Partial; called every ~3s while dirty |
| `DELETE` | `/drafts/<id>/` | Discard |
| `POST` | `/drafts/<id>/send/` | Hands off to `/send/`, deletes the draft on success |

Body: `{mailbox, to, cc, bcc, subject, body_text, attachments[]}`.

---

## Attachments

### `POST /attachments/` (multipart)
Fields: `file`, optional `draft`. Stored in R2 under `mail/att/<uuid>/<filename>`.
Per-file cap 10 MB; rejected types are none — mail carries what people send — but the
combined per-message ceiling is enforced at send.
```json
{"id": 11, "filename": "proposal.pdf", "size": 214233, "content_type": "application/pdf"}
```

### `GET /attachments/<id>/download/`
Streams from R2 after checking the caller may open the owning mailbox. Inbound
attachments captured by the ingest cron are downloadable through the same endpoint.

---

## Internal notes

Team-visible comments on a thread. **Never emailed to anyone** — the composer that
posts here is deliberately styled to look nothing like the reply box.

| Method | Path |
|---|---|
| `GET` | `/notes/?mailbox=<id>&thread_key=<key>` |
| `POST` | `/notes/` `{mailbox, thread_key, body}` |

Returns `{id, author_name, body, created_at}`, oldest first.

---

## SSO (admin panel → mail site)

### `POST /sso-ticket/` — portal JWT required
Returns `{code}`: a signed blob carrying the user id and a random jti, **valid 60
seconds, single use**. The ticket is minted when the user clicks, not when the page
loads, so a short life costs nothing.

Single use is enforced by a `MailSsoTicket` row and an atomic
`filter(jti=…, used_at__isnull=True).update(used_at=now)` — zero rows updated means
replay. This is deliberately a database row and not the cache: the cache is per-process
locmem unless Redis is configured, so under multiple gunicorn workers a cache-based
guard would fail open exactly when it matters.

### `POST /sso-redeem/` — no auth
`{code}` → `{access, refresh}` (a fresh SimpleJWT pair) plus the `/me/` payload so the
client can render immediately. Replay is refused: the jti is burned on first redemption.
Both steps write audit rows.

Rationale: the ticket is worth nothing after 30 seconds and nothing at all after one
use, so a URL copied out of a browser bar or a proxy log cannot be reused. It grants
exactly what the user already had — no elevation.

---

## Administration (superadmin only)

Unchanged from the existing implementation, listed for completeness:
`GET·POST·PATCH·DELETE /admin/mailboxes/`, `POST /admin/mailboxes/<id>/password/`,
`GET·POST·DELETE /admin/mailboxes/<id>/grants/`, `GET /admin/audit/?mailbox=`.
DELETE archives; mailboxes are never hard-deleted.

---

## Errors

Every endpoint returns `{"error": "<human sentence>"}` with a real status code.
The client's `request()` never throws — failures resolve to `{error, status}` — so
error text is written to be shown to a person, not parsed.

| Status | Meaning |
|---|---|
| 400 | Bad input (no recipients, missing subject, attachment too large) |
| 401 | No/expired credential — client attempts one refresh, then signs out |
| 403 | Authenticated but not permitted (sending as a mailbox you don't hold) |
| 404 | Mailbox/message not visible to you — deliberately not 403, so the API never confirms that something exists |
| 409 | Cancel arrived after the message was already sent |
| 429 | Daily send cap for that mailbox |

---

## Operations

- **Inbound**: SES → `s3://tiesverse-portal-mail/inbox/` → cron
  `manage.py ingest_portal_mail` parses MIME, stores attachments to R2, threads by
  `In-Reply-To`, deletes the S3 object. Idempotent on both `s3_key` and `Message-ID`.
- **Outbound**: `manage.py flush_outbox` sends `status='queued'` rows whose `send_at`
  has passed. **Cron runs every minute** — that cadence sets how late a scheduled mail
  can be. A normal send does not depend on it: the composer calls `release/` when the
  undo window closes, and cron is the safety net for a closed tab.
- **Orphan sweep**: an attachment uploaded to a draft that was never sent is dead
  weight in R2. The same command deletes attachment rows and objects with no message,
  no draft, and older than 7 days.
- Migrations: `python manage.py migrate mail_app --database=turso_db` (mail_app is
  routed to `turso_db`; the default database holds `auth.User`, which is why every
  user FK here is `db_constraint=False`).
