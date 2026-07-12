from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Domain',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('slug', models.SlugField(max_length=40, unique=True)),
                ('name', models.CharField(max_length=80)),
                ('description', models.CharField(blank=True, max_length=200)),
                ('color', models.CharField(blank=True, max_length=80)),
                ('order', models.PositiveIntegerField(default=0)),
            ],
            options={
                'db_table': 'learn_domains',
                'ordering': ['order'],
            },
        ),
        migrations.CreateModel(
            name='Course',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('instructor', models.CharField(blank=True, max_length=120)),
                ('description', models.TextField(blank=True)),
                ('thumbnail_url', models.URLField(blank=True)),
                ('is_published', models.BooleanField(default=True)),
                ('order', models.PositiveIntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('domain', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='courses', to='learn_app.domain')),
            ],
            options={
                'db_table': 'learn_courses',
                'ordering': ['order', '-created_at'],
            },
        ),
        migrations.CreateModel(
            name='Lesson',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('kind', models.CharField(choices=[('video', 'Video'), ('assignment', 'Assignment'), ('quiz', 'Quiz')], default='video', max_length=16)),
                ('video_id', models.CharField(blank=True, max_length=20)),
                ('duration', models.CharField(blank=True, max_length=16)),
                ('duration_seconds', models.PositiveIntegerField(default=0)),
                ('description', models.TextField(blank=True)),
                ('order', models.PositiveIntegerField(default=0)),
                ('course', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='lessons', to='learn_app.course')),
            ],
            options={
                'db_table': 'learn_lessons',
                'ordering': ['order'],
            },
        ),
        migrations.CreateModel(
            name='Enrollment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('course', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='enrollments', to='learn_app.course')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='learn_enrollments', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'learn_enrollments',
                'unique_together': {('user', 'course')},
            },
        ),
        migrations.CreateModel(
            name='LessonProgress',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('seconds', models.PositiveIntegerField(default=0)),
                ('completed', models.BooleanField(default=False)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('lesson', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='progress', to='learn_app.lesson')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='learn_progress', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'learn_lesson_progress',
                'unique_together': {('user', 'lesson')},
            },
        ),
    ]
