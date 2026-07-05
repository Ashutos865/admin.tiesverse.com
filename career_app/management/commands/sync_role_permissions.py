"""Grant every role-group its default permissions.

Run at deploy (and any time you change role_permissions.py):

    python manage.py sync_role_permissions

Additive and idempotent — safe to run repeatedly; never removes manually-granted
per-person or per-group permissions.
"""
from django.core.management.base import BaseCommand

from career_app.role_permissions import sync_group_permissions


class Command(BaseCommand):
    help = "Grant each role-group (Members, Team Leads, HR, …) its default permissions."

    def handle(self, *args, **options):
        summary = sync_group_permissions(report=self.stdout.write)
        for group, n in summary.items():
            self.stdout.write(f"  {group}: {n} permission(s)")

        # HR is also a department (so HR staff show up under the department
        # structure with everyone else). Idempotent.
        from career_app.models import HRDepartment
        _, created = HRDepartment.objects.get_or_create(
            name='HR', defaults={'description': 'Human Resources', 'is_active': True})
        self.stdout.write(f"  HR department: {'created' if created else 'exists'}")

        self.stdout.write(self.style.SUCCESS("Role permissions synced."))
