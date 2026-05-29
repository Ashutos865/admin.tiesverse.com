from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    EventViewSet, ArticleViewSet, YouTubeVideoViewSet,
    WorkshopViewSet, TeamMemberViewSet, GuestViewSet
)

router = DefaultRouter()
router.register(r'events', EventViewSet)
router.register(r'articles', ArticleViewSet)
router.register(r'youtube-videos', YouTubeVideoViewSet)
router.register(r'workshops', WorkshopViewSet)
router.register(r'team', TeamMemberViewSet)
router.register(r'guests', GuestViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
