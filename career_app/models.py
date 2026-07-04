from django.db import models
from django.contrib.auth.models import User


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
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_SUBMITTED, 'Submitted'),
        (STATUS_VERIFIED, 'Verified'),
        (STATUS_REJECTED, 'Rejected'),
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
        User, on_delete=models.CASCADE, related_name='member_account',
    )
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name='accounts_created',
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
        User, on_delete=models.SET_NULL, null=True, blank=True,
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
        User, on_delete=models.SET_NULL, null=True, blank=True,
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
        User, on_delete=models.SET_NULL, null=True, blank=True,
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
        User, on_delete=models.SET_NULL, null=True, blank=True,
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
        User, on_delete=models.SET_NULL, null=True, blank=True,
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

    due_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    completion_note = models.TextField(blank=True)

    class Meta:
        db_table = 'tasks'
        ordering = ['-created_at']

    def __str__(self):
        return self.title
