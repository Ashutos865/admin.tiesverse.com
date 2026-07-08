from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts_app', '0013_userprofile_avatar_url'),
    ]

    operations = [
        migrations.CreateModel(
            name='EmailDraft',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(blank=True, max_length=200)),
                ('payload', models.JSONField(default=dict)),
                ('created_by', models.CharField(blank=True, max_length=200)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={'db_table': 'email_drafts', 'ordering': ['-updated_at']},
        ),
    ]
