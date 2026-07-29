"""Shared Nimble Monitor operations: polling, weekly report, CSV export.

Used by BOTH the cron command (`poll_nimble_monitor`) and the API "Check now"
endpoint so the behaviour is identical. YouTube-only in this phase.
"""
from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta, timezone

from django.utils import timezone as dj_tz

from .models import MonitorChannel, MonitorAlert, MonitorOwnPost
from . import youtube


def poll_channels(only_active=True):
    """Fetch new posts for every (active) YouTube channel and insert MonitorAlert
    rows. Deduped by (channel, item_id). Sends an alert email for genuinely new
    COMPETITOR posts published after we started tracking that channel. Idempotent:
    re-running inserts nothing new. Returns a summary dict."""
    result = {'checked': 0, 'new_alerts': 0, 'notifications_sent': 0, 'errors': []}
    now = dj_tz.now()

    channels = MonitorChannel.objects.all()
    for channel in channels:
        if channel.source != 'youtube':
            continue   # IG/X not supported yet
        channel.last_checked = now
        if only_active and not channel.active:
            channel.save(update_fields=['last_checked'])
            continue
        result['checked'] += 1
        try:
            entries = youtube.fetch_youtube_entries(channel.source_handle)
        except Exception as exc:  # noqa: BLE001
            channel.last_error = youtube.friendly_fetch_error(exc)[:400]
            channel.last_error_at = now
            channel.save(update_fields=['last_checked', 'last_error', 'last_error_at'])
            result['errors'].append({'channel': channel.name, 'message': channel.last_error})
            continue

        channel.last_error = ''
        channel.last_error_at = None
        channel.save(update_fields=['last_checked', 'last_error', 'last_error_at'])

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
                youtube_video_id=entry.get('youtube_video_id', item_id),
                title=(entry.get('title') or 'New competitor post')[:400],
                url=entry.get('url', ''),
                published_at=published_at,
                thumbnail_url=entry.get('thumbnail_url', ''),
                status='OPEN',
                note='Auto-detected from YouTube.',
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
