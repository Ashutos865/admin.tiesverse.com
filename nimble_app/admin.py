from django.contrib import admin
from .models import MonitorChannel, MonitorAlert, MonitorOwnPost


class MonitorAlertInline(admin.TabularInline):
    model = MonitorAlert
    extra = 0
    fields = ('title', 'status', 'published_at', 'unread')
    readonly_fields = ('title', 'published_at')


class MonitorChannelAdmin(admin.ModelAdmin):
    list_display = ('name', 'source', 'source_handle', 'kind', 'active', 'priority', 'last_checked')
    list_filter = ('source', 'kind', 'active')
    search_fields = ('name', 'source_handle')
    inlines = [MonitorAlertInline]


class MonitorAlertAdmin(admin.ModelAdmin):
    list_display = ('title', 'channel', 'status', 'published_at', 'unread')
    list_filter = ('status', 'unread')
    search_fields = ('title', 'note')


admin.site.register(MonitorChannel, MonitorChannelAdmin)
admin.site.register(MonitorAlert, MonitorAlertAdmin)
admin.site.register(MonitorOwnPost)
