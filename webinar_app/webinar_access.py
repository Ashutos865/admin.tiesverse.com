"""Granular Webinar-portal access control.

Capabilities are per-member:
  * Admin / Advisory / HR / superuser  → everything
  * The 'Webinar' department's lead     → everything
  * 'Webinar' department members        → 'view' by default
  * Anyone else                         → exactly what's granted in WebinarAccess

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
    if not member:
        return False
    dept = HRDepartment.objects.filter(name__iexact=WEBINAR_DEPT).first()
    if not dept:
        return False
    name = (member.candidate_name or '').strip().lower()
    return bool(name and name in {(dept.lead_name or '').strip().lower(),
                                  (dept.co_lead_name or '').strip().lower()})


def can_grant(user):
    """Who may grant/revoke webinar access to others: admins + the Webinar lead."""
    if _is_org_admin(user):
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
    if WEBINAR_DEPT in (member.assigned_departments or []):
        caps.add('view')
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


def require_webinar_cap(cap):
    """Decorator for @api_view functions — 403 unless the caller has `cap`."""
    def deco(view):
        @wraps(view)
        def wrapped(request, *args, **kwargs):
            if not webinar_can(request.user, cap):
                return Response(
                    {'error': f'You do not have permission to {cap.replace("_", " ")} for webinars.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            return view(request, *args, **kwargs)
        return wrapped
    return deco
