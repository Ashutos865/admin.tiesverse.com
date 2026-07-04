from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PositionViewSet, EnrollmentViewSet, OfferLetterViewSet, HRDepartmentViewSet
from .views import (
    CandidateListView, CandidateDetailView, FormGateView, ResumeDownloadView, SendOfferLetterView,
    InitiateOnboardingView, OnboardingListView, OnboardingDetailView,
    OnboardingVerifyView, OnboardingDocView, ManualAddMemberView,
    OnboardingPublicInfoView, OnboardingPublicUploadView,
    CertificateIssueView, DocumentAuditLogListView, MeView,
    AttendanceListView, AttendanceCheckInView, AttendanceCheckOutView,
    AttendanceApproveView, AttendanceDetailView,
    LeaveListView, LeaveDetailView, LeaveReviewView,
    AssetListView, AssetDetailView, AssetAssignView,
    TaskListView, TaskDetailView,
)

router = DefaultRouter()
router.register(r'positions', PositionViewSet)
router.register(r'enrollments', EnrollmentViewSet, basename='enrollment')
router.register(r'offer-letters', OfferLetterViewSet)
router.register(r'hr-departments', HRDepartmentViewSet)

urlpatterns = [
    path('', include(router.urls)),
    # Current member identity + scope
    path('me/', MeView.as_view(), name='career-me'),
    path('candidates/', CandidateListView.as_view(), name='career-candidates'),
    path('candidates/<int:pk>/', CandidateDetailView.as_view(), name='career-candidate-detail'),
    path('form-gates/', FormGateView.as_view(), name='career-form-gates'),
    path('resume/<int:pk>/', ResumeDownloadView.as_view(), name='career-resume'),
    path('send-offer/', SendOfferLetterView.as_view(), name='career-send-offer'),

    # ── Onboarding — public (token-based, no JWT) ──────────────────────────
    path('onboarding/public/<str:token>/', OnboardingPublicInfoView.as_view(), name='onboarding-public-info'),
    path('onboarding/public/<str:token>/upload/', OnboardingPublicUploadView.as_view(), name='onboarding-public-upload'),

    # ── Onboarding — HR admin (JWT required) ──────────────────────────────
    path('onboarding/initiate/', InitiateOnboardingView.as_view(), name='onboarding-initiate'),
    path('onboarding/manual-add/', ManualAddMemberView.as_view(), name='onboarding-manual-add'),
    path('onboarding/', OnboardingListView.as_view(), name='onboarding-list'),
    path('onboarding/<int:pk>/', OnboardingDetailView.as_view(), name='onboarding-detail'),
    path('onboarding/<int:pk>/verify/', OnboardingVerifyView.as_view(), name='onboarding-verify'),
    path('onboarding/<int:pk>/doc/<str:doc_type>/', OnboardingDocView.as_view(), name='onboarding-doc'),

    # ── Certificates & Audit Logs ─────────────────────────────────────────
    path('onboarding/<int:pk>/certificate/', CertificateIssueView.as_view(), name='certificate-issue'),
    path('onboarding/<int:pk>/audit-log/', DocumentAuditLogListView.as_view(), name='document-audit-log'),

    # ── Attendance ─────────────────────────────────────────────────────────
    path('attendance/', AttendanceListView.as_view(), name='attendance-list'),
    path('attendance/<int:pk>/', AttendanceDetailView.as_view(), name='attendance-detail'),
    path('attendance/<int:pk>/approve/', AttendanceApproveView.as_view(), name='attendance-approve'),
    path('attendance/member/<int:member_id>/checkin/', AttendanceCheckInView.as_view(), name='attendance-checkin'),
    path('attendance/member/<int:member_id>/checkout/', AttendanceCheckOutView.as_view(), name='attendance-checkout'),

    # ── Leave Management ───────────────────────────────────────────────────
    path('leave/', LeaveListView.as_view(), name='leave-list'),
    path('leave/<int:pk>/', LeaveDetailView.as_view(), name='leave-detail'),
    path('leave/<int:pk>/review/', LeaveReviewView.as_view(), name='leave-review'),

    # ── Asset Management ───────────────────────────────────────────────────
    path('assets/', AssetListView.as_view(), name='asset-list'),
    path('assets/<int:pk>/', AssetDetailView.as_view(), name='asset-detail'),
    path('assets/<int:pk>/assign/', AssetAssignView.as_view(), name='asset-assign'),

    # ── Task Management ────────────────────────────────────────────────────
    path('tasks/', TaskListView.as_view(), name='task-list'),
    path('tasks/<int:pk>/', TaskDetailView.as_view(), name='task-detail'),
]
