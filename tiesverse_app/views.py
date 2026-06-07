from rest_framework import viewsets
from rest_framework.permissions import DjangoModelPermissions, IsAuthenticated
from .models import Event, Article, YouTubeVideo, Workshop, TeamMember, Guest, WebinarListing
from .serializers import (
    EventSerializer, ArticleSerializer, YouTubeVideoSerializer,
    WorkshopSerializer, TeamMemberSerializer, GuestSerializer, WebinarListingSerializer
)


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


class EventViewSet(viewsets.ModelViewSet):
    queryset = Event.objects.all()
    serializer_class = EventSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]

class ArticleViewSet(viewsets.ModelViewSet):
    queryset = Article.objects.all()
    serializer_class = ArticleSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]

class YouTubeVideoViewSet(viewsets.ModelViewSet):
    queryset = YouTubeVideo.objects.all()
    serializer_class = YouTubeVideoSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]

class WorkshopViewSet(viewsets.ModelViewSet):
    queryset = Workshop.objects.all()
    serializer_class = WorkshopSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]

class TeamMemberViewSet(viewsets.ModelViewSet):
    queryset = TeamMember.objects.all()
    serializer_class = TeamMemberSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]

class GuestViewSet(viewsets.ModelViewSet):
    queryset = Guest.objects.all()
    serializer_class = GuestSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]

class WebinarListingViewSet(viewsets.ModelViewSet):
    queryset = WebinarListing.objects.all()
    serializer_class = WebinarListingSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]
