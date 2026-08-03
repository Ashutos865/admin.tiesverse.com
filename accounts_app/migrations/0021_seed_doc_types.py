"""Seed the four built-in document types the HR matrix already tracks."""
from django.db import migrations

BUILTIN = [
    ('offer_letter',    'Offer Letter'),
    ('internship_cert', 'Internship Certificate'),
    ('lor',             'Letter of Recommendation'),
    ('noc',             'No Objection Certificate'),
]


def seed(apps, schema_editor):
    DocType = apps.get_model('accounts_app', 'CertificateDocType')
    for i, (key, label) in enumerate(BUILTIN):
        DocType.objects.get_or_create(
            key=key, defaults={'label': label, 'is_builtin': True, 'order': i})


def unseed(apps, schema_editor):
    apps.get_model('accounts_app', 'CertificateDocType').objects.filter(
        key__in=[k for k, _ in BUILTIN], is_builtin=True).delete()


class Migration(migrations.Migration):
    dependencies = [('accounts_app', '0020_certificatedoctype')]
    operations = [migrations.RunPython(seed, unseed)]
