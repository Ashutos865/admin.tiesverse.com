from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import DjangoModelPermissions, IsAuthenticated
from .models import WebinarEvent, RegistrationForm, CalendarEvent
from .serializers import WebinarEventSerializer, RegistrationFormSerializer, CalendarEventSerializer


class StaffModelPermissions(DjangoModelPermissions):
    """
    Extends DjangoModelPermissions to also require 'view' permission for GET requests.
    Superusers bypass all permission checks automatically.
    """
    perms_map = {
        'GET': ['%(app_label)s.view_%(model_name)s'],
        'OPTIONS': [],
        'HEAD': [],
        'POST': ['%(app_label)s.add_%(model_name)s'],
        'PUT': ['%(app_label)s.change_%(model_name)s'],
        'PATCH': ['%(app_label)s.change_%(model_name)s'],
        'DELETE': ['%(app_label)s.delete_%(model_name)s'],
    }


class WebinarEventViewSet(viewsets.ModelViewSet):
    queryset = WebinarEvent.objects.all()
    serializer_class = WebinarEventSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]

    @action(detail=True, methods=['post'], url_path='calendar-sync')
    def calendar_sync(self, request, pk=None):
        webinar = self.get_object()
        # Mocking calendar sync logic
        CalendarEvent.objects.update_or_create(
            webinar=webinar,
            defaults={'calendar_id': f'cal_{webinar.id}', 'sync_status': True}
        )
        return Response({'status': 'Synced with calendar'})

class RegistrationFormViewSet(viewsets.ModelViewSet):
    queryset = RegistrationForm.objects.all()
    serializer_class = RegistrationFormSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        registration = self.get_object()
        registration.is_accepted = True
        registration.notification_sent = True # Mocking notification
        registration.save()
        return Response({'status': 'Registration accepted and notification sent'})

class CalendarEventViewSet(viewsets.ModelViewSet):
    queryset = CalendarEvent.objects.all()
    serializer_class = CalendarEventSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]
