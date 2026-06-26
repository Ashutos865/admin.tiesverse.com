from django.db import models


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
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'departments'

    def __str__(self):
        return self.title

    def to_supabase_dict(self):
        return {
            'slug':      self.slug,
            'title':     self.title,
            'dek':       self.dek,
            'cat':       self.cat,
            'topic':     self.topic,
            'kind':      self.kind,
            'date':      self.date,
            'read_time': self.read_time,
            'cover_url': self.cover_url,
            'featured':  self.featured,
            'published': self.published,
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


# ── EventRegistration (workshops / online sessions) ───────────────────────────
class EventRegistration(models.Model):
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    date = models.CharField(max_length=50, blank=True)
    time_tz = models.CharField(max_length=50, blank=True)
    host = models.CharField(max_length=255, blank=True)
    cover_url = models.URLField(blank=True)
    register_url = models.URLField(blank=True)
    status = models.CharField(
        max_length=10,
        choices=[('upcoming', 'Upcoming'), ('past', 'Past')],
        default='upcoming',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'event_registrations'

    def __str__(self):
        return self.title

    def to_supabase_dict(self):
        return {
            'title':        self.title,
            'description':  self.description,
            'date':         self.date,
            'time_tz':      self.time_tz,
            'host':         self.host,
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
