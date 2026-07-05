"""Revoke portal access for every member whose approved offboarding last working
day has passed. Run daily from cron / Windows Task Scheduler for hands-off exits:

    python manage.py revoke_expired_offboarding

The member's record is kept — only their login is disabled.
"""
from django.core.management.base import BaseCommand

from career_app import offboarding


class Command(BaseCommand):
    help = "Revoke access for members whose offboarding last working day has passed."

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='Show who would be revoked without changing anything.')

    def handle(self, *args, **options):
        from django.utils import timezone
        from career_app.models import OffboardingRequest

        today = timezone.now().date()
        due = OffboardingRequest.objects.filter(
            status=OffboardingRequest.STATUS_APPROVED,
            last_working_day__isnull=False,
            last_working_day__lte=today,
        ).select_related('member')

        if options['dry_run']:
            for off in due:
                self.stdout.write(f"would revoke: {off.member.candidate_name} (last day {off.last_working_day})")
            self.stdout.write(self.style.WARNING(f"{due.count()} member(s) due for revocation (dry run)."))
            return

        count = offboarding.revoke_expired(today=today)
        self.stdout.write(self.style.SUCCESS(f"Revoked access for {count} member(s)."))
