from rest_framework import serializers
from .models import DocSpace, DocPage


class DocPageSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.SerializerMethodField()
    allowed_team_names = serializers.SerializerMethodField()

    class Meta:
        model = DocPage
        fields = ['id', 'space', 'parent', 'slug', 'title', 'body', 'visibility',
                  'allowed_teams', 'allowed_team_names', 'order',
                  'is_published', 'updated_at', 'updated_by_name']
        read_only_fields = ['updated_at', 'updated_by_name', 'allowed_team_names']

    def get_updated_by_name(self, obj):
        u = obj.updated_by
        return (u.get_short_name() or u.username) if u else ''

    def get_allowed_team_names(self, obj):
        """Resolve team IDs to names from HRDepartment model."""
        if not obj.allowed_teams:
            return []
        from career_app.models import HRDepartment
        return list(
            HRDepartment.objects.filter(id__in=obj.allowed_teams)
            .values_list('name', flat=True)
        )


class DocPageTreeSerializer(serializers.ModelSerializer):
    """Lightweight node for the navigation tree (no body)."""
    class Meta:
        model = DocPage
        fields = ['id', 'space', 'parent', 'slug', 'title', 'visibility', 'order']


class DocSpaceSerializer(serializers.ModelSerializer):
    page_count = serializers.IntegerField(source='pages.count', read_only=True)

    class Meta:
        model = DocSpace
        fields = ['id', 'slug', 'name', 'description', 'icon', 'order', 'page_count']
