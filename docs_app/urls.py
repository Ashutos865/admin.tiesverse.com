from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import DocSpaceViewSet, DocPageViewSet, DocTreeView

# trailing_slash=True to match the admin's apiClient, which appends a trailing
# slash to every request path (withSlash in frontend/src/apiClient.js).
router = SimpleRouter(trailing_slash=True)
router.register(r'spaces', DocSpaceViewSet, basename='doc-space')
router.register(r'pages', DocPageViewSet, basename='doc-page')

urlpatterns = [
    path('tree/', DocTreeView.as_view({'get': 'list'})),
    *router.urls,
]

# Wired in config/urls.py:
#   path('api/docs/', include('docs_app.urls')),
