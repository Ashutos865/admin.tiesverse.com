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

class TeamMember(models.Model):
    name = models.CharField(max_length=150)
    role = models.CharField(max_length=150)
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, blank=True)
    bio = models.TextField(blank=True, null=True)
    photo_url = models.CharField(max_length=500, blank=True, null=True)
    is_active = models.BooleanField(default=True)
    display_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'team_members'
        ordering = ['display_order']

    def __str__(self):
        return self.name

class TeamMemberSocial(models.Model):
    team_member = models.ForeignKey(TeamMember, on_delete=models.CASCADE)
    platform = models.CharField(max_length=50)
    url = models.CharField(max_length=500)

    class Meta:
        db_table = 'team_member_socials'

    def __str__(self):
        return self.platform

class Event(models.Model):
    EVENT_TYPE_CHOICES = [
        ('online', 'online'),
        ('offline', 'offline'),
    ]
    STATUS_CHOICES = [
        ('upcoming', 'upcoming'),
        ('ongoing', 'ongoing'),
        ('completed', 'completed'),
        ('cancelled', 'cancelled'),
    ]
    
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    event_type = models.CharField(max_length=20, choices=EVENT_TYPE_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='upcoming')
    cover_image_url = models.CharField(max_length=500, blank=True, null=True)
    venue_name = models.CharField(max_length=255, blank=True, null=True)
    venue_address = models.TextField(blank=True, null=True)
    meeting_link = models.CharField(max_length=500, blank=True, null=True)
    start_datetime = models.DateTimeField()
    end_datetime = models.DateTimeField(blank=True, null=True)
    registration_deadline = models.DateTimeField(blank=True, null=True)
    capacity = models.IntegerField(blank=True, null=True)
    is_published = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'events'

    def __str__(self):
        return self.title

class EventSpeaker(models.Model):
    event = models.ForeignKey(Event, on_delete=models.CASCADE)
    name = models.CharField(max_length=150)
    designation = models.CharField(max_length=150, blank=True, null=True)
    organization = models.CharField(max_length=150, blank=True, null=True)
    bio = models.TextField(blank=True, null=True)
    photo_url = models.CharField(max_length=500, blank=True, null=True)
    display_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'event_speakers'

    def __str__(self):
        return self.name

class EventRegistration(models.Model):
    STATUS_CHOICES = [
        ('confirmed', 'confirmed'),
        ('waitlisted', 'waitlisted'),
        ('cancelled', 'cancelled'),
        ('attended', 'attended'),
    ]

    event = models.ForeignKey(Event, on_delete=models.CASCADE)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField(max_length=255)
    phone = models.CharField(max_length=30, blank=True, null=True)
    organization = models.CharField(max_length=150, blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='confirmed')
    notes = models.TextField(blank=True, null=True)
    registered_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'event_registrations'

    def __str__(self):
        return f"{self.first_name} {self.last_name} - {self.event.title}"


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
