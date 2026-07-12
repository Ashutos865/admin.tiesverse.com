from django.contrib import admin
from .models import (
    Domain, Course, Lesson, Enrollment, LessonProgress, QuizQuestion, QuizAttempt,
)


class QuizQuestionInline(admin.TabularInline):
    model = QuizQuestion
    extra = 1


class LessonAdmin(admin.ModelAdmin):
    list_display = ('title', 'course', 'kind', 'order')
    inlines = [QuizQuestionInline]


admin.site.register(Lesson, LessonAdmin)
admin.site.register([Domain, Course, Enrollment, LessonProgress, QuizQuestion, QuizAttempt])
