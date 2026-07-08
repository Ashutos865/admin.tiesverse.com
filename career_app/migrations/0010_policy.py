from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('career_app', '0009_selfsignup'),
    ]

    operations = [
        migrations.CreateModel(
            name='Policy',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=255)),
                ('category', models.CharField(blank=True, default='General', max_length=80)),
                ('summary', models.CharField(blank=True, max_length=300)),
                ('body', models.TextField(blank=True)),
                ('is_published', models.BooleanField(default=True)),
                ('order', models.IntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by_user', models.ForeignKey(blank=True, db_constraint=False, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='policies_created', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'policies',
                'ordering': ['order', '-updated_at'],
            },
        ),
    ]
