"""Granular Webinar-portal access control.

Capabilities are per-member:
  * Superuser                           → everything, and may grant to others
  * Admin / Advisory / HR               → everything
  * A Webinar/Workshop department lead  → everything for their portal
  * Webinar or Workshop dept members    → 'view' only (read-only)
  * Anyone else                         → exactly what's granted in WebinarAccess

Granting is deliberately narrower than using the portal: only a superadmin (or
a department lead, for their own team) hands out capabilities, so a member with
'edit_event' cannot quietly widen their own access.

The Webinar admin views were previously open to any authenticated user; these
gates tighten that without affecting the public registration endpoints.
"""
from functools import wraps

from rest_framework import status
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from career_app.models import HRDepartment, WebinarAccess
from career_app import access

WEBINAR_DEPT = 'Webinar'
# Both portals live behind the same gate: whoever sits in either department
# can read the listings, and neither can change anything without a grant.
PORTAL_DEPTS = ('Webinar', 'Workshop', 'Workshops', 'Webinars')

# (key, label) — labels are shown in the grant UI.
CAPABILITIES = [
    ('view', 'View webinars'),
    ('edit_event', 'Edit event details'),
    ('manage_questions', 'Manage form questions'),
    ('manage_registrations', 'Manage registrations'),
    ('send_emails', 'Send emails & certificates'),
    ('manage_meeting', 'Manage meeting link'),
    ('manage_speakers', 'Manage speakers'),
]
CAP_KEYS = [k for k, _ in CAPABILITIES]


def _is_org_admin(user):
    if getattr(user, 'is_superuser', False):
        return True
    if user.groups.filter(name__in=['Admins', 'HR', 'Advisory']).exists():
        return True
    m = access.get_member_for_user(user)
    return bool(m and (m.portal_role or '') in ('admin', 'advisory', 'hr'))


def _leads_webinar(member):
    """Leads or co-leads either portal department."""
    if not member:
        return False
    name = (member.candidate_name or '').strip().lower()
    if not name:
        return False
    for dept in HRDepartment.objects.filter(name__in=PORTAL_DEPTS):
        if name in {(dept.lead_name or '').strip().lower(),
                    (dept.co_lead_name or '').strip().lower()}:
            return True
    return False


def _in_portal_dept(member):
    """Sits in the Webinar or Workshop department (read-only by default)."""
    if not member:
        return False
    assigned = {str(d).strip().lower() for d in (member.assigned_departments or [])}
    return bool(assigned & {d.lower() for d in PORTAL_DEPTS})


def can_grant(user):
    """Who may grant/revoke portal access to others.

    Deliberately tighter than `_is_org_admin`: giving out capabilities is a
    superadmin action, plus the portal's own lead for their team. An HR or
    advisory member can use the portal fully but cannot widen anyone's access.
    """
    if getattr(user, 'is_superuser', False):
        return True
    return _leads_webinar(access.get_member_for_user(user))


def member_capabilities(user):
    """The set of webinar capability keys this user has."""
    if not user or not getattr(user, 'is_authenticated', False):
        return set()
    if _is_org_admin(user):
        return set(CAP_KEYS)
    member = access.get_member_for_user(user)
    if not member:
        return set()
    if _leads_webinar(member):
        return set(CAP_KEYS)
    caps = set()
    if _in_portal_dept(member):
        caps.add('view')   # read-only until a lead or superadmin grants more
    wa = WebinarAccess.objects.filter(member=member).first()
    if wa:
        granted = {c for c in (wa.capabilities or []) if c in CAP_KEYS}
        if granted:
            granted.add('view')   # any capability implies being able to view
        caps.update(granted)
    return caps


def webinar_can(user, cap):
    return cap in member_capabilities(user)


class WebinarEventPermission(BasePermission):
    """Reads need 'view'; writes need 'edit_event'. Used on the event viewsets."""
    message = 'You do not have permission to edit webinar events.'

    def has_permission(self, request, view):
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return webinar_can(request.user, 'view')
        return webinar_can(request.user, 'edit_event')


class EventSpeakerPermission(BasePermission):
    """Speakers: either the webinar capability OR the Django model permission.

    Guest speakers are edited from the webinar screen's Guest Speaker tab, but
    the endpoint behind it belongs to tiesverse_app and was gated purely on
    Django model permissions. Granting somebody "Manage speakers" in the
    webinar access grid therefore changed nothing, and they were refused by a
    tab the grid said they could use.

    Both authorities are accepted rather than replacing one with the other, so
    existing model-permission holders (the landing-page editors, who add
    speakers with no webinar attached) keep working exactly as before.
    """
    message = 'You do not have permission to manage speakers.'

    _PERMS = {
        'GET': 'tiesverse_app.view_eventspeaker',
        'POST': 'tiesverse_app.add_eventspeaker',
        'PUT': 'tiesverse_app.change_eventspeaker',
        'PATCH': 'tiesverse_app.change_eventspeaker',
        'DELETE': 'tiesverse_app.delete_eventspeaker',
    }

    def has_permission(self, request, view):
        user = request.user
        if not getattr(user, 'is_authenticated', False):
            return False
        if request.method in ('OPTIONS', 'HEAD'):
            return True
        if request.method in ('GET',):
            if webinar_can(user, 'view') or webinar_can(user, 'manage_speakers'):
                return True
        elif webinar_can(user, 'manage_speakers'):
            return True
        perm = self._PERMS.get(request.method)
        return bool(perm and user.has_perm(perm))


def require_webinar_cap(cap, public_read=False):
    """Decorator for @api_view functions — 403 unless the caller has `cap`.

    public_read=True leaves GET open to anyone. Some of these endpoints serve
    the public website as well as the admin: the form schema has to be
    readable by a visitor filling the registration form, while only an admin
    may change it. Without this the capability check ran on every method and
    silently 403'd the website, which then fell back to its built-in fields
    and never showed the custom questions.
    """
    def deco(view):
        @wraps(view)
        def wrapped(request, *args, **kwargs):
            if public_read and request.method in ('GET', 'HEAD', 'OPTIONS'):
                return view(request, *args, **kwargs)
            if not webinar_can(request.user, cap):
                return Response(
                    {'error': f'You do not have permission to {cap.replace("_", " ")} for webinars.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            return view(request, *args, **kwargs)
        return wrapped
    return deco
