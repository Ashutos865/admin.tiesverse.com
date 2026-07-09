from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    DepartmentViewSet, TeamMemberViewSet, TeamMemberSocialViewSet,
    EventViewSet, EventSpeakerViewSet, EventRegistrationViewSet,
    WebinarListingViewSet, TechProductViewSet,
)
from .views import site_images_admin

router = DefaultRouter()
router.register(r'departments', DepartmentViewSet)
router.register(r'team_members', TeamMemberViewSet)
router.register(r'team_member_socials', TeamMemberSocialViewSet)
router.register(r'events', EventViewSet)
router.register(r'event_speakers', EventSpeakerViewSet)
router.register(r'event_registrations', EventRegistrationViewSet)
router.register(r'webinars', WebinarListingViewSet)
router.register(r'tech-products', TechProductViewSet, basename='tech-product')

urlpatterns = [
    path('site-images/', site_images_admin, name='site-images-admin'),
    path('', include(router.urls)),
]
