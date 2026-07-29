"""Poll tracked YouTube channels for new posts — run from cron on the VPS.

Fetches each active channel's RSS, inserts new MonitorAlert rows (deduped),
and emails alerts for genuinely new competitor posts (if SMTP is configured).
Idempotent: re-running inserts nothing new.

    manage.py poll_nimble_monitor
    manage.py poll_nimble_monitor --dry-run

Suggested cron (every 5 minutes):
    */5 * * * * cd /opt/admin && .venv/bin/python manage.py poll_nimble_monitor >> /var/log/nimble_monitor.log 2>&1
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Check tracked YouTube channels for new posts and raise/mail alerts.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='Report what would be fetched without inserting alerts or emailing.')

    def handle(self, *args, **opts):
        from nimble_app.models import MonitorChannel
        from nimble_app import youtube, services

        if opts.get('dry_run'):
            channels = MonitorChannel.objects.filter(active=True, source='youtube')
            self.stdout.write(f'[dry] {channels.count()} active YouTube channel(s) would be checked:')
            for c in channels:
                try:
                    entries = youtube.fetch_youtube_entries(c.source_handle)
                    self.stdout.write(f'  {c.name} ({c.source_handle}): feed OK, {len(entries)} entries')
                except Exception as exc:  # noqa: BLE001
                    self.stdout.write(self.style.WARNING(
                        f'  {c.name} ({c.source_handle}): {youtube.friendly_fetch_error(exc)}'))
            self.stdout.write('[dry] No changes written.')
            return

        result = services.poll_channels()
        self.stdout.write(
            f"Checked {result['checked']} channel(s): "
            f"{result['new_alerts']} new alert(s), "
            f"{result['notifications_sent']} email(s) sent.")
        for err in result.get('errors', []):
            self.stdout.write(self.style.WARNING(f"  {err['channel']}: {err['message']}"))
        if result.get('ok'):
            self.stdout.write(self.style.SUCCESS('OK'))
