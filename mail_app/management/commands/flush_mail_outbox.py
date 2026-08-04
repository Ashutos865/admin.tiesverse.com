"""Send scheduled mail whose time has come, and tidy up after abandoned drafts.

Runs beside the inbound ingest on the VPS, every minute:

    * * * * * cd /opt/admin && .venv/bin/python manage.py flush_mail_outbox \
              >> /var/log/tiesverse-mail.log 2>&1

The cadence is how late a scheduled message can be, so keep it at one minute.
An ordinary send does not wait for this: the composer releases its own message
when the undo window closes, and this is the safety net for a browser that was
closed in between.
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from mail_app import bulk, services, storage
from mail_app.models import MailAttachment

# How long an uploaded file may sit unattached before it is assumed abandoned.
ORPHAN_AFTER_DAYS = 7


class Command(BaseCommand):
    help = 'Send due scheduled mail and remove attachments from abandoned drafts.'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=100,
                            help='Maximum messages to send in one run.')
        parser.add_argument('--bulk-batch', type=int, default=25,
                            help='How many bulk recipients to handle per run.')
        parser.add_argument('--no-sweep', action='store_true',
                            help='Skip the orphaned-attachment cleanup.')

    def handle(self, *args, **opts):
        sent, failed = services.flush_due_messages(limit=opts['limit'])
        if sent or failed:
            self.stdout.write(f'sent {sent}, failed {failed}')

        # One bulk job per run, capped, so a large send shares the minute with
        # ordinary mail instead of blocking it.
        job = bulk.claim_next_job()
        if job is not None:
            result = bulk.run_job(job, limit=opts['bulk_batch'])
            self.stdout.write(
                f'bulk #{job.id} “{job.name or job.subject[:40]}”: '
                f'{result["sent"]} sent, {result["failed"]} failed, now {result["status"]} '
                f'({job.cursor}/{job.total})')

        if opts['no_sweep']:
            return

        # An attachment with no message and no draft belongs to a compose window
        # somebody closed. The row is cheap; the object in R2 is not.
        cutoff = timezone.now() - timedelta(days=ORPHAN_AFTER_DAYS)
        orphans = MailAttachment.objects.filter(
            message__isnull=True, draft__isnull=True, bulk_job__isnull=True,
            created_at__lt=cutoff,
        )[:200]
        removed = 0
        for att in list(orphans):
            storage.delete(att.storage_key)
            att.delete()
            removed += 1
        if removed:
            self.stdout.write(f'swept {removed} orphaned attachment(s)')
