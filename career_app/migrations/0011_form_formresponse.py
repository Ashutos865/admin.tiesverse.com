from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('career_app', '0010_policy'),
    ]

    operations = [
        migrations.CreateModel(
            name='Form',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(default='Untitled form', max_length=255)),
                ('description', models.TextField(blank=True)),
                ('schema', models.JSONField(blank=True, default=list)),
                ('theme', models.JSONField(blank=True, default=dict)),
                ('settings', models.JSONField(blank=True, default=dict)),
                ('visibility', models.CharField(choices=[('internal', 'Internal (logged-in members)'), ('public', 'Public link')], default='internal', max_length=10)),
                ('is_published', models.BooleanField(default=False)),
                ('token', models.CharField(blank=True, max_length=64, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by_user', models.ForeignKey(blank=True, db_constraint=False, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='forms_created', to=settings.AUTH_USER_MODEL)),
            ],
            options={'db_table': 'forms', 'ordering': ['-updated_at']},
        ),
        migrations.CreateModel(
            name='FormResponse',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('answers', models.JSONField(blank=True, default=dict)),
                ('submitter_name', models.CharField(blank=True, max_length=255)),
                ('submitter_email', models.EmailField(blank=True, max_length=254)),
                ('submitted_at', models.DateTimeField(auto_now_add=True)),
                ('form', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='responses', to='career_app.form')),
                ('submitted_by_user', models.ForeignKey(blank=True, db_constraint=False, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='form_responses', to=settings.AUTH_USER_MODEL)),
            ],
            options={'db_table': 'form_responses', 'ordering': ['-submitted_at']},
        ),
    ]
