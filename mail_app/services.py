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
    ).exclude(status='failed').count()


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


def send_mail_message(mailbox, *, to, subject, body_text, cc=None, actor=None,
                      in_reply_to='', thread_key=''):
    """Send from `mailbox` and record it. Returns (message, error_string).

    The caller is responsible for permission checks; this enforces the mailbox's
    own limits (active, daily cap) and validates recipients.
    """
    from config.email_utils import render_email, send_email

    if not mailbox or not mailbox.usable:
        return None, 'This mailbox is not active.'

    to_list = _clean_recipients(to)
    cc_list = _clean_recipients(cc)
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
    headers = {'Message-ID': own_message_id}
    if in_reply_to:
        headers['In-Reply-To'] = in_reply_to
        headers['References'] = in_reply_to

    paragraphs = [
        line.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        for line in body_text.split('\n') if line.strip()
    ] or ['&nbsp;']
    html_body, text_body = render_email(
        heading=subject, paragraphs=paragraphs, repliable=True,
    )

    msg = MailMessage.objects.create(
        mailbox=mailbox, direction='OUT',
        peer=to_list[0], to=to_list, cc=cc_list,
        subject=subject, body_text=body_text, body_html=html_body,
        snippet=body_text.strip()[:300],
        message_id=own_message_id, in_reply_to=in_reply_to or '',
        thread_key=thread_key or own_message_id,
        status='queued',
        sent_by_user=actor if (actor and getattr(actor, 'is_authenticated', False)) else None,
        read_at=timezone.now(),          # our own sent mail is not "unread"
        published_at=timezone.now(),
    )

    result = send_email(
        to=to_list[0], subject=subject, html_body=html_body, text_body=text_body,
        from_email=mailbox.from_header, enabled=True, detailed=True,
        reply_to=mailbox.address, cc=cc_list + to_list[1:],
        headers=headers, configuration_set=CONFIGURATION_SET,
    )

    if result.get('ok'):
        msg.status = 'sent'
        msg.ses_message_id = result.get('message_id', '') or ''
        msg.save(update_fields=['status', 'ses_message_id'])
        return msg, ''

    msg.status = 'failed'
    msg.error = result.get('error', '') or 'Send failed.'
    msg.save(update_fields=['status', 'error'])
    return msg, msg.error
