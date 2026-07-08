"""Nightly: email Advisory a digest of tasks that blew past their deadline.

A task is escalated ONCE (marked with overdue_escalated_at) when its due_date is
in the past and it isn't Done/Cancelled — so Advisory is told the first night a
task goes overdue, not every night after.

    manage.py escalate_overdue_tasks
"""
from django.core.management.base import BaseCommand
from django.conf import settings
from django.utils import timezone

from career_app.models import Task, OnboardingSubmission
from config.email_utils import send_email, render_email


class Command(BaseCommand):
    help = 'Email Advisory about newly-overdue (past deadline, not Done) tasks.'

    def handle(self, *args, **opts):
        today = timezone.now().date()
        overdue = list(
            Task.objects.filter(due_date__lt=today, overdue_escalated_at__isnull=True)
            .exclude(status__in=[Task.STATUS_DONE, Task.STATUS_CANCELLED])
            .select_related('assigned_to', 'assigned_by')
        )
        if not overdue:
            self.stdout.write('No new overdue tasks to escalate.')
            return

        rows = []
        for t in overdue:
            assignee = t.assigned_to.candidate_name if t.assigned_to_id else (t.assigned_to_department or 'Unassigned')
            lead = t.assigned_by.candidate_name if t.assigned_by_id else '—'
            days = (today - t.due_date).days
            rows.append((t.title[:80], f'{assignee} · lead {lead} · due {t.due_date} · {days}d overdue · {t.progress}%'))

        html, text = render_email(
            heading='Overdue tasks need attention',
            paragraphs=[f'{len(overdue)} task(s) have passed their deadline without being completed:'],
            info_rows=rows,
            footer_note='Automated escalation from the TiesVerse task board.',
        )

        emails = list(
            OnboardingSubmission.objects.filter(status='verified', portal_role__in=['advisory', 'admin'])
            .exclude(candidate_email='')
            .values_list('candidate_email', flat=True)
        )
        fallback = getattr(settings, 'ADVISORY_ESCALATION_EMAIL', '') or getattr(settings, 'SES_FROM_EMAIL', '')
        if not emails and fallback:
            emails = [fallback]

        sent = 0
        for em in dict.fromkeys(e.lower() for e in emails if e):
            if send_email(em, f'[Advisory] {len(overdue)} overdue task(s)', html, text_body=text):
                sent += 1

        # Mark escalated so we don't nag every night.
        now = timezone.now()
        for t in overdue:
            t.overdue_escalated_at = now
            t.save(update_fields=['overdue_escalated_at'])

        self.stdout.write(self.style.SUCCESS(
            f'Escalated {len(overdue)} overdue task(s); notified {sent} advisor(s).'
        ))
