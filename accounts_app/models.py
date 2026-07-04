from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver
import uuid

class Setting(models.Model):
    key = models.CharField(max_length=255, unique=True, primary_key=True)
    value = models.CharField(max_length=255)

    class Meta:
        db_table = 'site_settings'

    def __str__(self):
        return f"{self.key}: {self.value}"


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    display_name = models.CharField(max_length=255, blank=True, default='')
    bio = models.TextField(blank=True, default='')
    email_notifications = models.BooleanField(default=True)
    push_notifications = models.BooleanField(default=True)
    weekly_reports = models.BooleanField(default=True)
    two_factor_enabled = models.BooleanField(default=False)
    session_timeout = models.IntegerField(default=10)  # minutes of inactivity before auto-logout
    theme = models.CharField(max_length=50, default='light')
    accent_color = models.CharField(max_length=50, default='#3525CD')

    def __str__(self):
        return f"{self.user.username}'s Profile"

    class Meta:
        permissions = [
            ('can_delegate_permissions', 'Can delegate own permissions to team members'),
        ]


class CertificateRecord(models.Model):
    SOURCE_CHOICES = [
        ('webinar', 'Webinar certificate'),
        ('offer', 'Offer letter'),
        ('manual', 'Manual'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    certificate_id = models.CharField(max_length=80, unique=True)
    source_type = models.CharField(max_length=20, choices=SOURCE_CHOICES)
    source_ref = models.CharField(max_length=255)
    person_name = models.CharField(max_length=255)
    person_email = models.EmailField(blank=True)
    subject_title = models.CharField(max_length=255)
    template_id = models.CharField(max_length=80)
    template_name = models.CharField(max_length=255)
    data_json = models.JSONField(default=dict)
    email_status = models.CharField(max_length=30, default='not_sent')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'certificate_records'
        ordering = ['-created_at']
        unique_together = [('source_type', 'source_ref', 'template_id')]

    def __str__(self):
        return f"{self.certificate_id} — {self.person_name}"


class EmailTemplate(models.Model):
    """Admin-editable email template for one send point in the app.

    Every place the backend sends mail (password reset, onboarding, certificates,
    offers, ...) maps to one row here. The admin can change the subject, sender
    name/address, HTML design, whether it's enabled, and whether it may carry a
    PDF attachment. Bodies use {{placeholder}} tokens filled in at send time.
    """
    key = models.CharField(max_length=64, unique=True)   # e.g. 'password_reset'
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)

    subject = models.CharField(max_length=300)
    from_name = models.CharField(max_length=200, blank=True, help_text='Sender alias / display name')
    from_email = models.EmailField(blank=True, help_text='Blank = use the default sender')
    body_html = models.TextField(help_text='Rendered HTML (generated from content_json)')
    # Structured, friendly content the visual editor works with. body_html is
    # regenerated from this on every save. Shape:
    #   {heading, body, table:[{label,value}], closing, button:{label,url}, signature}
    content_json = models.JSONField(default=dict, blank=True)

    is_enabled = models.BooleanField(default=False, help_text='Off = printed to console, not sent')
    allow_attachment = models.BooleanField(default=False, help_text='May carry a PDF (e.g. certificates)')

    # True = user-created (deletable, name/variables editable). False = built-in send point.
    is_custom = models.BooleanField(default=False)
    # True = admin edits raw body_html directly; False = body_html is built from content_json.
    html_mode = models.BooleanField(default=False)

    # Which {{tokens}} this template can use (editable for custom templates).
    variables = models.JSONField(default=list, blank=True)

    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=200, blank=True)

    class Meta:
        db_table = 'email_templates'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.key})"


@receiver(post_save, sender=User)
def create_or_update_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)
    else:
        # Check if profile exists before saving (for users created before this model)
        if not hasattr(instance, 'profile'):
            UserProfile.objects.create(user=instance)
        else:
            instance.profile.save()
