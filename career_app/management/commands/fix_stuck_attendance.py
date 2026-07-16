"""One-off: reopen day-records for members who are still actively working.

A member works several sessions a day against ONE AttendanceRecord. A bug left
check_out (and approval) frozen from a previous session's checkout, so a member
with an OPEN session still showed as "checked out / Approved" in the Attendance
table. This finds every member who currently has an open WorkSession whose
matching AttendanceRecord wrongly has check_out set, and reopens that record:
clears check_out and resets approval to pending (they're not done for the day).

Only touches records that are genuinely inconsistent (open session + check_out
set). Idempotent and non-destructive to session notes / hours.

    manage.py fix_stuck_attendance            # apply
    manage.py fix_stuck_attendance --dry-run  # preview only
"""
from django.core.management.base import BaseCommand

from career_app.models import AttendanceRecord, WorkSession


class Command(BaseCommand):
    help = "Reopen AttendanceRecords for members who still have an open work session."

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Preview, write nothing')

    def handle(self, *args, **opts):
        dry = opts.get('dry_run')
        fixed = 0
        # Every member with a currently-open session.
        open_sessions = (
            WorkSession.objects
            .filter(check_out__isnull=True)
            .select_related('member')
        )
        seen = set()
        for s in open_sessions:
            key = (s.member_id, s.date)
            if key in seen:
                continue
            seen.add(key)
            rec = AttendanceRecord.objects.filter(member=s.member, date=s.date).first()
            if not rec or rec.check_out is None:
                continue  # already consistent (open) — nothing to fix
            name = getattr(s.member, 'candidate_name', s.member_id)
            self.stdout.write(f'{"[dry] " if dry else ""}Reopen {s.date} {name} '
                              f'(was approval={rec.approval_status})')
            if not dry:
                rec.check_out = None
                rec.approval_status = AttendanceRecord.APPROVAL_PENDING
                rec.approved_by_name = ''
                rec.approved_at = None
                rec.save(update_fields=['check_out', 'approval_status',
                                        'approved_by_name', 'approved_at'])
            fixed += 1

        verb = 'Would reopen' if dry else 'Reopened'
        self.stdout.write(self.style.SUCCESS(f'{verb} {fixed} stuck record(s).'))
