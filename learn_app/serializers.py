from rest_framework import serializers
from .models import Domain, Course, Lesson, QuizQuestion


class QuizQuestionPublicSerializer(serializers.ModelSerializer):
    """Questions as sent to the learner. The correct `answer` is intentionally
    excluded so it never reaches the browser; grading happens server-side."""

    class Meta:
        model = QuizQuestion
        fields = ['id', 'prompt', 'choices', 'order']


class DomainSerializer(serializers.ModelSerializer):
    id = serializers.SlugField(source='slug')
    course_count = serializers.SerializerMethodField()

    class Meta:
        model = Domain
        fields = ['id', 'name', 'description', 'color', 'course_count']

    def get_course_count(self, obj):
        return obj.courses.filter(is_published=True).count()


class LessonSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lesson
        fields = ['id', 'title', 'kind', 'video_id', 'duration', 'duration_seconds', 'description', 'order']


class LessonWriteSerializer(serializers.Serializer):
    """Nested lesson payload accepted when creating a course."""
    title = serializers.CharField()
    video_id = serializers.CharField(allow_blank=True, required=False)
    duration = serializers.CharField(allow_blank=True, required=False)
    kind = serializers.CharField(required=False, default='video')
    order = serializers.IntegerField(required=False, default=0)


class CourseSerializer(serializers.ModelSerializer):
    domain = serializers.SlugRelatedField(slug_field='slug', queryset=Domain.objects.all())
    domain_name = serializers.CharField(source='domain.name', read_only=True)
    lesson_count = serializers.IntegerField(source='lessons.count', read_only=True)
    enrolled_count = serializers.IntegerField(source='enrollments.count', read_only=True)
    lessons = LessonWriteSerializer(many=True, write_only=True, required=False)

    class Meta:
        model = Course
        fields = ['id', 'title', 'domain', 'domain_name', 'instructor', 'description',
                  'thumbnail_url', 'is_published', 'order', 'lesson_count', 'enrolled_count', 'lessons']

    def create(self, validated_data):
        lessons = validated_data.pop('lessons', [])
        course = Course.objects.create(**validated_data)
        for i, l in enumerate(lessons):
            Lesson.objects.create(course=course, order=l.get('order', i),
                                  title=l['title'], video_id=l.get('video_id', ''),
                                  duration=l.get('duration', ''), kind=l.get('kind', 'video'))
        return course
