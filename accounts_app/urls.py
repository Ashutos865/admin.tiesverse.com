from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    UserViewSet, PermissionViewSet, UserProfileView,
    DelegatablePermissionsView, TeamMembersForDelegationView, DelegatePermissionsView,
    PasswordResetRequestView, PasswordResetConfirmView,
    PasswordChangeRequestView, PasswordChangeConfirmView, EmailTemplateViewSet,
    EmailCampaignViewSet, SESSendersView, FeaturedContentViewSet, PublicFeaturedView,
    EmailDraftViewSet, SESNotificationView, SiteNavCategoryViewSet,
)

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'permissions', PermissionViewSet, basename='permission')
router.register(r'email-templates', EmailTemplateViewSet, basename='email-template')
router.register(r'email-campaigns', EmailCampaignViewSet, basename='email-campaign')
router.register(r'featured', FeaturedContentViewSet, basename='featured')
router.register(r'email-drafts', EmailDraftViewSet, basename='email-draft')
router.register(r'nav-categories', SiteNavCategoryViewSet, basename='nav-category')

urlpatterns = [
    path('profile/', UserProfileView.as_view(), name='user-profile'),
    # Password reset (public, no auth)
    path('ses-senders/', SESSendersView.as_view(), name='ses-senders'),
    # SES bounce/complaint/delivery notifications (via SNS) — public webhook
    path('ses-notify/', SESNotificationView.as_view(), name='ses-notify'),
    path('password-reset/', PasswordResetRequestView.as_view(), name='password-reset'),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view(), name='password-reset-confirm'),
    # In-app change password (authenticated, email OTP)
    path('password-change/request/', PasswordChangeRequestView.as_view(), name='password-change-request'),
    path('password-change/confirm/', PasswordChangeConfirmView.as_view(), name='password-change-confirm'),
    # Delegation endpoints (team leads + superusers)
    path('delegatable-permissions/', DelegatablePermissionsView.as_view(), name='delegatable-perms'),
    path('team-members-for-delegation/', TeamMembersForDelegationView.as_view(), name='delegation-members'),
    path('users/<int:pk>/delegate/', DelegatePermissionsView.as_view(), name='delegate-perms'),
    path('', include(router.urls)),
]
