from django.conf import settings
from django.db import models


# ── DocSpace (a top-level section of the knowledge base) ──────────────────────
class DocSpace(models.Model):
    slug = models.SlugField(max_length=60, unique=True)
    name = models.CharField(max_length=120)
    description = models.CharField(max_length=240, blank=True)
    icon = models.CharField(max_length=40, blank=True)   # lucide icon name (optional)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'docs_spaces'
        ordering = ['order', 'name']

    def __str__(self):
        return self.name


# ── DocPage (a page; parent lets pages nest into a tree) ──────────────────────
class DocPage(models.Model):
    space = models.ForeignKey(DocSpace, on_delete=models.CASCADE, related_name='pages')
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='children')
    slug = models.SlugField(max_length=80)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)                  # markdown
    order = models.PositiveIntegerField(default=0)
    is_published = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='docs_edited')

    class Meta:
        db_table = 'docs_pages'
        ordering = ['order', 'title']
        unique_together = ('space', 'slug')

    def __str__(self):
        return self.title
