"""One-click unsubscribe, and the suppression check every campaign must run.

Gmail and Yahoo have required this of bulk senders since February 2024: a
`List-Unsubscribe-Post` header, a POST endpoint that needs no login and shows no
confirmation page, and the opt-out honoured within two days. Without it, mail
from a domain sending at this volume is filtered to spam regardless of content —
so this is as much a deliverability fix as a compliance one.

Transactional mail is deliberately out of scope here. Someone who opted out of
marketing has still paid for their webinar seat and is still owed their
confirmation, their meeting link and their certificate.
"""
import logging

from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework import response, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny

from .models import MailContact

logger = logging.getLogger(__name__)


def get_or_create_contact(email, **fields):
    """Fetch the contact for an address, creating it if new.

    Never resurrects a status: someone who unsubscribed and later registers
    again stays unsubscribed until they say otherwise. Re-subscribing somebody
    because they bought a ticket is exactly the behaviour the rules forbid.
    """
    email = (email or '').strip().lower()
    if not email:
        return None

    contact = MailContact.objects.filter(email=email).first()
    if contact is None:
        contact = MailContact(email=email,
                              unsubscribe_token=MailContact.new_token())

    # Fill blanks and refresh what we know, without blanking good data with ''.
    for key, value in (fields or {}).items():
        if not hasattr(contact, key):
            continue
        value = (str(value).strip() if value is not None else '')
        if value:
            setattr(contact, key, value[:300])

    if not contact.unsubscribe_token:
        contact.unsubscribe_token = MailContact.new_token()
    contact.save()
    return contact


def suppressed_emails():
    """Every address that must be skipped by a bulk send, lowercased."""
    return {
        (e or '').strip().lower()
        for e in MailContact.objects
        .exclude(status=MailContact.ACTIVE)
        .values_list('email', flat=True)
        if (e or '').strip()
    }


def unsubscribe_link(contact):
    """The public unsubscribe URL for one contact, or '' if it cannot be built.

    Built from MAIL_PUBLIC_URL rather than the admin host on purpose: this link
    is read by every recipient, so it must not tell them where the admin panel
    lives.
    """
    if not contact or not contact.unsubscribe_token:
        return ''
    from django.conf import settings
    base = (getattr(settings, 'MAIL_PUBLIC_URL', '') or '').rstrip('/')
    if not base:
        base = 'https://mail.tiesverse.com'
    return f'{base}/api/mail/unsubscribe/{contact.unsubscribe_token}/'


def unsubscribe_headers(contact, base_url=None):
    """The two headers that make a mail client show an Unsubscribe button.

    RFC 2369 gives the address, RFC 8058 promises a single POST will do it with
    no further interaction — mailbox providers check for both.
    """
    url = unsubscribe_link(contact)
    if not url:
        return {}
    if base_url:                      # explicit override, used by tests
        url = (f'{base_url.rstrip("/")}/api/mail/unsubscribe/'
               f'{contact.unsubscribe_token}/')
    return {
        'List-Unsubscribe': f'<{url}>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    }


@csrf_exempt
@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def unsubscribe(request, token):
    """Opt an address out of bulk mail.

    POST is the one-click path the mail client calls by itself, so it answers
    plainly and never asks the reader to confirm — a confirmation step would
    break the guarantee `List-Unsubscribe-Post` makes. GET is the human path for
    someone who clicked the footer link in a browser.

    An unknown token still answers 200: telling a caller which tokens are real
    would turn this into a way to test whether we hold an address.
    """
    contact = MailContact.objects.filter(unsubscribe_token=token).first()

    if contact and contact.status == MailContact.ACTIVE:
        contact.status = MailContact.UNSUBSCRIBED
        contact.status_reason = 'one-click' if request.method == 'POST' else 'link'
        contact.status_changed_at = timezone.now()
        contact.save(update_fields=['status', 'status_reason',
                                    'status_changed_at', 'updated_at'])
        logger.info('Unsubscribed %s via %s', contact.email, request.method)

    if request.method == 'POST':
        return response.Response({'status': 'unsubscribed'})

    from django.shortcuts import render
    return render(request, 'unsubscribe.html', {
        'email': contact.email if contact else '',
        'token': token if contact else '',
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
def set_contact_status(request):
    """Change a contact's mail status from the admin.

    People ask to be put back on by phone or WhatsApp as often as by clicking a
    link, and somebody has to be able to act on that without a database console.
    Also the way to clear a `bounced` flag once a wrong address is corrected.

    Staff only — this decides who receives mail, so it is not a public route.

    POST /api/mail/contact-status/  { "email": "...", "status": "active" }
    """
    from rest_framework.permissions import IsAdminUser

    if not (request.user and request.user.is_staff):
        return response.Response({'error': 'Not permitted.'},
                                 status=status.HTTP_403_FORBIDDEN)

    email = str(request.data.get('email') or '').strip().lower()
    new_status = str(request.data.get('status') or '').strip().lower()

    valid = {choice for choice, _ in MailContact.STATUS_CHOICES}
    if not email or new_status not in valid:
        return response.Response(
            {'error': 'email and a valid status are required.',
             'valid_statuses': sorted(valid)},
            status=status.HTTP_400_BAD_REQUEST)

    contact = MailContact.objects.filter(email__iexact=email).first()
    if not contact:
        return response.Response({'error': 'No contact with that address.'},
                                 status=status.HTTP_404_NOT_FOUND)

    was = contact.status
    contact.status = new_status
    contact.status_reason = 'set to %s by %s' % (
        new_status, getattr(request.user, 'username', 'admin'))
    contact.status_changed_at = timezone.now()
    contact.save(update_fields=['status', 'status_reason',
                                'status_changed_at', 'updated_at'])
    logger.info('Contact %s: %s -> %s by %s', contact.email, was, new_status,
                getattr(request.user, 'username', 'admin'))

    return response.Response({
        'email': contact.email,
        'was': was,
        'status': contact.status,
    })


@api_view(['POST'])
def fix_contact_email(request):
    """Correct a mistyped address and put the person back on the list.

    Three of the imported contacts typed their own address wrong — `gmai.com`,
    `gmail.con` — so nothing we ever sent them arrived. They are real people who
    believe they registered, and the only way to reach them is to repair the
    address. Marked `bounced` on import rather than corrected automatically,
    because guessing what somebody meant and mailing the guess is worse than
    not mailing: a human has to confirm it.

    Reactivates on save, since the reason for the block was the typo itself.

    POST /api/mail/fix-email/  { "email": "old@gmai.com", "new_email": "..." }
    """
    if not (request.user and request.user.is_staff):
        return response.Response({'error': 'Not permitted.'},
                                 status=status.HTTP_403_FORBIDDEN)

    old_email = str(request.data.get('email') or '').strip().lower()
    new_email = str(request.data.get('new_email') or '').strip().lower()

    if not old_email or not new_email:
        return response.Response({'error': 'email and new_email are required.'},
                                 status=status.HTTP_400_BAD_REQUEST)

    from django.core.exceptions import ValidationError
    from django.core.validators import validate_email
    try:
        validate_email(new_email)
    except ValidationError:
        return response.Response({'error': 'That is not a valid email address.'},
                                 status=status.HTTP_400_BAD_REQUEST)

    contact = MailContact.objects.filter(email__iexact=old_email).first()
    if not contact:
        return response.Response({'error': 'No contact with that address.'},
                                 status=status.HTTP_404_NOT_FOUND)

    if new_email == old_email:
        return response.Response({'error': 'That is the same address.'},
                                 status=status.HTTP_400_BAD_REQUEST)

    # Merging two contact records would mean deciding which history survives,
    # so refuse and let a human choose rather than silently discard one.
    clash = MailContact.objects.filter(email__iexact=new_email).exclude(
        pk=contact.pk).first()
    if clash:
        return response.Response(
            {'error': 'A contact with that address already exists (%s).'
                      % (clash.name or clash.email)},
            status=status.HTTP_409_CONFLICT)

    contact.email = new_email
    contact.status = MailContact.ACTIVE
    contact.status_reason = 'address corrected from %s by %s' % (
        old_email, getattr(request.user, 'username', 'admin'))
    contact.status_changed_at = timezone.now()
    # A new address deserves a new token: the old one may have been printed in
    # mail that went nowhere, and reusing it would let a stale link act on the
    # corrected contact.
    contact.unsubscribe_token = MailContact.new_token()
    contact.save()

    logger.info('Contact %s corrected to %s by %s', old_email, new_email,
                getattr(request.user, 'username', 'admin'))

    return response.Response({
        'was': old_email,
        'email': contact.email,
        'status': contact.status,
    })


@csrf_exempt
@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def resubscribe(request, token):
    """Undo an unsubscribe, for the person who clicked it by mistake.

    A one-click unsubscribe is easy to hit by accident — it sits in the mail
    client's chrome, one tap from Delete — and without a way back the only
    remedy is emailing somebody and waiting. That is a bad experience for a
    reader who wanted to stay.

    Only ever reached from a link containing the person's own token, so this
    cannot be used to add an address that never subscribed: no token, no
    resubscribe. A `bounced` or `junk` contact is deliberately not resurrected
    here — those are broken addresses, not opinions, and a human should decide.
    """
    contact = MailContact.objects.filter(unsubscribe_token=token).first()

    resubscribed = False
    if contact and contact.status == MailContact.UNSUBSCRIBED:
        contact.status = MailContact.ACTIVE
        contact.status_reason = 'resubscribed by the recipient'
        contact.status_changed_at = timezone.now()
        contact.save(update_fields=['status', 'status_reason',
                                    'status_changed_at', 'updated_at'])
        resubscribed = True
        logger.info('Resubscribed %s', contact.email)

    if request.method == 'POST':
        return response.Response(
            {'status': 'active' if resubscribed else 'unchanged'})

    from django.shortcuts import render
    return render(request, 'resubscribe.html', {
        'email': contact.email if contact else '',
        'resubscribed': resubscribed,
    }, status=status.HTTP_200_OK)
