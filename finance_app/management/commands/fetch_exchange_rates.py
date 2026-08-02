"""Store today's exchange rates so INR conversion never depends on a live call.

The European Central Bank publishes once per working day around 16:00 CET, so
this runs after that. On a weekend or holiday the feed returns the last working
day's rates, which is correct behaviour — there is no newer number to have.

    30 21 * * * cd /opt/admin && .venv/bin/python manage.py fetch_exchange_rates >> /var/log/tiesverse-fx.log 2>&1

Failure is not fatal: conversion falls back to the most recent stored rate, and
anything with no rate at all is flagged rather than counted as zero.
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Fetch and store currency exchange rates (Frankfurter / ECB).'

    def add_arguments(self, parser):
        parser.add_argument('--date', help='Fetch a specific date (YYYY-MM-DD).')
        parser.add_argument('--dry-run', action='store_true',
                            help='Show the rates without storing them.')

    def handle(self, *args, **options):
        from datetime import date
        from finance_app import currency

        on = None
        if options.get('date'):
            try:
                on = date.fromisoformat(options['date'])
            except ValueError:
                self.stdout.write(self.style.ERROR('Date must be YYYY-MM-DD.'))
                return

        rates, api_date = currency.fetch_rates(on)
        if not rates:
            self.stdout.write(self.style.WARNING(
                'Could not reach the rate feed. Existing rates remain in use.'))
            return

        for cur, rate in sorted(rates.items()):
            self.stdout.write(f'  1 {cur} = Rs {rate}')

        if options['dry_run']:
            self.stdout.write(self.style.WARNING(f'[dry] {len(rates)} rate(s), nothing stored.'))
            return

        stored_date = date.fromisoformat(api_date) if api_date else (on or date.today())
        n = currency.store_rates(rates, stored_date)
        self.stdout.write(self.style.SUCCESS(f'Stored {n} rate(s) for {stored_date}.'))
