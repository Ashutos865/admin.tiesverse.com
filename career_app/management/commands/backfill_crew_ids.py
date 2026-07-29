"""Assign a permanent Crew ID to every existing member that doesn't have one.

Deterministic order (created_at, id) → deterministic ID assignment. Each member
is processed in its own small transaction on turso_db, so a mid-run failure is
resumable (already-assigned rows are skipped by the crew_id__isnull filter) and
the series counter stays consistent. Re-running is a no-op.

    manage.py backfill_crew_ids            # apply
    manage.py backfill_crew_ids --dry-run  # report only, writes nothing

IMPORTANT: back up turso_db.sqlite3 first. career_app lives on turso_db, so this
command reads/writes there via `using('turso_db')`.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from career_app.models import (
    OnboardingSubmission, DocumentAuditLog, EMPLOYMENT_TYPE_TO_CLASS,
)

_DB = 'turso_db'

# Map the existing lowercase lifecycle status → the standard's account_status.
STATUS_TO_ACCOUNT_STATUS = {
    OnboardingSubmission.STATUS_VERIFIED: 'ACTIVE',
    OnboardingSubmission.STATUS_OFFBOARDED: 'OFFBOARDED',
    OnboardingSubmission.STATUS_PENDING: 'PENDING',
    OnboardingSubmission.STATUS_SUBMITTED: 'PENDING',
    OnboardingSubmission.STATUS_REJECTED: 'CANCELLED',
}


class Command(BaseCommand):
    help = 'Assign permanent Crew IDs to all members that lack one.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='Report what would be assigned without writing.')

    # Founder seed: these two get fixed low IDs before anyone else (user request).
    # CRW-A-0000 overrides the standard's "0000 never issued" rule deliberately.
    FOUNDER_SEED = [
        ('ashutosp865@gmail.com', 'CRW-A-0000'),
        ('hello@tiesverse.com', 'CRW-A-0001'),
    ]

    def _seed_founders(self, dry):
        """Assign the fixed founder IDs first (idempotent), then set the active
        series counter to 1 so the auto-generator continues from CRW-A-0002."""
        from career_app.crew_id import format_crew_id, is_valid_crew_id
        from career_app.models import CrewSeries
        seeded = 0
        for email, cid in self.FOUNDER_SEED:
            sub = (OnboardingSubmission.objects.using(_DB)
                   .filter(candidate_email__iexact=email).order_by('id').first())
            if not sub:
                self.stdout.write(self.style.WARNING(f'  founder {email}: NOT FOUND — skipped'))
                continue
            if sub.crew_id:
                self.stdout.write(f'  founder {email}: already has {sub.crew_id} — kept')
                continue
            if not is_valid_crew_id(cid):
                self.stdout.write(self.style.ERROR(f'  founder {email}: invalid target {cid}'))
                continue
            acct = STATUS_TO_ACCOUNT_STATUS.get(sub.status, 'PENDING')
            cls = sub.identity_class or EMPLOYMENT_TYPE_TO_CLASS.get(sub.employment_type or '', 'EMP')
            legacy = (sub.candidate_id or '').strip() or str(sub.pk)
            if dry:
                self.stdout.write(f'  [dry] founder {sub.candidate_name} ({email}) -> {cid}, class={cls}, status={acct}')
                seeded += 1
                continue
            with transaction.atomic(using=_DB):
                sub.crew_id = cid
                sub.identity_class = cls
                sub.account_status = acct
                sub.legacy_id = legacy
                sub.save(using=_DB, update_fields=['crew_id', 'identity_class', 'account_status', 'legacy_id'])
                DocumentAuditLog.objects.create(
                    submission=sub, doc_type='crew_id', action='issued',
                    performed_by_name='system (founder seed)',
                    note=f'Founder Crew ID {cid} assigned (class {cls}).',
                )
            self.stdout.write(self.style.SUCCESS(f'  founder {sub.candidate_name}: {cid}'))
            seeded += 1
        # Advance the active series counter past the seeded founders (→ next is 0002)
        # so the auto-generator never collides with 0000/0001.
        if not dry:
            series = (CrewSeries.objects.using(_DB)
                      .filter(is_active=True).order_by('created_at', 'id').first())
            if series is None:
                series = CrewSeries.objects.using(_DB).create(series_code='A', current_number=0, is_active=True)
            if series.series_code == 'A' and series.current_number < 1:
                series.current_number = 1   # 0000+0001 used → generator continues at 0002
                series.save(using=_DB, update_fields=['current_number'])
        return seeded

    def handle(self, *args, **opts):
        from career_app.crew_id import generate_crew_id  # imported here so --help is cheap

        dry = opts.get('dry_run')

        # 1) Seed the founders first (fixed IDs), advance the counter to 0002.
        self.stdout.write('Seeding founder IDs…')
        self._seed_founders(dry)

        # 2) Auto-assign everyone else (deterministic order).
        qs = (OnboardingSubmission.objects.using(_DB)
              .filter(crew_id__isnull=True)
              .order_by('created_at', 'id'))
        total = qs.count()
        self.stdout.write(f'{total} remaining member(s) without a Crew ID.')

        done = 0
        for sub in qs.iterator():
            acct_status = STATUS_TO_ACCOUNT_STATUS.get(sub.status, 'PENDING')
            cls = sub.identity_class or EMPLOYMENT_TYPE_TO_CLASS.get(sub.employment_type or '', 'EMP')
            legacy = (sub.candidate_id or '').strip() or str(sub.pk)

            if dry:
                self.stdout.write(
                    f'[dry] {sub.candidate_name} (id {sub.id}) -> '
                    f'crew_id=<next>, class={cls}, status={acct_status}, legacy_id={legacy}')
                done += 1
                continue

            with transaction.atomic(using=_DB):
                cid = generate_crew_id()
                sub.crew_id = cid
                sub.identity_class = cls
                sub.account_status = acct_status
                sub.legacy_id = legacy
                sub.save(using=_DB, update_fields=[
                    'crew_id', 'identity_class', 'account_status', 'legacy_id'])
                DocumentAuditLog.objects.create(  # router routes career_app → turso_db
                    submission=sub, doc_type='crew_id', action='issued',
                    performed_by_name='system (backfill)',
                    note=f'Crew ID {cid} backfilled (class {cls}, legacy {legacy}).',
                )
            self.stdout.write(f'{sub.candidate_name}: {cid} (class {cls}, {acct_status})')
            done += 1

        verb = 'Would assign' if dry else 'Assigned'
        self.stdout.write(self.style.SUCCESS(f'{verb} {done} Crew ID(s).'))
