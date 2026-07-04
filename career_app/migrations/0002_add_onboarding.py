from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('career_app', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='HRDepartment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255, unique=True)),
                ('description', models.TextField(blank=True)),
                ('lead_name', models.CharField(blank=True, max_length=255)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': 'hr_departments',
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='OnboardingSubmission',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('candidate_id', models.CharField(max_length=100)),
                ('candidate_name', models.CharField(max_length=255)),
                ('candidate_email', models.EmailField()),
                ('role_offered', models.CharField(blank=True, max_length=255)),
                ('token', models.CharField(max_length=64, unique=True)),
                ('emergency_name', models.CharField(blank=True, max_length=255)),
                ('emergency_phone', models.CharField(blank=True, max_length=20)),
                ('emergency_relation', models.CharField(blank=True, max_length=100)),
                ('aadhaar_key', models.CharField(blank=True, max_length=500)),
                ('college_id_key', models.CharField(blank=True, max_length=500)),
                ('photo_key', models.CharField(blank=True, max_length=500)),
                ('has_aadhaar', models.BooleanField(default=False)),
                ('has_college_id', models.BooleanField(default=False)),
                ('has_photo', models.BooleanField(default=False)),
                ('status', models.CharField(
                    choices=[
                        ('pending', 'Pending'),
                        ('submitted', 'Submitted'),
                        ('verified', 'Verified'),
                        ('rejected', 'Rejected'),
                    ],
                    default='pending',
                    max_length=20,
                )),
                ('assigned_departments', models.JSONField(blank=True, default=list)),
                ('hr_notes', models.TextField(blank=True)),
                ('verified_by', models.CharField(blank=True, max_length=255)),
                ('verified_at', models.DateTimeField(blank=True, null=True)),
                ('submitted_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': 'onboarding_submissions',
                'ordering': ['-created_at'],
            },
        ),
    ]
