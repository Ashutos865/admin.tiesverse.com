from django.db import models
from django.utils.text import slugify as _slugify


# ── Article (stored as 'departments' table in migration) ──────────────────────
class Department(models.Model):
    slug = models.SlugField(max_length=255, unique=True)
    title = models.CharField(max_length=255)
    dek = models.TextField(blank=True)
    cat = models.CharField(max_length=100, blank=True)
    topic = models.CharField(max_length=100, blank=True)
    kind = models.CharField(
        max_length=20,
        choices=[('Article', 'Article'), ('Report', 'Report'), ('Brief', 'Brief'), ('Analysis', 'Analysis')],
        default='Article',
    )
    date = models.CharField(max_length=50, blank=True)
    read_time = models.CharField(max_length=30, blank=True)
    cover_url = models.CharField(max_length=500)
    featured = models.BooleanField(default=False)
    published = models.BooleanField(default=True)

    # ── The actual article content + attribution (what readers read) ──
    body = models.TextField(blank=True, help_text='Article body (HTML)')
    author = models.CharField(max_length=200, blank=True)
    author_role = models.CharField(max_length=200, blank=True)
    tags = models.JSONField(default=list, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'departments'
        ordering = ['-created_at']

    def __str__(self):
        return self.title

    def to_supabase_dict(self):
        return {
            'slug':        self.slug,
            'title':       self.title,
            'dek':         self.dek,
            'cat':         self.cat,
            'topic':       self.topic,
            'kind':        self.kind,
            'date':        self.date,
            'read_time':   self.read_time,
            'cover_url':   self.cover_url,
            'featured':    self.featured,
            'published':   self.published,
            'body':        self.body,
            'author':      self.author,
            'author_role': self.author_role,
            'tags':        self.tags,
        }


# Keep 'Article' as an alias so existing views/serializers don't break
Article = Department


# ── Event ─────────────────────────────────────────────────────────────────────
class Event(models.Model):
    title = models.CharField(max_length=255)
    category = models.CharField(
        max_length=50, blank=True,
        choices=[('Summit', 'Summit'), ('Salon', 'Salon'), ('Meetup', 'Meetup'),
                 ('Workshop', 'Workshop'), ('Roundtable', 'Roundtable'), ('Other', 'Other')],
    )
    city = models.CharField(max_length=100, blank=True)
    venue = models.CharField(max_length=255, blank=True)
    date = models.CharField(max_length=50)
    time = models.CharField(max_length=50, blank=True)
    host = models.CharField(max_length=255, blank=True)
    price = models.IntegerField(default=0)
    orig_price = models.IntegerField(blank=True, null=True)
    capacity = models.IntegerField(blank=True, null=True)
    attended = models.CharField(max_length=100, blank=True)
    note = models.TextField(blank=True)
    flagship = models.BooleanField(default=False)
    past = models.BooleanField(default=False)
    cover_url = models.URLField(blank=True)
    register_url = models.URLField(blank=True)
    certificate_template_id   = models.CharField(max_length=255, blank=True)
    certificate_template_name = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'events'

    def __str__(self):
        return self.title

    def to_supabase_dict(self):
        return {
            'title':        self.title,
            'category':     self.category,
            'city':         self.city,
            'venue':        self.venue,
            'date':         self.date,
            'time':         self.time,
            'host':         self.host,
            'price':        self.price,
            'orig_price':   self.orig_price,
            'capacity':     self.capacity,
            'attended':     self.attended,
            'note':         self.note,
            'flagship':     self.flagship,
            'past':         self.past,
            'cover_url':    self.cover_url,
            'register_url': self.register_url,
        }


# ── EventSpeaker (guests / past speakers) ─────────────────────────────────────
class EventSpeaker(models.Model):
    name = models.CharField(max_length=255)
    role = models.CharField(max_length=255)
    org = models.CharField(max_length=255, blank=True)
    photo_url = models.URLField(blank=True)
    quote = models.TextField(blank=True)
    featured = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'event_speakers'

    def __str__(self):
        return self.name

    def to_supabase_dict(self):
        return {
            'name':      self.name,
            'role':      self.role,
            'org':       self.org,
            'photo_url': self.photo_url,
            'quote':     self.quote,
            'featured':  self.featured,
        }


# Keep 'Guest' as alias
Guest = EventSpeaker


# ── TeamMember ────────────────────────────────────────────────────────────────
class TeamMember(models.Model):
    name = models.CharField(max_length=255)
    role = models.CharField(max_length=255)
    bio = models.TextField(blank=True)
    photo_url = models.URLField(blank=True)
    department = models.CharField(max_length=100, blank=True)
    is_founder = models.BooleanField(default=False)
    display_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'team_members'
        ordering = ['display_order']

    def __str__(self):
        return self.name

    def to_supabase_dict(self):
        return {
            'name':          self.name,
            'role':          self.role,
            'bio':           self.bio,
            'photo_url':     self.photo_url,
            'department':    self.department,
            'is_founder':    self.is_founder,
            'display_order': self.display_order,
        }


# ── EventRegistration (webinar / workshop listings) ───────────────────────────
class EventRegistration(models.Model):
    kind = models.CharField(
        max_length=20,
        choices=[('webinar', 'Webinar'), ('workshop', 'Workshop')],
        default='workshop',
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    date = models.CharField(max_length=50, blank=True)
    time_tz = models.CharField(max_length=50, blank=True)
    host = models.CharField(max_length=255, blank=True)
    host_image_url = models.URLField(max_length=500, blank=True)
    price = models.PositiveIntegerField(default=0)
    cover_url = models.URLField(blank=True)
    register_url = models.URLField(blank=True)
    status = models.CharField(
        max_length=10,
        choices=[('upcoming', 'Upcoming'), ('past', 'Past')],
        default='upcoming',
    )
    # Certificate distribution — assigned from Certificate Portal
    certificate_template_id   = models.CharField(max_length=255, blank=True)
    certificate_template_name = models.CharField(max_length=255, blank=True)

    # Meeting (Google Meet via Calendar) — one link per event; only paid registrants receive it
    meeting_link = models.CharField(max_length=500, blank=True)
    calendar_event_id = models.CharField(max_length=255, blank=True)
    meeting_start = models.DateTimeField(null=True, blank=True)
    meeting_duration_min = models.PositiveIntegerField(default=60)
    # Meeting host controls (applied via the Meet API in Phase C)
    meeting_join_access = models.CharField(
        max_length=12, default='invited',
        choices=[('open', 'Anyone with link'), ('org', 'Same org'), ('invited', 'Invited only')],
    )
    meeting_guests_see_each_other = models.BooleanField(default=False)
    meeting_moderation = models.BooleanField(default=True)         # host-only present/chat
    meeting_auto_record = models.BooleanField(default=False)
    meeting_hosts = models.JSONField(default=list, blank=True)     # host emails (get invite + moderation)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'event_registrations'

    def save(self, *args, **kwargs):
        if self.title:
            kind_path = 'webinar' if self.kind == 'webinar' else 'workshop'
            self.register_url = f'https://tiesverse.com/{kind_path}/{_slugify(self.title)}'
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title

    def to_supabase_dict(self):
        return {
            'kind':         self.kind,
            'title':        self.title,
            'description':  self.description,
            'date':         self.date,
            'time_tz':      self.time_tz,
            'host':         self.host,
            'host_image_url': self.host_image_url,
            'price':        self.price,
            'cover_url':    self.cover_url,
            'register_url': self.register_url,
            'status':       self.status,
        }


# Keep 'Workshop' as alias
Workshop = EventRegistration


# ── TeamMemberSocial (YouTube videos) ─────────────────────────────────────────
class TeamMemberSocial(models.Model):
    title = models.CharField(max_length=255)
    video_id = models.CharField(max_length=20)
    thumbnail_url = models.URLField(blank=True)
    published_at = models.CharField(max_length=50, blank=True)
    category = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'team_member_socials'

    def __str__(self):
        return self.title

    def to_supabase_dict(self):
        return {
            'title':         self.title,
            'video_id':      self.video_id,
            'thumbnail_url': self.thumbnail_url,
            'published_at':  self.published_at,
            'category':      self.category,
        }


# Keep 'YouTubeVideo' as alias
YouTubeVideo = TeamMemberSocial


# ── WebinarListing (webinars on tiesverse.com landing) ────────────────────────
class WebinarListing(models.Model):
    title = models.CharField(max_length=255)
    speaker = models.CharField(max_length=255, blank=True)
    org = models.CharField(max_length=255, blank=True)
    date = models.CharField(max_length=50, blank=True)
    time_tz = models.CharField(max_length=50, blank=True)
    cover_url = models.URLField(blank=True)
    registration_link = models.URLField(blank=True)
    status = models.CharField(max_length=10, default='upcoming')
    kind = models.CharField(max_length=50, default='webinar')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'webinars'

    def __str__(self):
        return self.title

    def to_supabase_dict(self):
        return {
            'title':             self.title,
            'speaker':           self.speaker,
            'org':               self.org,
            'date':              self.date,
            'time_tz':           self.time_tz,
            'cover_url':         self.cover_url,
            'registration_link': self.registration_link,
            'status':            self.status,
            'kind':              self.kind,
        }


class TechProduct(models.Model):
    """A product shown in the website's Technology section (admin-managed)."""
    name = models.CharField(max_length=200)
    tag = models.CharField(max_length=120, blank=True)          # e.g. "Consumer", "Govt & Enterprise"
    description = models.TextField(blank=True)
    image_url = models.CharField(max_length=500, blank=True)    # Cloudinary WebP
    cta_label = models.CharField(max_length=80, blank=True, default='Learn more')
    cta_url = models.CharField(max_length=500, blank=True, default='/contact')
    order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tech_products'
        ordering = ['order', 'id']

    def __str__(self):
        return self.name


class Brand(models.Model):
    """A masthead/brand shown in the website's 'One house, N mastheads' section."""
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)                  # the row blurb
    image_url = models.CharField(max_length=500, blank=True)    # logo (Cloudinary WebP)
    url = models.CharField(max_length=500, blank=True, default='/')  # where the row links
    domain = models.CharField(max_length=120, blank=True)       # e.g. "Geopolitics"
    color = models.CharField(max_length=20, blank=True, default='#FE7A00')  # accent colour
    order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'brands'
        ordering = ['order', 'id']

    def __str__(self):
        return self.name


class SiteImage(models.Model):
    """A per-slot override for a website image (see site_image_slots.SLOTS).
    mode='manual' uses image_url; mode='auto' lets the website pull from a feed."""
    key = models.CharField(max_length=120, unique=True)
    image_url = models.CharField(max_length=500, blank=True)   # Cloudinary WebP override
    mode = models.CharField(max_length=8, default='manual')    # 'manual' | 'auto'
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'site_images'

    def __str__(self):
        return f"{self.key} ({self.mode})"


class DataStore(models.Model):
    """A standalone data store ("database"/table) that any Tiesverse frontend can
    write to / read from via /api/data/v1/ using an origin-locked API key. Columns
    are typed and defined here in the admin; the API validates against them."""
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=120, unique=True, blank=True)
    description = models.TextField(blank=True)
    columns = models.JSONField(default=list, blank=True)   # [{key,label,type,required}]
    is_active = models.BooleanField(default=True)
    created_by_user = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL, null=True, blank=True, db_constraint=False,
        related_name='data_stores',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'data_stores'
        ordering = ['-updated_at']

    def save(self, *args, **kwargs):
        if not self.slug:
            base = _slugify(self.name) or 'store'
            slug, i = base, 2
            while DataStore.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f'{base}-{i}'; i += 1
            self.slug = slug
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class DataApiKey(models.Model):
    """Origin-locked API key for a DataStore. Only the sha256 hash is stored;
    the full key is shown once. Submit keys write, read keys read."""
    SCOPE_SUBMIT = 'submit'
    SCOPE_READ = 'read'
    SCOPE_CHOICES = [(SCOPE_SUBMIT, 'Write only (POST)'), (SCOPE_READ, 'Read only (GET)')]

    store = models.ForeignKey(DataStore, on_delete=models.CASCADE, related_name='api_keys')
    label = models.CharField(max_length=120, blank=True)
    scope = models.CharField(max_length=10, choices=SCOPE_CHOICES, default=SCOPE_SUBMIT)
    key_id = models.CharField(max_length=32, unique=True)
    key_hash = models.CharField(max_length=64)
    allowed_origins = models.JSONField(default=list, blank=True)   # ['https://x.com']; empty = blocked
    expires_at = models.DateTimeField(null=True, blank=True)
    single_use = models.BooleanField(default=False)
    used_at = models.DateTimeField(null=True, blank=True)
    records_count = models.IntegerField(default=0)
    last_used_at = models.DateTimeField(null=True, blank=True)
    created_by_user = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL, null=True, blank=True, db_constraint=False,
        related_name='data_api_keys',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'data_api_keys'
        ordering = ['-created_at']

    @staticmethod
    def _hash(raw):
        import hashlib
        return hashlib.sha256((raw or '').encode()).hexdigest()

    @classmethod
    def issue(cls, store, scope, **kwargs):
        """Create a key; returns (obj, full_key). full_key is shown once only."""
        import secrets
        prefix = 'tvk_wr' if scope == cls.SCOPE_SUBMIT else 'tvk_rd'
        key_id = f'{prefix}_{secrets.token_hex(5)}'
        secret = secrets.token_urlsafe(32)
        full = f'{key_id}.{secret}'
        obj = cls.objects.create(store=store, scope=scope, key_id=key_id, key_hash=cls._hash(full), **kwargs)
        return obj, full

    @property
    def status(self):
        from django.utils import timezone
        if self.revoked_at:
            return 'revoked'
        if self.expires_at and timezone.now() >= self.expires_at:
            return 'expired'
        if self.single_use and self.used_at:
            return 'used'
        return 'active'

    def matches(self, raw):
        return bool(raw) and self.key_hash == self._hash(raw)

    def origin_allowed(self, origin):
        if not origin:
            return False
        origins = self.allowed_origins or []
        if not origins:
            return False
        if '*' in origins:
            return True
        from urllib.parse import urlparse
        try:
            host = urlparse(origin).netloc.lower() or origin.lower()
        except Exception:  # noqa: BLE001
            host = origin.lower()
        for allowed in origins:
            a = str(allowed).strip().lower()
            try:
                a_host = urlparse(a).netloc or a
            except Exception:  # noqa: BLE001
                a_host = a
            if host == a_host.lower():
                return True
        return False


class DataRecord(models.Model):
    """One row written to a DataStore via the API."""
    store = models.ForeignKey(DataStore, on_delete=models.CASCADE, related_name='records')
    data = models.JSONField(default=dict, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'data_records'
        ordering = ['-created_at']

    def __str__(self):
        return f"Record {self.pk} in {self.store_id}"
