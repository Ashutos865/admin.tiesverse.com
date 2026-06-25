from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    EventViewSet, ArticleViewSet, YouTubeVideoViewSet,
    WorkshopViewSet, TeamMemberViewSet, GuestViewSet, WebinarListingViewSet
)

router = DefaultRouter()
router.register(r'events', EventViewSet)
router.register(r'articles', ArticleViewSet)
router.register(r'youtube_videos', YouTubeVideoViewSet)
router.register(r'workshops', WorkshopViewSet)
router.register(r'team_members', TeamMemberViewSet)
router.register(r'guests', GuestViewSet)
router.register(r'webinars', WebinarListingViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
