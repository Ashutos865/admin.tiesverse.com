from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    DepartmentViewSet, TeamMemberViewSet, TeamMemberSocialViewSet,
    EventViewSet, EventSpeakerViewSet, EventRegistrationViewSet,
    WebinarListingViewSet, TechProductViewSet, BrandViewSet,
)
from .views import site_images_admin, site_image_upload
from .data_api import (
    data_stores, data_store_detail, data_store_records, data_keys, data_key_detail,
)

router = DefaultRouter()
router.register(r'departments', DepartmentViewSet)
router.register(r'team_members', TeamMemberViewSet)
router.register(r'team_member_socials', TeamMemberSocialViewSet)
router.register(r'events', EventViewSet)
router.register(r'event_speakers', EventSpeakerViewSet)
router.register(r'event_registrations', EventRegistrationViewSet)
router.register(r'webinars', WebinarListingViewSet)
router.register(r'tech-products', TechProductViewSet, basename='tech-product')
router.register(r'brands', BrandViewSet, basename='brand')

urlpatterns = [
    path('site-images/', site_images_admin, name='site-images-admin'),
    path('site-image-upload/', site_image_upload, name='site-image-upload'),
    # ── Data API management (Advisory only) ──
    path('data-stores/', data_stores, name='data-stores'),
    path('data-stores/<int:pk>/', data_store_detail, name='data-store-detail'),
    path('data-stores/<int:pk>/records/', data_store_records, name='data-store-records'),
    path('data-stores/<int:pk>/keys/', data_keys, name='data-keys'),
    path('data-stores/<int:pk>/keys/<int:key_pk>/', data_key_detail, name='data-key-detail'),
    path('', include(router.urls)),
]
