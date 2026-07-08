from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts_app', '0012_emailsendlog_certificate_id'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='avatar_url',
            field=models.URLField(blank=True, default='', max_length=500),
        ),
    ]
