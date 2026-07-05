"""Role-based default permissions.

Each portal role maps to a Django group (see GROUP_NAME_MAP in views.py). This
module defines what permissions each group gets by default, and grants them
automatically — on member provisioning and via `manage.py sync_role_permissions`.

It is ADDITIVE: it only grants the role defaults, never strips permissions, so HR
can still grant per-person extras (user_permissions) on top and they survive a
re-sync.

Self-service (mark own attendance, apply leave/offboarding, own profile) needs no
permission — it's gated by IsAuthenticated + the "self" access scope. So Members /
Interns get an empty default set; they can already manage their own data.
"""

# View-only over team/org HR data (row-scoping to the right people is done in
# access.py — Team Leads see their team, Advisory sees org-wide).
VIEW_HR = [
    'view_onboardingsubmission',
    'view_attendancerecord',
    'view_leaverequest',
    'view_offboardingrequest',
    'view_asset',
    'view_task',
    'view_hrdepartment',
]

# Full HR: manage members + approve leave/offboarding.
HR_FULL = VIEW_HR + [
    'add_onboardingsubmission', 'change_onboardingsubmission',
    'add_attendancerecord', 'change_attendancerecord',
    'add_leaverequest', 'change_leaverequest', 'can_review_leave',
    'add_offboardingrequest', 'change_offboardingrequest', 'can_review_offboarding',
    'add_asset', 'change_asset', 'delete_asset',
    'add_task', 'change_task', 'delete_task',
    'add_hrdepartment', 'change_hrdepartment', 'delete_hrdepartment',
]

GROUP_PERMISSIONS = {
    'Interns':    [],          # self-service only
    'Members':    [],          # self-service only
    'Team Leads': VIEW_HR,     # view their team (scoped), no approve
    'Advisory':   HR_FULL,     # FULL access, org-wide (scope 'all'); advisory-only
                               # oversight (task review, weekly updates, revenue) is
                               # additionally gated to the 'advisory' role in views
    'HR':         HR_FULL,     # HR panel + career + cert/mail; org-wide view, but
                               # NOT the advisory-only oversight/revenue views
    'Admins':     HR_FULL,     # superuser is set separately if needed
}


def sync_group_permissions(report=None):
    """Grant each role-group its default permissions (additive). Returns
    {group_name: perms_granted}. `report` is an optional callable(str) for logging."""
    from django.contrib.auth.models import Group, Permission
    summary = {}
    for group_name, codenames in GROUP_PERMISSIONS.items():
        group, _ = Group.objects.get_or_create(name=group_name)
        if not codenames:
            summary[group_name] = 0
            continue
        perms = list(Permission.objects.filter(
            codename__in=codenames, content_type__app_label='career_app'))
        group.permissions.add(*perms)
        summary[group_name] = len(perms)
        if report:
            missing = set(codenames) - {p.codename for p in perms}
            if missing:
                report(f"  {group_name}: permissions not found yet: {sorted(missing)}")
    return summary
