"""Shared Nimble Monitor operations: polling, weekly report, CSV export.

Used by BOTH the cron command (`poll_nimble_monitor`) and the API "Check now"
endpoint so the behaviour is identical. Multi-platform: which sources are polled
comes from `platforms.enabled_sources()` (settings.NIMBLE_ENABLED_SOURCES).
"""
from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta, timezone

from django.utils import timezone as dj_tz

from .models import MonitorChannel, MonitorAlert, MonitorOwnPost
from . import youtube, platforms
from .instagram_source import fetch_instagram_posts
from .x_source import fetch_x_posts


# source -> callable(handle) -> list of normalised post dicts
FETCHERS = {
    'youtube': youtube.fetch_youtube_entries,
    'x': fetch_x_posts,
    'instagram': fetch_instagram_posts,
}


def poll_channels(only_active=True, only_source=None):
    """Fetch new posts for every (active) channel on an enabled platform and insert
    MonitorAlert rows. Deduped by (channel, item_id). Sends an alert email for
    genuinely new COMPETITOR posts published after we started tracking that channel.
    Idempotent: re-running inserts nothing new. Returns a summary dict.

    Also maintains per-channel health (`consecutive_failures`/`last_success_at`) so
    a scraping source that silently stops returning posts gets flagged instead of
    quietly reporting "no new activity" forever."""
    result = {'checked': 0, 'new_alerts': 0, 'notifications_sent': 0,
              'errors': [], 'skipped_disabled': 0}
    now = dj_tz.now()
    enabled = platforms.enabled_sources()
    only_source = platforms.normalize_source(only_source) if only_source else None

    channels = MonitorChannel.objects.all()
    for channel in channels:
        source = platforms.normalize_source(channel.source) or 'youtube'
        if only_source and source != only_source:
            continue
        if source not in enabled or source not in FETCHERS:
            result['skipped_disabled'] += 1
            continue
        channel.last_checked = now
        if only_active and not channel.active:
            channel.save(update_fields=['last_checked'])
            continue
        result['checked'] += 1
        label = platforms.platform_label(source)
        try:
            entries = FETCHERS[source](channel.source_handle)
        except Exception as exc:  # noqa: BLE001
            channel.last_error = platforms.friendly_fetch_error(source, exc)[:400]
            channel.last_error_at = now
            channel.consecutive_failures = (channel.consecutive_failures or 0) + 1
            channel.save(update_fields=['last_checked', 'last_error', 'last_error_at',
                                        'consecutive_failures'])
            result['errors'].append({'channel': channel.name, 'source': source,
                                     'message': channel.last_error})
            continue

        # A scraper that returns an empty list is "working" as far as HTTP is
        # concerned but may in fact be broken — count it, without raising an error.
        if entries:
            channel.consecutive_failures = 0
            channel.last_success_at = now
        else:
            channel.consecutive_failures = (channel.consecutive_failures or 0) + 1
        channel.last_error = ''
        channel.last_error_at = None
        channel.save(update_fields=['last_checked', 'last_error', 'last_error_at',
                                    'consecutive_failures', 'last_success_at'])

        existing = set(
            MonitorAlert.objects.filter(channel=channel).values_list('item_id', flat=True)
        )
        tracking_started = channel.created_at
        # oldest-first so inserts read chronologically
        for entry in reversed(entries):
            item_id = entry.get('item_id')
            if not item_id or item_id in existing:
                continue
            published_at = youtube.parse_dt(entry.get('published_at'))
            alert = MonitorAlert.objects.create(
                channel=channel,
                item_id=item_id,
                # Only meaningful for YouTube; blank for X/Instagram.
                youtube_video_id=(entry.get('youtube_video_id', item_id)
                                  if source == 'youtube' else ''),
                title=(entry.get('title') or 'New competitor post')[:400],
                url=entry.get('url', ''),
                published_at=published_at,
                thumbnail_url=entry.get('thumbnail_url', ''),
                status='OPEN',
                note=f'Auto-detected from {label}.',
                unread=True,
            )
            existing.add(item_id)
            result['new_alerts'] += 1

            should_notify = (
                channel.kind != 'OWN'
                and published_at is not None
                and tracking_started is not None
                and published_at >= tracking_started
            )
            if should_notify:
                try:
                    notif = youtube.send_alert_email(
                        {'title': alert.title, 'url': alert.url,
                         'published_at': alert.published_at}, channel)
                    if notif.get('sent'):
                        result['notifications_sent'] += 1
                except Exception as exc:  # noqa: BLE001 — alert already saved
                    result['errors'].append({
                        'channel': channel.name,
                        'message': f'Alert saved, but email failed: {exc}',
                    })
    result['ok'] = not result['errors']
    return result


def health():
    """Channels that have failed (errored OR returned nothing) several checks in a
    row. X/Instagram are scraping-based, so this is how a silent breakage — the
    fetch "succeeds" but yields no posts — becomes visible instead of looking like
    a quiet week. Returned to the UI for a warning banner and logged by the cron."""
    unhealthy = (MonitorChannel.objects
                 .filter(active=True,
                         consecutive_failures__gte=MonitorChannel.UNHEALTHY_AFTER)
                 .order_by('-consecutive_failures', 'name'))
    return {
        'unhealthy_after': MonitorChannel.UNHEALTHY_AFTER,
        'channels': [{
            'id': c.id,
            'name': c.name,
            'source': c.source,
            'platform': platforms.platform_label(c.source),
            'consecutive_failures': c.consecutive_failures,
            'last_error': c.last_error,
            'last_checked': c.last_checked,
            'last_success_at': c.last_success_at,
        } for c in unhealthy],
    }


def weekly_report():
    """Rolling 7-day competitor/response stats (mirrors the tool's weekly_report)."""
    cutoff = dj_tz.now() - timedelta(days=7)
    own_channel_ids = set(
        MonitorChannel.objects.filter(kind='OWN').values_list('id', flat=True)
    )

    competitor_posts = 0
    actions_taken = 0
    monitored_own_posts = 0
    for a in MonitorAlert.objects.filter(published_at__gte=cutoff).only(
            'channel_id', 'status', 'published_at'):
        if a.channel_id in own_channel_ids:
            monitored_own_posts += 1
        else:
            competitor_posts += 1
            if a.status == 'WORKING':
                actions_taken += 1

    manually_recorded = MonitorOwnPost.objects.filter(published_at__gte=cutoff).count()
    own_posts = monitored_own_posts + manually_recorded

    action_rate = round((actions_taken / competitor_posts) * 100, 1) if competitor_posts else 0
    missed_signals = max(competitor_posts - actions_taken, 0)
    if competitor_posts == 0:
        performance = 'No activity'
    elif action_rate >= 50:
        performance = 'On track'
    elif action_rate >= 25:
        performance = 'Needs attention'
    else:
        performance = 'Behind'

    return {
        'windowDays': 7,
        'competitorPosts': competitor_posts,
        'actionsTaken': actions_taken,
        'missedSignals': missed_signals,
        'ownPosts': own_posts,
        'ourChannelPosts': monitored_own_posts,
        'manuallyRecordedPosts': manually_recorded,
        'actionRate': action_rate,
        'performance': performance,
        'targetActionRate': 50,
    }


def weekly_report_text():
    r = weekly_report()
    return (
        'Nimble Monitor Weekly Report\n'
        f"Window: last {r['windowDays']} days\n"
        f"Competitor posts: {r['competitorPosts']}\n"
        f"Actions taken: {r['actionsTaken']}\n"
        f"Missed signals: {r['missedSignals']}\n"
        f"Our posts: {r['ownPosts']}\n"
        f"Action rate: {r['actionRate']}%\n"
        f"Target action rate: {r['targetActionRate']}%\n"
        f"Status: {r['performance']}\n"
    )


def own_post_heatmap(days=7):
    """Count own-posts per calendar day for the last `days` days (for the UI)."""
    cutoff = dj_tz.now() - timedelta(days=days)
    counts = {}
    for a in MonitorAlert.objects.filter(published_at__gte=cutoff).select_related('channel'):
        if a.channel and a.channel.kind == 'OWN' and a.published_at:
            key = a.published_at.date().isoformat()
            counts[key] = counts.get(key, 0) + 1
    for p in MonitorOwnPost.objects.filter(published_at__gte=cutoff).only('published_at'):
        if p.published_at:
            key = p.published_at.date().isoformat()
            counts[key] = counts.get(key, 0) + 1
    return counts


def export_csv_text():
    """CSV of channels + alerts + own-posts (mirrors the tool's export)."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['record_type', 'id', 'platform', 'channel_name', 'channel_id',
                     'title', 'url', 'published_at', 'status', 'assigned_to', 'note', 'kind'])

    channels = list(MonitorChannel.objects.all())
    channel_by_id = {c.id: c for c in channels}
    for c in channels:
        writer.writerow(['channel', c.id, c.source.upper(), c.name, c.source_handle,
                         '', '', '', '', '', '', c.kind])
    for a in MonitorAlert.objects.all():
        c = channel_by_id.get(a.channel_id)
        writer.writerow(['alert', a.id, (c.source.upper() if c else 'YOUTUBE'),
                         (c.name if c else ''), a.channel_id, a.title, a.url,
                         a.published_at.isoformat() if a.published_at else '',
                         a.status, a.assigned_to, a.note, (c.kind if c else 'COMPETITOR')])
    for p in MonitorOwnPost.objects.all():
        writer.writerow(['own_post', p.id, 'OWN', '', '', p.title, '',
                         p.published_at.isoformat() if p.published_at else '', '', '', '', 'OWN'])
    return output.getvalue()
