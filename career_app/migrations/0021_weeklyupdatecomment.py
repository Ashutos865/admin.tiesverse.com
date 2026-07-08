import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('career_app', '0020_task_estimated_hours_worksession'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='WeeklyUpdateComment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('author_name', models.CharField(blank=True, max_length=200)),
                ('text', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('author_user', models.ForeignKey(blank=True, db_constraint=False, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='weekly_update_comments', to=settings.AUTH_USER_MODEL)),
                ('update', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='comments', to='career_app.weeklyupdate')),
            ],
            options={
                'db_table': 'weekly_update_comments',
                'ordering': ['created_at'],
            },
        ),
    ]
