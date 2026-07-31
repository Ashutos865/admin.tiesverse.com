"""Pull inbound TIES Mail from S3 into the portal.

AWS SES writes every message for *@mail.tiesverse.com into the inbound bucket;
this command parses those objects into MailMessage rows and clears the bucket.

Cron on the VPS (every 2 minutes):

    */2 * * * * cd /opt/admin && .venv/bin/python manage.py ingest_portal_mail >> /var/log/tiesverse-mail.log 2>&1

Options:
    --dry-run   parse and report, but write nothing and keep the S3 objects
    --keep      ingest normally but leave the S3 objects in place (debugging)
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Ingest inbound TIES Mail from the SES S3 bucket into portal mailboxes.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='Report what would be ingested without writing.')
        parser.add_argument('--keep', action='store_true',
                            help='Ingest but do not delete the S3 objects.')

    def handle(self, *args, **options):
        # Imported here so the module loads even if boto3/settings are unavailable.
        from mail_app import ingest

        dry = options['dry_run']

        if dry:
            s3 = ingest._client()
            pending = []
            paginator = s3.get_paginator('list_objects_v2')
            for page in paginator.paginate(Bucket=ingest.BUCKET, Prefix=ingest.PREFIX):
                for obj in page.get('Contents', []):
                    if not obj['Key'].endswith('/'):
                        pending.append(obj)
            if not pending:
                self.stdout.write('[dry] No mail waiting in S3.')
                return
            self.stdout.write(f'[dry] {len(pending)} object(s) waiting:')
            for o in pending:
                name = o['Key'].rsplit('/', 1)[-1]
                marker = '  (SES setup marker — skipped)' if name in ingest.SKIP_KEYS else ''
                self.stdout.write(f"  {o['Key']}  {o['Size']}B  "
                                  f"{o['LastModified']:%d %b %H:%M}{marker}")
            self.stdout.write('[dry] Nothing written.')
            return

        result = ingest.ingest_all(delete=not options['keep'])

        for m in result['messages']:
            self.stdout.write(self.style.SUCCESS(
                f"  {m['note']}  from {m['from']}  \"{m['subject'][:60]}\""))
        for e in result['errors']:
            self.stdout.write(self.style.ERROR(f"  ERROR {e['key']}: {e['error']}"))

        summary = (f"checked={result['checked']} ingested={result['ingested']} "
                   f"skipped={result['skipped']} errors={len(result['errors'])}")
        if result['errors']:
            self.stdout.write(self.style.WARNING(summary))
        elif result['ingested']:
            self.stdout.write(self.style.SUCCESS(summary))
        else:
            self.stdout.write(summary)
