from django.conf import settings
from django.db import models


# ── Domain (the 5 cross-functional pillars) ──────────────────────────────────
class Domain(models.Model):
    slug = models.SlugField(max_length=40, unique=True)      # content | marketing | tech | design | social
    name = models.CharField(max_length=80)
    description = models.CharField(max_length=200, blank=True)
    color = models.CharField(max_length=80, blank=True)       # css gradient for the card
    order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'learn_domains'
        ordering = ['order']

    def __str__(self):
        return self.name


# ── Course ────────────────────────────────────────────────────────────────────
class Course(models.Model):
    domain = models.ForeignKey(Domain, on_delete=models.CASCADE, related_name='courses')
    title = models.CharField(max_length=200)
    instructor = models.CharField(max_length=120, blank=True)
    description = models.TextField(blank=True)
    thumbnail_url = models.URLField(blank=True)
    is_published = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'learn_courses'
        ordering = ['order', '-created_at']

    def __str__(self):
        return self.title


# ── Lesson (one YouTube video, or an assignment/quiz) ─────────────────────────
class Lesson(models.Model):
    KIND = [('video', 'Video'), ('assignment', 'Assignment'), ('quiz', 'Quiz')]
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='lessons')
    title = models.CharField(max_length=200)
    kind = models.CharField(max_length=16, choices=KIND, default='video')
    video_id = models.CharField(max_length=20, blank=True)     # SAME convention as TeamMemberSocial.video_id
    duration = models.CharField(max_length=16, blank=True)     # display "14:20"
    duration_seconds = models.PositiveIntegerField(default=0)  # for the progress bar
    description = models.TextField(blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'learn_lessons'
        ordering = ['order']

    def __str__(self):
        return self.title


# ── Enrollment + per-lesson progress ──────────────────────────────────────────
class Enrollment(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='learn_enrollments', db_constraint=False)
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='enrollments')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'learn_enrollments'
        unique_together = ('user', 'course')


class LessonProgress(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='learn_progress', db_constraint=False)
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='progress')
    seconds = models.PositiveIntegerField(default=0)
    completed = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'learn_lesson_progress'
        unique_together = ('user', 'lesson')


# ── Quiz (a Lesson with kind='quiz' owns questions) ───────────────────────────
class QuizQuestion(models.Model):
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='questions')
    prompt = models.CharField(max_length=500)
    choices = models.JSONField(default=list)          # list of option strings
    answer = models.PositiveSmallIntegerField(default=0)  # index of the correct choice
    order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'learn_quiz_questions'
        ordering = ['order']

    def __str__(self):
        return self.prompt[:60]


class QuizAttempt(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='learn_quiz_attempts', db_constraint=False)
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='attempts')
    score = models.PositiveSmallIntegerField(default=0)  # percent 0-100
    passed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'learn_quiz_attempts'
        ordering = ['-created_at']


# ─────────────────────────────────────────────────────────────────────────────
# Optional seed helper, call from seed_data.py after migrate:
#
#   from learn_app.models import Domain, Course, Lesson
#   def seed_learn():
#       pillars = [('content','Content Strategy'), ('marketing','Media Marketing'),
#                  ('tech','Technology'), ('design','Graphic Design'), ('social','Social Media')]
#       for i,(slug,name) in enumerate(pillars):
#           Domain.objects.get_or_create(slug=slug, defaults={'name':name, 'order':i})
#       tech = Domain.objects.get(slug='tech')
#       c,_ = Course.objects.get_or_create(domain=tech, title='Version Control with Git, Basics',
#                                          defaults={'instructor':'Rohan Shah'})
#       Lesson.objects.get_or_create(course=c, order=0,
#           defaults={'title':'What is version control?','video_id':'dQw4w9WgXcQ','duration':'6:12'})
# ─────────────────────────────────────────────────────────────────────────────
