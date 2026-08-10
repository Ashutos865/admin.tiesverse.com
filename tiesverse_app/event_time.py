"""When does an EventRegistration actually start and end?

The listing stores `date` and `time_tz` as free text ("20 Jul 2026",
"6:00 PM IST"), so anything that needs a real datetime — flipping a webinar to
past, prefilling the Meet scheduler — has to parse it. `meeting_start` is a
real DateTimeField and always wins when set.
"""
import re
from datetime import datetime, timedelta

from django.utils import timezone

MONTHS = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
}


def parse_date_text(text):
    """'20 Jul 2026' / 'Jul 20, 2026' / '2026-07-20' / '20/07/2026' -> date or None."""
    if not text:
        return None
    t = text.strip().lower().replace(',', ' ')
    m = re.search(r'(\d{4})-(\d{1,2})-(\d{1,2})', t)          # ISO
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return _safe_date(y, mo, d)
    m = re.search(r'(\d{1,2})\s*[/.]\s*(\d{1,2})\s*[/.]\s*(\d{4})', t)   # 20/07/2026 (day first)
    if m:
        return _safe_date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    m = re.search(r'(\d{1,2})\s+([a-z]{3,9})\s+(\d{4})', t)   # 20 Jul 2026
    if m:
        mo = MONTHS.get(m.group(2)[:3])
        return _safe_date(int(m.group(3)), mo, int(m.group(1))) if mo else None
    m = re.search(r'([a-z]{3,9})\s+(\d{1,2})\s+(\d{4})', t)   # Jul 20 2026
    if m:
        mo = MONTHS.get(m.group(1)[:3])
        return _safe_date(int(m.group(3)), mo, int(m.group(2))) if mo else None
    return None


def _safe_date(y, mo, d):
    try:
        return datetime(y, mo, d).date()
    except ValueError:
        return None


def parse_time_text(text):
    """'6:00 PM IST' / '18:30' / '6 PM' -> (hour, minute) or None."""
    if not text:
        return None
    t = text.strip().lower()
    m = re.search(r'(\d{1,2})(?::(\d{2}))?\s*(am|pm)?', t)
    if not m:
        return None
    hour = int(m.group(1))
    minute = int(m.group(2) or 0)
    ampm = m.group(3)
    if ampm == 'pm' and hour != 12:
        hour += 12
    elif ampm == 'am' and hour == 12:
        hour = 0
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return None
    return hour, minute


def event_start(ev):
    """Aware start datetime for an EventRegistration, or None if unknowable.

    meeting_start (a real field, set when the Meet is generated) always wins;
    otherwise the free-text date/time is parsed. Date without a time assumes
    end of day so a webinar is never flipped to past on its own morning.
    """
    if getattr(ev, 'meeting_start', None):
        return ev.meeting_start
    d = parse_date_text(getattr(ev, 'date', ''))
    if not d:
        return None
    hm = parse_time_text(getattr(ev, 'time_tz', ''))
    tz = timezone.get_current_timezone()
    if hm:
        return timezone.make_aware(datetime(d.year, d.month, d.day, hm[0], hm[1]), tz)
    return timezone.make_aware(datetime(d.year, d.month, d.day, 23, 59), tz)


def event_end(ev):
    """Start + duration (default 60 min). None when the start is unknowable."""
    start = event_start(ev)
    if not start:
        return None
    return start + timedelta(minutes=getattr(ev, 'meeting_duration_min', 60) or 60)


def has_ended(ev, now=None):
    end = event_end(ev)
    return bool(end and end < (now or timezone.now()))
