from django.db import models

class Event(models.Model):
    title = models.CharField(max_length=255)
    description = models.TextField()
    date = models.DateTimeField()
    location = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.title

class Article(models.Model):
    title = models.CharField(max_length=255)
    content = models.TextField()
    author = models.CharField(max_length=255)
    published_date = models.DateField()

    def __str__(self):
        return self.title

class YouTubeVideo(models.Model):
    title = models.CharField(max_length=255)
    url = models.URLField()
    thumbnail_url = models.URLField(blank=True, null=True)

    def __str__(self):
        return self.title

class Workshop(models.Model):
    title = models.CharField(max_length=255)
    instructor = models.CharField(max_length=255)
    schedule = models.DateTimeField()

    def __str__(self):
        return self.title

class TeamMember(models.Model):
    name = models.CharField(max_length=255)
    role = models.CharField(max_length=255)
    linkedin_url = models.URLField(blank=True, null=True)
    image = models.ImageField(upload_to='team/', blank=True, null=True)

    def __str__(self):
        return self.name

class Guest(models.Model):
    name = models.CharField(max_length=255)
    affiliation = models.CharField(max_length=255)
    is_upcoming = models.BooleanField(default=False)

    def __str__(self):
        return self.name
