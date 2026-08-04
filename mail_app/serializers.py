from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import (
    Mailbox, MailboxGrant, MailMessage, MailAuditLog,
    MailAttachment, MailBulkJob, MailDraft, MailNote,
)


def _user_label(user_id):
    """auth.User lives in the `default` DB while these models live in turso_db, so
    resolve with a separate query — never select_related across the boundary."""
    if not user_id:
        return ''
    User = get_user_model()
    u = User.objects.filter(pk=user_id).only('username', 'first_name', 'last_name').first()
    if not u:
        return ''
    return (u.get_full_name() or u.username or '').strip()


class MailboxSerializer(serializers.ModelSerializer):
    has_access_password = serializers.BooleanField(read_only=True)
    owner_name = serializers.SerializerMethodField()
    grant_count = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    can_send = serializers.SerializerMethodField()

    class Meta:
        model = Mailbox
        fields = [
            'id', 'kind', 'address', 'display_name', 'avatar_url',
            'member', 'user', 'owner_name',
            'is_active', 'is_archived', 'daily_send_limit',
            'has_access_password', 'grant_count', 'unread_count', 'can_send',
            'created_at', 'updated_at',
        ]
        # `user` IS writable: a superadmin picks which portal account owns the box.
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_address(self, value):
        return (value or '').strip().lower()

    def get_can_send(self, obj):
        """Whether THIS caller may send from the box, as opposed to merely read
        it. A superadmin overseeing someone else's mailbox gets False — they can
        look, but sending as another person is never allowed."""
        request = self.context.get('request')
        if request is None:
            return True                      # no caller context: don't hide the option
        from . import services
        from .views import mailbox_from_shared_token
        scoped = mailbox_from_shared_token(request)
        if scoped is not None:
            return scoped.id == obj.id
        return services.can_use_mailbox(request.user, obj)

    def get_owner_name(self, obj):
        if obj.member_id:
            return getattr(obj.member, 'candidate_name', '') or ''
        return _user_label(obj.user_id)

    def get_grant_count(self, obj):
        return obj.grants.count()

    def get_unread_count(self, obj):
        return obj.messages.filter(direction='IN', read_at__isnull=True,
                                   is_deleted=False).count()


class MailAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = MailAttachment
        # storage_key is deliberately absent: the client asks for a file by id and
        # the server decides whether it may have it.
        fields = ['id', 'filename', 'size', 'content_type', 'created_at']
        read_only_fields = fields


class MailMessageSerializer(serializers.ModelSerializer):
    is_read = serializers.BooleanField(read_only=True)
    sent_by_name = serializers.SerializerMethodField()
    mailbox_address = serializers.CharField(source='mailbox.address', read_only=True)
    attachments = MailAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = MailMessage
        fields = [
            'id', 'mailbox', 'mailbox_address', 'direction', 'peer', 'to', 'cc', 'bcc',
            'subject', 'body_text', 'body_html', 'snippet',
            'message_id', 'in_reply_to', 'thread_key',
            'status', 'error', 'sent_by_name', 'is_read', 'read_at',
            'is_deleted', 'spam_verdict', 'virus_verdict',
            'starred', 'snoozed_until', 'send_at', 'has_attachments', 'attachments',
            'published_at', 'created_at',
        ]
        read_only_fields = fields

    def get_sent_by_name(self, obj):
        return _user_label(obj.sent_by_user_id)


class MailMessageListSerializer(MailMessageSerializer):
    """Lighter payload for list views — no full bodies."""

    class Meta(MailMessageSerializer.Meta):
        fields = [
            f for f in MailMessageSerializer.Meta.fields
            if f not in ('body_text', 'body_html', 'attachments')
        ]
        read_only_fields = fields


class MailboxGrantSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    granted_by_name = serializers.SerializerMethodField()

    class Meta:
        model = MailboxGrant
        fields = ['id', 'mailbox', 'user', 'user_name', 'granted_by_name', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_user_name(self, obj):
        return _user_label(obj.user_id)

    def get_granted_by_name(self, obj):
        return _user_label(obj.granted_by_user_id)


class MailAuditLogSerializer(serializers.ModelSerializer):
    mailbox_address = serializers.CharField(source='mailbox.address', read_only=True)

    class Meta:
        model = MailAuditLog
        fields = ['id', 'actor_name', 'action', 'mailbox', 'mailbox_address',
                  'message', 'note', 'created_at']
        read_only_fields = fields


class MailDraftSerializer(serializers.ModelSerializer):
    attachments = MailAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = MailDraft
        fields = ['id', 'mailbox', 'to', 'cc', 'bcc', 'subject', 'body_text', 'body_html',
                  'in_reply_to', 'thread_key', 'attachments',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'attachments', 'created_at', 'updated_at']


class MailNoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = MailNote
        fields = ['id', 'mailbox', 'thread_key', 'author_name', 'body', 'created_at']
        read_only_fields = ['id', 'author_name', 'created_at']


class MailBulkJobSerializer(serializers.ModelSerializer):
    attachments = MailAttachmentSerializer(many=True, read_only=True)
    total = serializers.IntegerField(read_only=True)
    # Recipient rows can be long; the list view sends a count, not the payload.
    recipient_preview = serializers.SerializerMethodField()

    class Meta:
        model = MailBulkJob
        fields = ['id', 'mailbox', 'name', 'subject', 'body_text',
                  'status', 'cursor', 'total', 'sent_count', 'failed_count',
                  'last_error', 'attachments', 'recipient_preview',
                  'created_at', 'updated_at', 'finished_at']
        read_only_fields = ['id', 'status', 'cursor', 'total', 'sent_count',
                            'failed_count', 'last_error', 'attachments',
                            'created_at', 'updated_at', 'finished_at']

    def get_recipient_preview(self, obj):
        return [r.get('email') for r in (obj.recipients or [])[:5]]
