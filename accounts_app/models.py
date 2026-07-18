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
    avatar_url = models.URLField(max_length=500, blank=True, default='')

    def __str__(self):
        return f"{self.user.username}'s Profile"

    class Meta:
        permissions = [
            ('can_delegate_permissions', 'Can delegate own permissions to team members'),
            ('can_edit_articles', 'Can write and save article/report drafts'),
            ('can_publish_articles', 'Can publish and edit articles/reports'),
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


class FeaturedContent(models.Model):
    """An item curated for the public website's homepage sections (the spotlight
    hero card, "Latest in Insights", "Latest in Engagements"). Exposed via a
    public read-only API the website fetches, so cards update without a redeploy."""
    KIND_CHOICES = [
        ('report', 'Report'), ('insight', 'Insight'), ('webinar', 'Webinar'),
        ('workshop', 'Workshop'), ('event', 'Event'), ('podcast', 'Podcast'),
    ]
    SECTION_CHOICES = [
        ('spotlight', 'Spotlight (hero card)'),
        ('insights', 'Latest in Insights'),
        ('engagements', 'Latest in Engagements'),
    ]

    section = models.CharField(max_length=20, choices=SECTION_CHOICES, default='spotlight')
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default='report')
    title = models.CharField(max_length=300)
    subtitle = models.CharField(max_length=300, blank=True, help_text='Category / meta line')
    image_url = models.CharField(max_length=800, blank=True)
    link_url = models.CharField(max_length=800, blank=True, help_text='Where the card links to')
    cta_label = models.CharField(max_length=100, blank=True, help_text='e.g. "Read the report"')
    date_label = models.CharField(max_length=100, blank=True, help_text='e.g. "Jun 04, 2026"')

    is_active = models.BooleanField(default=True)
    order = models.IntegerField(default=0, help_text='Lower shows first')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'featured_content'
        ordering = ['section', 'order', '-created_at']

    def __str__(self):
        return f"[{self.section}] {self.title}"


class SiteNavCategory(models.Model):
    """A WordPress category chosen to appear in the public website's navigation
    (the Insights dropdown on tiesverse.com). Curated in the admin panel — you
    pick which WP categories are 'nav-worthy', set their order and a friendly
    display label. The website reads these (with live post counts / articles
    fetched from WordPress) so the nav updates without a code change."""
    wp_slug = models.SlugField(max_length=120, help_text='WordPress category slug')
    wp_category_id = models.IntegerField(default=0, help_text='WordPress category ID (for fast lookups)')
    label = models.CharField(max_length=120, help_text='Friendly label shown in the nav, e.g. "Map illustrations"')
    order = models.IntegerField(default=0, help_text='Lower shows first')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'site_nav_categories'
        ordering = ['order', 'id']

    def __str__(self):
        return f"{self.label} ({self.wp_slug})"


class EmailCampaign(models.Model):
    """A record of one bulk mail-merge send (for history/tracking)."""
    name = models.CharField(max_length=200, blank=True)
    template_key = models.CharField(max_length=64)
    template_name = models.CharField(max_length=200, blank=True)
    subject = models.CharField(max_length=300, blank=True)
    # Full record of what was sent, so history shows the exact content + sender.
    from_name = models.CharField(max_length=200, blank=True)
    from_email = models.CharField(max_length=254, blank=True)
    body_html = models.TextField(blank=True)
    had_attachment = models.BooleanField(default=False)
    recipient_count = models.IntegerField(default=0)
    sent_count = models.IntegerField(default=0)
    failed_count = models.IntegerField(default=0)
    skipped_count = models.IntegerField(default=0)
    # Background-job progress for certificate campaigns (generated server-side).
    # queued  = saved, awaiting the worker
    # running = worker is processing it
    # canceled= sender stopped it mid-send
    # done    = finished    error = crashed/failed to complete
    status = models.CharField(max_length=20, default='done')
    processed_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=200, blank=True)

    # ── Durable-queue fields (added for resumable, batched, cancellable sending) ──
    # The full job spec (recipients + send config) so the worker can run — and
    # RESUME after a restart — without the browser. Kept on the row itself so the
    # queue is entirely DB-backed (no external broker).
    job_config = models.JSONField(default=dict, blank=True)
    # Sender can request a stop; the worker honours it between recipients.
    cancel_requested = models.BooleanField(default=False)
    # Adaptive batching (sized from the live SES send rate, not a fixed number).
    batch_size = models.IntegerField(default=0)
    batch_total = models.IntegerField(default=0)
    batch_index = models.IntegerField(default=0)
    # Timing: started_at drives the live ETA; updated_at is the worker heartbeat
    # (used to detect a campaign left 'running' by a crash so it can be resumed).
    started_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    # Completion notice → sent once to this address (the campaign's From).
    notify_email = models.CharField(max_length=254, blank=True)
    notified = models.BooleanField(default=False)

    class Meta:
        db_table = 'email_campaigns'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name or self.template_name} — {self.sent_count}/{self.recipient_count}"


class EmailSendLog(models.Model):
    """One row per individual email actually sent (or stubbed), so we can report
    per-recipient counts: who received what, how many times, and when. Written by
    the webinar broadcast, certificate send, and campaign paths."""
    recipient_email = models.CharField(max_length=254, db_index=True)
    recipient_name = models.CharField(max_length=200, blank=True)
    template_key = models.CharField(max_length=64, blank=True)
    template_name = models.CharField(max_length=200, blank=True)
    subject = models.CharField(max_length=300, blank=True)
    # what triggered it: 'webinar_broadcast' | 'webinar_confirmation' | 'certificate' | 'campaign' | ...
    context = models.CharField(max_length=40, default='campaign', db_index=True)
    event_key = models.CharField(max_length=120, blank=True, db_index=True)
    event_type = models.CharField(max_length=20, blank=True)
    # sent | stubbed | failed  → then updated by SES notifications: delivered | bounced | complained
    status = models.CharField(max_length=20, default='sent')
    error = models.TextField(blank=True)
    certificate_id = models.CharField(max_length=64, blank=True)  # set when a cert PDF was attached
    message_id = models.CharField(max_length=200, blank=True, db_index=True)  # SES MessageId (for bounce matching)
    campaign = models.ForeignKey('EmailCampaign', null=True, blank=True, on_delete=models.SET_NULL, related_name='logs')
    sent_by = models.CharField(max_length=200, blank=True)
    sent_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'email_send_logs'
        ordering = ['-sent_at']

    def __str__(self):
        return f"{self.recipient_email} <- {self.template_name or self.template_key} ({self.status})"


class EmailDraft(models.Model):
    """A saved-but-unsent Mail Automation setup. Stores the whole builder state
    (template, subject, sender, recipients, certificate config) as JSON so it can
    be reopened and finished/sent later."""
    name = models.CharField(max_length=200, blank=True)
    payload = models.JSONField(default=dict)     # full front-end builder state
    created_by = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'email_drafts'
        ordering = ['-updated_at']

    def __str__(self):
        return self.name or f'Draft #{self.pk}'


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
