"""Central identity + team-scope resolution for the HR portal.

Every "who am I / what am I allowed to see" decision goes through here so the
rule lives in ONE place instead of being re-derived (and forgotten) per view.

Model (department-match, no schema change):
  - A logged-in User maps to a member (OnboardingSubmission) via MemberAccount.
  - A member "leads" the departments where they are named lead/co-lead on an
    HRDepartment (falling back to their own assigned_departments if they hold the
    team_lead role but aren't named anywhere yet).
  - A lead's team = every verified member who shares one of those departments.

Scope returned by get_access_scope():
  'all'  -> superusers, back-office staff with no member profile, and HR /
            admin / advisory members: no row restriction (still permission-gated).
  'team' -> team leads: their own team + themselves.
  'self' -> ordinary members / interns: only their own rows.
  'none' -> authenticated but resolves to nothing (defensive default).
"""

from __future__ import annotations

from .models import OnboardingSubmission, MemberAccount, HRDepartment

ORG_WIDE_ROLES = {'hr', 'admin', 'advisory'}
ORG_WIDE_GROUPS = {'HR', 'Admins', 'Advisory'}


def get_member_for_user(user):
    """Resolve a Django User to their member record, or None.

    Prefers the explicit MemberAccount link; falls back to an email match for
    accounts created before the link existed.
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return None
    acct = (
        MemberAccount.objects.filter(user=user)
        .select_related('submission')
        .first()
    )
    if acct:
        return acct.submission
    if user.email:
        return OnboardingSubmission.objects.filter(candidate_email__iexact=user.email).first()
    return None


def led_department_names(member):
    """Set of department names this member leads."""
    if not member:
        return set()
    name = (member.candidate_name or '').strip().lower()
    led = set()
    if name:
        for dep in HRDepartment.objects.all():
            if name in {
                (dep.lead_name or '').strip().lower(),
                (dep.co_lead_name or '').strip().lower(),
            }:
                led.add(dep.name)
    # Fallback: a team_lead leads the departments they're assigned to, even if
    # HR hasn't set lead_name to their exact name yet.
    if not led and (member.portal_role or '') == 'team_lead':
        led = set(member.assigned_departments or [])
    return led


def is_lead(member):
    return bool(led_department_names(member))


def team_member_ids(member):
    """Member ids on this lead's team, including the lead. SQLite-safe (the
    department overlap is computed in Python, not with a JSON __overlap query)."""
    ids = {member.id} if member else set()
    led = led_department_names(member)
    if led:
        for m in OnboardingSubmission.objects.filter(status='verified'):
            if any(d in (m.assigned_departments or []) for d in led):
                ids.add(m.id)
    return ids


CONTENT_DEPARTMENT = 'content'   # matched case-insensitively against assigned_departments


def _in_content_department(member):
    """True if this member belongs to the Content department (case-insensitive)."""
    if not member:
        return False
    return any(str(d).strip().lower() == CONTENT_DEPARTMENT
               for d in (member.assigned_departments or []))


def _leads_content(member):
    """True if this member leads the Content department."""
    return any(str(d).strip().lower() == CONTENT_DEPARTMENT
               for d in led_department_names(member))


def get_article_access(user):
    """Classify a user's access to the Articles/Reports (WordPress) portal.

    Returns one of:
      'full'  -> superuser, the Content lead, or a member granted
                 `can_publish_articles`: read + create + publish + edit + delete.
      'draft' -> a Content-department member (or one granted `can_edit_articles`):
                 read + create/save DRAFTS under their own name only. No publish,
                 no delete, no editing others' published posts.
      'none'  -> everyone else.

    Also returns the member (or None) so the caller can stamp the author name.
    """
    if getattr(user, 'is_superuser', False):
        return ('full', None)
    # Explicit Django permission grants win (delegated by a lead/admin).
    if user and user.has_perm('accounts_app.can_publish_articles'):
        member = get_member_for_user(user)
        return ('full', member)

    member = get_member_for_user(user)
    if member is None:
        # Back-office staff with no member profile: treat like the old superuser
        # gate only if they are staff; otherwise no article access.
        return ('none', None)

    if _leads_content(member):
        return ('full', member)
    if user and user.has_perm('accounts_app.can_edit_articles'):
        return ('draft', member)
    if _in_content_department(member):
        return ('draft', member)
    return ('none', member)


def get_access_scope(user):
    """Return (scope, member) — scope in {'all', 'team', 'self', 'none'}."""
    if getattr(user, 'is_superuser', False):
        return ('all', None)

    member = get_member_for_user(user)

    # Back-office staff (admin portal users with no member profile) keep org-wide
    # access — their views are still gated by Django model permissions.
    if member is None:
        return ('all', None)

    if (member.portal_role or '') in ORG_WIDE_ROLES or user.groups.filter(
        name__in=ORG_WIDE_GROUPS
    ).exists():
        return ('all', member)

    if is_lead(member):
        return ('team', member)

    return ('self', member)


def can_manage_project(user, project):
    """True if `user` may manage (edit/close/extend/assign-teams on) `project`:
    a superuser/advisory (org-wide), the creator, or a team lead over one of the
    project's departments. Requires the change_project permission."""
    if getattr(user, 'is_superuser', False):
        return True
    if not user.has_perm('career_app.change_project'):
        return False
    scope, member = get_access_scope(user)
    if scope == 'all':
        return True
    if member and getattr(project, 'created_by_id', None) == member.id:
        return True
    if scope == 'team' and member and (set(getattr(project, 'departments', None) or []) & led_department_names(member)):
        return True
    return False


def scope_member_queryset(qs, user, field='member'):
    """Restrict a queryset that has a FK to OnboardingSubmission (`field`) to the
    rows the user is allowed to see."""
    scope, member = get_access_scope(user)
    if scope == 'all':
        return qs
    if scope == 'team' and member:
        return qs.filter(**{f'{field}_id__in': team_member_ids(member)})
    if scope == 'self' and member:
        return qs.filter(**{f'{field}_id': member.id})
    return qs.none()
