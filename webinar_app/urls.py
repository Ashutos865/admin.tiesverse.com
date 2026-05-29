from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import WebinarEventViewSet, RegistrationFormViewSet, CalendarEventViewSet

router = DefaultRouter()
router.register(r'events', WebinarEventViewSet)
router.register(r'registrations', RegistrationFormViewSet)
router.register(r'calendar-events', CalendarEventViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
