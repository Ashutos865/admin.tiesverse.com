"""Unified data-source connector.

One contract that both Mail Automation and Certificate generation consume so a
variable ({{name}}, {{email}}, ...) can be connected to a field from an existing
system table (or a CSV/manual list handled client-side). Every adapter returns a
normalized `(columns, rows)` where each row is a flat {column: string} dict.
"""

from __future__ import annotations

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response


def _s(v):
    return '' if v is None else str(v)


# ── table adapters — each returns (columns, rows) ─────────────────────────────

def _team_members_source(_event_key=''):
    from tiesverse_app.models import TeamMember
    cols = ['name', 'role', 'department']
    rows = [{'name': _s(t.name), 'role': _s(t.role), 'department': _s(t.department)}
            for t in TeamMember.objects.all().order_by('display_order', 'name')]
    return cols, rows


def _signups_source(_event_key=''):
    from career_app.models import SelfSignup
    cols = ['name', 'email', 'status']
    rows = [{'name': _s(s.name), 'email': _s(s.email), 'status': _s(s.status)}
            for s in SelfSignup.objects.exclude(status=SelfSignup.STATUS_REJECTED).order_by('-created_at')[:1000]]
    return cols, rows


def _onboarding_source(_event_key=''):
    from career_app.models import OnboardingSubmission
    cols = ['name', 'email', 'role', 'portal_role', 'employment_type', 'joining_date', 'departments']
    rows = []
    for o in OnboardingSubmission.objects.all().order_by('-id')[:2000]:
        depts = o.assigned_departments if isinstance(o.assigned_departments, list) else []
        rows.append({
            'name': _s(o.candidate_name), 'email': _s(o.candidate_email),
            'role': _s(o.role_offered), 'portal_role': _s(o.portal_role),
            'employment_type': _s(o.employment_type), 'joining_date': _s(o.joining_date),
            'departments': ', '.join(str(d) for d in depts),
        })
    return cols, rows


def _candidates_source(_event_key=''):
    from career_app import cloudflare_proxy
    cols = ['name', 'email', 'phone', 'city', 'role', 'department', 'final_decision']
    rows = []
    for c in (cloudflare_proxy.get_candidates() or []):
        name = ' '.join(p for p in [c.get('first_name'), c.get('last_name')] if p).strip() or _s(c.get('name'))
        rows.append({
            'name': name, 'email': _s(c.get('email')), 'phone': _s(c.get('phone')),
            'city': _s(c.get('city')), 'role': _s(c.get('roles') or c.get('role')),
            'department': _s(c.get('department')), 'final_decision': _s(c.get('final_decision')),
        })
    return cols, rows


def _webinar_registrations_source(event_key=''):
    from config.certificate_workflow import _webinar_rows
    cols = ['name', 'email', 'phone', 'city', 'event_title', 'role', 'organization',
            'country', 'attended', 'payment_status', 'registered_at']
    rows = []
    for r in _webinar_rows():
        rk = _s(r.get('event_id') or r.get('event_title'))
        if event_key and rk != event_key and _s(r.get('event_title')) != event_key:
            continue
        rows.append({
            'name': _s(r.get('name')), 'email': _s(r.get('email')), 'phone': _s(r.get('phone')),
            'city': _s(r.get('city')), 'event_title': _s(r.get('event_title')),
            'role': _s(r.get('role')), 'organization': _s(r.get('organization')),
            'country': _s(r.get('country')), 'attended': _s(r.get('attended')),
            'payment_status': _s(r.get('payment_status')), 'registered_at': _s(r.get('registered_at')),
        })
    return cols, rows


def _webinar_events():
    from config.certificate_workflow import _webinar_rows
    seen = {}
    for r in _webinar_rows():
        key = _s(r.get('event_id') or r.get('event_title'))
        if not key:
            continue
        if key not in seen:
            seen[key] = {'key': key, 'title': _s(r.get('event_title') or 'Webinar'), 'count': 0}
        seen[key]['count'] += 1
    return list(seen.values())


SOURCES = {
    'webinar_registrations': {'label': 'Webinar Registrations', 'needs_event': True, 'loader': _webinar_registrations_source},
    'candidates':            {'label': 'Career Candidates',     'loader': _candidates_source},
    'onboarding':            {'label': 'Members (Onboarding)',  'loader': _onboarding_source},
    'signups':               {'label': 'New Signups',           'loader': _signups_source},
    'team_members':          {'label': 'Team Members',          'loader': _team_members_source},
}


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_data_sources(request):
    """List every connectable table source (plus, for event-scoped ones, the events)."""
    out = []
    for sid, spec in SOURCES.items():
        entry = {'id': sid, 'label': spec['label'], 'needs_event': spec.get('needs_event', False)}
        if spec.get('needs_event'):
            try:
                entry['events'] = _webinar_events()
            except Exception:  # noqa: BLE001
                entry['events'] = []
        out.append(entry)
    return Response({'sources': out})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def data_source_rows(request, source_id):
    """Normalized {columns, rows, count} for one source, so any variable can be
    mapped to any column by the mail/certificate flows."""
    spec = SOURCES.get(source_id)
    if not spec:
        return Response({'error': 'Unknown data source.'}, status=404)
    event_key = request.GET.get('event_key', '')
    try:
        columns, rows = spec['loader'](event_key)
    except Exception as exc:  # noqa: BLE001
        return Response({'error': f'Could not load rows: {exc}', 'columns': [], 'rows': []}, status=502)
    return Response({'columns': columns, 'rows': rows, 'count': len(rows)})
