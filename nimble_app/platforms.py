"""Platform registry for Watchdog — one place defining every monitored platform.

Ported from the upstream standalone tool's `PLATFORM_REGISTRY`
(Upties/YT-Competitor-Monitor-by-TIES @ acd48d6, "Verify clean multi-platform
workspace tests"), so labels, help text and handle validation live in a single
dict instead of being hardcoded across the backend and the React page.

Reliability of each source (measured, not assumed):
  * youtube   — official channel RSS. Sanctioned + stable. Always on.
  * x         — scrapes the public profile HTML. VERIFIED WORKING, but it is
                scraping, so it can break whenever X changes their markup. On by
                default with health tracking (see services.poll_channels).
  * instagram — public web_profile_info JSON. Currently answers HTTP 429 for
                everyone (blocked), so it ships DISABLED. The code is kept and
                correct; flip it on via NIMBLE_ENABLED_SOURCES when it clears.

`NIMBLE_ENABLED_SOURCES` (settings / env, comma separated) is the switch:
setting it to "youtube" instantly reverts to YouTube-only with no code change.
"""
from __future__ import annotations

import re

from django.conf import settings


PLATFORM_REGISTRY = {
    'youtube': {
        'label': 'YouTube',
        'tracked_noun': 'channels',
        'handle_label': 'channel ID',
        'handle_help': 'Paste the channel ID (starts with UC…) or a URL containing it.',
        'handle_error': 'Enter a valid YouTube channel ID beginning with UC.',
        'url_hint': 'https://www.youtube.com/feeds/videos.xml?channel_id=',
        'experimental': False,
    },
    'x': {
        'label': 'X',
        'tracked_noun': 'accounts',
        'handle_label': 'profile username or URL',
        'handle_help': 'Enter a username (e.g. TiesIndia) or paste the full X profile URL.',
        'handle_error': 'Enter a valid X username or profile URL.',
        'url_hint': 'https://x.com/',
        # Scraping-based: works today, but flag it so the UI can say so.
        'experimental': True,
    },
    'instagram': {
        'label': 'Instagram',
        'tracked_noun': 'accounts',
        'handle_label': 'profile username or URL',
        'handle_help': 'Enter a username or paste the full Instagram profile URL.',
        'handle_error': 'Enter a valid Instagram username or profile URL.',
        'url_hint': 'https://www.instagram.com/',
        'experimental': True,
    },
}

# Order shown in the UI.
PLATFORM_ORDER = ['youtube', 'x', 'instagram']

DEFAULT_ENABLED = ('youtube', 'x')   # instagram intentionally excluded (HTTP 429)


def normalize_source(value):
    """'YouTube ' -> 'youtube'; unknown/blank -> None."""
    source = (value or '').strip().lower()
    return source if source in PLATFORM_REGISTRY else None


def platform_config(source):
    return PLATFORM_REGISTRY.get(normalize_source(source) or '', PLATFORM_REGISTRY['youtube'])


def platform_label(source):
    return platform_config(source)['label']


def enabled_sources():
    """Sources the poller and API will act on. Driven by NIMBLE_ENABLED_SOURCES
    so Instagram can be switched on later without a deploy."""
    raw = getattr(settings, 'NIMBLE_ENABLED_SOURCES', None)
    if not raw:
        return list(DEFAULT_ENABLED)
    if isinstance(raw, (list, tuple, set)):
        values = raw
    else:
        values = str(raw).split(',')
    out = [s for s in (normalize_source(v) for v in values) if s]
    return out or list(DEFAULT_ENABLED)


def is_enabled(source):
    return (normalize_source(source) or '') in enabled_sources()


def public_config(source):
    """Registry entry + source key, for the /api/nimble/platforms/ payload."""
    source = normalize_source(source)
    if not source:
        return None
    config = dict(PLATFORM_REGISTRY[source])
    config['source'] = source
    config['enabled'] = source in enabled_sources()
    return config


def public_platforms(include_disabled=False):
    """All enabled platforms in display order (for the UI's platform tabs)."""
    out = []
    for source in PLATFORM_ORDER:
        config = public_config(source)
        if config and (include_disabled or config['enabled']):
            out.append(config)
    return out


# ── handle validation (ported verbatim from the tool's normalize_handle) ────────
def normalize_handle(source, value):
    """Turn user input (bare handle, @handle, or full profile URL) into the stored
    handle for `source`. Raises ValueError with the registry's friendly message."""
    source = normalize_source(source)
    if not source:
        raise ValueError('Choose a valid platform.')
    value = (value or '').strip()

    if source == 'youtube':
        match = re.search(r'(UC[A-Za-z0-9_-]{22})', value)
        if not match:
            raise ValueError(PLATFORM_REGISTRY['youtube']['handle_error'])
        return match.group(1)

    # IG/X accept a URL — take the first path segment — or a bare/@ handle.
    if '://' in value:
        from urllib.parse import urlparse
        parsed = urlparse(value)
        parts = [part for part in parsed.path.split('/') if part]
        value = parts[0] if parts else ''
    value = value.lstrip('@')

    if source == 'instagram':
        if not re.fullmatch(r'[A-Za-z0-9._]{1,30}', value):
            raise ValueError(PLATFORM_REGISTRY['instagram']['handle_error'])
        if re.fullmatch(r'UC[A-Za-z0-9_-]{22}', value):
            raise ValueError('That is a YouTube channel ID, not an Instagram username.')
        return value

    if source == 'x':
        if not re.fullmatch(r'[A-Za-z0-9_]{1,15}', value):
            raise ValueError(PLATFORM_REGISTRY['x']['handle_error'])
        return value

    raise ValueError('Choose a valid platform.')


def friendly_fetch_error(source, exc):
    """Per-platform message for a failed check (ported from the tool)."""
    source = normalize_source(source) or 'youtube'
    status = getattr(exc, 'code', None)
    if source == 'instagram':
        if status == 400:
            return ('Instagram could not find this username or expose its public posts. '
                    'Check the current profile username.')
        if status in {401, 403, 429}:
            return 'Instagram temporarily blocked the public check. Try again later.'
    if source == 'x' and status in {401, 403, 429}:
        return 'X temporarily blocked the public check. Try again later.'
    if source == 'youtube':
        if status == 404:
            return 'YouTube could not find this channel ID.'
        if status in {429, 403}:
            return 'YouTube temporarily blocked the check. Try again later.'
    return str(exc) or 'The platform check failed.'
