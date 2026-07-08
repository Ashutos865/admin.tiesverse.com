"""Erase group chat + direct messages for projects that ended > N days ago.

A project's chats/DMs are purged `chat_purge_after_days` (default 15) after it is
marked Completed. The project, its tasks, checklist, members and history are kept —
only the conversations are removed. Idempotent; safe to run daily.

Schedule (VPS), e.g. a daily cron or systemd timer:
    /opt/admin/.venv/bin/python /opt/admin/manage.py purge_expired_project_chats
"""

from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone

from career_app.models import Project, ProjectMessage, DirectMessage


class Command(BaseCommand):
    help = "Delete chat + DMs for projects completed more than their purge window ago."

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Report what would be deleted, delete nothing.')

    def handle(self, *args, **options):
        now = timezone.now()
        dry = options['dry_run']
        purged_projects = 0
        total_msgs = 0
        total_dms = 0

        completed = Project.objects.filter(
            status=Project.STATUS_COMPLETED, completed_at__isnull=False,
        )
        for p in completed:
            window = timedelta(days=p.chat_purge_after_days or 15)
            if p.completed_at + window > now:
                continue  # still within the retention window
            msgs = ProjectMessage.objects.filter(project=p)
            dms = DirectMessage.objects.filter(project=p)
            nm, nd = msgs.count(), dms.count()
            if nm == 0 and nd == 0:
                continue
            if dry:
                self.stdout.write(f"  [dry-run] project {p.id} '{p.title}': would delete {nm} messages, {nd} DMs")
            else:
                msgs.delete()
                dms.delete()
                self.stdout.write(f"  project {p.id} '{p.title}': deleted {nm} messages, {nd} DMs")
            purged_projects += 1
            total_msgs += nm
            total_dms += nd

        self.stdout.write(self.style.SUCCESS(
            f"{'[dry-run] ' if dry else ''}Done. {purged_projects} project(s), {total_msgs} messages, {total_dms} DMs."))
