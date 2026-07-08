from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PositionViewSet, EnrollmentViewSet, OfferLetterViewSet, HRDepartmentViewSet, PolicyViewSet
from .views import FormViewSet, public_form_view, public_form_submit
from .project_views import (
    ProjectViewSet, ProjectChecklistViewSet, ProjectMessageViewSet,
    DirectMessageViewSet, ProjectNotificationViewSet,
    ProjectTeamViewSet, ProjectMilestoneViewSet, ProjectAttachmentViewSet,
    TaskStepViewSet,
)
from .work_sessions import (
    WorkSessionCheckInView, WorkSessionCheckOutView, WorkSessionActiveView,
    WorkSessionListView, WorkLeaderboardView,
)
from .views import (
    CandidateListView, CandidateDetailView, FormGateView, ResumeDownloadView, SendOfferLetterView,
    InitiateOnboardingView, OnboardingListView, OnboardingDetailView,
    OnboardingVerifyView, OnboardingDocView, ManualAddMemberView,
    OnboardingPublicInfoView, OnboardingPublicUploadView,
    CertificateIssueView, SendCertificateEmailView, DocumentAuditLogListView,
    MeView, DirectorySearchView,
    AttendanceListView, AttendanceCheckInView, AttendanceCheckOutView,
    AttendanceApproveView, AttendanceDetailView,
    LeaveListView, LeaveDetailView, LeaveReviewView,
    OffboardingListView, OffboardingDetailView, OffboardingReviewView,
    OffboardingRevokeView, OffboardingReactivateView,
    AssetListView, AssetDetailView, AssetAssignView,
    TaskListView, TaskDetailView,
    AdvisoryTaskOversightView, AdvisoryDailyUpdatesView, WeeklyUpdateView,
    PublicSignupView, VerifySignupOtpView, SignupListView, ApproveSignupView, RejectSignupView,
    ResendCredentialsView,
)

router = DefaultRouter()
router.register(r'positions', PositionViewSet)
router.register(r'enrollments', EnrollmentViewSet, basename='enrollment')
router.register(r'offer-letters', OfferLetterViewSet)
router.register(r'hr-departments', HRDepartmentViewSet)
router.register(r'policies', PolicyViewSet, basename='policy')
router.register(r'forms', FormViewSet, basename='form')
router.register(r'projects', ProjectViewSet, basename='project')
router.register(r'project-checklist', ProjectChecklistViewSet, basename='project-checklist')
router.register(r'project-messages', ProjectMessageViewSet, basename='project-message')
router.register(r'project-dms', DirectMessageViewSet, basename='project-dm')
router.register(r'project-notifications', ProjectNotificationViewSet, basename='project-notification')
router.register(r'project-teams', ProjectTeamViewSet, basename='project-team')
router.register(r'project-milestones', ProjectMilestoneViewSet, basename='project-milestone')
router.register(r'project-attachments', ProjectAttachmentViewSet, basename='project-attachment')
router.register(r'task-steps', TaskStepViewSet, basename='task-step')

urlpatterns = [
    # Public form fill (no login) — MUST precede the router so `forms/public/…`
    # is not swallowed by the `forms/<pk>/` detail route.
    path('forms/public/<str:token>/', public_form_view, name='public-form'),
    path('forms/public/<str:token>/submit/', public_form_submit, name='public-form-submit'),

    path('', include(router.urls)),
    # Current member identity + scope
    path('me/', MeView.as_view(), name='career-me'),
    # Master directory — unified people search
    path('directory/', DirectorySearchView.as_view(), name='career-directory'),
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
    path('onboarding/<int:pk>/send-certificate/', SendCertificateEmailView.as_view(), name='certificate-send'),
    path('onboarding/<int:pk>/audit-log/', DocumentAuditLogListView.as_view(), name='document-audit-log'),

    # ── Attendance ─────────────────────────────────────────────────────────
    path('attendance/', AttendanceListView.as_view(), name='attendance-list'),
    path('attendance/<int:pk>/', AttendanceDetailView.as_view(), name='attendance-detail'),
    path('attendance/<int:pk>/approve/', AttendanceApproveView.as_view(), name='attendance-approve'),
    path('attendance/member/<int:member_id>/checkin/', AttendanceCheckInView.as_view(), name='attendance-checkin'),
    path('attendance/member/<int:member_id>/checkout/', AttendanceCheckOutView.as_view(), name='attendance-checkout'),

    # ── Work sessions (multi check-in/out per day) + weekly leaderboard ─────
    path('work-sessions/', WorkSessionListView.as_view(), name='work-sessions'),
    path('work-sessions/checkin/', WorkSessionCheckInView.as_view(), name='work-session-checkin'),
    path('work-sessions/checkout/', WorkSessionCheckOutView.as_view(), name='work-session-checkout'),
    path('work-sessions/active/', WorkSessionActiveView.as_view(), name='work-session-active'),
    path('work-leaderboard/', WorkLeaderboardView.as_view(), name='work-leaderboard'),

    # ── Leave Management ───────────────────────────────────────────────────
    path('leave/', LeaveListView.as_view(), name='leave-list'),
    path('leave/<int:pk>/', LeaveDetailView.as_view(), name='leave-detail'),
    path('leave/<int:pk>/review/', LeaveReviewView.as_view(), name='leave-review'),

    # ── Offboarding ────────────────────────────────────────────────────────
    path('offboarding/', OffboardingListView.as_view(), name='offboarding-list'),
    path('offboarding/<int:pk>/', OffboardingDetailView.as_view(), name='offboarding-detail'),
    path('offboarding/<int:pk>/review/', OffboardingReviewView.as_view(), name='offboarding-review'),
    path('offboarding/<int:pk>/revoke/', OffboardingRevokeView.as_view(), name='offboarding-revoke'),
    path('offboarding/<int:pk>/reactivate/', OffboardingReactivateView.as_view(), name='offboarding-reactivate'),

    # ── Asset Management ───────────────────────────────────────────────────
    path('assets/', AssetListView.as_view(), name='asset-list'),
    path('assets/<int:pk>/', AssetDetailView.as_view(), name='asset-detail'),
    path('assets/<int:pk>/assign/', AssetAssignView.as_view(), name='asset-assign'),

    # ── Task Management ────────────────────────────────────────────────────
    path('tasks/', TaskListView.as_view(), name='task-list'),
    path('tasks/<int:pk>/', TaskDetailView.as_view(), name='task-detail'),

    # ── Advisory oversight + weekly team-lead updates ──────────────────────
    path('advisory/task-oversight/', AdvisoryTaskOversightView.as_view(), name='advisory-task-oversight'),
    path('advisory/daily-updates/', AdvisoryDailyUpdatesView.as_view(), name='advisory-daily-updates'),
    path('weekly-updates/', WeeklyUpdateView.as_view(), name='weekly-updates'),

    # ── Self-service signup (public hashed link -> OTP) + HR review ─────────
    path('signup/<str:link_hash>/', PublicSignupView.as_view(), name='public-signup'),
    path('signup/<str:link_hash>/verify/', VerifySignupOtpView.as_view(), name='verify-signup-otp'),
    path('signups/', SignupListView.as_view(), name='signup-list'),
    path('signups/<int:pk>/approve/', ApproveSignupView.as_view(), name='signup-approve'),
    path('signups/<int:pk>/reject/', RejectSignupView.as_view(), name='signup-reject'),
    path('signups/resend-credentials/', ResendCredentialsView.as_view(), name='signup-resend-credentials'),
]
