"""Shared Cloudflare Turnstile verification.

verify_turnstile(request, token) returns True when the request should be allowed:
- True if TURNSTILE_SECRET_KEY is unset (feature disabled — nothing changes).
- False on a missing token or an explicit Cloudflare reject (fail closed).
- True if siteverify is unreachable (fail OPEN, so a Cloudflare outage never
  blocks logins/signups — the password/OTP remain the real factors).
"""
import json
import urllib.parse
import urllib.request

from django.conf import settings

_SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

# Origins whose logins skip the Turnstile check (they have no widget). The docs
# site uses the same accounts; the password stays the real factor. Extendable
# via the TURNSTILE_EXEMPT_ORIGINS env/setting (comma-separated).
_DEFAULT_EXEMPT = ('https://docs.tiesverse.com',)


def origin_exempt_from_turnstile(request):
    """True if this request's Origin is on the Turnstile exemption list."""
    origin = (request.META.get('HTTP_ORIGIN', '') or '').strip().rstrip('/').lower()
    if not origin:
        return False
    exempt = set(_DEFAULT_EXEMPT)
    extra = getattr(settings, 'TURNSTILE_EXEMPT_ORIGINS', '') or ''
    for o in extra.split(','):
        o = o.strip().rstrip('/').lower()
        if o:
            exempt.add(o)
    return origin in exempt


def verify_turnstile(request, token):
    secret = getattr(settings, 'TURNSTILE_SECRET_KEY', '')
    if not secret:
        return True
    if not token:
        return False
    ip = (request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()
          or request.META.get('REMOTE_ADDR', ''))
    payload = urllib.parse.urlencode({'secret': secret, 'response': token, 'remoteip': ip}).encode()
    try:
        req = urllib.request.Request(_SITEVERIFY, data=payload)
        with urllib.request.urlopen(req, timeout=10) as r:  # noqa: S310 — fixed trusted host
            return bool(json.loads(r.read()).get('success'))
    except Exception:  # noqa: BLE001 — outage: don't block auth
        return True
