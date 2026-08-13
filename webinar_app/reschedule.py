"""Keep a webinar's Meet event and its registrants in step with its listing.

Editing the date or time in the Details tab is the single source of truth. When
it changes we patch the existing Google Calendar event (same Meet link, so a
link anyone already saved keeps working), realign the stored meeting_start, and
email the people who are actually coming.

Kept out of views.py so the reschedule rules live in one readable place.
"""
import logging

logger = logging.getLogger(__name__)

# Who hears about a moved session. A free webinar has no payment step, so its
# registrants count as confirmed; a paid one only notifies people who paid,
# since an unpaid registration is an abandoned checkout, not a commitment.
UPDATE_TEMPLATE = 'webinar_updated'


def schedule_fields_changed(before, after):
    """Did the listing's own date/time text change?"""
    return (
        str(before.get('date') or '').strip() != str(after.get('date') or '').strip()
        or str(before.get('time_tz') or '').strip() != str(after.get('time_tz') or '').strip()
    )


def sync_meeting_time(event):
    """Move the Google Calendar event to match the listing's date/time.

    Returns (moved, new_start_iso). `moved` is False when there is no meeting
    yet, the date cannot be parsed, or Google refuses — none of which should
    block the save that triggered this.
    """
    from django.utils import timezone as dj_timezone

    from config import google_calendar
    from tiesverse_app.event_time import parse_date_text, parse_time_text

    d = parse_date_text(event.date or '')
    if not d:
        return False, ''
    hm = parse_time_text(event.time_tz or '') or (0, 0)
    import datetime as _dt
    naive = _dt.datetime(d.year, d.month, d.day, hm[0], hm[1])
    new_start = dj_timezone.make_aware(naive, dj_timezone.get_current_timezone())
    start_iso = naive.strftime('%Y-%m-%dT%H:%M')

    # meeting_start is what event_start() trusts first, so it has to follow the
    # listing or the site and the reminders would disagree with the calendar.
    if event.meeting_start != new_start:
        event.meeting_start = new_start
        event.save(update_fields=['meeting_start'])

    if not event.calendar_event_id:
        return False, start_iso

    try:
        res = google_calendar.reschedule_event(
            event_id=event.calendar_event_id,
            start_iso=start_iso,
            duration_min=event.meeting_duration_min or 60,
            send_updates='all',      # Google emails its own invitees too
        )
    except Exception as exc:  # noqa: BLE001 — a calendar hiccup must not lose the edit
        logger.warning('reschedule_event failed for event %s: %s', event.id, exc)
        return False, start_iso
    return bool(res), start_iso


def notify_registrants(event, request=None):
    """Email confirmed registrants that the timing moved. Returns the count."""
    from django.utils.text import slugify

    from config.email_templates import send_template_email

    from .views import _has_paid, _load_event_registrants

    rows = _load_event_registrants(slugify(event.title or ''), 'all')
    audience = [r for r in rows if _has_paid(r)]
    if not audience:
        return 0

    sent = 0
    for row in audience:
        to = str(row.get('email') or '').strip()
        if not to:
            continue
        ctx = {
            'name': str(row.get('name') or 'there'),
            'topic': event.title,
            'event_title': event.title,
            'date': event.date or '',
            'time': event.time_tz or '',
            'join_link': event.meeting_link or '',
        }
        try:
            # force=True: a schedule change is an explicit, time-critical action,
            # not marketing — it goes out even if broadcasts are switched off.
            if send_template_email(UPDATE_TEMPLATE, to, ctx, force=True):
                sent += 1
        except Exception as exc:  # noqa: BLE001 — one bad address must not stop the rest
            logger.warning('webinar_updated mail to %s failed: %s', to, exc)
    return sent


def handle_schedule_change(event, request=None):
    """Full reschedule: move the calendar, then tell the people coming."""
    moved, start_iso = sync_meeting_time(event)
    notified = notify_registrants(event, request=request)
    logger.info('Webinar %s rescheduled to %s (calendar moved=%s, %s notified)',
                event.id, start_iso, moved, notified)
    return {'calendar_moved': moved, 'notified': notified, 'start': start_iso}
