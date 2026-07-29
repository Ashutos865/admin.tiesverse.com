"""Crew ID lifecycle alerts — run daily from cron on the VPS.

Checks and reports:
  * Active series at/over 90% capacity → pre-creates the next series and flags it.
  * (Extensible) temporary identities past an expiry date, offboarded-auth attempts.

Reporting only + the series pre-create; never blocks anything. Idempotent.

    manage.py crew_alerts
    manage.py crew_alerts --dry-run
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Report Crew ID lifecycle alerts (series capacity, etc.) and prep the next series.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='Report only; do not pre-create the next series.')

    def handle(self, *args, **opts):
        from career_app.crew_id import maybe_prepare_next_series
        from career_app.models import CrewSeries

        dry = opts.get('dry_run')

        series = (CrewSeries.objects.filter(is_active=True)
                  .order_by('created_at', 'id').first())
        if series is None:
            self.stdout.write('No active Crew ID series yet — nothing to alert on.')
            return

        pct = round(series.current_number / CrewSeries.MAX_PER_SERIES * 100, 1)
        self.stdout.write(
            f'Active series {series.series_code}: {series.current_number}/'
            f'{CrewSeries.MAX_PER_SERIES} ({pct}%).')

        if series.current_number >= CrewSeries.PREPARE_THRESHOLD:
            next_code = CrewSeries.next_series_code(series.series_code)
            exists = CrewSeries.objects.filter(series_code=next_code).exists()
            if dry:
                self.stdout.write(self.style.WARNING(
                    f'[dry] ALERT: series at {pct}% — would prepare next series {next_code} '
                    f'{"(already exists)" if exists else ""}.'))
            else:
                info = maybe_prepare_next_series()
                self.stdout.write(self.style.WARNING(
                    f'ALERT: series at {pct}% — next series {next_code} ready '
                    f'{"(pre-existing)" if exists else "(created)"}.'))
                if info:
                    self.stdout.write(f'  capacity info: {info}')
        else:
            self.stdout.write(self.style.SUCCESS('Series capacity healthy (below 90%).'))
