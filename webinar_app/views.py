import datetime
import json
import logging

from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, DjangoModelPermissions, IsAuthenticated
from rest_framework.response import Response

from .models import WebinarEvent, RegistrationForm, CalendarEvent
from .serializers import WebinarEventSerializer, RegistrationFormSerializer, CalendarEventSerializer
from . import turso_client
from .ses_email import send_registration_confirmation

logger = logging.getLogger(__name__)


class StaffModelPermissions(DjangoModelPermissions):
    perms_map = {
        'GET': ['%(app_label)s.view_%(model_name)s'],
        'OPTIONS': [], 'HEAD': [],
        'POST': ['%(app_label)s.add_%(model_name)s'],
        'PUT': ['%(app_label)s.change_%(model_name)s'],
        'PATCH': ['%(app_label)s.change_%(model_name)s'],
        'DELETE': ['%(app_label)s.delete_%(model_name)s'],
    }


# ── public registration endpoint ─────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([AllowAny])
def register_for_event(request):
    """
    Public endpoint — no JWT required.
    Accepts: { event_id, event_title, event_type, name, email, phone, city, event_date }
    Saves to Turso, sends SES confirmation email.
    """
    data = request.data
    name = str(data.get('name') or '').strip()
    email = str(data.get('email') or '').strip().lower()
    event_title = str(data.get('event_title') or '').strip()
    event_type = str(data.get('event_type') or 'event').strip()

    if not name or not email or not event_title:
        return Response({'error': 'name, email and event_title are required'}, status=400)

    now = datetime.datetime.utcnow().isoformat()
    event_date = str(data.get('event_date') or '')

    if turso_client.is_configured():
        try:
            turso_client.setup_tables()
            turso_client.execute(
                """INSERT INTO registrations
                   (event_id, event_title, event_type, name, email, phone, city, registered_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                {
                    '1': str(data.get('event_id') or ''),
                    '2': event_title,
                    '3': event_type,
                    '4': name,
                    '5': email,
                    '6': str(data.get('phone') or ''),
                    '7': str(data.get('city') or ''),
                    '8': now,
                },
            )
        except turso_client.TursoError as exc:
            logger.error('Turso registration insert failed: %s', exc)
            return Response({'error': 'Registration could not be saved. Please try again.'}, status=500)
    else:
        logger.warning('Turso not configured — registration from %s not persisted', email)

    email_sent = send_registration_confirmation(email, name, event_title, event_type, event_date)

    return Response({
        'status': 'registered',
        'email_sent': email_sent,
    })


# ── admin-only registrations list (reads from Turso) ─────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_registrations(request):
    """Returns all registrations from Turso. Admin only (JWT required)."""
    if not turso_client.is_configured():
        return Response({'error': 'Turso not configured', 'rows': []}, status=503)
    try:
        rows = turso_client.execute(
            'SELECT * FROM registrations ORDER BY registered_at DESC LIMIT 500'
        )
        return Response({'rows': rows, 'count': len(rows)})
    except turso_client.TursoError as exc:
        logger.error('list_registrations failed: %s', exc)
        return Response({'error': str(exc), 'rows': []}, status=503)


# ── Django ORM–backed viewsets (webinar events, calendar) ────────────────────

class WebinarEventViewSet(viewsets.ModelViewSet):
    queryset = WebinarEvent.objects.all()
    serializer_class = WebinarEventSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]

    @action(detail=True, methods=['post'], url_path='calendar-sync')
    def calendar_sync(self, request, pk=None):
        webinar = self.get_object()
        CalendarEvent.objects.update_or_create(
            webinar=webinar,
            defaults={'calendar_id': f'cal_{webinar.id}', 'sync_status': True},
        )
        return Response({'status': 'Synced with calendar'})


class CalendarEventViewSet(viewsets.ModelViewSet):
    queryset = CalendarEvent.objects.all()
    serializer_class = CalendarEventSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]
