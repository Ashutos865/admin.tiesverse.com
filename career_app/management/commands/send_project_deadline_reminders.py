"""Email + notify project participants when a project's deadline is near.

Reminds at 3 days out, 1 day out, and on the due day, for Active/Planning projects
that have a deadline. A per-(project, days-left, date) marker row prevents sending
the same reminder twice in a day. Safe to run daily.

Schedule daily on the VPS:
    /opt/admin/.venv/bin/python /opt/admin/manage.py send_project_deadline_reminders
"""

from django.core.management.base import BaseCommand
from django.utils import timezone

from career_app.models import Project, ProjectMember, ProjectNotification


REMIND_AT = {3, 1, 0}   # days before deadline to remind


class Command(BaseCommand):
    help = "Email participants about projects whose deadline is near."

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        try:
            from config.email_utils import send_email
        except Exception:  # noqa: BLE001
            send_email = None

        today = timezone.localdate()
        dry = options['dry_run']
        batches = 0
        active = Project.objects.filter(
            status__in=[Project.STATUS_PLANNING, Project.STATUS_ACTIVE], deadline__isnull=False,
        )
        for p in active:
            days = (p.deadline - today).days
            if days not in REMIND_AT:
                continue
            marker = f"reminder:{p.id}:{days}:{today.isoformat()}"
            if ProjectNotification.objects.filter(link=marker).exists():
                continue  # already handled this bucket today

            when = 'today' if days == 0 else f"in {days} day{'s' if days != 1 else ''}"
            members = [pm.member for pm in ProjectMember.objects.filter(project=p).select_related('member') if pm.member]
            for m in members:
                if not dry:
                    ProjectNotification.objects.create(
                        recipient=m, project=p, kind=ProjectNotification.KIND_DEADLINE,
                        text=f"\"{p.title}\" is due {when}", link=f"/projects/{p.id}",
                    )
                if send_email and not dry and m.candidate_email:
                    try:
                        send_email(
                            to=m.candidate_email,
                            subject=f'[Project] "{p.title}" is due {when}',
                            html_body=(f"<p>Hi {m.candidate_name},</p>"
                                       f"<p>The project <strong>{p.title}</strong> is due {when} ({p.deadline}).</p>"
                                       f"<p>Open it in the admin panel → Projects.</p>"),
                        )
                    except Exception as exc:  # noqa: BLE001
                        self.stderr.write(f"  email to {m.candidate_email} failed: {exc}")

            # dedupe marker (read, hidden from the bell by its empty text + link marker)
            if not dry and members:
                ProjectNotification.objects.create(
                    recipient=members[0], project=p, kind=ProjectNotification.KIND_DEADLINE,
                    text='', link=marker, is_read=True,
                )
            self.stdout.write(f"  {'[dry] ' if dry else ''}project {p.id} '{p.title}': due {when}, {len(members)} people")
            batches += 1

        self.stdout.write(self.style.SUCCESS(f"{'[dry-run] ' if dry else ''}Done. {batches} reminder batch(es)."))
