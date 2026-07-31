from django.contrib import admin

from .models import Mailbox, MailboxGrant, MailMessage, MailAuditLog


class MailboxGrantInline(admin.TabularInline):
    model = MailboxGrant
    extra = 0
    raw_id_fields = ('user', 'granted_by_user')


@admin.register(Mailbox)
class MailboxAdmin(admin.ModelAdmin):
    list_display = ('address', 'kind', 'display_name', 'is_active', 'is_archived',
                    'daily_send_limit', 'created_at')
    list_filter = ('kind', 'is_active', 'is_archived')
    search_fields = ('address', 'display_name')
    raw_id_fields = ('member', 'user', 'created_by_user')
    inlines = [MailboxGrantInline]
    exclude = ('access_password',)          # set via the API so it is always hashed


@admin.register(MailMessage)
class MailMessageAdmin(admin.ModelAdmin):
    list_display = ('subject', 'mailbox', 'direction', 'peer', 'status',
                    'is_deleted', 'created_at')
    list_filter = ('direction', 'status', 'is_deleted')
    search_fields = ('subject', 'peer', 'message_id')
    raw_id_fields = ('mailbox', 'sent_by_user')


@admin.register(MailAuditLog)
class MailAuditLogAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'actor_name', 'action', 'mailbox', 'note')
    list_filter = ('action',)
    search_fields = ('actor_name', 'note')
    raw_id_fields = ('mailbox', 'message', 'actor_user')
