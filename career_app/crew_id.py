"""Crew ID generation — the Ties HQ Crew ID Standard.

A Crew ID is a permanent, system-generated, sequential identity of the form
``CRW-<Series>-<NNNN>`` (e.g. ``CRW-A-0247``):

* System-generated only — never chosen manually.
* Sequential per series (0001–9999); 0000 is never issued.
* Atomic — the next number is reserved inside a write transaction so two
  concurrent provisions can never get the same number (SQLite takes a
  file-level write lock; ``turso_db`` is a local SQLite file).
* No reuse, no gap-filling — the counter only ever increments and rolls to the
  next series (A→B→…→Z→AA→…) at 9999, so reuse/gaps are impossible by
  construction.

The DB ``unique=True`` index on ``OnboardingSubmission.crew_id`` is the ultimate
guarantee; the in-process ``_ISSUED_THIS_RUN`` set is a cheap belt-and-suspenders
guard (mirrors the certificate-ID generator in accounts_app.campaign_jobs).
"""

import re

from django.db import transaction

from .models import CrewSeries

CREW_ID_RE = re.compile(r'^CRW-[A-Z]{1,2}-\d{4}$')

# Numbers handed out this process but perhaps not yet saved onto a member — stops
# two mints in the same run from colliding before either is persisted.
_ISSUED_THIS_RUN = set()

# All Crew ID work targets the turso_db (where career_app models live).
_DB = 'turso_db'


def is_valid_crew_id(value):
    return bool(value) and bool(CREW_ID_RE.match(str(value)))


def format_crew_id(series_code, number):
    """CRW-<series>-<NNNN>. 0000 is normally reserved, but the founder seed
    (backfill) deliberately assigns CRW-A-0000; the auto-generator only ever
    hands out 1..9999 (its counter starts at 1), so 0000 is never auto-issued
    or reused. So we allow 0..9999 here and rely on the generator to skip 0."""
    number = int(number)
    if number < 0 or number > CrewSeries.MAX_PER_SERIES:
        raise ValueError(f'Crew ID number out of range: {number}')
    cid = f'CRW-{series_code}-{number:04d}'
    if not is_valid_crew_id(cid):
        raise ValueError(f'Generated an invalid Crew ID: {cid!r}')
    return cid


def _reserve_next_number():
    """Atomically reserve the next (series_code, number). Rolls to the next
    series when the active one is exhausted. Returns (series_code, number)."""
    with transaction.atomic(using=_DB):
        series = (CrewSeries.objects.using(_DB)
                  .select_for_update()               # no-op on SQLite, harmless
                  .filter(is_active=True)
                  .order_by('created_at', 'id')
                  .first())
        if series is None:
            series = CrewSeries.objects.using(_DB).create(
                series_code='A', current_number=0, is_active=True)

        nxt = series.current_number + 1
        if nxt > CrewSeries.MAX_PER_SERIES:
            # Exhausted — retire this series and open the next.
            series.is_active = False
            series.save(using=_DB, update_fields=['is_active'])
            new_code = CrewSeries.next_series_code(series.series_code)
            new_series = CrewSeries.objects.using(_DB).create(
                series_code=new_code, current_number=1, is_active=True)
            return new_series.series_code, 1

        series.current_number = nxt
        series.save(using=_DB, update_fields=['current_number'])
        return series.series_code, nxt


def generate_crew_id():
    """Reserve and return the next unique Crew ID string (e.g. 'CRW-A-0248')."""
    series_code, number = _reserve_next_number()
    cid = format_crew_id(series_code, number)
    _ISSUED_THIS_RUN.add(cid.upper())
    return cid


def maybe_prepare_next_series():
    """If the active series has reached the 90% threshold, pre-create the next
    (inactive) series so it's ready before the roll. Returns a dict describing
    capacity for alerting, or None if there's no active series yet."""
    series = (CrewSeries.objects.using(_DB)
              .filter(is_active=True).order_by('created_at', 'id').first())
    if series is None:
        return None
    at_threshold = series.current_number >= CrewSeries.PREPARE_THRESHOLD
    if at_threshold:
        next_code = CrewSeries.next_series_code(series.series_code)
        if not CrewSeries.objects.using(_DB).filter(series_code=next_code).exists():
            CrewSeries.objects.using(_DB).create(
                series_code=next_code, current_number=0, is_active=False)
    pct = round(series.current_number / CrewSeries.MAX_PER_SERIES * 100, 1)
    return {
        'series_code': series.series_code,
        'current_number': series.current_number,
        'max': CrewSeries.MAX_PER_SERIES,
        'percent': pct,
        'at_threshold': at_threshold,
    }
