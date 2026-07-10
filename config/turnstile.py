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
