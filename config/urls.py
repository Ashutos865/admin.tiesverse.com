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
from accounts_app.views import (
    CustomTokenObtainPairView, SettingViewSet, PublicFeaturedView, PublicEmailTemplateView,
)
from tiesverse_app.media_views import MediaUploadView, CloudinaryImageListView, DocumentUploadView
from config.certificate_proxy import certificate_generator_proxy
from config.wordpress_proxy import wordpress_proxy
from config.newsroom import (
    public_newsroom_nav, public_newsroom_articles,
    public_events_feed, public_guests_feed, public_tech_products, public_brands, public_site_images,
    public_site_image,
)
from config.certificate_workflow import (
    certificate_import_records,
    certificate_import_rows,
    certificate_mark_emailed,
    certificate_records,
    certificate_records_csv,
    certificate_send_emails,
    certificate_sources,
    verify_certificate,
    verify_certificate_photo,
)
from config.data_sources import list_data_sources, data_source_rows
from config.tech_stats import technical_stats
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register(r'settings', SettingViewSet, basename='setting')

from tiesverse_app.data_api import data_schema, data_records, data_upload

urlpatterns = [
    path('admin/', admin.site.urls),
    # ── Standalone Data API (cross-domain, API-key auth) ──
    path('api/data/v1/<str:slug>/schema/', data_schema, name='data-schema'),
    path('api/data/v1/<str:slug>/records/', data_records, name='data-records'),
    path('api/data/v1/uploads/<int:store_id>/<str:name>/', data_upload, name='data-upload'),
    path('api/public/featured/', PublicFeaturedView.as_view(), name='public-featured'),
    path('api/public/newsroom/nav/', public_newsroom_nav, name='public-newsroom-nav'),
    path('api/public/newsroom/articles/', public_newsroom_articles, name='public-newsroom-articles'),
    path('api/public/events/', public_events_feed, name='public-events-feed'),
    path('api/public/guests/', public_guests_feed, name='public-guests-feed'),
    path('api/public/tech-products/', public_tech_products, name='public-tech-products'),
    path('api/public/brands/', public_brands, name='public-brands'),
    path('api/public/verify-certificate/', verify_certificate, name='verify-certificate'),
    path('api/public/verify-certificate/photo/', verify_certificate_photo, name='verify-certificate-photo'),
    path('api/public/site-images/', public_site_images, name='public-site-images'),
    path('api/public/site-image/<str:key>/', public_site_image, name='public-site-image'),
    path('api/public/email-template/<str:key>/', PublicEmailTemplateView.as_view(), name='public-email-template'),
    path('api/token/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/accounts/', include('accounts_app.urls')),
    path('api/landing/', include('tiesverse_app.urls')),
    path('api/career/', include('career_app.urls')),
    path('api/webinar/', include('webinar_app.urls')),
    path('api/learn/', include('learn_app.urls')),
    path('api/docs/', include('docs_app.urls')),
    path('api/media/upload/', MediaUploadView.as_view(), name='media_upload'),
    path('api/media/upload-file/', DocumentUploadView.as_view(), name='media_upload_file'),
    path('api/media/images/', CloudinaryImageListView.as_view(), name='media_images'),
    path('api/certificates/proxy/<path:remote_path>', certificate_generator_proxy, name='certificate_generator_proxy'),
    path('api/wordpress/<path:remote_path>', wordpress_proxy, name='wordpress_proxy'),
    path('api/certificates/sources/', certificate_sources, name='certificate_sources'),
    path('api/certificates/import-rows/', certificate_import_rows, name='certificate_import_rows'),
    path('api/certificates/import-records/', certificate_import_records, name='certificate_import_records'),
    path('api/certificates/records/', certificate_records, name='certificate_records'),
    path('api/certificates/records/csv/', certificate_records_csv, name='certificate_records_csv'),
    path('api/certificates/records/mark-emailed/', certificate_mark_emailed, name='certificate_mark_emailed'),
    path('api/certificates/records/send-emails/', certificate_send_emails, name='certificate_send_emails'),
    path('api/data-sources/', list_data_sources, name='data_sources'),
    path('api/data-sources/<str:source_id>/rows/', data_source_rows, name='data_source_rows'),
    path('api/technical/stats/', technical_stats, name='technical_stats'),
    path('api/', include(router.urls)),
]
