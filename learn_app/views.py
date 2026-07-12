from django.contrib.auth import get_user_model
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Domain, Course, Lesson, Enrollment, LessonProgress, QuizQuestion, QuizAttempt
from .serializers import DomainSerializer, CourseSerializer, LessonSerializer, QuizQuestionPublicSerializer

PASS_MARK = 80  # percent required to pass a mandatory quiz (per the Capstone PDF)

# ── Gamification (computed from real progress, no extra tables) ────────────────
POINTS_PER_LESSON = 10
POINTS_PER_QUIZ_PASS = 20
POINTS_PER_CERTIFICATE = 100


def points_for(user):
    lessons = LessonProgress.objects.filter(user=user, completed=True).count()
    quizzes = QuizAttempt.objects.filter(user=user, passed=True).values('lesson').distinct().count()
    certs = _certificates_earned(user)
    return lessons * POINTS_PER_LESSON + quizzes * POINTS_PER_QUIZ_PASS + certs * POINTS_PER_CERTIFICATE


def _certificates_earned(user):
    earned = 0
    for d in Domain.objects.all():
        pub = d.courses.filter(is_published=True)
        total = pub.count()
        if not total:
            continue
        done = sum(1 for c in pub if c.lessons.count() and
                   LessonProgress.objects.filter(user=user, completed=True, lesson__course=c).count() >= c.lessons.count())
        if done == total:
            earned += 1
    return earned


def badges_for(user):
    done = LessonProgress.objects.filter(user=user, completed=True).count()
    quizzes = QuizAttempt.objects.filter(user=user, passed=True).count()
    certs = _certificates_earned(user)
    out = []
    if done >= 1:
        out.append({'key': 'first-steps', 'name': 'First Steps', 'earned': True})
    out.append({'key': 'quiz-ace', 'name': 'Quiz Ace', 'earned': quizzes >= 3})
    out.append({'key': 'pillar-master', 'name': 'Pillar Master', 'earned': certs >= 1})
    out.append({'key': 'fully-certified', 'name': 'Fully Certified', 'earned': certs >= 5})
    return out


class LearnCoursePermission(permissions.BasePermission):
    """Any authenticated member can browse courses and self-enroll (the Learn
    Portal is open to everyone). Authoring (create/edit/delete a course, add a
    lesson) requires the standard Django model permissions, so a normal member
    can't mutate the catalog via the API even though the endpoints are shared."""

    _WRITE_PERM = {
        'POST': 'learn_app.add_course',
        'PUT': 'learn_app.change_course',
        'PATCH': 'learn_app.change_course',
        'DELETE': 'learn_app.delete_course',
    }

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True                       # everyone can read
        if getattr(view, 'action', None) == 'enroll':
            return True                       # self-enrollment is open to everyone
        if request.user.is_superuser:
            return True
        return request.user.has_perm(self._WRITE_PERM.get(request.method, 'learn_app.change_course'))


class DomainViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Domain.objects.all()
    serializer_class = DomainSerializer
    permission_classes = [permissions.IsAuthenticated]


class CourseViewSet(viewsets.ModelViewSet):
    """
    /api/learn/courses            GET list (published; ?all=1 for admins), POST create
    /api/learn/courses/:id        GET / PATCH / DELETE
    /api/learn/courses/:id/lessons  GET lessons, POST add lesson
    /api/learn/courses/:id/enroll   POST enroll current user
    """
    serializer_class = CourseSerializer
    permission_classes = [LearnCoursePermission]   # read + enroll open to all; authoring needs model perms

    def get_queryset(self):
        qs = Course.objects.select_related('domain').prefetch_related('lessons', 'enrollments')
        if self.request.query_params.get('all') != '1':
            qs = qs.filter(is_published=True)
        domain = self.request.query_params.get('domain')
        if domain:
            qs = qs.filter(domain__slug=domain)
        return qs

    @action(detail=True, methods=['get', 'post'])
    def lessons(self, request, pk=None):
        course = self.get_object()
        if request.method == 'POST':
            data = request.data
            lesson = Lesson.objects.create(
                course=course, title=data.get('title', ''), video_id=data.get('video_id', ''),
                duration=data.get('duration', ''), kind=data.get('kind', 'video'),
                order=data.get('order', course.lessons.count()),
            )
            return Response(LessonSerializer(lesson).data, status=201)
        # annotate completion for the current user
        done = set(LessonProgress.objects.filter(user=request.user, completed=True,
                                                 lesson__course=course).values_list('lesson_id', flat=True))
        out = []
        for l in course.lessons.all():
            row = LessonSerializer(l).data
            row['completed'] = l.id in done
            out.append(row)
        return Response(out)

    @action(detail=True, methods=['post'])
    def enroll(self, request, pk=None):
        Enrollment.objects.get_or_create(user=request.user, course=self.get_object())
        return Response({'enrolled': True})


class LessonProgressView(viewsets.ViewSet):
    """POST /api/learn/lessons/:id/progress  { seconds, completed }"""
    permission_classes = [permissions.IsAuthenticated]

    def create(self, request, lesson_id=None):
        lesson = Lesson.objects.get(pk=lesson_id)
        obj, _ = LessonProgress.objects.get_or_create(user=request.user, lesson=lesson)
        obj.seconds = int(request.data.get('seconds', obj.seconds))
        if request.data.get('completed'):
            obj.completed = True
        obj.save()
        return Response({'ok': True, 'completed': obj.completed})


class MyLearningView(viewsets.ViewSet):
    """
    GET /api/learn/me
    Everything the learner dashboard, program tracker, and certificates need,
    all derived from existing models (no extra tables):
      - courses        : enrolled courses with per-course progress
      - domains        : per-pillar progress + whether the domain certificate is earned
      - completion     : overall onboarding completion percent (the PDF's 100% KPI)
      - modules_done   : lessons completed by the member
    """
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        user = request.user

        # enrolled courses with progress
        courses = []
        for e in Enrollment.objects.filter(user=user).select_related('course__domain'):
            c = e.course
            total = c.lessons.count() or 1
            done = LessonProgress.objects.filter(user=user, completed=True, lesson__course=c).count()
            courses.append({
                'id': c.id, 'title': c.title, 'instructor': c.instructor,
                'domain': c.domain.slug, 'domain_name': c.domain.name,
                'thumbnail_url': c.thumbnail_url, 'lesson_count': total,
                'progress': round(done / total * 100),
            })

        # per-domain progress -> certificate is earned when every published course is complete
        domains = []
        for d in Domain.objects.all():
            pub = d.courses.filter(is_published=True)
            total_c = pub.count()
            done_c = 0
            for c in pub:
                tl = c.lessons.count()
                cdone = LessonProgress.objects.filter(user=user, completed=True, lesson__course=c).count()
                if tl and cdone >= tl:
                    done_c += 1
            domains.append({
                'slug': d.slug, 'name': d.name,
                'courses_total': total_c, 'courses_done': done_c,
                'earned': total_c > 0 and done_c == total_c,
            })

        # overall onboarding completion
        total_lessons = Lesson.objects.filter(course__is_published=True).count()
        done_lessons = LessonProgress.objects.filter(
            user=user, completed=True, lesson__course__is_published=True).count()
        completion = round(done_lessons / total_lessons * 100) if total_lessons else 0

        # gamification
        my_points = points_for(user)
        rank = 1 + sum(1 for u in get_user_model().objects.all() if points_for(u) > my_points) \
            if my_points else None

        return Response({
            'name': (user.get_short_name() or user.username),
            'courses': courses,
            'domains': domains,
            'completion': completion,
            'modules_done': done_lessons,
            'certificates_earned': sum(1 for d in domains if d['earned']),
            'points': my_points,
            'rank': rank,
            'badges': badges_for(user),
        })


class QuizView(viewsets.ViewSet):
    """
    GET  /api/learn/lessons/:id/quiz          -> questions WITHOUT the answers
    POST /api/learn/lessons/:id/quiz/submit   -> { answers: {questionId: choiceIndex} }
        grades server-side, records an attempt, and (on >= PASS_MARK) marks the
        quiz lesson complete so the module can advance. This is what makes the
        quiz mandatory and non-skippable.
    """
    permission_classes = [permissions.IsAuthenticated]

    def questions(self, request, lesson_id=None):
        qs = QuizQuestion.objects.filter(lesson_id=lesson_id)
        return Response({'pass_mark': PASS_MARK, 'questions': QuizQuestionPublicSerializer(qs, many=True).data})

    def submit(self, request, lesson_id=None):
        answers = request.data.get('answers', {}) or {}
        questions = list(QuizQuestion.objects.filter(lesson_id=lesson_id))
        if not questions:
            return Response({'error': 'This quiz has no questions yet.'}, status=400)
        correct = sum(1 for q in questions if int(answers.get(str(q.id), -1)) == q.answer)
        score = round(correct / len(questions) * 100)
        passed = score >= PASS_MARK
        QuizAttempt.objects.create(user=request.user, lesson_id=lesson_id, score=score, passed=passed)
        if passed:
            LessonProgress.objects.update_or_create(
                user=request.user, lesson_id=lesson_id, defaults={'completed': True})
        return Response({'score': score, 'passed': passed, 'pass_mark': PASS_MARK,
                         'correct': correct, 'total': len(questions)})


class LeaderboardView(viewsets.ViewSet):
    """GET /api/learn/leaderboard -> ranked members by points (gamification)."""
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        rows = []
        for u in get_user_model().objects.all():
            p = points_for(u)
            if p <= 0:
                continue
            rows.append({'id': u.id, 'name': (u.get_short_name() or u.username), 'points': p,
                         'is_me': u.id == request.user.id})
        rows.sort(key=lambda r: r['points'], reverse=True)
        for i, r in enumerate(rows):
            r['rank'] = i + 1
        return Response(rows[:50])
