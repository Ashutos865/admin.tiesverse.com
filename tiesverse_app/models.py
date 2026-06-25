from django.db import models

class Department(models.Model):
    name = models.CharField(max_length=100, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'departments'

    def __str__(self):
        return self.name

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

    def __str__(self):
        return self.name

class TeamMemberSocial(models.Model):
    team_member = models.ForeignKey(TeamMember, on_delete=models.CASCADE)
    platform = models.CharField(max_length=50)
    url = models.CharField(max_length=500)

    class Meta:
        db_table = 'team_member_socials'
        constraints = [
            models.UniqueConstraint(fields=['team_member', 'platform'], name='unique_team_member_platform')
        ]

    def __str__(self):
        return f"{self.team_member.name} - {self.platform}"

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
    updated_at = models.DateTimeField(auto_now=True)

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
        constraints = [
            models.UniqueConstraint(fields=['event', 'email'], name='unique_event_email_registration')
        ]

    def __str__(self):
        return f"{self.first_name} {self.last_name} - {self.event.title}"
