from rest_framework import serializers

from .models import MonitorChannel, MonitorAlert, MonitorOwnPost
from . import platforms


class MonitorChannelSerializer(serializers.ModelSerializer):
    alert_count = serializers.IntegerField(source='alerts.count', read_only=True)
    platform_label = serializers.SerializerMethodField()
    is_unhealthy = serializers.BooleanField(read_only=True)

    class Meta:
        model = MonitorChannel
        fields = ['id', 'name', 'source', 'platform_label', 'source_handle', 'youtube_id',
                  'priority', 'kind', 'active', 'last_checked', 'last_error', 'last_error_at',
                  'consecutive_failures', 'last_success_at', 'is_unhealthy',
                  'created_at', 'alert_count']
        read_only_fields = ['youtube_id', 'platform_label', 'last_checked', 'last_error',
                            'last_error_at', 'consecutive_failures', 'last_success_at',
                            'is_unhealthy', 'created_at', 'alert_count']

    def get_platform_label(self, obj):
        return platforms.platform_label(obj.source)

    def validate_source(self, value):
        source = platforms.normalize_source(value) or 'youtube'
        if not platforms.is_enabled(source):
            raise serializers.ValidationError(
                f'{platforms.platform_label(source)} monitoring is not enabled.')
        return source

    def validate_priority(self, value):
        if value not in range(1, 6):
            raise serializers.ValidationError('priority must be 1..5')
        return value

    def validate(self, attrs):
        # Resolve the platform, then normalise the handle with that platform's rules
        # (UC… id for YouTube; username/URL for X/Instagram).
        source = attrs.get('source') or getattr(self.instance, 'source', None) or 'youtube'
        source = platforms.normalize_source(source) or 'youtube'
        raw = attrs.get('source_handle', getattr(self.instance, 'source_handle', ''))
        try:
            handle = platforms.normalize_handle(source, raw)
        except ValueError as exc:
            raise serializers.ValidationError({'source_handle': str(exc)})
        attrs['source'] = source
        attrs['source_handle'] = handle
        # youtube_id is a YouTube-only convenience mirror.
        attrs['youtube_id'] = handle if source == 'youtube' else ''
        return attrs


class MonitorAlertSerializer(serializers.ModelSerializer):
    channel_name = serializers.CharField(source='channel.name', read_only=True)
    channel_kind = serializers.CharField(source='channel.kind', read_only=True)
    platform = serializers.CharField(source='channel.source', read_only=True)

    class Meta:
        model = MonitorAlert
        fields = ['id', 'channel', 'channel_name', 'channel_kind', 'platform', 'item_id',
                  'youtube_video_id', 'title', 'url', 'published_at', 'thumbnail_url',
                  'status', 'assigned_to', 'note', 'unread', 'created_at']
        # Only the response fields are editable; the post itself is detected data.
        read_only_fields = ['channel', 'channel_name', 'channel_kind', 'platform', 'item_id',
                           'youtube_video_id', 'title', 'url', 'published_at', 'thumbnail_url',
                           'created_at']

    def validate_status(self, value):
        if value not in {'OPEN', 'WORKING'}:
            raise serializers.ValidationError('status must be OPEN or WORKING')
        return value


class MonitorOwnPostSerializer(serializers.ModelSerializer):
    class Meta:
        model = MonitorOwnPost
        fields = ['id', 'title', 'published_at', 'source', 'created_at']
        read_only_fields = ['created_at']

    def validate_title(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('title is required')
        return value
