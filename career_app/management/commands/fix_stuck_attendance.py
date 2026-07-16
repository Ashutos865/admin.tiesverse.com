"""DEPRECATED — no-op.

This command used to reopen a member's day-level AttendanceRecord (clear
check_out and reset approval to pending) when they had an open session. That is
now the WRONG behaviour: approval lives PER SESSION, so resetting the day
record's approval would wipe an already-reviewed earlier session. The live
Attendance view reads per-session state directly, so there is nothing to "fix"
at the day level. Kept as an inert command so any references / muscle-memory
invocations don't error.
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "(Deprecated, no-op) Per-session approval replaced this command."

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **opts):
        self.stdout.write(self.style.WARNING(
            'fix_stuck_attendance is deprecated and does nothing. Approval is now '
            'per-session; the Attendance view reflects live session state directly.'
        ))
