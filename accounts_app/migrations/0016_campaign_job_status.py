from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts_app', '0015_campaign_history_delivery'),
    ]

    operations = [
        migrations.AddField(
            model_name='emailcampaign',
            name='status',
            field=models.CharField(default='done', max_length=20),
        ),
        migrations.AddField(
            model_name='emailcampaign',
            name='processed_count',
            field=models.IntegerField(default=0),
        ),
    ]
