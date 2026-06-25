from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    DepartmentViewSet, TeamMemberViewSet, TeamMemberSocialViewSet,
    EventViewSet, EventSpeakerViewSet, EventRegistrationViewSet
)

router = DefaultRouter()
router.register(r'departments', DepartmentViewSet)
router.register(r'team_members', TeamMemberViewSet)
router.register(r'team_member_socials', TeamMemberSocialViewSet)
router.register(r'events', EventViewSet)
router.register(r'event_speakers', EventSpeakerViewSet)
router.register(r'event_registrations', EventRegistrationViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
