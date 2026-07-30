"""Instagram public-profile post fetch.

Ported VERBATIM from the standalone Nimble Monitor tool
(Upties/YT-Competitor-Monitor-by-TIES @ acd48d6, `fetch_instagram_posts` +
`parse_instagram_posts`). Only the returned dict keys are renamed to match the
shape `services.poll_channels` expects (item_id / title / url / published_at /
thumbnail_url).

STATUS: DISABLED BY DEFAULT — the code is correct, the platform refuses it.
Tested against @instagram, @nasa and @ties.in from a residential connection and
every call returned **HTTP 429 Too Many Requests**. Instagram rate-limits this
public endpoint aggressively, so it is excluded from `platforms.DEFAULT_ENABLED`.
Nothing here needs changing if/when that clears — just add `instagram` to
NIMBLE_ENABLED_SOURCES. Supports public timeline posts and reels only (never
Stories or private accounts).
"""
from __future__ import annotations

import json
import urllib.request
from datetime import datetime, timezone

from .youtube import UA


def instagram_profile_url(username):
    return f'https://www.instagram.com/{str(username).strip().lstrip("@")}/'


def instagram_api_url(username):
    handle = str(username).strip().lstrip('@')
    return ('https://www.instagram.com/api/v1/users/web_profile_info/'
            f'?username={handle}')


def _iso_now():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def parse_instagram_posts(payload_text):
    """Parse the web_profile_info JSON into post dicts."""
    payload = json.loads(payload_text)
    user = (payload.get('data') or {}).get('user') or {}
    edges = ((user.get('edge_owner_to_timeline_media') or {}).get('edges')) or []
    posts = []
    for edge in edges:
        node = edge.get('node') or {}
        shortcode = node.get('shortcode') or ''
        caption_edges = ((node.get('edge_media_to_caption') or {}).get('edges')) or []
        caption = ''
        if caption_edges:
            caption = ((caption_edges[0].get('node') or {}).get('text')) or ''
        taken_at = node.get('taken_at_timestamp')
        published_at = (
            datetime.fromtimestamp(int(taken_at), tz=timezone.utc)
            .isoformat().replace('+00:00', 'Z')
        ) if taken_at else _iso_now()
        posts.append({
            'item_id': shortcode,
            'title': (caption.splitlines()[0][:120] if caption else 'New Instagram post'),
            'url': (f'https://www.instagram.com/p/{shortcode}/' if shortcode
                    else instagram_profile_url(user.get('username') or '')),
            'published_at': published_at,
            'thumbnail_url': node.get('display_url', ''),
            'is_video': bool(node.get('is_video')),
            'caption': caption,
        })
    return posts


def fetch_instagram_posts(username, count=12, timeout=15):
    """Return up to `count` recent public posts. Raises HTTPError (often 429) when
    Instagram blocks the check — the caller records it as a channel error."""
    req = urllib.request.Request(
        instagram_api_url(username),
        headers={
            'User-Agent': UA,
            'Accept': '*/*',
            'X-IG-App-ID': '936619743392459',
            'X-Requested-With': 'XMLHttpRequest',
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        posts = parse_instagram_posts(response.read().decode('utf-8'))
    return posts[:count]
