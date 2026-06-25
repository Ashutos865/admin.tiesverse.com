from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import WebinarEventViewSet, CalendarEventViewSet, register_for_event, list_registrations

router = DefaultRouter()
router.register(r'events', WebinarEventViewSet)
router.register(r'calendar-events', CalendarEventViewSet)

urlpatterns = [
    path('register/', register_for_event, name='webinar-register'),
    path('registrations/', list_registrations, name='webinar-registrations'),
    path('', include(router.urls)),
]
