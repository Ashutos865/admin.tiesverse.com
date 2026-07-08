from datetime import timedelta
from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone


class Position(models.Model):
    title = models.CharField(max_length=255)
    department = models.CharField(max_length=255)
    description = models.TextField()
    is_open = models.BooleanField(default=True)

    def __str__(self):
        return self.title


class Enrollment(models.Model):
    STATUS_CHOICES = [
        ('Pending', 'Pending'),
        ('Reviewed', 'Reviewed'),
        ('Accepted', 'Accepted'),
        ('Rejected', 'Rejected'),
    ]
    position = models.ForeignKey(Position, on_delete=models.CASCADE)
    applicant_name = models.CharField(max_length=255)
    email = models.EmailField()
    resume = models.FileField(upload_to='resumes/')
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='Pending')

    def __str__(self):
        return f"{self.applicant_name} - {self.position.title}"


class OfferLetter(models.Model):
    applicant = models.ForeignKey(Enrollment, on_delete=models.CASCADE)
    salary = models.DecimalField(max_digits=10, decimal_places=2)
    joining_date = models.DateField()
    generated_pdf = models.FileField(upload_to='offers/', blank=True, null=True)

    def __str__(self):
        return f"Offer for {self.applicant.applicant_name}"


class HRDepartment(models.Model):
    name = models.CharField(max_length=255, unique=True)
    description = models.TextField(blank=True)
    lead_name = models.CharField(max_length=255, blank=True)
    co_lead_name = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'hr_departments'
        ordering = ['name']

    def __str__(self):
        return self.name


# ── Employment & Role choices ──────────────────────────────────────────────────

EMPLOYMENT_TYPE_CHOICES = [
    ('Intern', 'Intern'),
    ('Full-Time', 'Full-Time'),
    ('Part-Time', 'Part-Time'),
    ('Freelance', 'Freelance'),
    ('Volunteer', 'Volunteer'),
]

PORTAL_ROLE_CHOICES = [
    ('intern', 'Intern'),
    ('member', 'Member'),
    ('team_lead', 'Team Lead'),
    ('advisory', 'Advisory'),
    ('hr', 'HR'),
    ('admin', 'Admin'),
]


class OnboardingSubmission(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_SUBMITTED = 'submitted'
    STATUS_VERIFIED = 'verified'
    STATUS_REJECTED = 'rejected'
    STATUS_OFFBOARDED = 'offboarded'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_SUBMITTED, 'Submitted'),
        (STATUS_VERIFIED, 'Verified'),
        (STATUS_REJECTED, 'Rejected'),
        (STATUS_OFFBOARDED, 'Offboarded'),
    ]

    # Candidate reference
    candidate_id = models.CharField(max_length=100)
    candidate_name = models.CharField(max_length=255)
    candidate_email = models.EmailField()
    role_offered = models.CharField(max_length=255, blank=True)

    # ── Proper structured fields (replacing hr_notes JSON blob) ───────────────
    employment_type = models.CharField(
        max_length=20, choices=EMPLOYMENT_TYPE_CHOICES, blank=True,
    )
    joining_date = models.DateField(null=True, blank=True)
    portal_role = models.CharField(
        max_length=20, choices=PORTAL_ROLE_CHOICES, blank=True,
        help_text='Portal access level assigned by HR on verify',
    )
    member_notes = models.TextField(blank=True, help_text='HR notes about this member')

    # Certificate issuance dates (null = not yet issued)
    cert_internship_issued_at = models.DateTimeField(null=True, blank=True)
    cert_internship_issued_by = models.CharField(max_length=255, blank=True)
    cert_lor_issued_at = models.DateTimeField(null=True, blank=True)
    cert_lor_issued_by = models.CharField(max_length=255, blank=True)
    cert_noc_issued_at = models.DateTimeField(null=True, blank=True)
    cert_noc_issued_by = models.CharField(max_length=255, blank=True)
    # ──────────────────────────────────────────────────────────────────────────

    # Secure one-time token for upload link
    token = models.CharField(max_length=64, unique=True)

    # Emergency contact (filled by candidate)
    emergency_name = models.CharField(max_length=255, blank=True)
    emergency_phone = models.CharField(max_length=20, blank=True)
    emergency_relation = models.CharField(max_length=100, blank=True)

    # Cloudflare R2 object keys
    aadhaar_key = models.CharField(max_length=500, blank=True)
    college_id_key = models.CharField(max_length=500, blank=True)
    photo_key = models.CharField(max_length=500, blank=True)

    has_aadhaar = models.BooleanField(default=False)
    has_college_id = models.BooleanField(default=False)
    has_photo = models.BooleanField(default=False)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)

    assigned_departments = models.JSONField(default=list, blank=True)

    # Legacy — kept for backward compat with any old data; use structured fields above
    hr_notes = models.TextField(blank=True)

    verified_by = models.CharField(max_length=255, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'onboarding_submissions'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.candidate_name} ({self.status})"


# ── Portal user account linked to a verified member ───────────────────────────

class MemberAccount(models.Model):
    submission = models.OneToOneField(
        OnboardingSubmission, on_delete=models.CASCADE, related_name='account',
    )
    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name='member_account', db_constraint=False,
    )
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name='accounts_created', db_constraint=False,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'member_accounts'

    def __str__(self):
        return f"Account: {self.submission.candidate_name}"


# ── Document / certificate audit log ──────────────────────────────────────────

class DocumentAuditLog(models.Model):
    DOC_OFFER_LETTER = 'offer_letter'
    DOC_INTERNSHIP_CERT = 'internship_cert'
    DOC_LOR = 'lor'
    DOC_NOC = 'noc'
    DOC_CHOICES = [
        (DOC_OFFER_LETTER, 'Offer Letter'),
        (DOC_INTERNSHIP_CERT, 'Internship Certificate'),
        (DOC_LOR, 'Letter of Recommendation'),
        (DOC_NOC, 'No Objection Certificate'),
    ]
    ACTION_ISSUED = 'issued'
    ACTION_REVOKED = 'revoked'
    ACTION_CHOICES = [
        (ACTION_ISSUED, 'Issued'),
        (ACTION_REVOKED, 'Revoked'),
    ]

    submission = models.ForeignKey(
        OnboardingSubmission, on_delete=models.CASCADE, related_name='doc_audit_logs',
    )
    doc_type = models.CharField(max_length=30, choices=DOC_CHOICES)
    action = models.CharField(max_length=10, choices=ACTION_CHOICES)
    performed_by_name = models.CharField(max_length=255)
    performed_by_user = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, db_constraint=False,
    )
    performed_at = models.DateTimeField(auto_now_add=True)
    note = models.TextField(blank=True)

    class Meta:
        db_table = 'document_audit_logs'
        ordering = ['-performed_at']

    def __str__(self):
        return f"{self.doc_type} {self.action} for {self.submission.candidate_name}"


# ── Attendance ─────────────────────────────────────────────────────────────────

class AttendanceRecord(models.Model):
    STATUS_PRESENT = 'present'
    STATUS_ABSENT = 'absent'
    STATUS_LATE = 'late'
    STATUS_HALF_DAY = 'half_day'
    STATUS_ON_LEAVE = 'on_leave'
    STATUS_HOLIDAY = 'holiday'
    STATUS_CHOICES = [
        (STATUS_PRESENT, 'Present'),
        (STATUS_ABSENT, 'Absent'),
        (STATUS_LATE, 'Late'),
        (STATUS_HALF_DAY, 'Half Day'),
        (STATUS_ON_LEAVE, 'On Leave'),
        (STATUS_HOLIDAY, 'Holiday'),
    ]

    APPROVAL_PENDING = 'pending'
    APPROVAL_APPROVED = 'approved'
    APPROVAL_REJECTED = 'rejected'
    APPROVAL_CHOICES = [
        (APPROVAL_PENDING, 'Pending'),
        (APPROVAL_APPROVED, 'Approved'),
        (APPROVAL_REJECTED, 'Rejected'),
    ]

    member = models.ForeignKey(
        OnboardingSubmission, on_delete=models.CASCADE, related_name='attendance_records',
    )
    date = models.DateField()
    check_in = models.DateTimeField(null=True, blank=True)
    check_out = models.DateTimeField(null=True, blank=True)

    # Work report submitted at checkout
    work_report = models.TextField(blank=True, help_text='What the member did today')

    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default=STATUS_PRESENT)

    # Team lead approval
    approval_status = models.CharField(
        max_length=10, choices=APPROVAL_CHOICES, default=APPROVAL_PENDING,
    )
    approved_by_name = models.CharField(max_length=255, blank=True)
    approved_by_user = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, db_constraint=False,
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    approval_note = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'attendance_records'
        unique_together = ('member', 'date')
        ordering = ['-date']

    def __str__(self):
        return f"{self.member.candidate_name} — {self.date} ({self.status})"


# ── Leave Management ──────────────────────────────────────────────────────────

class LeaveRequest(models.Model):
    # All leave is unpaid — these are categories of reason only, not paid entitlements.
    TYPE_SICK = 'sick'
    TYPE_CASUAL = 'casual'
    TYPE_PERSONAL = 'personal'
    TYPE_UNPAID = 'unpaid'
    TYPE_OTHER = 'other'
    LEAVE_TYPE_CHOICES = [
        (TYPE_SICK, 'Sick'),
        (TYPE_CASUAL, 'Casual'),
        (TYPE_PERSONAL, 'Personal'),
        (TYPE_UNPAID, 'Unpaid'),
        (TYPE_OTHER, 'Other'),
    ]

    STATUS_PENDING = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'
    STATUS_CANCELLED = 'cancelled'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_REJECTED, 'Rejected'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    member = models.ForeignKey(
        OnboardingSubmission, on_delete=models.CASCADE, related_name='leave_requests',
    )
    leave_type = models.CharField(max_length=10, choices=LEAVE_TYPE_CHOICES)
    from_date = models.DateField()
    to_date = models.DateField()
    reason = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING)

    reviewed_by_name = models.CharField(max_length=255, blank=True)
    reviewed_by_user = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, db_constraint=False,
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.TextField(blank=True)

    applied_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'leave_requests'
        ordering = ['-applied_at']
        permissions = [
            ('can_review_leave', 'Can approve or reject leave requests (HR only)'),
        ]

    def __str__(self):
        return f"{self.member.candidate_name} — {self.leave_type} ({self.from_date} to {self.to_date})"


# ── Offboarding ───────────────────────────────────────────────────────────────

class OffboardingRequest(models.Model):
    TYPE_RESIGNATION = 'resignation'
    TYPE_END_INTERNSHIP = 'end_of_internship'
    TYPE_TERMINATION = 'termination'
    TYPE_OTHER = 'other'
    TYPE_CHOICES = [
        (TYPE_RESIGNATION, 'Resignation'),
        (TYPE_END_INTERNSHIP, 'End of internship'),
        (TYPE_TERMINATION, 'Termination'),
        (TYPE_OTHER, 'Other'),
    ]

    STATUS_PENDING = 'pending'       # member applied, awaiting HR
    STATUS_APPROVED = 'approved'     # HR approved + set notice; serving notice
    STATUS_REJECTED = 'rejected'
    STATUS_CANCELLED = 'cancelled'
    STATUS_COMPLETED = 'completed'   # last working day passed, access revoked
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_REJECTED, 'Rejected'),
        (STATUS_CANCELLED, 'Cancelled'),
        (STATUS_COMPLETED, 'Completed'),
    ]

    member = models.ForeignKey(
        OnboardingSubmission, on_delete=models.CASCADE, related_name='offboarding_requests',
    )
    offboard_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_RESIGNATION)
    reason = models.TextField(blank=True)
    desired_last_day = models.DateField(null=True, blank=True)   # member's requested date

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING)

    # HR review + notice period
    notice_period_days = models.IntegerField(null=True, blank=True)
    last_working_day = models.DateField(null=True, blank=True)   # set on approval
    reviewed_by_name = models.CharField(max_length=255, blank=True)
    reviewed_by_user = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, db_constraint=False,
        related_name='offboardings_reviewed',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.TextField(blank=True)

    # Access revocation
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_by_name = models.CharField(max_length=255, blank=True)

    applied_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'offboarding_requests'
        ordering = ['-applied_at']
        permissions = [
            ('can_review_offboarding', 'Can approve, reject or revoke offboarding (HR only)'),
        ]

    def __str__(self):
        return f"{self.member.candidate_name} — offboarding ({self.status})"


# ── Asset Management ──────────────────────────────────────────────────────────

class Asset(models.Model):
    CAT_LAPTOP = 'laptop'
    CAT_PHONE = 'phone'
    CAT_ID_CARD = 'id_card'
    CAT_CHARGER = 'charger'
    CAT_HEADSET = 'headset'
    CAT_MONITOR = 'monitor'
    CAT_OTHER = 'other'
    CATEGORY_CHOICES = [
        (CAT_LAPTOP, 'Laptop'),
        (CAT_PHONE, 'Phone'),
        (CAT_ID_CARD, 'ID Card'),
        (CAT_CHARGER, 'Charger'),
        (CAT_HEADSET, 'Headset'),
        (CAT_MONITOR, 'Monitor'),
        (CAT_OTHER, 'Other'),
    ]

    COND_NEW = 'new'
    COND_GOOD = 'good'
    COND_FAIR = 'fair'
    COND_POOR = 'poor'
    CONDITION_CHOICES = [
        (COND_NEW, 'New'),
        (COND_GOOD, 'Good'),
        (COND_FAIR, 'Fair'),
        (COND_POOR, 'Poor'),
    ]

    STATUS_AVAILABLE = 'available'
    STATUS_ASSIGNED = 'assigned'
    STATUS_REPAIR = 'under_repair'
    STATUS_RETIRED = 'retired'
    STATUS_CHOICES = [
        (STATUS_AVAILABLE, 'Available'),
        (STATUS_ASSIGNED, 'Assigned'),
        (STATUS_REPAIR, 'Under Repair'),
        (STATUS_RETIRED, 'Retired'),
    ]

    name = models.CharField(max_length=255)
    category = models.CharField(max_length=15, choices=CATEGORY_CHOICES, default=CAT_OTHER)
    serial_number = models.CharField(max_length=255, blank=True)
    condition = models.CharField(max_length=10, choices=CONDITION_CHOICES, default=COND_GOOD)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default=STATUS_AVAILABLE)
    notes = models.TextField(blank=True)
    added_at = models.DateTimeField(auto_now_add=True)

    # Assignment
    assigned_to = models.ForeignKey(
        OnboardingSubmission, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='assets',
    )
    assigned_at = models.DateTimeField(null=True, blank=True)
    assigned_by_name = models.CharField(max_length=255, blank=True)
    assigned_by_user = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, db_constraint=False,
    )
    returned_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'assets'
        ordering = ['category', 'name']

    def __str__(self):
        return f"{self.name} ({self.get_status_display()})"


# ── Task Management ───────────────────────────────────────────────────────────

class Task(models.Model):
    PRIORITY_LOW = 'low'
    PRIORITY_MED = 'medium'
    PRIORITY_HIGH = 'high'
    PRIORITY_URGENT = 'urgent'
    PRIORITY_CHOICES = [
        (PRIORITY_LOW, 'Low'),
        (PRIORITY_MED, 'Medium'),
        (PRIORITY_HIGH, 'High'),
        (PRIORITY_URGENT, 'Urgent'),
    ]

    STATUS_TODO = 'todo'
    STATUS_IN_PROGRESS = 'in_progress'
    STATUS_REVIEW = 'review'
    STATUS_DONE = 'done'
    STATUS_CANCELLED = 'cancelled'
    STATUS_CHOICES = [
        (STATUS_TODO, 'To Do'),
        (STATUS_IN_PROGRESS, 'In Progress'),
        (STATUS_REVIEW, 'In Review'),
        (STATUS_DONE, 'Done'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    title = models.CharField(max_length=500)
    description = models.TextField(blank=True)

    # Who created/assigned the task
    assigned_by = models.ForeignKey(
        OnboardingSubmission, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='tasks_assigned',
    )
    assigned_by_admin = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, db_constraint=False,
        related_name='tasks_created',
    )

    # Assignment: either a specific member or a whole department
    assigned_to = models.ForeignKey(
        OnboardingSubmission, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='tasks_received',
    )
    assigned_to_department = models.CharField(max_length=255, blank=True,
                                               help_text='If set, task goes to full department')

    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default=PRIORITY_MED)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default=STATUS_TODO)

    # Optional link to a Project (career_app.Project). Nullable so all existing
    # standalone tasks are unaffected.
    project = models.ForeignKey(
        'Project', on_delete=models.SET_NULL, null=True, blank=True, related_name='tasks',
    )
    # Optional link to a sub-team within the project (all its members see the task).
    project_team = models.ForeignKey(
        'ProjectTeam', on_delete=models.SET_NULL, null=True, blank=True, related_name='tasks',
    )
    # Lead's estimate of how many hours the task should take (actual comes from work sessions).
    estimated_hours = models.FloatField(null=True, blank=True)

    due_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    completion_note = models.TextField(blank=True)

    class Meta:
        db_table = 'tasks'
        ordering = ['-created_at']

    def __str__(self):
        return self.title


# ── Weekly Team-Lead Updates (submitted to Advisory via the portal) ───────────

class WeeklyUpdate(models.Model):
    """A team lead's weekly update, submitted through the portal to Advisory."""
    team_lead = models.ForeignKey(
        OnboardingSubmission, on_delete=models.CASCADE, related_name='weekly_updates',
    )
    week_ending = models.DateField(help_text='Date the reported week ends')
    summary = models.TextField(help_text='What the team did this week')
    wins = models.TextField(blank=True, help_text='Key wins / highlights')
    blockers = models.TextField(blank=True, help_text='Blockers / needs attention')
    submitted_by_user = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, db_constraint=False,
        related_name='weekly_updates_submitted',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'weekly_updates'
        ordering = ['-week_ending', '-created_at']

    def __str__(self):
        return f"{self.team_lead.candidate_name} - week of {self.week_ending}"


class WeeklyUpdateComment(models.Model):
    """Advisory feedback left on a team lead's weekly update."""
    update = models.ForeignKey(
        WeeklyUpdate, on_delete=models.CASCADE, related_name='comments',
    )
    author_user = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, db_constraint=False,
        related_name='weekly_update_comments',
    )
    author_name = models.CharField(max_length=200, blank=True)
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'weekly_update_comments'
        ordering = ['created_at']

    def __str__(self):
        return f"comment on WU#{self.update_id} by {self.author_name}"


# ── Self-service signup (hashed link -> OTP -> HR approval) ───────────────────

class SelfSignup(models.Model):
    """A person who self-registered via the shared hashed link. They verify their
    email by OTP, then wait for HR to approve + assign a role/department, which
    provisions their real member account."""
    STATUS_OTP = 'otp_pending'       # submitted, must verify email OTP
    STATUS_VERIFIED = 'verified'     # OTP done, awaiting HR approval
    STATUS_APPROVED = 'approved'     # HR approved -> member account created
    STATUS_REJECTED = 'rejected'
    STATUS_CHOICES = [
        (STATUS_OTP, 'OTP pending'), (STATUS_VERIFIED, 'Awaiting HR'),
        (STATUS_APPROVED, 'Approved'), (STATUS_REJECTED, 'Rejected'),
    ]

    name = models.CharField(max_length=255)
    email = models.EmailField()
    photo_url = models.URLField(blank=True)
    otp_code = models.CharField(max_length=6, blank=True)
    otp_expires_at = models.DateTimeField(null=True, blank=True)
    otp_attempts = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_OTP)
    reviewed_by_user = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, db_constraint=False,
        related_name='signups_reviewed',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'self_signups'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} <{self.email}> ({self.status})"


# ── Projects (Advisory + Team Leads create; tasks, deadlines, chat) ───────────

class Project(models.Model):
    """A project owned by Advisory (org-wide / chosen departments) or a Team Lead
    (their own team). Tasks link to it; participants come from the chosen
    departments plus manual adds. Group chat + DMs (Phase 2) are auto-purged
    `chat_purge_after_days` after the project completes."""

    PRIORITY_LOW = 'low'
    PRIORITY_MED = 'medium'
    PRIORITY_HIGH = 'high'
    PRIORITY_URGENT = 'urgent'
    PRIORITY_CHOICES = [
        (PRIORITY_LOW, 'Low'), (PRIORITY_MED, 'Medium'),
        (PRIORITY_HIGH, 'High'), (PRIORITY_URGENT, 'Urgent'),
    ]

    STATUS_PLANNING = 'planning'
    STATUS_ACTIVE = 'active'
    STATUS_ON_HOLD = 'on_hold'
    STATUS_COMPLETED = 'completed'
    STATUS_CANCELLED = 'cancelled'
    STATUS_CHOICES = [
        (STATUS_PLANNING, 'Planning'), (STATUS_ACTIVE, 'Active'),
        (STATUS_ON_HOLD, 'On hold'), (STATUS_COMPLETED, 'Completed'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    SCOPE_ALL = 'all'                 # org-wide (every department)
    SCOPE_DEPARTMENTS = 'departments'  # only the listed departments
    SCOPE_CHOICES = [(SCOPE_ALL, 'All departments'), (SCOPE_DEPARTMENTS, 'Selected departments')]

    title = models.CharField(max_length=500)
    description = models.TextField(blank=True)

    # Creator (a member, e.g. Advisory/Team Lead) and/or the admin user account.
    created_by = models.ForeignKey(
        OnboardingSubmission, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='projects_created',
    )
    created_by_admin = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, db_constraint=False,
        related_name='projects_created',
    )
    owner_role = models.CharField(max_length=20, blank=True, help_text="'advisory' or 'team_lead'")

    # Which departments the project is for, and each one's priority.
    scope = models.CharField(max_length=15, choices=SCOPE_CHOICES, default=SCOPE_DEPARTMENTS)
    departments = models.JSONField(default=list, blank=True)             # ['Research', ...]
    department_priorities = models.JSONField(default=dict, blank=True)   # {'Research': 'high'}
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default=PRIORITY_MED)

    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default=STATUS_PLANNING)

    start_date = models.DateField(null=True, blank=True)
    deadline = models.DateField(null=True, blank=True)
    original_deadline = models.DateField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    chat_purge_after_days = models.PositiveIntegerField(default=15)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'projects'
        ordering = ['-created_at']

    def __str__(self):
        return self.title

    @property
    def chat_purge_at(self):
        """When this project's chats/DMs should be erased (None until completed)."""
        if self.completed_at:
            return self.completed_at + timedelta(days=self.chat_purge_after_days or 15)
        return None

    @property
    def is_overdue(self):
        return bool(
            self.deadline and self.status not in (self.STATUS_COMPLETED, self.STATUS_CANCELLED)
            and self.deadline < timezone.localdate()
        )


class ProjectMember(models.Model):
    """A participant in a project. Auto-added from the project's departments,
    plus any manual additions."""
    ROLE_LEAD = 'lead'
    ROLE_MEMBER = 'member'
    ROLE_VIEWER = 'viewer'
    ROLE_CHOICES = [(ROLE_LEAD, 'Lead'), (ROLE_MEMBER, 'Member'), (ROLE_VIEWER, 'Viewer')]

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='members')
    member = models.ForeignKey(
        OnboardingSubmission, on_delete=models.CASCADE, related_name='project_memberships',
    )
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default=ROLE_MEMBER)
    teams = models.ManyToManyField('ProjectTeam', related_name='members', blank=True)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'project_members'
        unique_together = ('project', 'member')
        ordering = ['role', 'added_at']

    def __str__(self):
        return f"{self.member.candidate_name} in {self.project.title}"


class ProjectDeadlineChange(models.Model):
    """Audit trail of every deadline extension/change on a project."""
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='deadline_changes')
    old_deadline = models.DateField(null=True, blank=True)
    new_deadline = models.DateField(null=True, blank=True)
    reason = models.TextField(blank=True)
    changed_by = models.ForeignKey(
        OnboardingSubmission, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='project_deadline_changes',
    )
    changed_by_admin = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, db_constraint=False,
        related_name='project_deadline_changes',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'project_deadline_changes'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.project.title}: {self.old_deadline} → {self.new_deadline}"


class ProjectChecklistItem(models.Model):
    """A pinned 'what to do' item for the whole project — the shared to-do/agenda
    every participant sees (separate from assigned Kanban tasks)."""
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='checklist')
    text = models.CharField(max_length=1000)
    is_done = models.BooleanField(default=False)
    order = models.IntegerField(default=0)
    created_by = models.ForeignKey(
        OnboardingSubmission, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    created_by_admin = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, db_constraint=False, related_name='+',
    )
    done_by = models.ForeignKey(
        OnboardingSubmission, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    done_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'project_checklist_items'
        ordering = ['order', 'id']

    def __str__(self):
        return f"{self.project_id}: {self.text[:40]}"


class ProjectMessage(models.Model):
    """A chat message in a project. team=null is the whole-project group chat;
    team=<ProjectTeam> is that sub-team's private channel. Erased 15 days after
    the project ends."""
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='messages')
    team = models.ForeignKey(
        'ProjectTeam', on_delete=models.CASCADE, null=True, blank=True, related_name='messages',
    )
    sender = models.ForeignKey(
        OnboardingSubmission, on_delete=models.SET_NULL, null=True, blank=True, related_name='project_messages',
    )
    sender_admin = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, db_constraint=False, related_name='+',
    )
    body = models.TextField()
    mentions = models.JSONField(default=list, blank=True)   # list of OnboardingSubmission ids
    pinned = models.BooleanField(default=False)
    reply_to = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='replies')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'project_messages'
        ordering = ['created_at']

    def __str__(self):
        return f"{self.project_id}: {self.body[:40]}"


class DirectMessage(models.Model):
    """A 1:1 message between two people in a project context. Each side is either a
    member (OnboardingSubmission) or an admin user (auth.User). Erased with the
    project's group chat, 15 days after the project ends."""
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='dms')
    sender = models.ForeignKey(
        OnboardingSubmission, on_delete=models.CASCADE, null=True, blank=True, related_name='dms_sent',
    )
    sender_admin = models.ForeignKey(
        User, on_delete=models.CASCADE, null=True, blank=True, db_constraint=False, related_name='+',
    )
    recipient = models.ForeignKey(
        OnboardingSubmission, on_delete=models.CASCADE, null=True, blank=True, related_name='dms_received',
    )
    recipient_admin = models.ForeignKey(
        User, on_delete=models.CASCADE, null=True, blank=True, db_constraint=False, related_name='+',
    )
    body = models.TextField()
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'project_direct_messages'
        ordering = ['created_at']

    def __str__(self):
        return f"{self.sender_id or self.sender_admin_id}->{self.recipient_id or self.recipient_admin_id}: {self.body[:30]}"


class ProjectNotification(models.Model):
    """An in-app notification for a member (mention, chat, DM, task, deadline)."""
    KIND_MENTION = 'mention'
    KIND_MESSAGE = 'message'
    KIND_DM = 'dm'
    KIND_TASK = 'task'
    KIND_DEADLINE = 'deadline'
    KIND_CHOICES = [
        (KIND_MENTION, 'Mention'), (KIND_MESSAGE, 'Message'), (KIND_DM, 'Direct message'),
        (KIND_TASK, 'Task'), (KIND_DEADLINE, 'Deadline'),
    ]

    recipient = models.ForeignKey(
        OnboardingSubmission, on_delete=models.CASCADE, related_name='project_notifications',
    )
    project = models.ForeignKey(Project, on_delete=models.CASCADE, null=True, blank=True, related_name='notifications')
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default=KIND_MESSAGE)
    text = models.CharField(max_length=500)
    link = models.CharField(max_length=300, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'project_notifications'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.recipient_id}: {self.text[:40]}"


class ProjectTeam(models.Model):
    """A sub-team inside a project. Participants can be split into teams and tasks
    can be assigned to a whole team."""
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='teams')
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    lead = models.ForeignKey(
        OnboardingSubmission, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    color = models.CharField(max_length=20, blank=True)
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'project_teams'
        ordering = ['order', 'id']

    def __str__(self):
        return f"{self.project_id}: {self.name}"


class ProjectMilestone(models.Model):
    """A dated milestone/phase within a project."""
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='milestones')
    title = models.CharField(max_length=300)
    due_date = models.DateField(null=True, blank=True)
    is_done = models.BooleanField(default=False)
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'project_milestones'
        ordering = ['order', 'due_date', 'id']

    def __str__(self):
        return f"{self.project_id}: {self.title}"


class WorkSession(models.Model):
    """One check-in → check-out work session. A person can have several per day,
    each optionally tied to a task. The day's total = sum of its sessions; the
    day's approval lives on the matching AttendanceRecord (approved as a whole)."""
    member = models.ForeignKey(
        OnboardingSubmission, on_delete=models.CASCADE, related_name='work_sessions',
    )
    date = models.DateField()
    check_in = models.DateTimeField()
    check_out = models.DateTimeField(null=True, blank=True)
    task = models.ForeignKey(
        Task, on_delete=models.SET_NULL, null=True, blank=True, related_name='work_sessions',
    )
    note = models.TextField(blank=True)
    completed_task = models.BooleanField(default=False)   # marked the task done at checkout
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'work_sessions'
        ordering = ['-check_in']

    @property
    def duration_minutes(self):
        if self.check_in and self.check_out:
            return max(0, int((self.check_out - self.check_in).total_seconds() // 60))
        return 0

    def __str__(self):
        return f"{self.member_id} {self.date} ({self.duration_minutes}m)"


class TaskStep(models.Model):
    """An ordered step in a task's workflow — 'how this work is done'. The task's
    assignee (or a project manager) adds steps and ticks them off."""
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='steps')
    text = models.CharField(max_length=500)
    is_done = models.BooleanField(default=False)
    order = models.IntegerField(default=0)
    done_by = models.ForeignKey(
        OnboardingSubmission, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    done_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'task_steps'
        ordering = ['order', 'id']

    def __str__(self):
        return f"{self.task_id}: {self.text[:40]}"


class ProjectAttachment(models.Model):
    """A file/link attached to a project (uploaded image URL or a pasted link)."""
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='attachments')
    name = models.CharField(max_length=300)
    url = models.URLField(max_length=1000)
    uploaded_by = models.ForeignKey(
        OnboardingSubmission, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    uploaded_by_admin = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, db_constraint=False, related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'project_attachments'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.project_id}: {self.name}"


class Policy(models.Model):
    """A company policy published by HR. Simple shared library: every member
    sees every published policy (no per-team targeting, no acknowledgement)."""
    title = models.CharField(max_length=255)
    category = models.CharField(max_length=80, blank=True, default='General')
    summary = models.CharField(max_length=300, blank=True)
    body = models.TextField(blank=True)
    is_published = models.BooleanField(default=True)
    order = models.IntegerField(default=0)
    created_by_user = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, db_constraint=False,
        related_name='policies_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'policies'
        ordering = ['order', '-updated_at']

    def __str__(self):
        return self.title


class Form(models.Model):
    """A custom form (Google-Forms / Tally style). Fields, theme and settings are
    stored as JSON so the builder is fully flexible. HR/Advisory build them; they
    can be filled internally (logged-in) or via a public hashed link."""
    VIS_INTERNAL = 'internal'
    VIS_PUBLIC = 'public'
    VISIBILITY_CHOICES = [(VIS_INTERNAL, 'Internal (logged-in members)'), (VIS_PUBLIC, 'Public link')]

    title = models.CharField(max_length=255, default='Untitled form')
    description = models.TextField(blank=True)
    schema = models.JSONField(default=list, blank=True)      # [{id,type,label,help,required,options,...}]
    theme = models.JSONField(default=dict, blank=True)       # {bg_type,bg_color,bg_image,accent,font,layout,button_text}
    settings = models.JSONField(default=dict, blank=True)    # {accepting,require_login,one_response,thank_you,close_date,collect_email}
    visibility = models.CharField(max_length=10, choices=VISIBILITY_CHOICES, default=VIS_INTERNAL)
    is_published = models.BooleanField(default=False)
    token = models.CharField(max_length=64, unique=True, blank=True)
    created_by_user = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, db_constraint=False,
        related_name='forms_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'forms'
        ordering = ['-updated_at']

    def save(self, *args, **kwargs):
        if not self.token:
            import secrets
            self.token = secrets.token_urlsafe(12)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title


class FormResponse(models.Model):
    form = models.ForeignKey(Form, on_delete=models.CASCADE, related_name='responses')
    answers = models.JSONField(default=dict, blank=True)     # {field_id: value}
    submitted_by_user = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, db_constraint=False,
        related_name='form_responses',
    )
    submitter_name = models.CharField(max_length=255, blank=True)
    submitter_email = models.EmailField(blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'form_responses'
        ordering = ['-submitted_at']

    def __str__(self):
        return f"Response to {self.form_id} @ {self.submitted_at}"
