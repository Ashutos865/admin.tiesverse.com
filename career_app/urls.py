from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PositionViewSet, EnrollmentViewSet, OfferLetterViewSet
from .views import CandidateListView, CandidateDetailView, FormGateView, ResumeDownloadView

router = DefaultRouter()
router.register(r'positions', PositionViewSet)
router.register(r'enrollments', EnrollmentViewSet)
router.register(r'offer-letters', OfferLetterViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('candidates/', CandidateListView.as_view(), name='career-candidates'),
    path('candidates/<int:pk>/', CandidateDetailView.as_view(), name='career-candidate-detail'),
    path('form-gates/', FormGateView.as_view(), name='career-form-gates'),
    path('resume/<int:pk>/', ResumeDownloadView.as_view(), name='career-resume'),
]
