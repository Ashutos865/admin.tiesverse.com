from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import (
    MailAttachmentDetailView, MailAttachmentUploadView, MailAuditLogView,
    MailboxAdminViewSet, MailboxAvatarView, MailboxGrantView, MailboxPasswordView,
    MailCountsView, MailDraftDetailView, MailDraftListView,
    MailMessageCancelView, MailMessageDetailView, MailMessageFlagsView,
    MailMessageListView, MailMessageReleaseView, MailNoteView, MailSendView,
    MailSsoRedeemView, MailSsoTicketView,
    MyMailboxesView, SharedMailboxLoginView,
)

# trailing_slash=True to match the admin's apiClient (withSlash appends a slash).
router = SimpleRouter(trailing_slash=True)
router.register(r'admin/mailboxes', MailboxAdminViewSet, basename='mail-admin-mailbox')

urlpatterns = [
    # mailbox users
    path('me/', MyMailboxesView.as_view(), name='mail-me'),
    path('counts/', MailCountsView.as_view(), name='mail-counts'),
    path('messages/', MailMessageListView.as_view(), name='mail-messages'),
    path('messages/<int:pk>/', MailMessageDetailView.as_view(), name='mail-message-detail'),
    path('messages/<int:pk>/flags/', MailMessageFlagsView.as_view(), name='mail-message-flags'),
    path('messages/<int:pk>/cancel/', MailMessageCancelView.as_view(), name='mail-message-cancel'),
    path('messages/<int:pk>/release/', MailMessageReleaseView.as_view(), name='mail-message-release'),
    path('send/', MailSendView.as_view(), name='mail-send'),
    path('mailboxes/<int:pk>/avatar/', MailboxAvatarView.as_view(), name='mail-avatar'),

    # composing
    path('drafts/', MailDraftListView.as_view(), name='mail-drafts'),
    path('drafts/<int:pk>/', MailDraftDetailView.as_view(), name='mail-draft-detail'),
    path('attachments/', MailAttachmentUploadView.as_view(), name='mail-attachments'),
    path('attachments/<int:pk>/', MailAttachmentDetailView.as_view(), name='mail-attachment-detail'),

    # internal comments on a thread — never emailed
    path('notes/', MailNoteView.as_view(), name='mail-notes'),

    # team sign-in with a shared-mailbox password (no portal account needed)
    path('shared-login/', SharedMailboxLoginView.as_view(), name='mail-shared-login'),

    # silent sign-in when arriving from the admin panel
    path('sso-ticket/', MailSsoTicketView.as_view(), name='mail-sso-ticket'),
    path('sso-redeem/', MailSsoRedeemView.as_view(), name='mail-sso-redeem'),

    # superadmin administration
    path('admin/mailboxes/<int:pk>/password/', MailboxPasswordView.as_view(), name='mail-password'),
    path('admin/mailboxes/<int:pk>/grants/', MailboxGrantView.as_view(), name='mail-grants'),
    path('admin/audit/', MailAuditLogView.as_view(), name='mail-audit'),

    *router.urls,
]
