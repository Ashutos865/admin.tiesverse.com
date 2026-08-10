"""Flip webinars/workshops to 'past' once their date has gone, and publish
their guests to the website guest list.

Run from cron. Events whose free-text date can't be parsed and that have no
meeting_start are left alone — flipping on a guess would pull a live listing.
"""
from django.core.management.base import BaseCommand

from tiesverse_app import supabase_sync
from tiesverse_app.event_time import event_start, has_ended
from tiesverse_app.guests import publish_event_guests
from tiesverse_app.models import EventRegistration


class Command(BaseCommand):
    help = "Mark ended events as past and publish their guests"

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='report what would change without changing it')

    def handle(self, *args, **opts):
        dry = opts['dry_run']
        flipped = published = unparsed = 0
        for ev in EventRegistration.objects.filter(status='upcoming'):
            if event_start(ev) is None:
                unparsed += 1
                self.stdout.write(f'  ? "{ev.title}" — date "{ev.date}" not parseable, left upcoming')
                continue
            if not has_ended(ev):
                continue
            if dry:
                n = ev.guests.filter(published=False).count()
                self.stdout.write(f'  would flip "{ev.title}" to past (+{n} guest(s) to publish)')
                flipped += 1
                continue
            ev.status = 'past'
            ev.save(update_fields=['status'])
            supabase_sync.upsert(ev)
            n = publish_event_guests(ev)
            flipped += 1
            published += n
            self.stdout.write(f'  ✓ "{ev.title}" → past, {n} guest(s) now on the website')
        self.stdout.write(self.style.SUCCESS(
            f'{flipped} event(s) flipped, {published} guest(s) published, {unparsed} unparseable'))
