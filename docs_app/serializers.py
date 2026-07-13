from rest_framework import serializers
from .models import DocSpace, DocPage


class DocPageSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = DocPage
        fields = ['id', 'space', 'parent', 'slug', 'title', 'body', 'order',
                  'is_published', 'updated_at', 'updated_by_name']
        read_only_fields = ['updated_at', 'updated_by_name']

    def get_updated_by_name(self, obj):
        u = obj.updated_by
        return (u.get_short_name() or u.username) if u else ''


class DocPageTreeSerializer(serializers.ModelSerializer):
    """Lightweight node for the navigation tree (no body)."""
    class Meta:
        model = DocPage
        fields = ['id', 'space', 'parent', 'slug', 'title', 'order']


class DocSpaceSerializer(serializers.ModelSerializer):
    page_count = serializers.IntegerField(source='pages.count', read_only=True)

    class Meta:
        model = DocSpace
        fields = ['id', 'slug', 'name', 'description', 'icon', 'order', 'page_count']
