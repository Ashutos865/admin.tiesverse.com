import uuid
from django.db import models

class Event(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.TextField()
    date = models.TextField(blank=True, null=True)
    time = models.TextField(blank=True, null=True)
    location = models.TextField(blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    image_url = models.TextField(blank=True, null=True)
    form_link = models.TextField(blank=True, null=True)
    is_featured = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, blank=True, null=True)
    type = models.TextField(blank=True, null=True)
    status = models.TextField(default='REGISTRATION OPEN', blank=True, null=True)

    class Meta:
        db_table = 'events'

    def __str__(self):
        return self.title

class Article(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.TextField()
    excerpt = models.TextField(blank=True, null=True)
    category = models.TextField(blank=True, null=True)
    type = models.TextField(blank=True, null=True)
    display_id = models.TextField(blank=True, null=True)
    image_url = models.TextField(blank=True, null=True)
    redirect_url = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, blank=True, null=True)
    date = models.TextField(blank=True, null=True)

    class Meta:
        db_table = 'articles'

    def __str__(self):
        return self.title

class YouTubeVideo(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.TextField(blank=True, null=True)
    video_id = models.TextField(blank=True, null=True)
    thumbnail_url = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, blank=True, null=True)
    category = models.TextField(blank=True, null=True)
    episode_id = models.TextField(blank=True, null=True)
    video_url = models.TextField(blank=True, null=True)

    class Meta:
        db_table = 'youtube_videos'

    def __str__(self):
        return self.title or "Untitled Video"

class Workshop(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.TextField()
    category = models.TextField(blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    image_url = models.TextField(blank=True, null=True)
    date = models.TextField(blank=True, null=True)
    time = models.TextField(blank=True, null=True)
    location = models.TextField(blank=True, null=True)
    form_link = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, blank=True, null=True)
    register_link = models.TextField(blank=True, null=True)
    event_id = models.UUIDField(blank=True, null=True)

    class Meta:
        db_table = 'workshops'

    def __str__(self):
        return self.title

class TeamMember(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.TextField()
    role = models.TextField(blank=True, null=True)
    image_url = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, blank=True, null=True)

    class Meta:
        db_table = 'team_members'

    def __str__(self):
        return self.name

class Guest(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.TextField()
    role = models.TextField(blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    image_url = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, blank=True, null=True)

    class Meta:
        db_table = 'guests'

    def __str__(self):
        return self.name

class WebinarListing(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.TextField()
    speaker = models.TextField(blank=True, null=True)
    date = models.TextField(blank=True, null=True)
    registration_link = models.TextField(blank=True, null=True)
    status = models.TextField(default='upcoming', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, blank=True, null=True)

    class Meta:
        db_table = 'webinars'

    def __str__(self):
        return self.title
