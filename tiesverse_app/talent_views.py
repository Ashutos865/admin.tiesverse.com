"""Talent pool: institutions shown on tiesverse.com/about, managed in the admin.

Logos live in R2. Transparency is measured on upload rather than trusted,
because the grid sits on a cream background and a logo with its own white box
shows up as a rectangle.
"""
import re

from django.core.cache import cache
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import TalentInstitution
from .views import _can_manage_site

PUBLIC_CACHE_KEY = 'public_talent_pool'
R2_PREFIX = 'talent-logos'
MAX_LOGO_BYTES = 5 * 1024 * 1024
MAX_LOGO_PX = 600          # a grid cell is ~150px; more is wasted bandwidth
IMAGE_EXTS = ('png', 'webp', 'svg', 'jpg', 'jpeg', 'gif')


def _dto(t):
    return {
        'id': t.id,
        'name': t.name,
        'logo_url': t.logo_url,
        'has_transparency': t.has_transparency,
        'position': t.position,
        'is_published': t.is_published,
    }


# ── admin ────────────────────────────────────────────────────────────────
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser, MultiPartParser, FormParser])
def talent_admin(request):
    if not _can_manage_site(request.user):
        return Response({'error': 'Only staff can manage the talent pool.'}, status=403)

    if request.method == 'GET':
        return Response({'institutions': [_dto(t) for t in TalentInstitution.objects.all()]})

    name = str(request.data.get('name') or '').strip()[:180]
    if not name:
        return Response({'error': 'A name is required.'}, status=400)

    last = TalentInstitution.objects.order_by('-position').values_list('position', flat=True).first()
    t = TalentInstitution.objects.create(name=name, position=(last or 0) + 1)
    cache.delete(PUBLIC_CACHE_KEY)
    return Response(_dto(t), status=201)


@api_view(['PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser, MultiPartParser, FormParser])
def talent_detail(request, pk):
    if not _can_manage_site(request.user):
        return Response({'error': 'Only staff can manage the talent pool.'}, status=403)
    t = TalentInstitution.objects.filter(pk=pk).first()
    if t is None:
        return Response({'error': 'No such institution.'}, status=404)

    if request.method == 'DELETE':
        t.delete()
        cache.delete(PUBLIC_CACHE_KEY)
        return Response({'ok': True, 'deleted': True})

    if 'name' in request.data:
        name = str(request.data.get('name') or '').strip()[:180]
        if not name:
            return Response({'error': 'A name is required.'}, status=400)
        t.name = name
    if 'is_published' in request.data:
        t.is_published = str(request.data.get('is_published')).lower() in ('true', '1', 'yes', 'on')
    if 'position' in request.data:
        try:
            t.position = max(0, int(request.data.get('position') or 0))
        except (TypeError, ValueError):
            pass
    t.save()
    cache.delete(PUBLIC_CACHE_KEY)
    return Response(_dto(t))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def talent_logo_upload(request, pk):
    if not _can_manage_site(request.user):
        return Response({'error': 'Only staff can manage the talent pool.'}, status=403)
    t = TalentInstitution.objects.filter(pk=pk).first()
    if t is None:
        return Response({'error': 'No such institution.'}, status=404)

    f = request.FILES.get('file')
    if not f:
        return Response({'error': 'No file provided.'}, status=400)
    if f.size > MAX_LOGO_BYTES:
        return Response({'error': f'Logo too large (max {MAX_LOGO_BYTES // (1024 * 1024)} MB).'},
                        status=413)

    name = (getattr(f, 'name', '') or '').lower()
    ext = name.rsplit('.', 1)[-1] if '.' in name else ''
    ctype = (getattr(f, 'content_type', '') or '').lower().split(';')[0]
    if ext not in IMAGE_EXTS and not ctype.startswith('image/'):
        return Response({'error': 'Upload a PNG, WebP or SVG logo.'}, status=415)

    raw = f.read()
    payload, out_type, out_ext, transparent = _process(raw, ext, ctype)

    from career_app.providers import R2Storage
    import secrets
    key = f'{R2_PREFIX}/{t.id}-{secrets.token_hex(6)}.{out_ext}'
    try:
        R2Storage().put_object(key, payload, out_type)
    except Exception as e:  # noqa: BLE001
        return Response({'error': f'Upload failed: {e}'}, status=502)

    t.logo_url = request.build_absolute_uri(f'/api/public/talent-logo/{key.split("/")[-1]}')
    t.has_transparency = transparent
    t.save(update_fields=['logo_url', 'has_transparency', 'updated_at'])
    cache.delete(PUBLIC_CACHE_KEY)
    return Response({'logo_url': t.logo_url, 'has_transparency': transparent})


def _process(raw, ext, ctype):
    """Normalise a logo and report whether it has a transparent background.

    Returns (bytes, content_type, extension, has_transparency). SVG passes
    through untouched — it is already scalable and transparent by nature.
    """
    if ext == 'svg' or 'svg' in ctype:
        return raw, 'image/svg+xml', 'svg', True

    try:
        from io import BytesIO
        from PIL import Image
        img = Image.open(BytesIO(raw))
        img.load()

        transparent = False
        if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
            alpha = img.convert('RGBA').getchannel('A')
            # A single opaque value everywhere means the alpha channel exists but
            # carries nothing — common in a JPEG converted to PNG.
            transparent = alpha.getextrema()[0] < 250

        img = img.convert('RGBA')
        if max(img.size) > MAX_LOGO_PX:
            img.thumbnail((MAX_LOGO_PX, MAX_LOGO_PX), Image.LANCZOS)

        buf = BytesIO()
        img.save(buf, format='WEBP', quality=90, method=4)
        return buf.getvalue(), 'image/webp', 'webp', transparent
    except Exception:  # noqa: BLE001 — store the original rather than lose it
        return raw, ctype or 'image/png', (ext or 'png'), False


# ── public ───────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([AllowAny])
def public_talent_pool(request):
    payload = cache.get(PUBLIC_CACHE_KEY)
    if payload is None:
        rows = TalentInstitution.objects.filter(is_published=True)
        payload = {'institutions': [{'name': t.name, 'logo_url': t.logo_url} for t in rows]}
        cache.set(PUBLIC_CACHE_KEY, payload, 300)
    return Response(payload)


@api_view(['GET'])
@permission_classes([AllowAny])
def public_talent_logo(request, name):
    """Serve a logo. Public: these appear on a public page."""
    from django.http import HttpResponse, HttpResponseNotFound
    from career_app.providers import R2Storage
    if not re.match(r'^[A-Za-z0-9._-]+$', name or ''):
        return HttpResponseNotFound('Not found')
    try:
        data = R2Storage().get_object(f'{R2_PREFIX}/{name}')
    except Exception:  # noqa: BLE001
        return HttpResponseNotFound('Not found')
    ext = name.rsplit('.', 1)[-1].lower()
    ctype = {'webp': 'image/webp', 'png': 'image/png', 'svg': 'image/svg+xml',
             'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'gif': 'image/gif'}.get(ext, 'image/webp')
    resp = HttpResponse(data, content_type=ctype)
    resp['Cache-Control'] = 'public, max-age=86400'
    return resp
