from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    UserViewSet, PermissionViewSet, UserProfileView,
    DelegatablePermissionsView, TeamMembersForDelegationView, DelegatePermissionsView,
    PasswordResetRequestView, PasswordResetConfirmView, EmailTemplateViewSet,
)

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'permissions', PermissionViewSet, basename='permission')
router.register(r'email-templates', EmailTemplateViewSet, basename='email-template')

urlpatterns = [
    path('profile/', UserProfileView.as_view(), name='user-profile'),
    # Password reset (public, no auth)
    path('password-reset/', PasswordResetRequestView.as_view(), name='password-reset'),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view(), name='password-reset-confirm'),
    # Delegation endpoints (team leads + superusers)
    path('delegatable-permissions/', DelegatablePermissionsView.as_view(), name='delegatable-perms'),
    path('team-members-for-delegation/', TeamMembersForDelegationView.as_view(), name='delegation-members'),
    path('users/<int:pk>/delegate/', DelegatePermissionsView.as_view(), name='delegate-perms'),
    path('', include(router.urls)),
]
