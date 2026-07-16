"""Nightly: lock each member's completed work-day into a DailyWorkSummary.

Closes any session a member forgot to check out (capped at 23:59:59 of that day),
then writes one immutable snapshot per member: total minutes, session count,
first-in / last-out, and a per-task breakdown (with each assigned task's latest
progress). Idempotent — safe to re-run for the same date.

Run just after midnight for the day that just ended:
    manage.py finalize_work_day               # yesterday
    manage.py finalize_work_day --date 2026-07-08
"""
import datetime

from django.core.management.base import BaseCommand
from django.utils import timezone

from career_app.models import WorkSession, DailyWorkSummary, AttendanceRecord
from career_app.work_sessions import _compose_day_report


class Command(BaseCommand):
    help = "Finalize + lock a day's work sessions into DailyWorkSummary records."

    def add_arguments(self, parser):
        parser.add_argument('--date', help='YYYY-MM-DD (default: yesterday)')

    def handle(self, *args, **opts):
        if opts.get('date'):
            day = datetime.date.fromisoformat(opts['date'])
        else:
            day = timezone.now().date() - datetime.timedelta(days=1)

        naive_end = datetime.datetime.combine(day, datetime.time(23, 59, 59))
        day_end = timezone.make_aware(naive_end) if timezone.is_naive(naive_end) else naive_end

        # 1) Close any session left open on that day (member forgot to check out).
        auto_closed = {}
        for s in WorkSession.objects.filter(date=day, check_out__isnull=True):
            s.check_out = day_end
            s.auto_closed = True
            s.save(update_fields=['check_out', 'auto_closed'])
            auto_closed[s.member_id] = auto_closed.get(s.member_id, 0) + 1

        # 2) Roll up per member.
        by_member = {}
        for s in WorkSession.objects.filter(date=day).select_related('task', 'member'):
            e = by_member.setdefault(s.member_id, {
                'member': s.member, 'minutes': 0, 'count': 0,
                'first_in': None, 'last_out': None, 'tasks': {},
            })
            mins = s.duration_minutes
            e['minutes'] += mins
            e['count'] += 1
            if s.check_in and (e['first_in'] is None or s.check_in < e['first_in']):
                e['first_in'] = s.check_in
            if s.check_out and (e['last_out'] is None or s.check_out > e['last_out']):
                e['last_out'] = s.check_out
            if s.task_id:
                info = e['tasks'].setdefault(('task', s.task_id), {
                    'task_id': s.task_id, 'title': (s.task.title if s.task else ''),
                    'minutes': 0, 'custom': False, 'progress': (s.task.progress if s.task else 0),
                })
                info['minutes'] += mins
                if s.task:
                    info['progress'] = s.task.progress
            elif s.custom_task:
                info = e['tasks'].setdefault(('custom', s.custom_task.strip().lower()), {
                    'task_id': None, 'title': s.custom_task, 'minutes': 0, 'custom': True, 'progress': None,
                })
                info['minutes'] += mins

        # 3) Write the locked snapshots.
        now = timezone.now()
        written = 0
        for mid, e in by_member.items():
            DailyWorkSummary.objects.update_or_create(
                member=e['member'], date=day,
                defaults={
                    'total_minutes': e['minutes'],
                    'session_count': e['count'],
                    'first_check_in': e['first_in'],
                    'last_check_out': e['last_out'],
                    'auto_closed_count': auto_closed.get(mid, 0),
                    'tasks': sorted(e['tasks'].values(), key=lambda t: -t['minutes']),
                    'finalized_at': now,
                },
            )
            written += 1

            # Backfill the day-level Attendance report from the session notes, so
            # the Attendance table shows what was done even when a member forgot to
            # check out (nightly auto-close) — matching the manual-checkout path.
            report = _compose_day_report(e['member'], day)
            if report:
                rec = AttendanceRecord.objects.filter(member=e['member'], date=day).first()
                if rec and not (rec.work_report or '').strip():
                    rec.work_report = report
                    rec.save(update_fields=['work_report'])

        self.stdout.write(self.style.SUCCESS(
            f'Finalized {written} member-day summaries for {day} '
            f'({sum(auto_closed.values())} sessions auto-closed).'
        ))
