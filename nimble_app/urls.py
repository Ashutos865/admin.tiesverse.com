from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import (
    MonitorChannelViewSet, MonitorAlertViewSet, MonitorOwnPostViewSet,
    MonitorStateView, MonitorPollNowView, MonitorWeeklyReportView,
    MonitorWeeklyReportSendView, MonitorExportCsvView, MonitorPlatformsView,
)

# trailing_slash=True to match the admin's apiClient (withSlash appends a slash).
router = SimpleRouter(trailing_slash=True)
router.register(r'channels', MonitorChannelViewSet, basename='monitor-channel')
router.register(r'alerts', MonitorAlertViewSet, basename='monitor-alert')
router.register(r'own-posts', MonitorOwnPostViewSet, basename='monitor-own-post')

urlpatterns = [
    path('platforms/', MonitorPlatformsView.as_view()),
    path('state/', MonitorStateView.as_view()),
    path('poll-now/', MonitorPollNowView.as_view()),
    path('weekly-report/', MonitorWeeklyReportView.as_view()),
    path('weekly-report/send/', MonitorWeeklyReportSendView.as_view()),
    path('export/csv/', MonitorExportCsvView.as_view()),
    *router.urls,
]

# Wired in config/urls.py:
#   path('api/nimble/', include('nimble_app.urls')),
