from django.contrib import admin

from .models import ContentActivity, ContentItem


class ContentActivityInline(admin.TabularInline):
    model = ContentActivity
    extra = 0
    readonly_fields = ('verb', 'detail', 'actor_name', 'created_at')
    can_delete = False


@admin.register(ContentItem)
class ContentItemAdmin(admin.ModelAdmin):
    list_display = ('title', 'brand', 'status', 'content_type',
                    'due_date', 'release_date', 'priority')
    list_filter = ('status', 'content_type', 'priority', 'brand')
    search_fields = ('title', 'brand', 'notes')
    date_hierarchy = 'release_date'
    inlines = [ContentActivityInline]
    # M2M targets live on turso_db like this app, so the picker is safe.
    filter_horizontal = ('content_assignees', 'graphics_assignees')


@admin.register(ContentActivity)
class ContentActivityAdmin(admin.ModelAdmin):
    list_display = ('item', 'verb', 'actor_name', 'created_at')
    list_filter = ('verb',)
    readonly_fields = ('item', 'verb', 'detail', 'actor_admin', 'actor_name', 'created_at')
