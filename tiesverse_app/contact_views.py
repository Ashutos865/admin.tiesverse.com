"""Contact form: public submit, admin inbox.

Messages are stored and read in Admin -> Messages. They are not emailed by
default: a notification duplicated every enquiry into a TIES Mail inbox that
also stores it, so the same message existed twice for no added reach.

Set CONTACT_NOTIFY_EMAIL to an address to turn notifications back on.
"""
import re

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from django.utils.html import escape
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import JSONParser, FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import ContactMessage
from .views import _can_manage_site

# Blank disables the notification email entirely. Set CONTACT_NOTIFY_EMAIL in
# the environment to have new messages emailed somewhere as well as stored.
NOTIFY_TO = getattr(settings, 'CONTACT_NOTIFY_EMAIL', '') or ''
RATE_PER_HOUR = 5            # per IP; a genuine enquirer never needs a sixth
HONEYPOT_FIELD = 'website'   # real people leave it empty; bots fill everything
MAX_MESSAGE = 5000
_EMAIL = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


def _dto(m):
    return {
        'id': m.id,
        'name': m.name,
        'email': m.email,
        'organisation': m.organisation,
        'message': m.message,
        'status': m.status,
        'emailed': m.emailed,
        'created_at': m.created_at.isoformat(),
        'handled_at': m.handled_at.isoformat() if m.handled_at else None,
    }


def _client_ip(request):
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    return (xff.split(',')[0].strip() if xff else request.META.get('REMOTE_ADDR')) or None


@api_view(['POST'])
@permission_classes([AllowAny])
@parser_classes([JSONParser, FormParser, MultiPartParser])
def contact_submit(request):
    """Take a message from the website's contact form."""
    data = request.data

    # A bot fills every field it finds. Accept silently rather than saying no,
    # so it never learns which field gave it away.
    if str(data.get(HONEYPOT_FIELD) or '').strip():
        return Response({'ok': True}, status=201)

    name = str(data.get('name') or '').strip()[:160]
    email = str(data.get('email') or '').strip()[:254]
    organisation = str(data.get('organisation') or '').strip()[:200]
    message = str(data.get('message') or '').strip()[:MAX_MESSAGE]

    errors = {}
    if not name:
        errors['name'] = 'Please tell us your name.'
    if not email:
        errors['email'] = 'Please give us an email address to reply to.'
    elif not _EMAIL.match(email):
        errors['email'] = 'That does not look like an email address.'
    if not message:
        errors['message'] = 'Please write a message.'
    if errors:
        return Response({'error': 'Please check the form.', 'fields': errors}, status=422)

    ip = _client_ip(request) or 'noip'
    bucket = f'contact:rl:{ip}:{int(timezone.now().timestamp() // 3600)}'
    cache.add(bucket, 0, 3700)
    try:
        if cache.incr(bucket) > RATE_PER_HOUR:
            return Response(
                {'error': 'You have sent several messages already. Please email us directly.'},
                status=429)
    except ValueError:
        pass   # the key expired between add and incr; treat as under the limit

    msg = ContactMessage.objects.create(
        name=name, email=email, organisation=organisation, message=message,
        ip=_client_ip(request), user_agent=(request.META.get('HTTP_USER_AGENT') or '')[:300],
    )

    # Only when a recipient is configured. The message is already saved either
    # way, so a mail failure must not fail the request: the sender did nothing
    # wrong and the enquiry is not lost.
    if NOTIFY_TO:
        try:
            _notify(msg)
            ContactMessage.objects.filter(pk=msg.pk).update(emailed=True)
        except Exception:  # noqa: BLE001
            pass

    return Response({'ok': True, 'id': msg.id}, status=201)


def _notify(msg):
    from config.email_utils import send_email

    org = f'{escape(msg.organisation)}' if msg.organisation else '—'
    body = escape(msg.message).replace('\n', '<br>')
    html = f"""
      <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;color:#111827">
        <p style="margin:0 0 18px;font-size:13px;color:#6b7280">
          New message from the contact form on tiesverse.com
        </p>
        <table cellpadding="0" cellspacing="0" style="font-size:14px;margin-bottom:20px">
          <tr><td style="padding:3px 18px 3px 0;color:#6b7280">Name</td>
              <td style="padding:3px 0"><b>{escape(msg.name)}</b></td></tr>
          <tr><td style="padding:3px 18px 3px 0;color:#6b7280">Email</td>
              <td style="padding:3px 0"><a href="mailto:{escape(msg.email)}">{escape(msg.email)}</a></td></tr>
          <tr><td style="padding:3px 18px 3px 0;color:#6b7280">Organisation</td>
              <td style="padding:3px 0">{org}</td></tr>
        </table>
        <div style="border-left:3px solid #fe7a00;padding:2px 0 2px 14px;line-height:1.6">{body}</div>
        <p style="margin:22px 0 0;font-size:12.5px;color:#9ca3af">
          Reply to this email to answer {escape(msg.name)} directly.
        </p>
      </div>
    """
    text = (f'New message from the contact form on tiesverse.com\n\n'
            f'Name: {msg.name}\nEmail: {msg.email}\n'
            f'Organisation: {msg.organisation or "—"}\n\n{msg.message}\n')

    # Reply-To is the sender, so hitting reply answers the person, not the form.
    send_email(
        to=NOTIFY_TO,
        subject=f'Contact form: {msg.name}' + (f' ({msg.organisation})' if msg.organisation else ''),
        html_body=html, text_body=text, reply_to=msg.email,
    )


# ── admin ────────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def contact_messages(request):
    if not _can_manage_site(request.user):
        return Response({'error': 'Only staff can read contact messages.'}, status=403)

    qs = ContactMessage.objects.all()
    status = (request.GET.get('status') or '').strip()
    if status in (ContactMessage.NEW, ContactMessage.HANDLED):
        qs = qs.filter(status=status)
    q = (request.GET.get('q') or '').strip()
    if q:
        from django.db.models import Q
        qs = qs.filter(Q(name__icontains=q) | Q(email__icontains=q)
                       | Q(organisation__icontains=q) | Q(message__icontains=q))

    return Response({
        'messages': [_dto(m) for m in qs[:300]],
        'new_count': ContactMessage.objects.filter(status=ContactMessage.NEW).count(),
    })


@api_view(['PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser, FormParser])
def contact_message_detail(request, pk):
    if not _can_manage_site(request.user):
        return Response({'error': 'Only staff can manage contact messages.'}, status=403)
    m = ContactMessage.objects.filter(pk=pk).first()
    if m is None:
        return Response({'error': 'No such message.'}, status=404)

    if request.method == 'DELETE':
        m.delete()
        return Response({'ok': True, 'deleted': True})

    status = str(request.data.get('status') or '').strip()
    if status in (ContactMessage.NEW, ContactMessage.HANDLED):
        m.status = status
        m.handled_at = timezone.now() if status == ContactMessage.HANDLED else None
        m.save(update_fields=['status', 'handled_at'])
    return Response(_dto(m))
