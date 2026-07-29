from rest_framework import serializers

from .models import MonitorChannel, MonitorAlert, MonitorOwnPost
from . import youtube


class MonitorChannelSerializer(serializers.ModelSerializer):
    alert_count = serializers.IntegerField(source='alerts.count', read_only=True)

    class Meta:
        model = MonitorChannel
        fields = ['id', 'name', 'source', 'source_handle', 'youtube_id', 'priority',
                  'kind', 'active', 'last_checked', 'last_error', 'last_error_at',
                  'created_at', 'alert_count']
        read_only_fields = ['youtube_id', 'last_checked', 'last_error', 'last_error_at',
                            'created_at', 'alert_count']

    def validate_source(self, value):
        # YouTube-only in this phase.
        if value and value != 'youtube':
            raise serializers.ValidationError('Only YouTube channels are supported right now.')
        return value or 'youtube'

    def validate_priority(self, value):
        if value not in range(1, 6):
            raise serializers.ValidationError('priority must be 1..5')
        return value

    def validate(self, attrs):
        # Normalise the YouTube channel id (accepts UC… or a URL/handle containing it).
        raw = attrs.get('source_handle', getattr(self.instance, 'source_handle', ''))
        try:
            channel_id = youtube.normalize_youtube_channel_id(raw)
        except ValueError as exc:
            raise serializers.ValidationError({'source_handle': str(exc)})
        attrs['source_handle'] = channel_id
        attrs['youtube_id'] = channel_id
        attrs['source'] = 'youtube'
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
