"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenRefreshView
from accounts_app.views import CustomTokenObtainPairView, SettingViewSet
from tiesverse_app.media_views import MediaUploadView, CloudinaryImageListView
from config.certificate_proxy import certificate_generator_proxy
from config.certificate_workflow import (
    certificate_import_records,
    certificate_import_rows,
    certificate_mark_emailed,
    certificate_records,
    certificate_records_csv,
    certificate_send_emails,
    certificate_sources,
)
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register(r'settings', SettingViewSet, basename='setting')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/token/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/accounts/', include('accounts_app.urls')),
    path('api/landing/', include('tiesverse_app.urls')),
    path('api/career/', include('career_app.urls')),
    path('api/webinar/', include('webinar_app.urls')),
    path('api/media/upload/', MediaUploadView.as_view(), name='media_upload'),
    path('api/media/images/', CloudinaryImageListView.as_view(), name='media_images'),
    path('api/certificates/proxy/<path:remote_path>', certificate_generator_proxy, name='certificate_generator_proxy'),
    path('api/certificates/sources/', certificate_sources, name='certificate_sources'),
    path('api/certificates/import-rows/', certificate_import_rows, name='certificate_import_rows'),
    path('api/certificates/import-records/', certificate_import_records, name='certificate_import_records'),
    path('api/certificates/records/', certificate_records, name='certificate_records'),
    path('api/certificates/records/csv/', certificate_records_csv, name='certificate_records_csv'),
    path('api/certificates/records/mark-emailed/', certificate_mark_emailed, name='certificate_mark_emailed'),
    path('api/certificates/records/send-emails/', certificate_send_emails, name='certificate_send_emails'),
    path('api/', include(router.urls)),
]
