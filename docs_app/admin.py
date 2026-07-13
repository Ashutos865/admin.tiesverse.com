from django.contrib import admin
from .models import DocSpace, DocPage


class DocPageInline(admin.TabularInline):
    model = DocPage
    extra = 0
    fields = ('title', 'slug', 'parent', 'order', 'is_published')


class DocSpaceAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'order')
    inlines = [DocPageInline]


admin.site.register(DocSpace, DocSpaceAdmin)
admin.site.register(DocPage)
