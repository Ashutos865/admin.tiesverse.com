"""TIES Mail services — mailbox resolution, sending, auditing.

Kept separate from views so the same logic serves the API, management commands
and (later) the standalone mail.tiesverse.com frontend.
"""
import re
import uuid
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .models import (
    MAIL_DOMAIN, KIND_PERSONAL, KIND_SHARED, KIND_SYSTEM,
    Mailbox, MailboxGrant, MailMessage, MailAuditLog,
)

CATCHALL_ADDRESS = f'catchall@{MAIL_DOMAIN}'
CONFIGURATION_SET = getattr(settings, 'SES_PORTAL_MAIL_CONFIG_SET', '') or None

_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


# ── mailbox access ───────────────────────────────────────────────────────────

def mailboxes_for_user(user):
    """Every mailbox this user may open: their PERSONAL box + granted SHARED boxes.
    Superadmins are NOT auto-granted here — that is handled explicitly at the view
    layer so their access always gets audited."""
    if not (user and user.is_authenticated):
        return Mailbox.objects.none()
    own = Mailbox.objects.filter(user_id=user.id, is_active=True, is_archived=False)
    granted_ids = MailboxGrant.objects.filter(user_id=user.id).values_list('mailbox_id', flat=True)
    granted = Mailbox.objects.filter(id__in=list(granted_ids), is_active=True, is_archived=False)
    return (own | granted).distinct()


def can_use_mailbox(user, mailbox):
    """May this user READ/SEND AS this mailbox as its owner or a grantee?
    (Superadmin oversight is a separate, audited path — not this.)"""
    if not (user and user.is_authenticated and mailbox and mailbox.usable):
        return False
    if mailbox.user_id and mailbox.user_id == user.id:
        return True
    return MailboxGrant.objects.filter(mailbox=mailbox, user_id=user.id).exists()


def get_catchall():
    """The SYSTEM mailbox that collects mail to unknown local parts."""
    box = Mailbox.objects.filter(kind=KIND_SYSTEM).order_by('id').first()
    if box:
        return box
    return Mailbox.objects.create(
        kind=KIND_SYSTEM, address=CATCHALL_ADDRESS,
        display_name='Catch-all', is_active=True,
    )


def resolve_recipient_mailbox(addresses):
    """Given the To/Cc addresses of an inbound message, find the mailbox it belongs
    to. Falls back to the catch-all so mail is never silently dropped."""
    for addr in addresses or []:
        addr = (addr or '').strip().lower()
        if not addr.endswith('@' + MAIL_DOMAIN):
            continue
        box = Mailbox.objects.filter(address__iexact=addr, is_active=True).first()
        if box:
            return box
    return get_catchall()


# ── audit ────────────────────────────────────────────────────────────────────

def audit(actor, action, mailbox=None, message=None, note=''):
    name = 'system'
    if actor is not None and getattr(actor, 'is_authenticated', False):
        name = actor.get_full_name() or actor.username or 'system'
    return MailAuditLog.objects.create(
        actor_user=actor if (actor and getattr(actor, 'is_authenticated', False)) else None,
        actor_name=name, action=action, mailbox=mailbox, message=message, note=note,
    )


# ── sending ──────────────────────────────────────────────────────────────────

def sends_today(mailbox):
    since = timezone.now() - timedelta(days=1)
    return MailMessage.objects.filter(
        mailbox=mailbox, direction='OUT', created_at__gte=since,
    ).exclude(status__in=['failed', 'canceled']).count()


def _clean_recipients(value):
    """Accept a string ('a@b.com, c@d.com') or a list; return a validated list."""
    if isinstance(value, str):
        parts = re.split(r'[,;\s]+', value)
    else:
        parts = list(value or [])
    out = []
    for p in parts:
        p = (p or '').strip().strip('<>')
        if p and _EMAIL_RE.match(p) and p.lower() not in [o.lower() for o in out]:
            out.append(p)
    return out


def queue_mail_message(mailbox, *, to, subject, body_text, cc=None, bcc=None,
                       actor=None, in_reply_to='', thread_key='', send_at=None,
                       attachments=None, body_html=''):
    """Validate and record an outbound message without sending it yet.

    Everything leaves through here: a normal send is simply one queued a few
    seconds ahead, and that gap is what makes Undo possible. Returns
    (message, error_string).

    The caller checks permissions; this enforces the mailbox's own limits and
    validates recipients, so a bad address fails while the composer is still
    open rather than silently in a worker minutes later.
    """
    if not mailbox or not mailbox.usable:
        return None, 'This mailbox is not active.'

    to_list = _clean_recipients(to)
    cc_list = _clean_recipients(cc)
    bcc_list = _clean_recipients(bcc)
    if not to_list:
        return None, 'Enter at least one valid recipient email address.'
    subject = (subject or '').strip()
    if not subject:
        return None, 'Subject is required.'
    body_text = body_text or ''

    limit = mailbox.daily_send_limit or 0
    if limit and sends_today(mailbox) >= limit:
        return None, f'Daily send limit reached ({limit} messages in 24h).'

    # Our own RFC 5322 Message-ID — SES's returned MessageId is a different thing
    # and cannot be used for In-Reply-To/References threading.
    own_message_id = f'<{uuid.uuid4().hex}@{MAIL_DOMAIN}>'

    # Bcc recipients are stored on the row (we must deliver to them) but never
    # written into a header — that is the whole point of blind copy.
    msg = MailMessage.objects.create(
        mailbox=mailbox, direction='OUT',
        peer=to_list[0], to=to_list, cc=cc_list, bcc=bcc_list,
        subject=subject, body_text=body_text, body_html=body_html or '',
        snippet=body_text.strip()[:300],
        message_id=own_message_id, in_reply_to=in_reply_to or '',
        thread_key=thread_key or own_message_id,
        status='queued',
        send_at=send_at or timezone.now(),
        sent_by_user=actor if (actor and getattr(actor, 'is_authenticated', False)) else None,
        read_at=timezone.now(),          # our own sent mail is not "unread"
        published_at=timezone.now(),
    )
    if attachments:
        for att in attachments:
            att.message = msg
            att.draft = None
            att.save(update_fields=['message', 'draft'])
        msg.has_attachments = True
        msg.save(update_fields=['has_attachments'])

    return msg, ''


def claim_for_sending(message_id):
    """Take exclusive ownership of a queued message, or return None.

    This single compare-and-set is what stops a message going out twice when the
    cron flusher and a browser pressing "send now" reach for the same row at the
    same moment: whoever changes `queued` to `sending` first owns it, and the
    loser gets None.
    """
    claimed = MailMessage.objects.filter(
        pk=message_id, status='queued').update(status='sending')
    if not claimed:
        return None
    return MailMessage.objects.filter(pk=message_id).first()


def deliver(msg):
    """Hand a claimed message to SES. Returns (ok, error_string).

    Assumes the caller already won `claim_for_sending`.
    """
    from config.email_utils import render_personal_email, send_email

    mailbox = msg.mailbox
    to_list = list(msg.to or [])
    cc_list = list(msg.cc or [])
    bcc_list = list(msg.bcc or [])
    if not to_list:
        msg.status = 'failed'
        msg.error = 'No recipients.'
        msg.save(update_fields=['status', 'error'])
        return False, msg.error

    headers = {'Message-ID': msg.message_id}
    if msg.in_reply_to:
        headers['In-Reply-To'] = msg.in_reply_to
        headers['References'] = msg.in_reply_to

    # A message a person typed should look like a normal email, not a system
    # notice — no banner, no card, just the text plus a small signature.
    # A message composed with formatting carries its own HTML; a plain one is
    # built from the text.
    html_body, text_body = render_personal_email(
        msg.body_text,
        sender_name=(mailbox.display_name or '').strip(),
        sender_address=mailbox.address,
        body_html=msg.body_html or '',
    )

    files = []
    for att in msg.attachments.all():
        try:
            from . import storage
            data = storage.get(att.storage_key)
        except Exception as exc:  # noqa: BLE001
            msg.status = 'failed'
            msg.error = f'Could not read attachment “{att.filename}”: {exc}'[:500]
            msg.save(update_fields=['status', 'error'])
            return False, msg.error
        subtype = (att.content_type or '').rsplit('/', 1)[-1] or 'octet-stream'
        files.append((att.filename, data, subtype))

    result = send_email(
        to=to_list[0], subject=msg.subject, html_body=html_body, text_body=text_body,
        from_email=mailbox.from_header, enabled=True, detailed=True,
        reply_to=mailbox.address, cc=cc_list + to_list[1:], bcc=bcc_list,
        attachments=files or None,
        headers=headers, configuration_set=CONFIGURATION_SET,
    )

    if result.get('ok'):
        msg.status = 'sent'
        msg.ses_message_id = result.get('message_id', '') or ''
        msg.body_html = html_body
        msg.save(update_fields=['status', 'ses_message_id', 'body_html'])
        return True, ''

    msg.status = 'failed'
    msg.error = result.get('error', '') or 'Send failed.'
    msg.save(update_fields=['status', 'error'])
    return False, msg.error


def send_mail_message(mailbox, *, to, subject, body_text, cc=None, actor=None,
                      in_reply_to='', thread_key='', **extra):
    """Queue and send immediately. Returns (message, error_string).

    The straight-through path, kept because other code and tests call it; the
    API uses queue + claim + deliver so it can offer Undo.
    """
    msg, err = queue_mail_message(
        mailbox, to=to, subject=subject, body_text=body_text, cc=cc, actor=actor,
        in_reply_to=in_reply_to, thread_key=thread_key, **extra)
    if err:
        return None, err
    claimed = claim_for_sending(msg.pk)
    if claimed is None:
        return msg, ''       # something else already sent it
    ok, err = deliver(claimed)
    return claimed, ('' if ok else err)


def flush_due_messages(limit=100):
    """Send every queued message whose time has come. Returns (sent, failed).

    Called by the cron command. Failures are isolated per message so one bad
    address cannot stop the queue.
    """
    now = timezone.now()
    due = list(MailMessage.objects.filter(
        status='queued', send_at__lte=now, direction='OUT',
    ).order_by('send_at')[:limit])

    sent = failed = 0
    for row in due:
        claimed = claim_for_sending(row.pk)
        if claimed is None:
            continue
        try:
            ok, _ = deliver(claimed)
        except Exception as exc:  # noqa: BLE001
            claimed.status = 'failed'
            claimed.error = str(exc)[:500]
            claimed.save(update_fields=['status', 'error'])
            ok = False
        sent += 1 if ok else 0
        failed += 0 if ok else 1
    return sent, failed
