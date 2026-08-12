"""Research page content: tiesverse.com/research, managed in the admin.

One JSON document (`ResearchPage.data`) holds everything the page renders:
hero copy, the photo section, "what we research" areas and "what we
published" entries. The website merges it over its bundled defaults, so an
empty or unreachable document never blanks the page.
"""
from django.core.cache import cache
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import ResearchPage
from .views import _can_manage_site

PUBLIC_CACHE_KEY = 'public_research_page'

# Keys the admin form is allowed to store. Anything else in a PUT is dropped,
# so a stale client can't grow the document into an unbounded dumping ground.
ALLOWED_KEYS = {
    'hero_ghost', 'hero_note', 'photo_url', 'photo_caption',
    'statement', 'statement_soft',
    'about_heading', 'about_body_1', 'about_body_2', 'about_body_3',
    'areas', 'publications',
}
MAX_ITEMS = 40          # areas + publications each; the page is curated, not a feed
MAX_TEXT = 2000


def _clean(data):
    out = {}
    for key in ALLOWED_KEYS:
        if key not in data:
            continue
        val = data[key]
        if key in ('areas', 'publications'):
            if isinstance(val, list):
                out[key] = [
                    {str(k)[:40]: str(v)[:MAX_TEXT] for k, v in item.items()}
                    for item in val[:MAX_ITEMS] if isinstance(item, dict)
                ]
        else:
            out[key] = str(val or '')[:MAX_TEXT]
    return out


def _doc():
    page = ResearchPage.objects.using('turso_db').order_by('id').first()
    return page


# ── admin ────────────────────────────────────────────────────────────────
@api_view(['GET', 'PUT'])
@permission_classes([IsAuthenticated])
def research_page_admin(request):
    if not _can_manage_site(request.user):
        return Response({'error': 'Only staff can manage the research page.'}, status=403)

    page = _doc()
    if request.method == 'GET':
        return Response({'data': (page.data if page else {}) or {}})

    if not isinstance(request.data, dict):
        return Response({'error': 'Expected a JSON object.'}, status=400)
    cleaned = _clean(request.data.get('data') if 'data' in request.data else request.data)
    if page is None:
        page = ResearchPage.objects.using('turso_db').create(data=cleaned)
    else:
        page.data = cleaned
        page.save(using='turso_db')
    cache.delete(PUBLIC_CACHE_KEY)
    return Response({'data': page.data})


# ── public ───────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([AllowAny])
def public_research_page(request):
    """Content for tiesverse.com/research. Cached ~2 min."""
    cached = cache.get(PUBLIC_CACHE_KEY)
    if cached is None:
        try:
            page = _doc()
            cached = (page.data if page else {}) or {}
            # Only ship active items; drafts stay in the admin.
            for key in ('areas', 'publications'):
                items = cached.get(key) or []
                cached[key] = [i for i in items if str(i.get('is_active', '1')) not in ('0', 'false', 'False')]
        except Exception:  # noqa: BLE001 — the site falls back to bundled copy
            cached = {}
        cache.set(PUBLIC_CACHE_KEY, cached, 120)
    return JsonResponse({'page': cached})
