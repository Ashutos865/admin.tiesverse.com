from rest_framework import viewsets
from rest_framework.permissions import DjangoModelPermissions, IsAuthenticated
from .models import Department, TeamMember, TeamMemberSocial, Event, EventSpeaker, EventRegistration
from .serializers import (
    DepartmentSerializer, TeamMemberSerializer, TeamMemberSocialSerializer,
    EventSerializer, EventSpeakerSerializer, EventRegistrationSerializer
)

class StaffModelPermissions(DjangoModelPermissions):
    perms_map = {
        'GET': ['%(app_label)s.view_%(model_name)s'],
        'OPTIONS': [],
        'HEAD': [],
        'POST': ['%(app_label)s.add_%(model_name)s'],
        'PUT': ['%(app_label)s.change_%(model_name)s'],
        'PATCH': ['%(app_label)s.change_%(model_name)s'],
        'DELETE': ['%(app_label)s.delete_%(model_name)s'],
    }

class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]

class TeamMemberViewSet(viewsets.ModelViewSet):
    queryset = TeamMember.objects.all()
    serializer_class = TeamMemberSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]

class TeamMemberSocialViewSet(viewsets.ModelViewSet):
    queryset = TeamMemberSocial.objects.all()
    serializer_class = TeamMemberSocialSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]

class EventViewSet(viewsets.ModelViewSet):
    queryset = Event.objects.all()
    serializer_class = EventSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]

class EventSpeakerViewSet(viewsets.ModelViewSet):
    queryset = EventSpeaker.objects.all()
    serializer_class = EventSpeakerSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]

class EventRegistrationViewSet(viewsets.ModelViewSet):
    queryset = EventRegistration.objects.all()
    serializer_class = EventRegistrationSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]
