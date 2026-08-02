"""WhatsApp notifications via the official Meta WhatsApp Cloud API.

Dormant by design. With no credentials in the environment nothing is sent and
every attempt is recorded as `skipped` with the reason — so the whole feature can
ship, be wired up and be exercised long before a Meta account exists. To go live,
fill these in `.env` and restart; no code changes:

    WHATSAPP_ACCESS_TOKEN=EAAG...        permanent System User token
    WHATSAPP_PHONE_NUMBER_ID=123456...   WhatsApp Manager → API Setup
    WHATSAPP_ENABLED=True

Meta bills per message, so two guards are always on: a daily cap, and the rule
that a member must have both a number AND an explicit opt-in. Business-initiated
messages must use a pre-approved template — free-form text is rejected by Meta
outside the 24-hour service window, so `send_template` is the only sender here.
"""
import json
import re
import urllib.error
import urllib.request
from datetime import date

from django.conf import settings

GRAPH = 'https://graph.facebook.com'

# E.164: a leading + and 8–15 digits. Meta rejects anything else outright.
E164_RE = re.compile(r'^\+[1-9]\d{7,14}$')


def normalize_number(raw, default_cc='91'):
    """Best-effort E.164. Returns '' when the input cannot be trusted.

    Indian numbers are commonly written as '98765 43210', '098765 43210' or
    '+91 98765-43210'; all of those should reach the same person.
    """
    if not raw:
        return ''
    s = re.sub(r'[^\d+]', '', str(raw))
    if not s:
        return ''
    if s.startswith('+'):
        return s if E164_RE.match(s) else ''
    s = s.lstrip('0')                       # drop a trunk prefix
    if len(s) == 10:                        # bare local number
        s = default_cc + s
    cand = '+' + s
    return cand if E164_RE.match(cand) else ''


def config_status():
    """Why WhatsApp is or isn't live — surfaced in the admin UI."""
    token = getattr(settings, 'WHATSAPP_ACCESS_TOKEN', '')
    phone_id = getattr(settings, 'WHATSAPP_PHONE_NUMBER_ID', '')
    enabled = getattr(settings, 'WHATSAPP_ENABLED', False)
    missing = []
    if not token:
        missing.append('WHATSAPP_ACCESS_TOKEN')
    if not phone_id:
        missing.append('WHATSAPP_PHONE_NUMBER_ID')
    if not enabled:
        missing.append('WHATSAPP_ENABLED=True')
    return {
        'configured': not missing,
        'missing': missing,
        'phone_number_id': phone_id[:6] + '…' if phone_id else '',
        'template': getattr(settings, 'WHATSAPP_TEMPLATE_ASSIGNED', ''),
        'daily_cap': getattr(settings, 'WHATSAPP_DAILY_CAP', 200),
        'api_version': getattr(settings, 'WHATSAPP_API_VERSION', 'v21.0'),
    }


def sent_today():
    from .models import WhatsAppLog
    return WhatsAppLog.objects.filter(created_at__date=date.today(),
                                      status='sent').count()


def send_template(to_number, template, params, *, member=None, item=None,
                  actor=None, reason=''):
    """Send one approved template message. Always returns a WhatsAppLog row.

    Never raises: a notification failing must not roll back the assignment that
    triggered it. Every outcome — sent, skipped, failed — is logged with the
    reason, so a silent non-delivery is impossible to miss.
    """
    from .models import WhatsAppLog

    def record(status, error='', wamid=''):
        return WhatsAppLog.objects.create(
            member=member, item=item, to_number=to_number or '',
            template=template or '', params=params or [],
            status=status, error=error[:500], wamid=wamid,
            sent_by_admin=actor if (actor and actor.is_authenticated) else None,
        )

    cfg = config_status()
    if not cfg['configured']:
        return record('skipped', f"WhatsApp not configured ({', '.join(cfg['missing'])})")

    to = normalize_number(to_number)
    if not to:
        return record('skipped', f'Invalid or missing number: {to_number!r}')

    cap = getattr(settings, 'WHATSAPP_DAILY_CAP', 200)
    if cap and sent_today() >= cap:
        return record('skipped', f'Daily cap of {cap} reached.')

    payload = {
        'messaging_product': 'whatsapp',
        'to': to.lstrip('+'),
        'type': 'template',
        'template': {
            'name': template,
            'language': {'code': getattr(settings, 'WHATSAPP_TEMPLATE_LANG', 'en')},
            'components': [{
                'type': 'body',
                'parameters': [{'type': 'text', 'text': str(p)[:900]} for p in (params or [])],
            }],
        },
    }

    url = (f"{GRAPH}/{getattr(settings, 'WHATSAPP_API_VERSION', 'v21.0')}"
           f"/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages")
    req = urllib.request.Request(
        url, method='POST',
        data=json.dumps(payload).encode('utf-8'),
        headers={'Authorization': f'Bearer {settings.WHATSAPP_ACCESS_TOKEN}',
                 'Content-Type': 'application/json'},
    )

    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = json.loads(resp.read().decode('utf-8') or '{}')
        wamid = ((body.get('messages') or [{}])[0]).get('id', '')
        return record('sent', wamid=wamid)
    except urllib.error.HTTPError as exc:
        try:
            detail = json.loads(exc.read().decode('utf-8') or '{}')
            msg = (detail.get('error') or {}).get('message') or str(exc)
        except Exception:  # noqa: BLE001
            msg = str(exc)
        return record('failed', f'HTTP {exc.code}: {msg}')
    except Exception as exc:  # noqa: BLE001
        return record('failed', str(exc))


def notify_assignment(item, member, track, actor=None):
    """Tell one member they have been put on a piece of content.

    Respects the member's opt-in and number; anything missing is logged as
    skipped rather than silently dropped.
    """
    if member is None:
        return None
    if not getattr(member, 'notify_whatsapp', False):
        from .models import WhatsAppLog
        return WhatsAppLog.objects.create(
            member=member, item=item, to_number='', template='', params=[],
            status='skipped', error='Member has not opted in to WhatsApp.',
            sent_by_admin=actor if (actor and actor.is_authenticated) else None,
        )

    portal = getattr(settings, 'ADMIN_PORTAL_URL', '') or 'https://admin.tiesverse.com'
    params = [
        (member.candidate_name or 'there').split()[0],   # {{1}} first name
        item.title[:120],                                # {{2}} content name
        track,                                           # {{3}} Content / Graphics
        str(item.due_date or item.release_date or 'TBD'),  # {{4}} due
        f'{portal}/content/calendar',                    # {{5}} link
    ]
    return send_template(
        getattr(member, 'whatsapp_number', ''),
        getattr(settings, 'WHATSAPP_TEMPLATE_ASSIGNED', 'content_assigned'),
        params, member=member, item=item, actor=actor, reason='assignment',
    )
