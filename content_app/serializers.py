"""Serializers for the Content Calendar.

Assignee names are resolved in one query per page via a prefetch on the viewset,
so the table can render avatars without an N+1. The linked task is summarised
inline (never select_related — Task lives on turso_db but auth.User does not).
"""
from rest_framework import serializers

from .models import ContentActivity, ContentItem


class MemberChipSerializer(serializers.Serializer):
    """Just enough of a member to draw an avatar chip.

    `avatar_url` is read from a prebuilt {member_id: url} map passed in context —
    profile pictures live on accounts_app.UserProfile in the OTHER database, so
    resolving them per-object would cost two queries per person. The board view
    builds the map once; when it is absent (a single-item fetch) we fall back to
    looking that one member up.
    """
    id = serializers.IntegerField()
    name = serializers.CharField(source='candidate_name')
    email = serializers.CharField(source='candidate_email')
    crew_id = serializers.CharField(required=False, allow_null=True)
    avatar_url = serializers.SerializerMethodField()

    def get_avatar_url(self, obj):
        cached = self.context.get('avatars')
        if cached is not None:
            return cached.get(obj.id, '')
        try:
            from content_app.views import avatar_map
            return avatar_map([obj.id]).get(obj.id, '')
        except Exception:  # noqa: BLE001
            return ''


class ContentActivitySerializer(serializers.ModelSerializer):
    class Meta:
        model = ContentActivity
        fields = ['id', 'verb', 'detail', 'actor_name', 'created_at']
        read_only_fields = fields


class ContentItemSerializer(serializers.ModelSerializer):
    content_assignees_detail = MemberChipSerializer(
        source='content_assignees', many=True, read_only=True)
    graphics_assignees_detail = MemberChipSerializer(
        source='graphics_assignees', many=True, read_only=True)
    task_detail = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = ContentItem
        fields = [
            'id', 'brand', 'title', 'content_type', 'status',
            'content_assignees', 'graphics_assignees',
            'content_assignees_detail', 'graphics_assignees_detail',
            'doc_url', 'extra_links', 'due_date', 'release_date',
            'platforms', 'posting_url', 'priority', 'effort', 'notes',
            'task', 'task_detail', 'order', 'is_overdue',
            'created_at', 'updated_at',
        ]
        # The task link is managed by services.ensure_task, never by the client.
        read_only_fields = ['id', 'task', 'created_at', 'updated_at']

    def get_task_detail(self, obj):
        """Every linked task — one per assignee, so the panel can show who owes
        what rather than only the first person's."""
        rows = []
        for t in obj.tasks.all():
            rows.append({
                'id': t.id, 'status': t.status, 'priority': t.priority,
                'due_date': t.due_date, 'progress': t.progress,
                'track': t.assigned_to_department or '',
                'assigned_to_name': (getattr(t.assigned_to, 'candidate_name', '')
                                     if t.assigned_to_id else ''),
            })
        if not rows:
            return None
        rows.sort(key=lambda r: (r['track'] != 'Content', r['assigned_to_name']))
        return rows

    def get_is_overdue(self, obj):
        """Past its due date and not finished — drives the red marker in the UI."""
        from datetime import date
        if not obj.due_date or obj.status == 'published':
            return False
        return obj.due_date < date.today()

    def validate_title(self, v):
        v = (v or '').strip()
        if not v:
            raise serializers.ValidationError('Give the content a name.')
        return v

    def validate_platforms(self, v):
        if not isinstance(v, list):
            raise serializers.ValidationError('Platforms must be a list.')
        return [str(p).strip() for p in v if str(p).strip()]

    def validate_extra_links(self, v):
        if not isinstance(v, list):
            raise serializers.ValidationError('Links must be a list.')
        out = []
        for entry in v:
            if isinstance(entry, dict) and entry.get('url'):
                out.append({'label': str(entry.get('label', ''))[:120],
                            'url': str(entry['url'])[:1000]})
            elif isinstance(entry, str) and entry.strip():
                out.append({'label': '', 'url': entry.strip()[:1000]})
        return out

    def validate(self, attrs):
        due = attrs.get('due_date', getattr(self.instance, 'due_date', None))
        rel = attrs.get('release_date', getattr(self.instance, 'release_date', None))
        if due and rel and due > rel:
            raise serializers.ValidationError(
                {'due_date': 'The work is due after the release date — check the dates.'})
        return attrs
