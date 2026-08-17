"""Catch payments Razorpay captured but our registration rows never recorded.

Both normal paths can miss a payment:

  * `verify_payment` only runs if the browser comes back from checkout. On UPI
    the payer often finishes in their bank app and never returns, so it doesn't.
  * the `payment.captured` webhook is the server-to-server backstop, but it only
    helps once the URL is registered in the Razorpay dashboard, and it can be
    down or misconfigured without anyone noticing.

When both miss, we have taken the money and the registrant has no seat — which
is exactly what happened to two people on 16 Aug 2026. This command asks
Razorpay directly about every unpaid row that reached checkout and repairs the
ones that really were paid. It is the safety net that does not depend on either
of the other two working.

Marking the row paid is only half the job: the registrant still has to reach the
meeting. `_add_paid_registrant_to_meeting` is the same helper `verify_payment`
and the webhook both call, so a reconciled registration ends up identical to one
that completed normally — same guest-list entry, same email.

Safe to run repeatedly: rows already `paid` are skipped, and the guest-list
helper is itself idempotent.

    python manage.py reconcile_payments --dry-run   # report only, writes nothing
    python manage.py reconcile_payments             # repair
"""
import logging

from django.core.management.base import BaseCommand

from webinar_app import razorpay_client, turso_client

logger = logging.getLogger(__name__)

# Statuses worth asking Razorpay about. 'paid' is settled; 'refunded' has moved
# past capture and must never be dragged back to paid by a stale event.
UNSETTLED = ('pending', 'failed', 'created', '')


class Command(BaseCommand):
    help = 'Find Razorpay payments that were captured but never recorded, and repair them.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Report what would change without writing anything.')
        parser.add_argument(
            '--no-email', action='store_true',
            help='Repair the row but do not add to the meeting or send the link.')
        parser.add_argument(
            '--order', default='',
            help='Reconcile a single razorpay order id instead of scanning.')
        parser.add_argument(
            '--notify-missing', action='store_true',
            help='Send the confirmation to anyone already paid whose email_sent '
                 'is 0 — repairs registrations that were marked paid without '
                 'anybody being told.')

    def _notify_missing(self, dry):
        """Tell people who are paid in our records but were never informed.

        A row can reach 'paid' without anybody hearing about it — a reconciled
        payment, or a send that failed at the time. `email_sent` is the flag for
        exactly this, so anyone paid with email_sent=0 is owed a confirmation.
        """
        rows = turso_client.execute(
            "SELECT * FROM registrations "
            "WHERE payment_status='paid' "
            "AND (email_sent IS NULL OR email_sent=0) ORDER BY id") or []

        self.stdout.write('Paid registrants never informed: %d' % len(rows))
        sent = 0
        for reg in rows:
            who = reg.get('email') or '?'
            self.stdout.write('  #%-4s %-34s %s' % (
                reg.get('id'), who[:34], reg.get('event_title', '')[:30]))
            if dry:
                continue
            try:
                from webinar_app.views import (
                    _add_paid_registrant_to_meeting,
                    send_registration_confirmation,
                )
                link = _add_paid_registrant_to_meeting(reg)
                ok = send_registration_confirmation(
                    to_email=reg.get('email', ''),
                    name=reg.get('name', 'Guest'),
                    event_title=reg.get('event_title', ''),
                    event_type=reg.get('event_type', 'event'),
                    meeting_link=link,
                )
                if ok:
                    sent += 1
                    try:
                        turso_client.execute(
                            'UPDATE registrations SET email_sent=1 WHERE id=:id',
                            {'id': reg.get('id')})
                    except turso_client.TursoError:
                        pass
                self.stdout.write(
                    '      guest list %s, confirmation %s' % (
                        'ok' if link else 'no link yet', 'sent' if ok else 'FAILED'))
            except Exception as exc:  # noqa: BLE001
                self.stderr.write(self.style.WARNING('      failed: %s' % exc))

        self.stdout.write('')
        self.stdout.write('  confirmations sent: %d%s' % (
            sent, '  [dry run — nothing sent]' if dry else ''))

    def handle(self, *args, **opts):
        dry = opts['dry_run']
        if not turso_client.is_configured():
            self.stderr.write(self.style.ERROR('Turso is not configured; nothing to do.'))
            return

        if opts['notify_missing']:
            self._notify_missing(dry)
            return

        if opts['order']:
            rows = turso_client.execute(
                'SELECT * FROM registrations WHERE razorpay_order_id=:oid',
                {'oid': opts['order']}) or []
        else:
            # Only rows that actually reached checkout can have a captured payment.
            marks = ','.join(":s%d" % i for i in range(len(UNSETTLED)))
            params = {("s%d" % i): v for i, v in enumerate(UNSETTLED)}
            rows = turso_client.execute(
                "SELECT * FROM registrations "
                "WHERE razorpay_order_id IS NOT NULL AND razorpay_order_id <> '' "
                "AND (payment_status IN (%s) OR payment_status IS NULL) "
                "ORDER BY id" % marks, params) or []

        self.stdout.write('Checking %d unsettled order(s) against Razorpay…' % len(rows))

        repaired = abandoned = failed = errors = 0

        for row in rows:
            oid = (row.get('razorpay_order_id') or '').strip()
            if not oid:
                continue

            try:
                payments = razorpay_client.order_payments(oid)
            except Exception as exc:  # noqa: BLE001 — one bad order must not stop the sweep
                errors += 1
                self.stderr.write(self.style.WARNING(
                    '  row #%s (%s): could not reach Razorpay — %s' % (
                        row.get('id'), oid, exc)))
                continue

            captured = next(
                (p for p in payments if p.get('status') in ('captured', 'authorized')),
                None)

            if not captured:
                if any(p.get('status') == 'failed' for p in payments):
                    failed += 1
                else:
                    abandoned += 1
                continue

            pid = captured.get('id') or ''
            amount = int(captured.get('amount') or 0)
            who = row.get('email') or row.get('name') or '?'

            self.stdout.write(self.style.WARNING(
                '  UNRECORDED  row #%-4s %-32s %s  %s  Rs.%s' % (
                    row.get('id'), who[:32], pid, captured.get('status'),
                    amount / 100.0)))

            if dry:
                repaired += 1
                continue

            try:
                # Guarded on status so a row someone settled in the meantime —
                # or refunded — is never overwritten by this sweep.
                turso_client.execute(
                    "UPDATE registrations "
                    "SET payment_status='paid', razorpay_payment_id=:pid "
                    "WHERE id=:id AND payment_status != 'paid' "
                    "AND payment_status != 'refunded'",
                    {'pid': pid, 'id': row.get('id')})
            except turso_client.TursoError as exc:
                errors += 1
                self.stderr.write(self.style.ERROR(
                    '    write failed for row #%s: %s' % (row.get('id'), exc)))
                continue

            repaired += 1
            logger.info('Reconciled registration %s -> paid (%s)', row.get('id'), pid)

            if opts['no_email']:
                self.stdout.write('    marked paid (meeting invite skipped)')
                continue

            # Re-read so the helper sees the row as it now stands.
            try:
                fresh = turso_client.execute(
                    'SELECT * FROM registrations WHERE id=:id LIMIT 1',
                    {'id': row.get('id')}) or []
            except turso_client.TursoError:
                fresh = []

            if fresh:
                reg = fresh[0]
                try:
                    # Two separate jobs, as in `verify_payment`: the helper only
                    # puts them on the Google Calendar guest list and hands back
                    # the link — it does not tell anybody. Without the send that
                    # follows, a reconciled registrant is paid, seated, and
                    # never informed, which is how this repair first ran.
                    from webinar_app.views import (
                        _add_paid_registrant_to_meeting,
                        send_registration_confirmation,
                    )
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
                    self.stdout.write(self.style.SUCCESS(
                        '    repaired: seat granted%s, confirmation %s' % (
                            ' (link ready)' if link else ' (no meeting link yet)',
                            'sent' if ok else 'NOT sent')))
                except Exception as exc:  # noqa: BLE001 — the money fix already landed
                    self.stderr.write(self.style.WARNING(
                        '    row fixed but invite/confirmation failed: %s' % exc))

        self.stdout.write('')
        self.stdout.write('=' * 62)
        self.stdout.write('  repaired (captured but unrecorded) : %d%s' % (
            repaired, '  [dry run — nothing written]' if dry else ''))
        self.stdout.write('  genuinely failed                   : %d' % failed)
        self.stdout.write('  abandoned before paying            : %d' % abandoned)
        if errors:
            self.stdout.write(self.style.WARNING('  errors                             : %d' % errors))
        self.stdout.write('=' * 62)
