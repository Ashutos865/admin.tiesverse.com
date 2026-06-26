from rest_framework import viewsets
from rest_framework.permissions import DjangoModelPermissions, IsAuthenticated
from .models import (
    Department, Event, EventSpeaker, EventRegistration,
    TeamMember, TeamMemberSocial, WebinarListing,
)
from .serializers import (
    DepartmentSerializer, EventSerializer, EventSpeakerSerializer,
    EventRegistrationSerializer, TeamMemberSerializer, TeamMemberSocialSerializer,
    WebinarListingSerializer,
)
from . import supabase_sync


class StaffModelPermissions(DjangoModelPermissions):
    perms_map = {
        'GET':    ['%(app_label)s.view_%(model_name)s'],
        'OPTIONS': [], 'HEAD': [],
        'POST':   ['%(app_label)s.add_%(model_name)s'],
        'PUT':    ['%(app_label)s.change_%(model_name)s'],
        'PATCH':  ['%(app_label)s.change_%(model_name)s'],
        'DELETE': ['%(app_label)s.delete_%(model_name)s'],
    }


class SupabaseSyncMixin:
    """After every write, mirror the change to Supabase."""
    def perform_create(self, serializer):
        instance = serializer.save()
        supabase_sync.upsert(instance)

    def perform_update(self, serializer):
        instance = serializer.save()
        supabase_sync.upsert(instance)

    def perform_destroy(self, instance):
        supabase_sync.delete(instance)
        instance.delete()


class DepartmentViewSet(SupabaseSyncMixin, viewsets.ModelViewSet):
    queryset = Department.objects.all().order_by('-created_at')
    serializer_class = DepartmentSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]


class EventViewSet(SupabaseSyncMixin, viewsets.ModelViewSet):
    queryset = Event.objects.all().order_by('date')
    serializer_class = EventSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]


class EventSpeakerViewSet(SupabaseSyncMixin, viewsets.ModelViewSet):
    queryset = EventSpeaker.objects.all().order_by('-created_at')
    serializer_class = EventSpeakerSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]


class EventRegistrationViewSet(SupabaseSyncMixin, viewsets.ModelViewSet):
    queryset = EventRegistration.objects.all().order_by('date')
    serializer_class = EventRegistrationSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]


class TeamMemberViewSet(SupabaseSyncMixin, viewsets.ModelViewSet):
    queryset = TeamMember.objects.all().order_by('display_order')
    serializer_class = TeamMemberSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]


class TeamMemberSocialViewSet(SupabaseSyncMixin, viewsets.ModelViewSet):
    queryset = TeamMemberSocial.objects.all().order_by('-created_at')
    serializer_class = TeamMemberSocialSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]


class WebinarListingViewSet(SupabaseSyncMixin, viewsets.ModelViewSet):
    queryset = WebinarListing.objects.all().order_by('-date')
    serializer_class = WebinarListingSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]
