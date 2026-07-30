"""Poll tracked competitor accounts for new posts — run from cron on the VPS.

Checks every active channel on an ENABLED platform (settings.NIMBLE_ENABLED_SOURCES,
default youtube + x), inserts new MonitorAlert rows (deduped), and emails alerts for
genuinely new competitor posts (if SMTP is configured). Idempotent: re-running
inserts nothing new.

    manage.py poll_nimble_monitor
    manage.py poll_nimble_monitor --dry-run
    manage.py poll_nimble_monitor --source x

Suggested cron (every 5 minutes):
    */5 * * * * cd /opt/admin && .venv/bin/python manage.py poll_nimble_monitor >> /var/log/tiesverse-nimble.log 2>&1
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Check tracked competitor accounts (YouTube/X) for new posts and raise/mail alerts.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='Report what would be fetched without inserting alerts or emailing.')
        parser.add_argument('--source', default=None,
                            help='Limit to one platform (youtube, x, instagram).')

    def handle(self, *args, **opts):
        from nimble_app.models import MonitorChannel
        from nimble_app import services, platforms

        only_source = platforms.normalize_source(opts.get('source')) if opts.get('source') else None
        enabled = platforms.enabled_sources()
        self.stdout.write(f"Enabled platforms: {', '.join(enabled)}")

        if opts.get('dry_run'):
            channels = MonitorChannel.objects.filter(active=True, source__in=enabled)
            if only_source:
                channels = channels.filter(source=only_source)
            self.stdout.write(f'[dry] {channels.count()} active channel(s) would be checked:')
            for c in channels:
                label = platforms.platform_label(c.source)
                fetcher = services.FETCHERS.get(c.source)
                if not fetcher:
                    self.stdout.write(f'  [{label}] {c.name}: no fetcher, skipped')
                    continue
                try:
                    entries = fetcher(c.source_handle)
                    self.stdout.write(
                        f'  [{label}] {c.name} ({c.source_handle}): OK, {len(entries)} entries')
                except Exception as exc:  # noqa: BLE001
                    self.stdout.write(self.style.WARNING(
                        f'  [{label}] {c.name} ({c.source_handle}): '
                        f'{platforms.friendly_fetch_error(c.source, exc)}'))
            self.stdout.write('[dry] No changes written.')
            return

        result = services.poll_channels(only_source=only_source)
        self.stdout.write(
            f"Checked {result['checked']} channel(s): "
            f"{result['new_alerts']} new alert(s), "
            f"{result['notifications_sent']} email(s) sent.")
        for err in result.get('errors', []):
            self.stdout.write(self.style.WARNING(
                f"  [{err.get('source', '?')}] {err['channel']}: {err['message']}"))

        # Surface silently-degrading scrapers (X/IG can "succeed" but return nothing).
        health = services.health()
        if health['channels']:
            self.stdout.write(self.style.ERROR(
                f"UNHEALTHY: {len(health['channels'])} channel(s) failed "
                f"{health['unhealthy_after']}+ checks in a row — monitoring may be broken:"))
            for c in health['channels']:
                self.stdout.write(self.style.ERROR(
                    f"  [{c['platform']}] {c['name']}: {c['consecutive_failures']} failures"
                    + (f" — {c['last_error']}" if c['last_error'] else ' — returned no posts')))

        if result.get('ok'):
            self.stdout.write(self.style.SUCCESS('OK'))
