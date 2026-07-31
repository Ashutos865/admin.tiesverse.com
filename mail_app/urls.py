from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import (
    MailAuditLogView, MailboxAdminViewSet, MailboxAvatarView, MailboxGrantView,
    MailboxPasswordView, MailMessageDetailView, MailMessageListView, MailSendView,
    MyMailboxesView, SharedMailboxLoginView,
)

# trailing_slash=True to match the admin's apiClient (withSlash appends a slash).
router = SimpleRouter(trailing_slash=True)
router.register(r'admin/mailboxes', MailboxAdminViewSet, basename='mail-admin-mailbox')

urlpatterns = [
    # mailbox users
    path('me/', MyMailboxesView.as_view(), name='mail-me'),
    path('messages/', MailMessageListView.as_view(), name='mail-messages'),
    path('messages/<int:pk>/', MailMessageDetailView.as_view(), name='mail-message-detail'),
    path('send/', MailSendView.as_view(), name='mail-send'),
    path('mailboxes/<int:pk>/avatar/', MailboxAvatarView.as_view(), name='mail-avatar'),

    # team sign-in with a shared-mailbox password (no portal account needed)
    path('shared-login/', SharedMailboxLoginView.as_view(), name='mail-shared-login'),

    # superadmin administration
    path('admin/mailboxes/<int:pk>/password/', MailboxPasswordView.as_view(), name='mail-password'),
    path('admin/mailboxes/<int:pk>/grants/', MailboxGrantView.as_view(), name='mail-grants'),
    path('admin/audit/', MailAuditLogView.as_view(), name='mail-audit'),

    *router.urls,
]
