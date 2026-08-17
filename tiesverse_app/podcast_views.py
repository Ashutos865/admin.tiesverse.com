"""Podcast episodes: managed in the admin, served to tiesverse.com.

An episode is published by giving it the link where it already lives — a
Spotify, YouTube or Apple URL — and the site sends listeners there. That is how
a podcast is actually distributed, and it avoids carrying a 45-minute recording
through this server: uploads were capped at 25 MB by nginx while the code
allowed 200 MB, so any real episode failed with nothing but "Upload failed".

Direct audio upload is still accepted for anything genuinely hosted here, and
an episode may have both: the link is what the site offers first.
"""
import re

from django.core.cache import cache
from django.utils.text import slugify
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response

from .models import Podcast
from .views import _can_manage_site

PUBLIC_CACHE_KEY = 'public_podcasts'
R2_PREFIX = 'podcasts'
MAX_AUDIO_BYTES = 200 * 1024 * 1024      # a long episode at a decent bitrate
AUDIO_TYPES = {
    'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav',
    'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'weba',
}


def _dto(p):
    return {
        'id': p.id,
        'title': p.title,
        'slug': p.slug,
        'episode_label': p.episode_label,
        'tag': p.tag,
        'description': p.description,
        'audio_url': p.audio_url,
        'listen_url': p.listen_url,
        'platform': p.platform,
        'embed_url': p.embed_url,
        'cover_url': p.cover_url,
        'duration_seconds': p.duration_seconds,
        # Tolerant on purpose: whatever shape the date is in, describing an
        # episode must never be the thing that fails.
        'published_at': (p.published_at.isoformat()
                         if hasattr(p.published_at, 'isoformat')
                         else (str(p.published_at) if p.published_at else None)),
        'is_featured': p.is_featured,
        'is_published': p.is_published,
        'position': p.position,
    }


def _unique_slug(title, pk=None):
    base = slugify(title)[:120] or 'episode'
    slug, n = base, 2
    qs = Podcast.objects.exclude(pk=pk) if pk else Podcast.objects.all()
    while qs.filter(slug=slug).exists():
        slug = f'{base}-{n}'
        n += 1
    return slug


def _apply(p, data):
    """Copy the editable fields off a request onto an episode."""
    for field in ('title', 'episode_label', 'tag', 'description', 'cover_url',
                  'listen_url'):
        if field in data:
            setattr(p, field, str(data.get(field) or '').strip()[:600])
    # `platform` is not stored: Podcast derives it from listen_url as a
    # read-only property, so it is always in step with the link and must not be
    # assigned here — doing so raises AttributeError and fails the whole save.
    for field in ('is_featured', 'is_published'):
        if field in data:
            setattr(p, field, str(data.get(field)).lower() in ('true', '1', 'yes', 'on'))
    for field in ('position', 'duration_seconds'):
        if field in data:
            try:
                setattr(p, field, max(0, int(data.get(field) or 0)))
            except (TypeError, ValueError):
                pass
    if 'published_at' in data:
        # Parse it rather than assigning the string. Django only converts on
        # save-and-reload, so the unsaved model held a str and anything reading
        # it back — the response serialiser, immediately below — hit
        # 'str' object has no attribute 'isoformat' and returned a 500 even
        # though the save itself had succeeded.
        raw = str(data.get('published_at') or '').strip()[:10]
        parsed = None
        if re.match(r'^\d{4}-\d{2}-\d{2}$', raw):
            from datetime import date
            try:
                parsed = date(*(int(x) for x in raw.split('-')))
            except ValueError:
                parsed = None      # e.g. 2025-02-31
        p.published_at = parsed
    return p


# ── admin ────────────────────────────────────────────────────────────────
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser, MultiPartParser, FormParser])
def podcasts_admin(request):
    if not _can_manage_site(request.user):
        return Response({'error': 'Only staff can manage podcasts.'}, status=403)

    if request.method == 'GET':
        return Response({'episodes': [_dto(p) for p in Podcast.objects.all()]})

    title = str(request.data.get('title') or '').strip()
    if not title:
        return Response({'error': 'A title is required.'}, status=400)

    p = _apply(Podcast(title=title[:250]), request.data)
    p.slug = _unique_slug(title)
    if not p.position:
        last = Podcast.objects.order_by('-position').values_list('position', flat=True).first()
        p.position = (last or 0) + 1
    p.save()
    cache.delete(PUBLIC_CACHE_KEY)
    return Response(_dto(p), status=201)


@api_view(['PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser, MultiPartParser, FormParser])
def podcast_detail(request, pk):
    if not _can_manage_site(request.user):
        return Response({'error': 'Only staff can manage podcasts.'}, status=403)
    p = Podcast.objects.filter(pk=pk).first()
    if p is None:
        return Response({'error': 'No such episode.'}, status=404)

    if request.method == 'DELETE':
        p.delete()
        cache.delete(PUBLIC_CACHE_KEY)
        return Response({'ok': True, 'deleted': True})

    new_title = str(request.data.get('title') or '').strip()
    _apply(p, request.data)
    # The slug is part of a public URL, so it follows a retitle only while the
    # episode is still a draft — changing it after publication breaks links.
    if new_title and not p.is_published:
        p.slug = _unique_slug(new_title, pk=p.pk)
    p.save()
    cache.delete(PUBLIC_CACHE_KEY)
    return Response(_dto(p))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def podcast_audio_upload(request, pk):
    """Upload an episode's audio to R2 and record its real duration."""
    if not _can_manage_site(request.user):
        return Response({'error': 'Only staff can manage podcasts.'}, status=403)
    p = Podcast.objects.filter(pk=pk).first()
    if p is None:
        return Response({'error': 'No such episode.'}, status=404)

    f = request.FILES.get('file')
    if not f:
        return Response({'error': 'No file provided.'}, status=400)
    if f.size > MAX_AUDIO_BYTES:
        return Response(
            {'error': f'Audio too large (max {MAX_AUDIO_BYTES // (1024 * 1024)} MB).'}, status=413)

    ctype = (getattr(f, 'content_type', '') or '').lower().split(';')[0]
    name = (getattr(f, 'name', '') or '').lower()
    ext = AUDIO_TYPES.get(ctype) or (name.rsplit('.', 1)[-1] if '.' in name else '')
    if ext not in ('mp3', 'm4a', 'aac', 'wav', 'ogg', 'weba'):
        return Response({'error': 'Upload an MP3, M4A, WAV or OGG file.'}, status=415)

    data = f.read()
    # The browser decodes the file to play it anyway, so it knows the exact
    # length for free. Reading it server-side would mean shipping an audio
    # library to production for a number the client already holds.
    try:
        duration = max(0, int(float(request.data.get('duration_seconds') or 0)))
    except (TypeError, ValueError):
        duration = 0

    from career_app.providers import R2Storage
    import secrets
    key = f'{R2_PREFIX}/{p.id}-{secrets.token_hex(6)}.{ext}'
    try:
        R2Storage().put_object(key, data, ctype or 'audio/mpeg')
    except Exception as e:  # noqa: BLE001
        return Response({'error': f'Upload failed: {e}'}, status=502)

    p.audio_url = request.build_absolute_uri(f'/api/public/podcast-audio/{key.split("/")[-1]}')
    if duration:
        p.duration_seconds = duration
    p.save(update_fields=['audio_url', 'duration_seconds', 'updated_at'])
    cache.delete(PUBLIC_CACHE_KEY)
    return Response({'audio_url': p.audio_url, 'duration_seconds': p.duration_seconds})


# ── public ───────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([AllowAny])
def public_podcasts(request):
    """Published episodes for tiesverse.com. Cached; writes bust it."""
    payload = cache.get(PUBLIC_CACHE_KEY)
    if payload is None:
        # An episode needs somewhere to send the listener: either audio we
        # host, or the link where it is published. Requiring audio_url alone
        # would hide every episode released on Spotify or YouTube.
        from django.db.models import Q
        rows = (Podcast.objects.filter(is_published=True)
                .exclude(Q(audio_url='') & Q(listen_url='')))
        payload = {'episodes': [_dto(p) for p in rows]}
        cache.set(PUBLIC_CACHE_KEY, payload, 300)
    return Response(payload)


@api_view(['GET'])
@permission_classes([AllowAny])
def public_podcast_audio(request, name):
    """Stream an episode. Public by design — a podcast is meant to be heard."""
    from django.http import HttpResponse, HttpResponseNotFound
    from career_app.providers import R2Storage
    if not re.match(r'^[A-Za-z0-9._-]+$', name or ''):
        return HttpResponseNotFound('Not found')
    try:
        data = R2Storage().get_object(f'{R2_PREFIX}/{name}')
    except Exception:  # noqa: BLE001
        return HttpResponseNotFound('Not found')
    ext = name.rsplit('.', 1)[-1].lower()
    ctype = {'mp3': 'audio/mpeg', 'm4a': 'audio/mp4', 'aac': 'audio/aac',
             'wav': 'audio/wav', 'ogg': 'audio/ogg', 'weba': 'audio/webm'}.get(ext, 'audio/mpeg')
    resp = HttpResponse(data, content_type=ctype)
    resp['Cache-Control'] = 'public, max-age=86400'
    resp['Accept-Ranges'] = 'bytes'
    resp['Content-Length'] = str(len(data))
    return resp
