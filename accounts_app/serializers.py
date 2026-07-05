from django.contrib.auth.models import User, Permission
from django.contrib.contenttypes.models import ContentType
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import Setting, UserProfile, EmailTemplate, EmailCampaign, FeaturedContent


class PermissionSerializer(serializers.ModelSerializer):
    """Serializes Django's built-in Permission model."""
    app_label = serializers.CharField(source='content_type.app_label', read_only=True)
    model = serializers.CharField(source='content_type.model', read_only=True)

    class Meta:
        model = Permission
        fields = ('id', 'codename', 'name', 'app_label', 'model')


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = (
            'display_name', 'bio', 'email_notifications', 'push_notifications',
            'weekly_reports', 'two_factor_enabled', 'session_timeout', 'theme', 'accent_color'
        )


class EmailTemplateSerializer(serializers.ModelSerializer):
    # Generated server-side (or provided only in HTML mode), so never required.
    body_html = serializers.CharField(required=False, allow_blank=True)
    content_json = serializers.JSONField(required=False)

    class Meta:
        model = EmailTemplate
        fields = (
            'id', 'key', 'name', 'description', 'subject', 'from_name', 'from_email',
            'content_json', 'body_html', 'is_enabled', 'allow_attachment', 'variables',
            'is_custom', 'html_mode', 'updated_at', 'updated_by',
        )
        # body_html is derived unless html_mode; key/is_custom are managed by the view.
        read_only_fields = ('id', 'key', 'is_custom', 'updated_at', 'updated_by')


class EmailCampaignSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmailCampaign
        fields = '__all__'
        read_only_fields = ('id', 'created_at')


class FeaturedContentSerializer(serializers.ModelSerializer):
    class Meta:
        model = FeaturedContent
        fields = '__all__'
        read_only_fields = ('id', 'created_at', 'updated_at')


class UserSerializer(serializers.ModelSerializer):
    """
    Handles user CRUD with an optional 'permissions' field.
    When creating/updating a user, you can pass a list of permission codenames
    (e.g. ['add_event', 'view_article']) to assign permissions.
    """
    profile = UserProfileSerializer(required=False)
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
            'is_active', 'password', 'permissions', 'user_permissions', 'profile'
        )
        extra_kwargs = {'password': {'write_only': True}}

    def get_user_permissions(self, obj):
        """Return the list of permission codenames assigned to this user."""
        return list(obj.user_permissions.values_list('codename', flat=True))

    def create(self, validated_data):
        permission_codenames = validated_data.pop('permissions', [])
        password = validated_data.pop('password', None)
        profile_data = validated_data.pop('profile', None)
        user = super().create(validated_data)
        if password:
            user.set_password(password)
            user.save()
        if permission_codenames:
            self._assign_permissions(user, permission_codenames)
        
        # Profile is created by signal, update any provided fields
        if profile_data:
            profile, _ = UserProfile.objects.get_or_create(user=user)
            for attr, val in profile_data.items():
                setattr(profile, attr, val)
            profile.save()
        return user

    def update(self, instance, validated_data):
        permission_codenames = validated_data.pop('permissions', None)
        password = validated_data.pop('password', None)
        profile_data = validated_data.pop('profile', None)
        user = super().update(instance, validated_data)
        if password:
            user.set_password(password)
            user.save()
        if permission_codenames is not None:
            self._assign_permissions(user, permission_codenames)
        
        # Get or create profile and update fields
        if profile_data is not None:
            profile, _ = UserProfile.objects.get_or_create(user=user)
            for attr, val in profile_data.items():
                setattr(profile, attr, val)
            profile.save()
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

        # Embed all permissions (direct + group) as codenames so the frontend
        # can check can_delegate_permissions regardless of how it was granted.
        if user.is_superuser:
            token['permissions'] = ['__all__']
        else:
            direct = set(user.user_permissions.values_list('codename', flat=True))
            group = set(
                Permission.objects.filter(group__user=user).values_list('codename', flat=True)
            )
            token['permissions'] = list(direct | group)

        return token

    def validate(self, attrs):
        # Authenticates + runs the stock is_active check, then enforces offboarding:
        # if this member's last working day has arrived, revoke access and block login.
        data = super().validate(attrs)
        from rest_framework_simplejwt.exceptions import AuthenticationFailed
        try:
            from career_app.offboarding import enforce_offboarding_on_login
            revoked = enforce_offboarding_on_login(self.user)
        except AuthenticationFailed:
            raise
        except Exception:  # noqa: BLE001 — never let enforcement crash login for others
            revoked = False
        if revoked:
            raise AuthenticationFailed('Your portal access has ended. Please contact HR.', 'offboarded')
        return data


class SettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Setting
        fields = ['key', 'value']
