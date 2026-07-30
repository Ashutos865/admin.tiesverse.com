"""YouTube RSS fetch + weekly report + alert email.

Ported (trimmed to YouTube-only) from the standalone Nimble Monitor tool
(Upties/YT-Competitor-Monitor-by-TIES, server.py). Pure stdlib — no extra deps.

The polling itself (looping channels, inserting MonitorAlert rows) lives in
`services.poll_channels`, shared by the cron command and the "Check now" endpoint.
"""
from __future__ import annotations

import os
import re
import smtplib
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.message import EmailMessage


UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')


# ── channel-id validation (mirror the tool's normalize_handle for YouTube) ──────
def normalize_youtube_channel_id(value):
    """Accept a UC… channel id or a URL/handle that contains one. Raises
    ValueError with a friendly message if none is found."""
    value = (value or '').strip()
    match = re.search(r'(UC[A-Za-z0-9_-]{22})', value)
    if not match:
        raise ValueError('Enter a valid YouTube channel ID beginning with UC.')
    return match.group(1)


def youtube_feed_url(channel_id):
    return f'https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}'


def parse_rss_entries(xml_text):
    """Parse a YouTube channel Atom feed into a list of post dicts."""
    root = ET.fromstring(xml_text)
    ns = {
        'atom': 'http://www.w3.org/2005/Atom',
        'yt': 'http://www.youtube.com/xml/schemas/2015',
        'media': 'http://search.yahoo.com/mrss/',
    }
    entries = []
    for entry in root.findall('atom:entry', ns):
        video_id = entry.findtext('yt:videoId', default='', namespaces=ns)
        title = entry.findtext('atom:title', default='', namespaces=ns)
        published = entry.findtext('atom:published', default='', namespaces=ns)
        thumbnail_el = entry.find('media:thumbnail', ns)
        link_el = entry.find("atom:link[@rel='alternate']", ns)
        url = (link_el.attrib.get('href') if link_el is not None
               else f'https://www.youtube.com/watch?v={video_id}')
        entries.append({
            'youtube_video_id': video_id,
            'item_id': video_id,
            'title': title,
            'url': url,
            'published_at': published,
            'thumbnail_url': thumbnail_el.attrib.get('url') if thumbnail_el is not None else '',
        })
    return entries


def fetch_youtube_entries(channel_id, timeout=15):
    req = urllib.request.Request(youtube_feed_url(channel_id), headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return parse_rss_entries(response.read().decode('utf-8'))


def friendly_fetch_error(exc):
    status = getattr(exc, 'code', None)
    if status == 404:
        return 'YouTube could not find this channel ID.'
    if status in {429, 403}:
        return 'YouTube temporarily blocked the check. Try again later.'
    return str(exc) or 'The platform check failed.'


# ── datetime helpers ────────────────────────────────────────────────────────────
def parse_dt(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except Exception:  # noqa: BLE001
        return None


# ── SMTP (env-var driven, Amazon-SES shaped — mirrors the tool) ─────────────────
def _smtp_conf():
    return {
        'host': os.environ.get('WATCHDOG_SMTP_HOST', ''),
        'port': int(os.environ.get('WATCHDOG_SMTP_PORT', '587')),
        'user': os.environ.get('WATCHDOG_SMTP_USER', ''),
        'pass': os.environ.get('WATCHDOG_SMTP_PASS', ''),
        'to': os.environ.get('WATCHDOG_MAIL_TO', ''),
        'public_url': os.environ.get('WATCHDOG_PUBLIC_URL', '').rstrip('/'),
    }


def send_alert_email(alert, channel):
    """Send a "competitor posted" email. Returns {'sent': bool, ...}. Never raises
    to the caller for a mere config gap — real SMTP errors do propagate so the
    poller can record them."""
    c = _smtp_conf()
    if not c['host'] or not c['to']:
        return {'sent': False, 'reason': 'SMTP host or recipient not configured'}
    mail_from = os.environ.get('WATCHDOG_MAIL_FROM', c['user'])
    dashboard = f"{c['public_url']}/nimble/monitor" if c['public_url'] else ''

    # Label the platform the post came from (YouTube / X / Instagram).
    from .platforms import platform_label
    label = platform_label(getattr(channel, 'source', 'youtube'))

    msg = EmailMessage()
    msg['Subject'] = f"[{label}] {channel.name} posted: {alert['title']}"
    msg['From'] = mail_from
    msg['To'] = c['to']
    lines = [
        f'{channel.name} posted on {label}.',
        '',
        alert['title'],
        f"Published: {alert.get('published_at') or ''}",
        f"Open post: {alert.get('url') or ''}",
    ]
    if dashboard:
        lines.extend(['', f'Open Nimble Monitor: {dashboard}'])
    msg.set_content('\n'.join(lines))

    with smtplib.SMTP(c['host'], c['port'], timeout=20) as client:
        client.starttls()
        if c['user']:
            client.login(c['user'], c['pass'])
        client.send_message(msg)
    return {'sent': True}


def send_report_email(report_text, subject):
    c = _smtp_conf()
    if not c['host'] or not c['to']:
        return {'sent': False, 'reason': 'SMTP host or recipient not configured'}
    mail_from = os.environ.get('WATCHDOG_MAIL_FROM', c['user'])
    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = mail_from
    msg['To'] = c['to']
    msg.set_content(report_text)
    with smtplib.SMTP(c['host'], c['port'], timeout=20) as client:
        client.starttls()
        if c['user']:
            client.login(c['user'], c['pass'])
        client.send_message(msg)
    return {'sent': True}
