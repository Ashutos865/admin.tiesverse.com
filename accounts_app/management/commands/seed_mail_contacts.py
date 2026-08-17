"""Build the master contact sheet from the data we already hold.

Two sources, in order of trust:

  1. The webinar registration ledger — people who typed their own details in.
     Richest record: name, phone, city, country, attribution.
  2. The email send log — the 1,035 who were mailed the invite. Address and
     name only, but it is how most of the list got here.

Idempotent by design: running it twice must not create a second copy of anyone,
because it will be run again every time the ledger moves. Existing contacts are
enriched, never blanked, and a status is never reset — someone who unsubscribed
stays unsubscribed no matter how many times this runs.

    python manage.py seed_mail_contacts --dry-run
    python manage.py seed_mail_contacts
"""
import logging

from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts_app.models import EmailSendLog, MailContact, MailContactEvent

logger = logging.getLogger(__name__)

# Addresses that are obviously not people. Kept as 'junk' rather than deleted so
# they cannot be silently re-imported by the next run.
JUNK_MARKERS = ('test@', 'example.com', 'noreply', 'no-reply', 'donotreply')

# Domains that are almost certainly typos of real ones. Flagged, not corrected:
# guessing what somebody meant and mailing the guess is worse than not mailing.
TYPO_DOMAINS = ('gmail.co', 'gmial.com', 'gmai.com', 'gmail.cm', 'gmail.con',
                'yahoo.co', 'hotmail.co', 'outlok.com', 'gmil.com')


class Command(BaseCommand):
    help = 'Seed / refresh the master contact sheet from registrations and the send log.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='Report what would change without writing.')

    def handle(self, *args, **opts):
        dry = opts['dry_run']
        created = updated = events = skipped = 0

        def classify(email):
            low = email.lower()
            if any(m in low for m in JUNK_MARKERS):
                return MailContact.JUNK, 'looks like a test address'
            domain = low.rsplit('@', 1)[-1] if '@' in low else ''
            if domain in TYPO_DOMAINS:
                return MailContact.BOUNCED, f'probable typo domain: {domain}'
            return MailContact.ACTIVE, ''

        # ── 1. the registration ledger ──────────────────────────────────────
        rows = []
        try:
            from webinar_app import turso_client
            if turso_client.is_configured():
                rows = turso_client.execute(
                    'SELECT name,email,phone,city,country,event_id,event_title,'
                    'event_date,registered_at,utm_source,utm_medium,utm_campaign,'
                    'utm_content,referrer FROM registrations ORDER BY id') or []
        except Exception as exc:  # noqa: BLE001
            self.stderr.write(self.style.WARNING('Could not read registrations: %s' % exc))

        self.stdout.write('Registration rows: %d' % len(rows))

        for r in rows:
            email = (r.get('email') or '').strip().lower()
            if not email or '@' not in email:
                skipped += 1
                continue

            status, reason = classify(email)
            contact = MailContact.objects.filter(email=email).first()
            is_new = contact is None

            if dry:
                created += 1 if is_new else 0
                updated += 0 if is_new else 1
                continue

            if is_new:
                contact = MailContact(email=email,
                                      unsubscribe_token=MailContact.new_token(),
                                      status=status, status_reason=reason)
                if status != MailContact.ACTIVE:
                    contact.status_changed_at = timezone.now()
                created += 1
            else:
                updated += 1

            # Fill gaps only. A later registration with a blank phone must not
            # erase the number an earlier one gave us.
            for field, key in (('name', 'name'), ('phone', 'phone'),
                               ('city', 'city'), ('country', 'country'),
                               ('utm_source', 'utm_source'), ('utm_medium', 'utm_medium'),
                               ('utm_campaign', 'utm_campaign'),
                               ('utm_content', 'utm_content'), ('referrer', 'referrer')):
                value = (str(r.get(key) or '')).strip()
                if value and not getattr(contact, field, ''):
                    setattr(contact, field, value[:300])

            contact.save()

            event_key = (r.get('event_id') or r.get('event_title') or '').strip()
            if event_key:
                _, made = MailContactEvent.objects.get_or_create(
                    contact=contact, event_key=event_key[:200],
                    defaults={
                        'event_title': (r.get('event_title') or '')[:300],
                        'event_date': (r.get('event_date') or '')[:80],
                    })
                if made:
                    events += 1

        # ── 2. the send log ─────────────────────────────────────────────────
        mailed = (EmailSendLog.objects.values_list('recipient_email', 'recipient_name')
                  .distinct())
        seen = set()
        log_new = 0
        for email, name in mailed:
            email = (email or '').strip().lower()
            if not email or '@' not in email or email in seen:
                continue
            seen.add(email)
            if MailContact.objects.filter(email=email).exists():
                continue
            status, reason = classify(email)
            log_new += 1
            if dry:
                continue
            MailContact.objects.create(
                email=email, name=(name or '')[:200],
                unsubscribe_token=MailContact.new_token(),
                status=status, status_reason=reason,
                status_changed_at=timezone.now() if status != MailContact.ACTIVE else None,
            )

        self.stdout.write('')
        self.stdout.write('=' * 60)
        self.stdout.write('  from registrations — new      : %d' % created)
        self.stdout.write('  from registrations — enriched : %d' % updated)
        self.stdout.write('  from the send log  — new      : %d' % log_new)
        self.stdout.write('  webinar links recorded        : %d' % events)
        self.stdout.write('  rows skipped (no address)     : %d' % skipped)
        if not dry:
            self.stdout.write('  ' + '-' * 56)
            for st, _label in MailContact.STATUS_CHOICES:
                self.stdout.write('  %-30s %d' % (
                    st, MailContact.objects.filter(status=st).count()))
            self.stdout.write('  %-30s %d' % ('TOTAL CONTACTS',
                                              MailContact.objects.count()))
        else:
            self.stdout.write('  [dry run — nothing written]')
        self.stdout.write('=' * 60)
