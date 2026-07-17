"""Keep certificate VERIFY records in sync with the IDs stored on members.

Every certificate ID saved on a member (OnboardingSubmission.certificate_ids)
must have a matching row in `certificate_records` so the public /verify page can
confirm it. Sends should create that record, but the flow has changed several
times, so some old IDs have a tick in the HR matrix yet fail verification
("Not found"). This command finds every member cert ID with no verify record and
creates one from the member's data (name, position, avatar, doc type).

Idempotent and non-destructive — only creates records that are missing.

    manage.py reconcile_cert_records            # apply
    manage.py reconcile_cert_records --dry-run  # report only
"""
from django.core.management.base import BaseCommand

from career_app.models import OnboardingSubmission
from config.certificate_workflow import record_certificate
from webinar_app import turso_client

DOC_LABELS = {
    'offer_letter': 'Offer Letter',
    'internship_cert': 'Internship Certificate',
    'lor': 'Letter of Recommendation',
    'noc': 'No Objection Certificate',
}


class Command(BaseCommand):
    help = "Backfill missing certificate verify records from member cert IDs."

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **opts):
        dry = opts.get('dry_run')
        if not turso_client.is_configured():
            self.stdout.write(self.style.WARNING('Turso not configured — nothing to do.'))
            return

        turso_client.setup_tables()
        fixed = scanned = 0
        members = (OnboardingSubmission.objects
                   .exclude(certificate_ids={}).exclude(certificate_ids__isnull=True))
        for m in members:
            for key, cid in (m.certificate_ids or {}).items():
                if not cid:
                    continue
                scanned += 1
                rows = turso_client.execute(
                    "SELECT certificate_id FROM certificate_records WHERE UPPER(certificate_id)=:c",
                    {'c': str(cid).upper()})
                if rows:
                    continue   # already has a verify record
                doc = DOC_LABELS.get(key, 'Certificate')
                avatar = _member_avatar(m)
                self.stdout.write(f'{"[dry] " if dry else ""}record {cid} — {m.candidate_name} · {doc}')
                if not dry:
                    record_certificate(
                        cid, m.candidate_name, doc, source_type='hr', source_ref=str(m.id),
                        person_email=m.candidate_email, position=m.role_offered or '',
                        extra={'doc_type': doc, 'avatar_url': avatar},
                    )
                fixed += 1

        verb = 'Would create' if dry else 'Created'
        self.stdout.write(self.style.SUCCESS(
            f'{verb} {fixed} missing verify record(s) (scanned {scanned} member cert IDs).'))


def _member_avatar(m):
    try:
        if hasattr(m, 'account') and m.account and m.account.user_id:
            from accounts_app.models import UserProfile
            pr = UserProfile.objects.filter(user_id=m.account.user_id).first()
            return (pr.avatar_url if pr else '') or ''
    except Exception:  # noqa: BLE001
        pass
    return ''
