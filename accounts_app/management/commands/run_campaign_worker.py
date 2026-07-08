"""Always-on background worker that sends queued email campaigns.

Runs as a systemd service (see deploy notes). It polls the DB for campaigns in
'queued' or 'running' state and processes them one at a time — checkpointing
progress after every recipient so a restart resumes exactly where it left off,
without re-sending anyone. Keeping this out of the web process is what makes a
big send survive both the browser tab closing and a server restart.
"""

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Process queued/interrupted email campaigns (durable background worker)."

    def add_arguments(self, parser):
        parser.add_argument('--poll', type=float, default=3.0,
                            help='Seconds to wait between polls when idle (default: 3).')
        parser.add_argument('--once', action='store_true',
                            help='Process a single pending campaign then exit (for testing).')

    def handle(self, *args, **opts):
        from accounts_app.campaign_jobs import run_worker_forever, run_worker_once
        if opts.get('once'):
            worked = run_worker_once()
            self.stdout.write(self.style.SUCCESS('Processed one campaign.') if worked
                              else 'Nothing to process.')
            return
        self.stdout.write(self.style.SUCCESS('Campaign worker started — waiting for jobs…'))
        run_worker_forever(poll_seconds=opts.get('poll') or 3.0)
