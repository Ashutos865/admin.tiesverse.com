from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import (
    ContentActivityView, ContentArchiveView, ContentBoardView, ContentCategoryViewSet,
    ContentItemViewSet, ContentPublishMediaView,
    ContentMoveView, ContentRescheduleView,
    WhatsAppStatusView,
)

# trailing_slash=True to match the admin's apiClient (withSlash appends a slash).
router = SimpleRouter(trailing_slash=True)
router.register(r'items', ContentItemViewSet, basename='content-item')
router.register(r'categories', ContentCategoryViewSet, basename='content-category')

urlpatterns = [
    path('board/', ContentBoardView.as_view(), name='content-board'),
    path('whatsapp/', WhatsAppStatusView.as_view(), name='content-whatsapp'),
    path('items/<int:pk>/move/', ContentMoveView.as_view(), name='content-move'),
    path('items/<int:pk>/reschedule/', ContentRescheduleView.as_view(), name='content-reschedule'),
    path('items/<int:pk>/activity/', ContentActivityView.as_view(), name='content-activity'),
    path('items/<int:pk>/archive/', ContentArchiveView.as_view(), name='content-archive'),
    path('items/<int:pk>/publish-media/', ContentPublishMediaView.as_view(), name='content-publish-media'),
    *router.urls,
]
