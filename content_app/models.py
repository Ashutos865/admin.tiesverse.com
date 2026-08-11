"""Content Calendar — the Content department's planning workspace.

A `ContentItem` is one planned piece of content: the row you see in the table,
the card you drag on the Kanban board, and the chip you drag on the calendar.

Two dates do different jobs and must not be conflated:
  * `due_date`     — when the writer/designer owes the work
  * `release_date` — when it goes out; this is what the calendar is keyed on

Each item may own a real `career_app.Task`, so assigned work shows up in the
person's normal task list instead of living in a second, invisible tracker.
Models live on turso_db (see config/routers.py); the FK to auth.User therefore
uses db_constraint=False, and is never select_related across the DB boundary.
"""
from django.conf import settings
from django.db import models

# Kanban columns, in board order. Deliberately richer than Task.STATUS_CHOICES —
# content has production stages a generic task does not; services.py maps between
# the two so the linked task still reads sensibly in the task tracker.
STATUS_IDEA = 'idea'
STATUS_SCRIPTING = 'scripting'
STATUS_DESIGN = 'design'
STATUS_EDITING = 'editing'
STATUS_REVIEW = 'review'
STATUS_SCHEDULED = 'scheduled'
STATUS_PUBLISHED = 'published'
STATUS_CHOICES = [
    (STATUS_IDEA, 'Idea'),
    (STATUS_SCRIPTING, 'Scripting'),
    (STATUS_DESIGN, 'Design'),
    (STATUS_EDITING, 'Editing'),
    (STATUS_REVIEW, 'Review'),
    (STATUS_SCHEDULED, 'Scheduled'),
    (STATUS_PUBLISHED, 'Published'),
]
BOARD_ORDER = [s for s, _ in STATUS_CHOICES]

CONTENT_TYPE_CHOICES = [
    ('carousel', 'Carousel / Static'),
    ('reel', 'Reel / Short'),
    ('story', 'Story'),
    ('article', 'Article'),
    ('video', 'Long-form Video'),
    ('podcast', 'Podcast'),
    ('report', 'Report'),
    ('other', 'Other'),
]

PRIORITY_CHOICES = [
    ('low', 'Low'),
    ('medium', 'Medium'),
    ('high', 'High'),
    ('urgent', 'Urgent'),
]

EFFORT_CHOICES = [
    ('s', 'Small'),
    ('m', 'Medium'),
    ('l', 'Large'),
]

# Offered in the UI; stored as a JSON list so a new platform needs no migration.
PLATFORM_OPTIONS = [
    'Instagram', 'LinkedIn', 'YouTube', 'X', 'Facebook',
    'Website', 'Substack', 'WhatsApp', 'Threads', 'Other',
]


class ContentItem(models.Model):
    # Legacy free-text brand. Kept so existing rows keep their value while the
    # category FK below becomes the real field; the API mirrors the two.
    brand = models.CharField(max_length=200, blank=True)
    category = models.ForeignKey(
        'ContentCategory', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='items')
    # Archived items leave the board but keep their record and their history.
    archived_at = models.DateTimeField(null=True, blank=True, db_index=True)
    # Work delivered at the end: images plus where it went live. Optional, and
    # the source for publishing this piece to the public Media page.
    assets = models.JSONField(default=list, blank=True)      # [url, ...]
    media_post_id = models.IntegerField(null=True, blank=True)
    title = models.CharField(max_length=500)
    content_type = models.CharField(
        max_length=20, choices=CONTENT_TYPE_CHOICES, default='other')
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default=STATUS_IDEA, db_index=True)

    # Two independent assignment tracks — the writing side and the design side
    # are usually different people and are scheduled separately.
    content_assignees = models.ManyToManyField(
        'career_app.OnboardingSubmission', blank=True,
        related_name='content_items_writing')
    # Editing is its own job, not a synonym for writing: one field for both
    # meant you could not tell who wrote a piece from who edited it.
    editor_assignees = models.ManyToManyField(
        'career_app.OnboardingSubmission', blank=True,
        related_name='content_items_editing')
    graphics_assignees = models.ManyToManyField(
        'career_app.OnboardingSubmission', blank=True,
        related_name='content_items_graphics')

    doc_url = models.URLField(max_length=1000, blank=True)      # Google Doc / design file
    extra_links = models.JSONField(default=list, blank=True)    # [{label, url}, …]

    due_date = models.DateField(null=True, blank=True)          # work owed by
    release_date = models.DateField(null=True, blank=True, db_index=True)  # drives the calendar

    platforms = models.JSONField(default=list, blank=True)      # ['Instagram', …]
    posting_url = models.URLField(max_length=1000, blank=True)  # where it went live

    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')
    effort = models.CharField(max_length=1, choices=EFFORT_CHOICES, blank=True)
    notes = models.TextField(blank=True)

    # Linked tasks — ONE PER ASSIGNEE, because career_app.Task.assigned_to is a
    # ForeignKey and can only name one person. Three people on a piece of content
    # therefore means three tasks, so the work shows up for each of them.
    # `task` is kept as the "primary" task for backwards compatibility and for a
    # quick summary in the panel; `tasks` is the full set.
    task = models.ForeignKey(
        'career_app.Task', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='content_items')
    tasks = models.ManyToManyField(
        'career_app.Task', blank=True, related_name='content_items_all')

    # Manual position within a Kanban column (lower first).
    order = models.PositiveIntegerField(default=0)

    # Per-item switch: WhatsApp costs money per message, so notifying is a
    # deliberate choice rather than something that fires on every edit.
    notify_on_assign = models.BooleanField(default=True)

    created_by_admin = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        db_constraint=False, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'content_items'
        ordering = ['order', '-created_at']
        indexes = [
            models.Index(fields=['status', 'order']),
            models.Index(fields=['release_date']),
            models.Index(fields=['due_date']),
        ]

    def __str__(self):
        return f'{self.title} [{self.status}]'


class WhatsAppLog(models.Model):
    """Every WhatsApp notification attempt — sent, skipped or failed.

    Meta bills per message, so there is a record of exactly what went out and
    what did not. `skipped` is a first-class outcome, not an error: it covers a
    member with no opt-in, a missing number, the daily cap, and the normal state
    before any credentials exist — each with its reason in `error`.
    """
    STATUS_CHOICES = [
        ('sent', 'Sent'),
        ('skipped', 'Skipped'),
        ('failed', 'Failed'),
    ]

    member = models.ForeignKey(
        'career_app.OnboardingSubmission', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='whatsapp_logs')
    item = models.ForeignKey(
        'ContentItem', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='whatsapp_logs')
    to_number = models.CharField(max_length=20, blank=True)
    template = models.CharField(max_length=100, blank=True)
    params = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, db_index=True)
    error = models.CharField(max_length=500, blank=True)
    wamid = models.CharField(max_length=128, blank=True)   # Meta's message id
    sent_by_admin = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        db_constraint=False, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'content_whatsapp_logs'
        ordering = ['-created_at']
        indexes = [models.Index(fields=['status', '-created_at'])]

    def __str__(self):
        return f'{self.status} → {self.to_number or "(no number)"}'


class ContentActivity(models.Model):
    """Audit trail + lightweight comments, shown in the detail panel.

    Every status move, reschedule and edit writes one row, so a piece of content
    carries its own history — who moved it, when, and from what.
    """
    VERB_CHOICES = [
        ('created', 'Created'),
        ('updated', 'Updated'),
        ('status_changed', 'Status changed'),
        ('rescheduled', 'Rescheduled'),
        ('assigned', 'Assignees changed'),
        ('commented', 'Commented'),
        ('task_linked', 'Task linked'),
        ('deleted', 'Deleted'),
    ]

    item = models.ForeignKey(
        ContentItem, on_delete=models.CASCADE, related_name='activity')
    actor_admin = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        db_constraint=False, related_name='+')
    actor_name = models.CharField(max_length=255, blank=True)
    verb = models.CharField(max_length=20, choices=VERB_CHOICES)
    detail = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'content_activity'
        ordering = ['-created_at']
        indexes = [models.Index(fields=['item', '-created_at'])]

    def __str__(self):
        return f'{self.verb} · {self.item_id}'


class ContentCategory(models.Model):
    """A brand or project a content item belongs to (TIES, FPI, a campaign).

    `brand` on ContentItem was free text, so every typo became a new "brand"
    and nothing could be grouped reliably. Categories are created from the
    panel itself (Notion-style: type a name, press create), so this stays a
    real list without anyone having to visit a settings screen.
    """
    name = models.CharField(max_length=120, unique=True)
    color = models.CharField(max_length=9, blank=True)      # '#fe7a00'
    order = models.IntegerField(default=0)
    archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'content_categories'
        ordering = ['order', 'name']
        verbose_name_plural = 'content categories'

    def __str__(self):
        return self.name
