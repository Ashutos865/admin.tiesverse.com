from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('career_app', '0002_add_onboarding'),
    ]

    operations = [
        migrations.AddField(
            model_name='hrdepartment',
            name='co_lead_name',
            field=models.CharField(blank=True, max_length=255),
        ),
    ]
