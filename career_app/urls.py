from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PositionViewSet, EnrollmentViewSet, OfferLetterViewSet

router = DefaultRouter()
router.register(r'positions', PositionViewSet)
router.register(r'enrollments', EnrollmentViewSet)
router.register(r'offer-letters', OfferLetterViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
