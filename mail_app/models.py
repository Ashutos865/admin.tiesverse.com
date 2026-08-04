"""TIES Mail — portal mailboxes on the mail.tiesverse.com domain.

Mail for `@mail.tiesverse.com` is received by AWS SES (MX → inbound-smtp), dropped
into S3, and ingested here; outbound goes through the same SES account used for
transactional mail. Google Workspace owns `@tiesverse.com` and is never involved.

Three kinds of mailbox:
  PERSONAL — one member's own box (diya@mail.tiesverse.com)
  SHARED   — a team box (nimble@mail.tiesverse.com) any number of members may be
             granted; it can also carry its own password so the team can sign in
             to just that box without a portal account
  SYSTEM   — the catch-all for mail addressed to a non-existent local part

All models live on turso_db (see config/routers.py). FKs to auth.User therefore
use db_constraint=False and are resolved with separate queries — auth lives in the
`default` DB and SQLite cannot join across files.
"""
from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core.validators import RegexValidator
from django.db import models

MAIL_DOMAIN = 'mail.tiesverse.com'

# Local part: lowercase letters, digits, dot, underscore, hyphen.
ADDRESS_RE = r'^[a-z0-9][a-z0-9._-]{0,63}@mail\.tiesverse\.com$'
address_validator = RegexValidator(
    ADDRESS_RE,
    'Address must look like name@mail.tiesverse.com (lowercase letters, digits, . _ -).',
)

KIND_PERSONAL = 'PERSONAL'
KIND_SHARED = 'SHARED'
KIND_SYSTEM = 'SYSTEM'
KIND_CHOICES = [
    (KIND_PERSONAL, 'Personal'),
    (KIND_SHARED, 'Shared / team'),
    (KIND_SYSTEM, 'System (catch-all)'),
]

DIRECTION_CHOICES = [('OUT', 'Sent'), ('IN', 'Received')]
STATUS_CHOICES = [
    ('queued', 'Queued'),
    # Claimed by whoever is about to hand it to SES. The queued→sending move is a
    # compare-and-set, so the cron flusher and a browser pressing "send now" can
    # race for the same row and only one of them wins.
    ('sending', 'Sending'),
    ('sent', 'Sent'),
    ('failed', 'Failed'),
    ('canceled', 'Canceled'),
    ('received', 'Received'),
]


class Mailbox(models.Model):
    """One mail identity. Created only by a superadmin (the ROLE, not a person)."""

    kind = models.CharField(max_length=10, choices=KIND_CHOICES, default=KIND_PERSONAL)
    address = models.CharField(max_length=255, unique=True, db_index=True,
                              validators=[address_validator])
    display_name = models.CharField(max_length=120, blank=True)
    avatar_url = models.URLField(max_length=500, blank=True, default='')

    # PERSONAL boxes belong to a member (and their portal login).
    member = models.ForeignKey(
        'career_app.OnboardingSubmission', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='mailboxes',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        db_constraint=False, related_name='+',
    )

    # SHARED boxes may carry their own password for direct sign-in. Stored hashed.
    access_password = models.CharField(max_length=255, blank=True, default='')

    is_active = models.BooleanField(default=True)
    is_archived = models.BooleanField(default=False)
    daily_send_limit = models.PositiveIntegerField(default=200)

    created_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        db_constraint=False, related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'mailboxes'
        ordering = ['address']
        indexes = [
            models.Index(fields=['kind', 'is_active']),
            models.Index(fields=['member']),
        ]

    def __str__(self):
        return self.address

    # ── password helpers (SHARED boxes) ──
    def set_access_password(self, raw):
        """Set (or clear, when raw is falsy) the shared-mailbox password."""
        self.access_password = make_password(raw) if raw else ''

    def check_access_password(self, raw):
        if not (self.access_password and raw):
            return False
        return check_password(raw, self.access_password)

    @property
    def has_access_password(self):
        return bool(self.access_password)

    @property
    def local_part(self):
        return (self.address or '').split('@', 1)[0]

    @property
    def usable(self):
        return bool(self.is_active and not self.is_archived)

    @property
    def from_header(self):
        """'Diya Moze <diya@mail.tiesverse.com>' — falls back to the bare address."""
        name = (self.display_name or '').strip()
        return f'{name} <{self.address}>' if name else self.address


class MailboxGrant(models.Model):
    """Gives a portal user access to a SHARED mailbox."""

    mailbox = models.ForeignKey(Mailbox, on_delete=models.CASCADE, related_name='grants')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        db_constraint=False, related_name='+',
    )
    granted_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        db_constraint=False, related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'mailbox_grants'
        ordering = ['-created_at']
        unique_together = ('mailbox', 'user')
        indexes = [models.Index(fields=['user'])]

    def __str__(self):
        return f'{self.user_id} → {self.mailbox_id}'


class MailMessage(models.Model):
    """A single sent or received message belonging to one mailbox."""

    mailbox = models.ForeignKey(Mailbox, on_delete=models.CASCADE, related_name='messages')
    direction = models.CharField(max_length=3, choices=DIRECTION_CHOICES)

    peer = models.CharField(max_length=255, blank=True)      # the other party
    to = models.JSONField(default=list, blank=True)
    cc = models.JSONField(default=list, blank=True)
    # Delivered to, never written into a header — that is what blind means.
    bcc = models.JSONField(default=list, blank=True)
    subject = models.CharField(max_length=500, blank=True)
    body_text = models.TextField(blank=True)
    body_html = models.TextField(blank=True)
    snippet = models.CharField(max_length=300, blank=True)

    # RFC 5322 Message-ID we set (OUT) or read (IN) — the basis of threading.
    message_id = models.CharField(max_length=500, blank=True, db_index=True)
    in_reply_to = models.CharField(max_length=500, blank=True)
    thread_key = models.CharField(max_length=500, blank=True, db_index=True)

    ses_message_id = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='queued')
    error = models.TextField(blank=True)

    # Who pressed send — matters for SHARED boxes (attribution).
    sent_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        db_constraint=False, related_name='+',
    )

    read_at = models.DateTimeField(null=True, blank=True)
    is_deleted = models.BooleanField(default=False)          # soft delete → Trash
    deleted_at = models.DateTimeField(null=True, blank=True)

    starred = models.BooleanField(default=False)
    # Set → hidden from Inbox until this moment passes, then it returns.
    snoozed_until = models.DateTimeField(null=True, blank=True)
    # When an outbound message should actually go. Set a few seconds ahead for a
    # normal send (that gap is the undo window) or further out for a scheduled one.
    send_at = models.DateTimeField(null=True, blank=True, db_index=True)
    has_attachments = models.BooleanField(default=False)

    spam_verdict = models.CharField(max_length=20, blank=True)
    virus_verdict = models.CharField(max_length=20, blank=True)
    s3_key = models.CharField(max_length=500, blank=True, db_index=True)

    published_at = models.DateTimeField(null=True, blank=True)   # header Date
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'mail_messages'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['mailbox', 'direction', '-created_at']),
            models.Index(fields=['thread_key']),
            models.Index(fields=['mailbox', 'is_deleted']),
            models.Index(fields=['mailbox', 'starred']),
            models.Index(fields=['status', 'send_at']),
        ]

    def __str__(self):
        return f'[{self.direction}] {self.subject[:50]}'

    @property
    def is_read(self):
        return self.read_at is not None


class MailAuditLog(models.Model):
    """Audit trail. Written whenever a superadmin touches a mailbox that is not
    their own — reading someone's mail must never be silent."""

    ACTION_CHOICES = [
        ('created_mailbox', 'Created mailbox'),
        ('updated_mailbox', 'Updated mailbox'),
        ('archived_mailbox', 'Archived mailbox'),
        ('restored_mailbox', 'Restored mailbox'),
        ('set_password', 'Set/rotated shared password'),
        ('granted_access', 'Granted access'),
        ('revoked_access', 'Revoked access'),
        ('viewed_mailbox', 'Viewed mailbox'),
        ('read_message', 'Read message'),
        ('deleted_message', 'Deleted message'),
        ('restored_message', 'Restored message'),
        ('updated_avatar', 'Updated mailbox picture'),
        ('shared_login', 'Shared-mailbox login'),
        ('sso_login', 'Signed in from the admin panel'),
        ('sent_scheduled', 'Sent a scheduled message'),
        ('bulk_started', 'Started a bulk send'),
    ]

    actor_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        db_constraint=False, related_name='+',
    )
    actor_name = models.CharField(max_length=255, blank=True)
    action = models.CharField(max_length=30, choices=ACTION_CHOICES)
    mailbox = models.ForeignKey(Mailbox, on_delete=models.CASCADE, null=True, blank=True,
                               related_name='audit_logs')
    message = models.ForeignKey(MailMessage, on_delete=models.SET_NULL, null=True, blank=True,
                                related_name='+')
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'mail_audit_logs'
        ordering = ['-created_at']
        indexes = [models.Index(fields=['mailbox', '-created_at'])]

    def __str__(self):
        return f'{self.actor_name} {self.action}'


class MailDraft(models.Model):
    """An unsent message the composer keeps saving as it is typed.

    Separate from MailMessage because a draft is not yet mail: it has no
    Message-ID, no direction, and may have no recipients at all. One row per
    composing session — the client holds the id and PATCHes it, so a long reply
    does not leave a trail of near-identical rows behind.
    """
    mailbox = models.ForeignKey(Mailbox, on_delete=models.CASCADE, related_name='drafts')
    to = models.JSONField(default=list, blank=True)
    cc = models.JSONField(default=list, blank=True)
    bcc = models.JSONField(default=list, blank=True)
    subject = models.CharField(max_length=500, blank=True)
    body_text = models.TextField(blank=True)

    # Set when the draft is a reply, so sending keeps it in the same thread.
    in_reply_to = models.CharField(max_length=500, blank=True)
    thread_key = models.CharField(max_length=500, blank=True)

    created_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        db_constraint=False, related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'mail_drafts'
        ordering = ['-updated_at']
        indexes = [models.Index(fields=['mailbox', '-updated_at'])]

    def __str__(self):
        return f'draft: {self.subject[:50] or "(no subject)"}'


class MailAttachment(models.Model):
    """A file on a message or a draft, stored in R2 rather than the database.

    It belongs to a draft while being composed and is re-parented to the message
    on send, which is why both FKs are nullable. Bytes never live in this table —
    only where to find them.
    """
    message = models.ForeignKey(MailMessage, on_delete=models.CASCADE, null=True, blank=True,
                                related_name='attachments')
    draft = models.ForeignKey(MailDraft, on_delete=models.CASCADE, null=True, blank=True,
                              related_name='attachments')
    # A bulk job's files are uploaded once and referenced by every message it
    # sends, rather than copied per recipient.
    bulk_job = models.ForeignKey('MailBulkJob', on_delete=models.CASCADE, null=True, blank=True,
                                 related_name='attachments')

    filename = models.CharField(max_length=255)
    size = models.PositiveIntegerField(default=0)
    content_type = models.CharField(max_length=120, blank=True)
    storage_key = models.CharField(max_length=500)

    uploaded_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        db_constraint=False, related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'mail_attachments'
        ordering = ['id']
        indexes = [
            models.Index(fields=['message']),
            models.Index(fields=['draft']),
            models.Index(fields=['bulk_job']),
        ]

    def __str__(self):
        return self.filename


class MailNote(models.Model):
    """An internal comment on a thread — visible to the team, never emailed.

    Kept in its own table rather than as a flag on MailMessage so that no code
    path which sends mail can ever reach one by accident.
    """
    mailbox = models.ForeignKey(Mailbox, on_delete=models.CASCADE, related_name='notes')
    thread_key = models.CharField(max_length=500, db_index=True)

    author_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        db_constraint=False, related_name='+',
    )
    author_name = models.CharField(max_length=255, blank=True)
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'mail_notes'
        ordering = ['created_at']
        indexes = [models.Index(fields=['mailbox', 'thread_key', 'created_at'])]

    def __str__(self):
        return f'{self.author_name}: {self.body[:40]}'


class MailSsoTicket(models.Model):
    """A one-time code that carries a signed-in admin-panel user into TIES Mail.

    A database row rather than a cache entry on purpose: the cache is per-process
    unless Redis is configured, so under several gunicorn workers a cache-based
    single-use check would let a replayed code through on a different worker.
    """
    user_id = models.IntegerField(db_index=True)
    jti = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'mail_sso_tickets'
        ordering = ['-created_at']

    def __str__(self):
        return f'sso {self.jti[:8]} for user {self.user_id}'


class MailBulkJob(models.Model):
    """A one-to-many send from a mailbox: the same message to many people, each
    addressed personally.

    Deliberately not a MailMessage with many recipients — every person gets
    their own message so a reply comes back as a normal conversation, and so one
    bad address cannot fail the whole run.

    Progress lives on the row rather than in memory, so a restart resumes where
    it stopped instead of starting again and sending twice.
    """
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('queued', 'Queued'),
        ('running', 'Running'),
        ('paused', 'Paused'),        # daily cap reached; resumes on its own
        ('done', 'Finished'),
        ('canceled', 'Canceled'),
        ('failed', 'Failed'),
    ]

    mailbox = models.ForeignKey(Mailbox, on_delete=models.CASCADE, related_name='bulk_jobs')
    name = models.CharField(max_length=200, blank=True)
    subject = models.CharField(max_length=500)
    body_text = models.TextField(blank=True)

    # [{'email': 'a@x.com', 'name': 'Aarav', ...}] — extra keys become {{tokens}}.
    recipients = models.JSONField(default=list, blank=True)

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='draft')
    # How far the worker has got. The resume point, and why a restart is safe.
    cursor = models.PositiveIntegerField(default=0)
    sent_count = models.PositiveIntegerField(default=0)
    failed_count = models.PositiveIntegerField(default=0)
    last_error = models.TextField(blank=True)

    created_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        db_constraint=False, related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'mail_bulk_jobs'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['mailbox', '-created_at']),
        ]

    def __str__(self):
        return f'{self.name or self.subject[:40]} ({self.status})'

    @property
    def total(self):
        return len(self.recipients or [])
