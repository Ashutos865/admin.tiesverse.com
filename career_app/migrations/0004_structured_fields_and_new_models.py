from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('career_app', '0003_hrdepartment_co_lead'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ── Add structured fields to OnboardingSubmission ──────────────────
        migrations.AddField(
            model_name='onboardingsubmission',
            name='employment_type',
            field=models.CharField(
                blank=True, max_length=20,
                choices=[
                    ('Intern', 'Intern'), ('Full-Time', 'Full-Time'),
                    ('Part-Time', 'Part-Time'), ('Freelance', 'Freelance'),
                    ('Volunteer', 'Volunteer'),
                ],
            ),
        ),
        migrations.AddField(
            model_name='onboardingsubmission',
            name='joining_date',
            field=models.DateField(null=True, blank=True),
        ),
        migrations.AddField(
            model_name='onboardingsubmission',
            name='portal_role',
            field=models.CharField(
                blank=True, max_length=20,
                choices=[
                    ('intern', 'Intern'), ('member', 'Member'),
                    ('team_lead', 'Team Lead'), ('advisory', 'Advisory'),
                    ('hr', 'HR'), ('admin', 'Admin'),
                ],
                help_text='Portal access level assigned by HR on verify',
            ),
        ),
        migrations.AddField(
            model_name='onboardingsubmission',
            name='member_notes',
            field=models.TextField(blank=True, help_text='HR notes about this member'),
        ),
        migrations.AddField(
            model_name='onboardingsubmission',
            name='cert_internship_issued_at',
            field=models.DateTimeField(null=True, blank=True),
        ),
        migrations.AddField(
            model_name='onboardingsubmission',
            name='cert_internship_issued_by',
            field=models.CharField(max_length=255, blank=True),
        ),
        migrations.AddField(
            model_name='onboardingsubmission',
            name='cert_lor_issued_at',
            field=models.DateTimeField(null=True, blank=True),
        ),
        migrations.AddField(
            model_name='onboardingsubmission',
            name='cert_lor_issued_by',
            field=models.CharField(max_length=255, blank=True),
        ),
        migrations.AddField(
            model_name='onboardingsubmission',
            name='cert_noc_issued_at',
            field=models.DateTimeField(null=True, blank=True),
        ),
        migrations.AddField(
            model_name='onboardingsubmission',
            name='cert_noc_issued_by',
            field=models.CharField(max_length=255, blank=True),
        ),

        # ── MemberAccount ───────────────────────────────────────────────────
        migrations.CreateModel(
            name='MemberAccount',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('submission', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='account',
                    to='career_app.onboardingsubmission',
                )),
                ('user', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='member_account',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('created_by', models.ForeignKey(
                    null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='accounts_created', to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'db_table': 'member_accounts'},
        ),

        # ── DocumentAuditLog ────────────────────────────────────────────────
        migrations.CreateModel(
            name='DocumentAuditLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('doc_type', models.CharField(max_length=30, choices=[
                    ('offer_letter', 'Offer Letter'), ('internship_cert', 'Internship Certificate'),
                    ('lor', 'Letter of Recommendation'), ('noc', 'No Objection Certificate'),
                ])),
                ('action', models.CharField(max_length=10, choices=[
                    ('issued', 'Issued'), ('revoked', 'Revoked'),
                ])),
                ('performed_by_name', models.CharField(max_length=255)),
                ('note', models.TextField(blank=True)),
                ('performed_at', models.DateTimeField(auto_now_add=True)),
                ('submission', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='doc_audit_logs',
                    to='career_app.onboardingsubmission',
                )),
                ('performed_by_user', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'db_table': 'document_audit_logs', 'ordering': ['-performed_at']},
        ),

        # ── AttendanceRecord ────────────────────────────────────────────────
        migrations.CreateModel(
            name='AttendanceRecord',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('date', models.DateField()),
                ('check_in', models.DateTimeField(null=True, blank=True)),
                ('check_out', models.DateTimeField(null=True, blank=True)),
                ('work_report', models.TextField(blank=True)),
                ('status', models.CharField(max_length=15, default='present', choices=[
                    ('present', 'Present'), ('absent', 'Absent'), ('late', 'Late'),
                    ('half_day', 'Half Day'), ('on_leave', 'On Leave'), ('holiday', 'Holiday'),
                ])),
                ('approval_status', models.CharField(max_length=10, default='pending', choices=[
                    ('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected'),
                ])),
                ('approved_by_name', models.CharField(max_length=255, blank=True)),
                ('approved_at', models.DateTimeField(null=True, blank=True)),
                ('approval_note', models.TextField(blank=True)),
                ('escalated_to_advisory', models.BooleanField(default=False)),
                ('escalated_at', models.DateTimeField(null=True, blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('member', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='attendance_records',
                    to='career_app.onboardingsubmission',
                )),
                ('approved_by_user', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'db_table': 'attendance_records',
                'ordering': ['-date'],
                'unique_together': {('member', 'date')},
            },
        ),

        # ── LeaveRequest ────────────────────────────────────────────────────
        migrations.CreateModel(
            name='LeaveRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('leave_type', models.CharField(max_length=10, choices=[
                    ('sick', 'Sick Leave'), ('casual', 'Casual Leave'),
                    ('annual', 'Annual Leave'), ('unpaid', 'Unpaid Leave'), ('other', 'Other'),
                ])),
                ('from_date', models.DateField()),
                ('to_date', models.DateField()),
                ('reason', models.TextField(blank=True)),
                ('status', models.CharField(max_length=10, default='pending', choices=[
                    ('pending', 'Pending'), ('approved', 'Approved'),
                    ('rejected', 'Rejected'), ('cancelled', 'Cancelled'),
                ])),
                ('reviewed_by_name', models.CharField(max_length=255, blank=True)),
                ('reviewed_at', models.DateTimeField(null=True, blank=True)),
                ('review_note', models.TextField(blank=True)),
                ('applied_at', models.DateTimeField(auto_now_add=True)),
                ('member', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='leave_requests',
                    to='career_app.onboardingsubmission',
                )),
                ('reviewed_by_user', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'db_table': 'leave_requests', 'ordering': ['-applied_at']},
        ),

        # ── Asset ───────────────────────────────────────────────────────────
        migrations.CreateModel(
            name='Asset',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=255)),
                ('category', models.CharField(max_length=15, default='other', choices=[
                    ('laptop', 'Laptop'), ('phone', 'Phone'), ('id_card', 'ID Card'),
                    ('charger', 'Charger'), ('headset', 'Headset'),
                    ('monitor', 'Monitor'), ('other', 'Other'),
                ])),
                ('serial_number', models.CharField(max_length=255, blank=True)),
                ('condition', models.CharField(max_length=10, default='good', choices=[
                    ('new', 'New'), ('good', 'Good'), ('fair', 'Fair'), ('poor', 'Poor'),
                ])),
                ('status', models.CharField(max_length=15, default='available', choices=[
                    ('available', 'Available'), ('assigned', 'Assigned'),
                    ('under_repair', 'Under Repair'), ('retired', 'Retired'),
                ])),
                ('notes', models.TextField(blank=True)),
                ('added_at', models.DateTimeField(auto_now_add=True)),
                ('assigned_at', models.DateTimeField(null=True, blank=True)),
                ('assigned_by_name', models.CharField(max_length=255, blank=True)),
                ('returned_at', models.DateTimeField(null=True, blank=True)),
                ('assigned_to', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='assets', to='career_app.onboardingsubmission',
                )),
                ('assigned_by_user', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'db_table': 'assets', 'ordering': ['category', 'name']},
        ),

        # ── Task ────────────────────────────────────────────────────────────
        migrations.CreateModel(
            name='Task',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=500)),
                ('description', models.TextField(blank=True)),
                ('assigned_to_department', models.CharField(max_length=255, blank=True)),
                ('priority', models.CharField(max_length=10, default='medium', choices=[
                    ('low', 'Low'), ('medium', 'Medium'), ('high', 'High'), ('urgent', 'Urgent'),
                ])),
                ('status', models.CharField(max_length=15, default='todo', choices=[
                    ('todo', 'To Do'), ('in_progress', 'In Progress'),
                    ('review', 'In Review'), ('done', 'Done'), ('cancelled', 'Cancelled'),
                ])),
                ('due_date', models.DateField(null=True, blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('completed_at', models.DateTimeField(null=True, blank=True)),
                ('completion_note', models.TextField(blank=True)),
                ('assigned_by', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='tasks_assigned', to='career_app.onboardingsubmission',
                )),
                ('assigned_by_admin', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='tasks_created', to=settings.AUTH_USER_MODEL,
                )),
                ('assigned_to', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='tasks_received', to='career_app.onboardingsubmission',
                )),
            ],
            options={'db_table': 'tasks', 'ordering': ['-created_at']},
        ),
    ]
