"""One-time codes for verifying an email address or a phone number.

Email goes out through SES from noreply@mail.tiesverse.com, which is already a
verified sending identity. Phone is pluggable: WhatsApp works today with no
regulatory setup, SMS needs DLT registration and is wired but off by default.

The code is never stored, only a salted hash. A leaked database should not hand
anyone a working OTP.
"""
import hashlib
import hmac
import re
import secrets

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import JSONParser, FormParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import OtpChallenge

CODE_LENGTH = 6
TTL_SECONDS = 10 * 60          # long enough to find the mail, short enough to matter
MAX_ATTEMPTS = 5
RESEND_COOLDOWN = 60           # seconds between sends to one destination
MAX_SENDS_PER_HOUR = 5         # per destination
MAX_SENDS_PER_IP_HOUR = 15     # one person verifying a few things, not a farm

PURPOSES = ('verify', 'registration', 'login')
_EMAIL = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
_E164 = re.compile(r'^\+[1-9]\d{7,14}$')


def _err(msg, status, **extra):
    return Response({'error': msg, **extra}, status=status)


def _client_ip(request):
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    return (xff.split(',')[0].strip() if xff else request.META.get('REMOTE_ADDR')) or None


def _hash(code, destination):
    """Salted with SECRET_KEY and the destination, so a rainbow table over six
    digits is useless and a hash cannot be replayed against another address."""
    msg = f'{destination}:{code}'.encode()
    return hmac.new(settings.SECRET_KEY.encode(), msg, hashlib.sha256).hexdigest()


def _normalise(channel, raw):
    """Return (destination, error). Phone numbers must be E.164 so the same
    number cannot be verified twice under two spellings."""
    value = str(raw or '').strip()
    if channel == OtpChallenge.CHANNEL_EMAIL:
        value = value.lower()
        if not _EMAIL.match(value):
            return None, 'That does not look like an email address.'
        return value[:254], None

    digits = re.sub(r'[\s\-()]', '', value)
    if digits.startswith('00'):
        digits = '+' + digits[2:]
    if not digits.startswith('+'):
        # Bare Indian mobile numbers are the common case; anything else must
        # carry its own country code rather than be guessed at.
        if re.fullmatch(r'[6-9]\d{9}', digits):
            digits = '+91' + digits
        else:
            return None, 'Include the country code, for example +91 98765 43210.'
    if not _E164.match(digits):
        return None, 'That does not look like a phone number.'
    return digits, None


# ── send ─────────────────────────────────────────────────────────────────
@api_view(['POST'])
@permission_classes([AllowAny])
@parser_classes([JSONParser, FormParser])
def otp_send(request):
    """Issue a code and deliver it. POST {channel, destination, purpose?}."""
    channel = str(request.data.get('channel') or '').strip().lower()
    if channel not in dict(OtpChallenge.CHANNEL_CHOICES):
        return _err('channel must be email, whatsapp or sms.', 400)

    purpose = str(request.data.get('purpose') or 'verify').strip().lower()
    if purpose not in PURPOSES:
        return _err('Unknown purpose.', 400)

    destination, bad = _normalise(channel, request.data.get('destination'))
    if bad:
        return _err(bad, 422, field='destination')

    now = timezone.now()

    # A cooldown stops the resend button being used as a free megaphone at
    # someone else's inbox or phone.
    last = (OtpChallenge.objects
            .filter(destination=destination, purpose=purpose)
            .order_by('-sent_at').first())
    if last and (now - last.sent_at).total_seconds() < RESEND_COOLDOWN:
        wait = RESEND_COOLDOWN - int((now - last.sent_at).total_seconds())
        return _err(f'A code was just sent. Try again in {wait} seconds.', 429, retry_after=wait)

    ip = _client_ip(request) or 'noip'
    window = int(now.timestamp() // 3600)
    limits = (
        (f'otp:d:{destination}:{purpose}:{window}', MAX_SENDS_PER_HOUR,
         'Too many codes requested for this address. Try again later.'),
        (f'otp:i:{ip}:{window}', MAX_SENDS_PER_IP_HOUR,
         'Too many verification attempts. Try again later.'),
    )
    for bucket, ceiling, message in limits:
        cache.add(bucket, 0, 3700)
        try:
            if cache.incr(bucket) > ceiling:
                return _err(message, 429)
        except ValueError:
            pass   # expired between add and incr; treat as under the limit

    code = ''.join(secrets.choice('0123456789') for _ in range(CODE_LENGTH))
    challenge = OtpChallenge.objects.create(
        channel=channel, destination=destination, purpose=purpose,
        code_hash=_hash(code, destination), max_attempts=MAX_ATTEMPTS,
        expires_at=now + timezone.timedelta(seconds=TTL_SECONDS), ip=_client_ip(request),
    )

    try:
        _deliver(channel, destination, code)
    except Exception as exc:  # noqa: BLE001
        # The code is useless if it never arrived, so do not leave a live
        # challenge behind pretending otherwise.
        challenge.delete()
        return _err(f'Could not send the code: {exc}', 502)

    return Response({
        'ok': True,
        'channel': channel,
        'destination': _mask(channel, destination),
        'expires_in': TTL_SECONDS,
        'resend_in': RESEND_COOLDOWN,
    }, status=201)


def _mask(channel, destination):
    """Show enough to recognise, not enough to harvest."""
    if channel == OtpChallenge.CHANNEL_EMAIL:
        name, _, domain = destination.partition('@')
        head = name[:2] if len(name) > 3 else name[:1]
        return f'{head}{"*" * max(3, len(name) - len(head))}@{domain}'
    return f'{destination[:3]}{"*" * (len(destination) - 5)}{destination[-2:]}'


def _deliver(channel, destination, code):
    if channel == OtpChallenge.CHANNEL_EMAIL:
        return _deliver_email(destination, code)
    if channel == OtpChallenge.CHANNEL_WHATSAPP:
        return _deliver_whatsapp(destination, code)
    return _deliver_sms(destination, code)


def _deliver_email(destination, code):
    from config.email_utils import send_email

    sender = getattr(settings, 'OTP_FROM_EMAIL', '') or 'noreply@mail.tiesverse.com'
    minutes = TTL_SECONDS // 60
    html = f"""
      <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#111827">
        <p style="margin:0 0 18px;font-size:15px">Your verification code is</p>
        <p style="margin:0 0 18px;font-size:34px;font-weight:700;letter-spacing:.18em">{code}</p>
        <p style="margin:0 0 8px;font-size:14px;color:#6b7280">
          It expires in {minutes} minutes and can be used once.
        </p>
        <p style="margin:0;font-size:13px;color:#9ca3af">
          If you did not ask for this code, you can ignore this email. Nobody can
          use it without access to this inbox.
        </p>
      </div>
    """
    text = (f'Your verification code is {code}\n\n'
            f'It expires in {minutes} minutes and can be used once.\n'
            f'If you did not ask for this code, you can ignore this email.\n')
    send_email(to=destination, subject=f'{code} is your Tiesverse verification code',
               html_body=html, text_body=text, from_email=sender)


def _deliver_whatsapp(destination, code):
    """Meta's Cloud API. Authentication templates are the cheapest category and
    need no DLT registration, unlike SMS in India."""
    import json
    import urllib.request

    token = getattr(settings, 'WHATSAPP_ACCESS_TOKEN', '')
    phone_id = getattr(settings, 'WHATSAPP_PHONE_NUMBER_ID', '')
    if not (token and phone_id):
        raise RuntimeError('WhatsApp is not configured (WHATSAPP_ACCESS_TOKEN, '
                           'WHATSAPP_PHONE_NUMBER_ID).')

    template = getattr(settings, 'WHATSAPP_TEMPLATE_OTP', 'otp_verification')
    lang = getattr(settings, 'WHATSAPP_TEMPLATE_LANG', 'en')
    version = getattr(settings, 'WHATSAPP_API_VERSION', 'v21.0')

    payload = {
        'messaging_product': 'whatsapp',
        'to': destination.lstrip('+'),
        'type': 'template',
        'template': {
            'name': template,
            'language': {'code': lang},
            'components': [
                {'type': 'body', 'parameters': [{'type': 'text', 'text': code}]},
                # An authentication template's button copies the code; Meta
                # requires the same value repeated here.
                {'type': 'button', 'sub_type': 'url', 'index': '0',
                 'parameters': [{'type': 'text', 'text': code}]},
            ],
        },
    }
    req = urllib.request.Request(
        f'https://graph.facebook.com/{version}/{phone_id}/messages',
        data=json.dumps(payload).encode(),
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def _deliver_sms(destination, code):
    """Send by SMS through whichever provider is configured.

    Two exist because they solve different problems. MSG91 is the cheap route
    (~Rs 0.25/SMS) but needs DLT registration with TRAI first, which takes
    weeks and without which carriers drop the message. Fast2SMS has a route
    that works with no DLT at all, so it can be switched on today — at a much
    higher price per message.
    """
    provider = (getattr(settings, 'SMS_PROVIDER', '') or 'msg91').lower()
    if provider == 'fast2sms':
        return _deliver_sms_fast2sms(destination, code)
    if provider == '2factor':
        return _deliver_sms_2factor(destination, code)
    return _deliver_sms_msg91(destination, code)


def _deliver_sms_msg91(destination, code):
    """Cheapest India route. Requires DLT registration: an unregistered sender
    is blocked outright by the carriers, so this stays off until that is done."""
    import json
    import urllib.parse
    import urllib.request

    key = getattr(settings, 'MSG91_AUTH_KEY', '')
    template_id = getattr(settings, 'MSG91_OTP_TEMPLATE_ID', '')
    if not (key and template_id):
        raise RuntimeError('SMS is not configured (MSG91_AUTH_KEY, '
                           'MSG91_OTP_TEMPLATE_ID). SMS in India also requires '
                           'DLT registration. To send without DLT, set '
                           'SMS_PROVIDER=fast2sms instead.')

    params = urllib.parse.urlencode({
        'template_id': template_id,
        'mobile': destination.lstrip('+'),
        'authkey': key,
        'otp': code,
        'otp_expiry': TTL_SECONDS // 60,
    })
    req = urllib.request.Request(f'https://control.msg91.com/api/v5/otp?{params}',
                                 method='POST', headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def _deliver_sms_fast2sms(destination, code):
    """Works without DLT registration, which is why it exists here: it can be
    tested today. Indian numbers only, and priced well above the DLT route, so
    it suits a pilot rather than volume."""
    import json
    import urllib.parse
    import urllib.request

    key = getattr(settings, 'FAST2SMS_API_KEY', '')
    if not key:
        raise RuntimeError('SMS is not configured (FAST2SMS_API_KEY).')

    number = destination.lstrip('+')
    if number.startswith('91'):
        number = number[2:]
    if len(number) != 10:
        raise RuntimeError('Fast2SMS delivers to Indian numbers only.')

    params = urllib.parse.urlencode({
        'variables_values': code,
        'route': 'otp',
        'numbers': number,
    })
    req = urllib.request.Request(
        f'https://www.fast2sms.com/dev/bulkV2?{params}',
        headers={'authorization': key},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        out = json.loads(resp.read().decode())
    if not out.get('return', False):
        raise RuntimeError(out.get('message') or 'Fast2SMS refused the message.')
    return out


def _deliver_sms_2factor(destination, code):
    """Billed per DELIVERED OTP, not per attempt: a message a carrier drops
    costs nothing, and they retry on a backup carrier before giving up. Has a
    no-DLT route as well, so it can start the same day."""
    import json
    import urllib.parse
    import urllib.request

    key = getattr(settings, 'TWOFACTOR_API_KEY', '')
    if not key:
        raise RuntimeError('SMS is not configured (TWOFACTOR_API_KEY).')

    number = destination.lstrip('+')
    if number.startswith('91'):
        number = number[2:]
    if len(number) != 10:
        raise RuntimeError('2Factor delivers to Indian numbers only.')

    # A named template is what makes the message DLT-compliant; without one the
    # account's default (no-DLT) route is used instead.
    template = getattr(settings, 'TWOFACTOR_TEMPLATE_NAME', '')
    path = f'https://2factor.in/API/V1/{urllib.parse.quote(key)}/SMS/{number}/{code}'
    if template:
        path += f'/{urllib.parse.quote(template)}'

    with urllib.request.urlopen(path, timeout=15) as resp:
        out = json.loads(resp.read().decode())
    if str(out.get('Status', '')).lower() != 'success':
        raise RuntimeError(out.get('Details') or '2Factor refused the message.')
    return out


# ── verify ───────────────────────────────────────────────────────────────
@api_view(['POST'])
@permission_classes([AllowAny])
@parser_classes([JSONParser, FormParser])
def otp_verify(request):
    """Check a code. POST {channel, destination, code, purpose?}."""
    channel = str(request.data.get('channel') or '').strip().lower()
    if channel not in dict(OtpChallenge.CHANNEL_CHOICES):
        return _err('channel must be email, whatsapp or sms.', 400)

    purpose = str(request.data.get('purpose') or 'verify').strip().lower()
    destination, bad = _normalise(channel, request.data.get('destination'))
    if bad:
        return _err(bad, 422, field='destination')

    code = re.sub(r'\D', '', str(request.data.get('code') or ''))
    if len(code) != CODE_LENGTH:
        return _err('Enter the 6-digit code.', 422, field='code')

    challenge = (OtpChallenge.objects
                 .filter(destination=destination, purpose=purpose, consumed_at__isnull=True)
                 .order_by('-sent_at').first())
    if challenge is None:
        return _err('No code was requested for this address, or it has been used.', 404)

    now = timezone.now()
    if challenge.expires_at <= now:
        return _err('That code has expired. Ask for a new one.', 410)

    if challenge.attempts >= challenge.max_attempts:
        return _err('Too many incorrect attempts. Ask for a new code.', 429)

    # Count the attempt before comparing, so a crash mid-check cannot be used
    # to get a free guess.
    OtpChallenge.objects.filter(pk=challenge.pk).update(attempts=challenge.attempts + 1)

    # Constant-time: a timing difference would leak the code digit by digit.
    if not hmac.compare_digest(challenge.code_hash, _hash(code, destination)):
        # Every allowed attempt is answered as a wrong code; the lockout is what
        # the NEXT request meets. Reporting 429 on the last permitted guess
        # would quietly cost the user one of the tries they were promised.
        left = max(0, challenge.max_attempts - (challenge.attempts + 1))
        return _err('That code is not right.', 422, field='code', attempts_left=left)

    OtpChallenge.objects.filter(pk=challenge.pk).update(verified_at=now, consumed_at=now)

    # A short-lived token proves the check happened, so the next request does
    # not have to trust a "verified: true" flag the browser could invent.
    from django.core import signing
    token = signing.dumps(
        {'c': channel, 'd': destination, 'p': purpose}, salt='tiesverse.otp')
    return Response({'ok': True, 'verified': True, 'token': token, 'token_expires_in': 1800})


@api_view(['POST'])
@permission_classes([AllowAny])
@parser_classes([JSONParser, FormParser])
def otp_verify_token(request):
    """Confirm a token really proves a destination was verified.

    Another service (the IWT registration server) holds the token but not the
    signing key, so it asks here rather than decoding something it could just
    as easily have forged.
    """
    channel = str(request.data.get('channel') or '').strip().lower()
    if channel not in dict(OtpChallenge.CHANNEL_CHOICES):
        return _err('channel must be email, whatsapp or sms.', 400)
    purpose = str(request.data.get('purpose') or 'verify').strip().lower()
    ok = verify_token(str(request.data.get('token') or ''), channel,
                      request.data.get('destination'), purpose=purpose)
    return Response({'valid': bool(ok)})


def verify_token(token, channel, destination, purpose='verify', max_age=1800):
    """Server-side check that a destination really was verified. Callers should
    use this rather than believing a client-supplied flag."""
    from django.core import signing
    dest, bad = _normalise(channel, destination)
    if bad:
        return False
    try:
        data = signing.loads(token, salt='tiesverse.otp', max_age=max_age)
    except Exception:  # noqa: BLE001
        return False
    return (data.get('c') == channel and data.get('d') == dest
            and data.get('p') == purpose)
