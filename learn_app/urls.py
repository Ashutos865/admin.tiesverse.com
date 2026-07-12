from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import (
    DomainViewSet, CourseViewSet, LessonProgressView, MyLearningView,
    QuizView, LeaderboardView,
)

# trailing_slash=True to match the admin's apiClient, which appends a trailing
# slash to every request path (withSlash in frontend/src/apiClient.js).
router = SimpleRouter(trailing_slash=True)
router.register(r'domains', DomainViewSet, basename='learn-domain')
router.register(r'courses', CourseViewSet, basename='learn-course')

urlpatterns = [
    path('me/', MyLearningView.as_view({'get': 'list'})),
    path('leaderboard/', LeaderboardView.as_view({'get': 'list'})),
    path('lessons/<int:lesson_id>/progress/', LessonProgressView.as_view({'post': 'create'})),
    path('lessons/<int:lesson_id>/quiz/', QuizView.as_view({'get': 'questions'})),
    path('lessons/<int:lesson_id>/quiz/submit/', QuizView.as_view({'post': 'submit'})),
    *router.urls,
]

# Wired in config/urls.py:
#   path('api/learn/', include('learn_app.urls')),
