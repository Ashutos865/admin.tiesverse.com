from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('accounts_app', '0014_emaildraft'),
    ]

    operations = [
        migrations.AddField(
            model_name='emailcampaign',
            name='from_name',
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name='emailcampaign',
            name='from_email',
            field=models.CharField(blank=True, max_length=254),
        ),
        migrations.AddField(
            model_name='emailcampaign',
            name='body_html',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='emailcampaign',
            name='had_attachment',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='emailsendlog',
            name='message_id',
            field=models.CharField(blank=True, db_index=True, max_length=200),
        ),
        migrations.AddField(
            model_name='emailsendlog',
            name='campaign',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='logs', to='accounts_app.emailcampaign'),
        ),
    ]
