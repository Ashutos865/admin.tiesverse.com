from django.contrib.auth.models import User, Permission
from rest_framework import viewsets, permissions, views, response, status
from rest_framework_simplejwt.views import TokenObtainPairView
from .serializers import UserSerializer, PermissionSerializer, CustomTokenObtainPairSerializer, SettingSerializer
from .models import Setting


class IsSuperUser(permissions.BasePermission):
    """Only superusers can access user/permission management."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_superuser)


class UserViewSet(viewsets.ModelViewSet):
    """
    Full CRUD for user management.
    Only superusers can access this endpoint.
    Accepts an optional 'permissions' list of codenames in POST/PUT.
    """
    queryset = User.objects.all().order_by('-date_joined')
    serializer_class = UserSerializer
    permission_classes = [IsSuperUser]


class PermissionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only endpoint that lists all available Django permissions
    filtered to only our app-level models (tiesverse, career, webinar).
    Used by the frontend to build the permissions matrix UI.
    """
    serializer_class = PermissionSerializer
    permission_classes = [IsSuperUser]

    def get_queryset(self):
        app_labels = ['tiesverse_app', 'career_app', 'webinar_app']
        return Permission.objects.filter(
            content_type__app_label__in=app_labels
        ).select_related('content_type').order_by(
            'content_type__app_label', 'content_type__model', 'codename'
        )


class CustomTokenObtainPairView(TokenObtainPairView):
    """Uses our custom serializer that embeds permissions into the JWT."""
    serializer_class = CustomTokenObtainPairSerializer


class SettingViewSet(viewsets.ModelViewSet):
    queryset = Setting.objects.all()
    serializer_class = SettingSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = 'key'
    lookup_value_regex = '[^/]+'

    def get_queryset(self):
        defaults = {
            'event_display_limit_pc': '2',
            'event_display_limit_mobile': '1',
            'article_display_limit_pc': '3',
            'article_display_limit_mobile': '3',
            'youtube_display_limit_pc': '3',
            'youtube_display_limit_mobile': '2'
        }
        if not Setting.objects.exists():
            Setting.objects.bulk_create([
                Setting(key=k, value=v) for k, v in defaults.items()
            ])
        return Setting.objects.all()


class UserProfileView(views.APIView):
    """
    Endpoint to get or update the authenticated user's profile and settings.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return response.Response(serializer.data)

    def put(self, request):
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return response.Response(serializer.data)
        return response.Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
