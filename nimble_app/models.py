from django.db import models


# Nimble Monitor — competitor-content alert & response tracker for the Nimble
# (Creative) team. Ported from the standalone Upties/YT-Competitor-Monitor-by-TIES
# tool ("Nimble Monitor"), which stored everything in a flat data.json. Here the
# data lives in turso_db as proper models so it is queryable and persists history.
#
# Platforms are defined centrally in `platforms.PLATFORM_REGISTRY`; which ones the
# poller acts on is controlled by settings.NIMBLE_ENABLED_SOURCES (default
# youtube + x). YouTube uses official RSS; X scrapes the public profile (verified
# working, but see x_source.py caveats); Instagram is built but disabled because
# the platform currently answers HTTP 429.


SOURCE_CHOICES = [
    ('youtube', 'YouTube'),
    ('instagram', 'Instagram'),
    ('x', 'X'),
]

KIND_CHOICES = [
    ('COMPETITOR', 'Competitor'),   # tracked rival account
    ('OWN', 'Own'),                 # our own account — excluded from the alert board
]

STATUS_CHOICES = [
    ('OPEN', 'They have posted'),
    ('WORKING', "We're posting"),
]


class MonitorChannel(models.Model):
    """A tracked account (competitor or our own) on one platform."""
    name = models.CharField(max_length=200)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='youtube')
    # For YouTube this is the UC… channel ID; for IG/X it would be the handle.
    source_handle = models.CharField(max_length=120)
    youtube_id = models.CharField(max_length=120, blank=True)
    priority = models.PositiveSmallIntegerField(default=3)   # 1..5
    kind = models.CharField(max_length=12, choices=KIND_CHOICES, default='COMPETITOR')
    active = models.BooleanField(default=True)
    last_checked = models.DateTimeField(null=True, blank=True)
    last_error = models.CharField(max_length=400, blank=True)
    last_error_at = models.DateTimeField(null=True, blank=True)
    # Health tracking — X/Instagram are scraping-based and can break silently when
    # the platform changes its markup, so count consecutive bad checks and surface
    # a warning once we cross UNHEALTHY_AFTER (see services.poll_channels/health).
    consecutive_failures = models.PositiveSmallIntegerField(default=0)
    last_success_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    # A channel is flagged in the UI once it has failed this many checks in a row.
    UNHEALTHY_AFTER = 3

    class Meta:
        db_table = 'monitor_channels'
        ordering = ['-created_at']
        unique_together = ('source', 'source_handle')

    def __str__(self):
        return f'{self.name} ({self.source})'

    @property
    def is_unhealthy(self):
        return self.consecutive_failures >= self.UNHEALTHY_AFTER


class MonitorAlert(models.Model):
    """A detected post from a tracked channel, and the team's response state."""
    channel = models.ForeignKey(MonitorChannel, on_delete=models.CASCADE, related_name='alerts')
    # Dedupe key — the platform's own id for the post (video id / shortcode / tweet id).
    item_id = models.CharField(max_length=120, db_index=True)
    youtube_video_id = models.CharField(max_length=120, blank=True)
    title = models.CharField(max_length=400)
    url = models.URLField(max_length=600, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    thumbnail_url = models.URLField(max_length=600, blank=True)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default='OPEN')
    assigned_to = models.CharField(max_length=120, blank=True)   # free-text for now
    note = models.CharField(max_length=400, blank=True)
    unread = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'monitor_alerts'
        ordering = ['-published_at', '-created_at']
        unique_together = ('channel', 'item_id')
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['channel', 'created_at']),
        ]

    def __str__(self):
        return self.title[:60]


class MonitorOwnPost(models.Model):
    """A manually logged own-post (for the response/heatmap when we didn't detect
    it automatically from a tracked OWN channel)."""
    title = models.CharField(max_length=400)
    published_at = models.DateTimeField(null=True, blank=True)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='youtube')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'monitor_own_posts'
        ordering = ['-published_at', '-created_at']

    def __str__(self):
        return self.title[:60]
