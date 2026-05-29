from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import WebinarEvent, RegistrationForm, CalendarEvent
from .serializers import WebinarEventSerializer, RegistrationFormSerializer, CalendarEventSerializer

class WebinarEventViewSet(viewsets.ModelViewSet):
    queryset = WebinarEvent.objects.all()
    serializer_class = WebinarEventSerializer

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
