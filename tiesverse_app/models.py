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
