"""Running a bulk send.

One message per recipient, sent through the same path as any other mail from
that mailbox — so replies come back as ordinary conversations and the daily cap
still means something.

The job's `cursor` is the resume point. It advances only after a recipient has
actually been handled, so a worker killed mid-run picks up exactly where it
stopped rather than starting over and sending twice.
"""
import re

from django.utils import timezone

from . import services
from .models import MailAttachment, MailBulkJob

TOKEN_RE = re.compile(r'\{\{\s*([a-zA-Z0-9_]+)\s*\}\}')


def render_tokens(template, row):
    """Replace {{name}} with the recipient's value.

    An unknown token renders empty rather than leaving `{{name}}` visible in
    someone's inbox — a blank looks like an oversight, a raw token looks broken.
    """
    if not template:
        return ''
    lower = {str(k).lower(): ('' if v is None else str(v)) for k, v in (row or {}).items()}
    return TOKEN_RE.sub(lambda m: lower.get(m.group(1).lower(), ''), template)


def tokens_in(*templates):
    """Every distinct token used, for the composer's preview."""
    found = []
    for t in templates:
        for m in TOKEN_RE.finditer(t or ''):
            name = m.group(1).lower()
            if name not in found:
                found.append(name)
    return found


def clean_recipients(rows):
    """Keep the valid, distinct addresses. Returns (rows, skipped_count).

    De-duplicating here rather than at send time means the count the sender sees
    before starting is the count that will actually go out.
    """
    out, seen, skipped = [], set(), 0
    for row in rows or []:
        if isinstance(row, str):
            row = {'email': row}
        email = str((row or {}).get('email', '')).strip()
        if not email or not services._EMAIL_RE.match(email) or email.lower() in seen:
            skipped += 1
            continue
        seen.add(email.lower())
        out.append(row)
    return out, skipped


def run_job(job, *, limit=None):
    """Send this job's remaining recipients. Returns a short summary dict.

    Stops early and marks the job `paused` when the mailbox's daily cap is
    reached — the next run resumes automatically once the window has moved.
    """
    if job.status in ('done', 'canceled'):
        return {'status': job.status, 'sent': 0, 'failed': 0}

    rows = job.recipients or []
    mailbox = job.mailbox
    if not mailbox.usable:
        job.status = 'failed'
        job.last_error = 'This mailbox is no longer active.'
        job.save(update_fields=['status', 'last_error'])
        return {'status': 'failed', 'sent': 0, 'failed': 0}

    MailBulkJob.objects.filter(pk=job.pk).update(status='running')
    job.status = 'running'

    # Files are attached to the job, and every recipient gets the same set.
    attachments = list(MailAttachment.objects.filter(bulk_job=job))

    sent = failed = 0
    processed = 0
    while job.cursor < len(rows):
        if limit is not None and processed >= limit:
            break

        # Someone may have pressed Cancel since the last recipient.
        current = MailBulkJob.objects.filter(pk=job.pk).values_list('status', flat=True).first()
        if current == 'canceled':
            job.status = 'canceled'
            job.save(update_fields=['status'])
            return {'status': 'canceled', 'sent': sent, 'failed': failed}

        cap = mailbox.daily_send_limit or 0
        if cap and services.sends_today(mailbox) >= cap:
            job.status = 'paused'
            job.last_error = f'Daily limit of {cap} reached — this will continue on its own.'
            job.save(update_fields=['status', 'last_error'])
            return {'status': 'paused', 'sent': sent, 'failed': failed}

        row = rows[job.cursor]
        delivered = False
        try:
            msg, err = services.queue_mail_message(
                mailbox,
                to=row.get('email'),
                subject=render_tokens(job.subject, row),
                body_text=render_tokens(job.body_text, row),
                actor=None,
                send_at=timezone.now(),
                attachments=None,        # attached below, shared across recipients
            )
            if err:
                job.last_error = err[:500]
            else:
                # Each message points at the same stored file rather than
                # copying it: one upload, many messages.
                for att in attachments:
                    MailAttachment.objects.create(
                        message=msg, filename=att.filename, size=att.size,
                        content_type=att.content_type, storage_key=att.storage_key,
                    )
                if attachments:
                    msg.has_attachments = True
                    msg.save(update_fields=['has_attachments'])

                claimed = services.claim_for_sending(msg.pk)
                if claimed is None:
                    delivered = True         # something else delivered it
                else:
                    ok, send_err = services.deliver(claimed)
                    delivered = ok
                    if not ok:
                        job.last_error = (send_err or '')[:500]
        except Exception as exc:  # noqa: BLE001 — one bad row must not end the run
            job.last_error = str(exc)[:500]

        if delivered:
            sent += 1
            job.sent_count += 1
        else:
            failed += 1
            job.failed_count += 1

        # Advance only now: if the process dies mid-recipient, that one is
        # retried rather than skipped.
        job.cursor += 1
        processed += 1
        job.save(update_fields=['cursor', 'sent_count', 'failed_count', 'last_error'])

    if job.cursor >= len(rows):
        job.status = 'done'
        job.finished_at = timezone.now()
    job.save()
    return {'status': job.status, 'sent': sent, 'failed': failed}


def claim_next_job():
    """The next job waiting to run, or None.

    Paused jobs are picked up again: the cap that stopped them is a rolling
    24-hour window, so it clears without anyone intervening.
    """
    return MailBulkJob.objects.filter(status__in=['queued', 'paused']).order_by('created_at').first()
