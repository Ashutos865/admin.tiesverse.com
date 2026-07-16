"""One-off: fill empty AttendanceRecord.work_report from WorkSession notes.

Members' work notes are saved per WorkSession, but for a while the checkout
flow never copied them onto the day-level AttendanceRecord, so the Attendance
table showed "—" even when the member had written a report. This walks every
AttendanceRecord whose work_report is blank and, if that member wrote notes in
any of that day's sessions, composes and stores the report.

Idempotent and non-destructive: only fills records that are currently blank.

    manage.py backfill_work_reports            # all dates
    manage.py backfill_work_reports --date 2026-07-16
    manage.py backfill_work_reports --dry-run
"""
import datetime

from django.core.management.base import BaseCommand

from career_app.models import AttendanceRecord
from career_app.work_sessions import _compose_day_report


class Command(BaseCommand):
    help = "Backfill blank AttendanceRecord.work_report values from WorkSession notes."

    def add_arguments(self, parser):
        parser.add_argument('--date', help='YYYY-MM-DD — only this date (default: all)')
        parser.add_argument('--dry-run', action='store_true', help='Report what would change, write nothing')

    def handle(self, *args, **opts):
        qs = AttendanceRecord.objects.all().select_related('member')
        if opts.get('date'):
            qs = qs.filter(date=datetime.date.fromisoformat(opts['date']))

        dry = opts.get('dry_run')
        filled = 0
        scanned = 0
        for rec in qs:
            if (rec.work_report or '').strip():
                continue  # already has a report — never overwrite
            scanned += 1
            report = _compose_day_report(rec.member, rec.date)
            if not report:
                continue
            name = getattr(rec.member, 'candidate_name', rec.member_id)
            self.stdout.write(f'{"[dry] " if dry else ""}{rec.date} {name}: '
                              f'{report[:70].replace(chr(10), " / ")}...')
            if not dry:
                rec.work_report = report
                rec.save(update_fields=['work_report'])
            filled += 1

        verb = 'Would fill' if dry else 'Filled'
        self.stdout.write(self.style.SUCCESS(
            f'{verb} {filled} of {scanned} blank-report records.'
        ))
