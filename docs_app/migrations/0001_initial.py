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
            name='DocSpace',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('slug', models.SlugField(max_length=60, unique=True)),
                ('name', models.CharField(max_length=120)),
                ('description', models.CharField(blank=True, max_length=240)),
                ('icon', models.CharField(blank=True, max_length=40)),
                ('order', models.PositiveIntegerField(default=0)),
            ],
            options={
                'db_table': 'docs_spaces',
                'ordering': ['order', 'name'],
            },
        ),
        migrations.CreateModel(
            name='DocPage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('slug', models.SlugField(max_length=80)),
                ('title', models.CharField(max_length=200)),
                ('body', models.TextField(blank=True)),
                ('order', models.PositiveIntegerField(default=0)),
                ('is_published', models.BooleanField(default=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('parent', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='children', to='docs_app.docpage')),
                ('space', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='pages', to='docs_app.docspace')),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='docs_edited', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'docs_pages',
                'ordering': ['order', 'title'],
                'unique_together': {('space', 'slug')},
            },
        ),
    ]
