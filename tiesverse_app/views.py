from rest_framework import viewsets
from rest_framework.permissions import DjangoModelPermissions, IsAuthenticated
from .models import Event, Article, YouTubeVideo, Workshop, TeamMember, Guest, WebinarListing
from .serializers import (
    EventSerializer, ArticleSerializer, YouTubeVideoSerializer,
    WorkshopSerializer, TeamMemberSerializer, GuestSerializer, WebinarListingSerializer
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


class EventViewSet(SupabaseSyncMixin, viewsets.ModelViewSet):
    queryset = Event.objects.all().order_by('date')
    serializer_class = EventSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]


class ArticleViewSet(SupabaseSyncMixin, viewsets.ModelViewSet):
    queryset = Article.objects.filter(published=True).order_by('-created_at')
    serializer_class = ArticleSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]


class YouTubeVideoViewSet(SupabaseSyncMixin, viewsets.ModelViewSet):
    queryset = YouTubeVideo.objects.all().order_by('-created_at')
    serializer_class = YouTubeVideoSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]


class WorkshopViewSet(SupabaseSyncMixin, viewsets.ModelViewSet):
    queryset = Workshop.objects.all().order_by('date')
    serializer_class = WorkshopSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]


class TeamMemberViewSet(SupabaseSyncMixin, viewsets.ModelViewSet):
    queryset = TeamMember.objects.all().order_by('display_order')
    serializer_class = TeamMemberSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]


class GuestViewSet(SupabaseSyncMixin, viewsets.ModelViewSet):
    queryset = Guest.objects.all().order_by('-created_at')
    serializer_class = GuestSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]

class WebinarListingViewSet(viewsets.ModelViewSet):
    queryset = WebinarListing.objects.all()
    serializer_class = WebinarListingSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]
