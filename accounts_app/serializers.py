from django.contrib.auth.models import User, Permission
from django.contrib.contenttypes.models import ContentType
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


class PermissionSerializer(serializers.ModelSerializer):
    """Serializes Django's built-in Permission model."""
    app_label = serializers.CharField(source='content_type.app_label', read_only=True)
    model = serializers.CharField(source='content_type.model', read_only=True)

    class Meta:
        model = Permission
        fields = ('id', 'codename', 'name', 'app_label', 'model')


class UserSerializer(serializers.ModelSerializer):
    """
    Handles user CRUD with an optional 'permissions' field.
    When creating/updating a user, you can pass a list of permission codenames
    (e.g. ['add_event', 'view_article']) to assign permissions.
    """
    permissions = serializers.ListField(
        child=serializers.CharField(),
        write_only=True,
        required=False,
        default=[]
    )
    user_permissions = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = User
        fields = (
            'id', 'username', 'email', 'is_staff', 'is_superuser',
            'is_active', 'password', 'permissions', 'user_permissions'
        )
        extra_kwargs = {'password': {'write_only': True}}

    def get_user_permissions(self, obj):
        """Return the list of permission codenames assigned to this user."""
        return list(obj.user_permissions.values_list('codename', flat=True))

    def create(self, validated_data):
        permission_codenames = validated_data.pop('permissions', [])
        password = validated_data.pop('password', None)
        user = super().create(validated_data)
        if password:
            user.set_password(password)
            user.save()
        if permission_codenames:
            self._assign_permissions(user, permission_codenames)
        return user

    def update(self, instance, validated_data):
        permission_codenames = validated_data.pop('permissions', None)
        password = validated_data.pop('password', None)
        user = super().update(instance, validated_data)
        if password:
            user.set_password(password)
            user.save()
        if permission_codenames is not None:
            self._assign_permissions(user, permission_codenames)
        return user

    def _assign_permissions(self, user, codenames):
        """Clear existing permissions and assign the new set."""
        # Filter to only our app-level permissions
        app_labels = ['tiesverse_app', 'career_app', 'webinar_app', 'accounts_app']
        perms = Permission.objects.filter(
            codename__in=codenames,
            content_type__app_label__in=app_labels
        )
        user.user_permissions.set(perms)


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Extends the default JWT serializer to embed user role and
    permission information directly into the access token payload.
    """
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        # Basic identity claims
        token['username'] = user.username
        token['is_superuser'] = user.is_superuser
        token['is_staff'] = user.is_staff

        # Embed all user permissions as a list of codenames
        # For superusers, we embed a special flag — they bypass all checks anyway
        if user.is_superuser:
            token['permissions'] = ['__all__']
        else:
            token['permissions'] = list(
                user.user_permissions.values_list('codename', flat=True)
            )

        return token
