"""Continuously recover payments the webhook did not deliver.

Three payments were captured by Razorpay and left unrecorded in one day, each
found only because somebody went looking. The webhook is the intended safety
net, but it depends on a shared secret matching at both ends and on Razorpay
being able to reach us — neither of which fails loudly. A payment silently
missing is the worst kind of bug here: the customer is charged, gets nothing,
and nobody finds out until they complain.

So this runs on a timer and does not care why the webhook missed. It asks
Razorpay what really happened to every recent unsettled order and repairs
whatever was actually paid.

Scoped to recent rows so it stays cheap enough to run every few minutes; the
full `reconcile_payments` sweep remains available for a complete audit.

    python manage.py autosync_payments               # last 24h
    python manage.py autosync_payments --hours 72
    python manage.py autosync_payments --quiet       # for cron
"""
import datetime
import logging

from django.core.management.base import BaseCommand

from webinar_app import razorpay_client, turso_client

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Recover recently captured payments the webhook did not record.'

    def add_arguments(self, parser):
        parser.add_argument('--hours', type=int, default=24,
                            help='How far back to look (default 24).')
        parser.add_argument('--quiet', action='store_true',
                            help='Print only when something was repaired.')

    def handle(self, *args, **opts):
        quiet = opts['quiet']
        if not turso_client.is_configured():
            return

        cutoff = (datetime.datetime.utcnow()
                  - datetime.timedelta(hours=opts['hours'])).isoformat()

        try:
            rows = turso_client.execute(
                "SELECT * FROM registrations "
                "WHERE razorpay_order_id IS NOT NULL AND razorpay_order_id <> '' "
                "AND payment_status IN ('pending','failed','created') "
                "AND registered_at >= :cutoff ORDER BY id",
                {'cutoff': cutoff}) or []
        except turso_client.TursoError as exc:
            logger.warning('autosync: could not read registrations: %s', exc)
            return

        if not quiet:
            self.stdout.write('autosync: %d recent unsettled order(s)' % len(rows))

        repaired = 0
        for row in rows:
            oid = (row.get('razorpay_order_id') or '').strip()
            if not oid:
                continue
            try:
                payments = razorpay_client.order_payments(oid)
            except Exception as exc:  # noqa: BLE001
                logger.warning('autosync: Razorpay unreachable for %s: %s', oid, exc)
                continue

            captured = next(
                (p for p in payments if p.get('status') in ('captured', 'authorized')),
                None)
            if not captured:
                continue

            pid = captured.get('id') or ''
            try:
                turso_client.execute(
                    "UPDATE registrations "
                    "SET payment_status='paid', razorpay_payment_id=:pid "
                    "WHERE id=:id AND payment_status != 'paid' "
                    "AND payment_status != 'refunded'",
                    {'pid': pid, 'id': row.get('id')})
            except turso_client.TursoError as exc:
                logger.error('autosync: write failed for row %s: %s', row.get('id'), exc)
                continue

            repaired += 1
            # Loud on purpose: a recovered payment means the webhook failed, and
            # that should be visible in the logs rather than quietly patched.
            logger.warning('autosync: RECOVERED payment %s for registration %s (%s) '
                           '— the webhook did not deliver this',
                           pid, row.get('id'), row.get('email'))
            self.stdout.write(self.style.WARNING(
                'RECOVERED  #%s  %s  %s  Rs.%s' % (
                    row.get('id'), (row.get('email') or '')[:34], pid,
                    int(captured.get('amount') or 0) / 100.0)))

            try:
                fresh = turso_client.execute(
                    'SELECT * FROM registrations WHERE id=:id LIMIT 1',
                    {'id': row.get('id')}) or []
            except turso_client.TursoError:
                fresh = []
            if not fresh:
                continue
            reg = fresh[0]

            try:
                from webinar_app.views import (
                    _add_paid_registrant_to_meeting, send_registration_confirmation)
                link = _add_paid_registrant_to_meeting(reg)
                ok = send_registration_confirmation(
                    to_email=reg.get('email', ''),
                    name=reg.get('name', 'Guest'),
                    event_title=reg.get('event_title', ''),
                    event_type=reg.get('event_type', 'event'),
                    meeting_link=link,
                )
                if ok:
                    try:
                        turso_client.execute(
                            'UPDATE registrations SET email_sent=1 WHERE id=:id',
                            {'id': reg.get('id')})
                    except turso_client.TursoError:
                        pass
                self.stdout.write('           seat granted, confirmation %s'
                                  % ('sent' if ok else 'FAILED'))
            except Exception as exc:  # noqa: BLE001
                logger.exception('autosync: post-payment steps failed for %s: %s',
                                 reg.get('id'), exc)

        if repaired or not quiet:
            self.stdout.write('autosync: repaired %d' % repaired)
