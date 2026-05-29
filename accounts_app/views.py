from django.contrib.auth.models import User, Permission
from rest_framework import viewsets, permissions
from rest_framework_simplejwt.views import TokenObtainPairView
from .serializers import UserSerializer, PermissionSerializer, CustomTokenObtainPairSerializer


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
