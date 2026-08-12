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


# ═══ Research reports (full documents, rendered by the report reader) ═══

REPORTS_LIST_KEY = 'public_research_reports'


def _report_summary(r):
    return {
        'slug': r.slug, 'title': r.title, 'kind': r.kind, 'dek': r.dek,
        'date': r.date_label, 'cover_url': r.cover_url,
    }


def _bust_reports(slug=None):
    cache.delete(REPORTS_LIST_KEY)
    if slug:
        cache.delete(f'public_research_report:{slug}')


@api_view(['GET'])
@permission_classes([AllowAny])
def public_research_reports(request):
    """Active reports, newest first. Cached ~2 min."""
    cached = cache.get(REPORTS_LIST_KEY)
    if cached is None:
        try:
            from .models import ResearchReport
            cached = [
                _report_summary(r)
                for r in ResearchReport.objects.using('turso_db').filter(is_active=True)
            ]
        except Exception:  # noqa: BLE001
            cached = []
        cache.set(REPORTS_LIST_KEY, cached, 120)
    return JsonResponse({'reports': cached})


@api_view(['GET'])
@permission_classes([AllowAny])
def public_research_report_detail(request, slug):
    key = f'public_research_report:{slug}'
    cached = cache.get(key)
    if cached is None:
        from .models import ResearchReport
        r = ResearchReport.objects.using('turso_db').filter(slug=slug, is_active=True).first()
        if r is None:
            return JsonResponse({'error': 'Not found.'}, status=404)
        from .gdoc_import import DOC_ID_RE
        m = DOC_ID_RE.search(r.source_url or '')
        pdf = f'https://docs.google.com/document/d/{m.group(1)}/export?format=pdf' if m else ''
        cached = dict(_report_summary(r), eyebrow=r.eyebrow, blocks=r.blocks or [], pdf_url=pdf)
        cache.set(key, cached, 120)
    return JsonResponse({'report': cached})


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def research_reports_admin(request):
    """GET: all reports. POST: import one from a shared Google Doc link."""
    if not _can_manage_site(request.user):
        return Response({'error': 'Only staff can manage research reports.'}, status=403)
    from .models import ResearchReport

    if request.method == 'GET':
        return Response({'reports': [
            dict(_report_summary(r), id=r.id, is_active=r.is_active, source_url=r.source_url,
                 blocks_count=len(r.blocks or []))
            for r in ResearchReport.objects.using('turso_db').all()
        ]})

    url = str(request.data.get('url') or '').strip()
    from .gdoc_import import import_doc
    from django.utils.text import slugify
    try:
        eyebrow, title, blocks = import_doc(url)
    except ValueError as e:
        return Response({'error': str(e)}, status=400)
    except Exception:  # noqa: BLE001
        return Response({'error': 'Import failed while reading the document.'}, status=502)

    title = str(request.data.get('title') or '').strip() or title
    if not title:
        return Response({'error': 'Could not find a title in the document; provide one.'}, status=400)
    base = slugify(title)[:200] or 'report'
    slug, n = base, 2
    while ResearchReport.objects.using('turso_db').filter(slug=slug).exists():
        slug, n = f'{base}-{n}', n + 1
    r = ResearchReport.objects.using('turso_db').create(
        slug=slug, title=title, eyebrow=eyebrow,
        dek=str(request.data.get('dek') or '').strip(),
        kind=str(request.data.get('kind') or 'Report').strip() or 'Report',
        date_label=str(request.data.get('date') or '').strip(),
        cover_url=str(request.data.get('cover_url') or '').strip(),
        source_url=url, blocks=blocks,
    )
    _bust_reports(slug)
    return Response(dict(_report_summary(r), id=r.id, is_active=True, blocks_count=len(blocks)), status=201)


@api_view(['PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def research_report_admin_detail(request, pk):
    if not _can_manage_site(request.user):
        return Response({'error': 'Only staff can manage research reports.'}, status=403)
    from .models import ResearchReport
    r = ResearchReport.objects.using('turso_db').filter(pk=pk).first()
    if r is None:
        return Response({'error': 'Not found.'}, status=404)

    if request.method == 'DELETE':
        slug = r.slug
        r.delete(using='turso_db')
        _bust_reports(slug)
        return Response({'success': True})

    for field in ('title', 'eyebrow', 'dek', 'kind', 'date_label', 'cover_url'):
        if field in request.data:
            setattr(r, field, str(request.data.get(field) or '').strip()[:500])
    if 'is_active' in request.data:
        r.is_active = bool(request.data.get('is_active'))
    if 'order' in request.data:
        try:
            r.order = int(request.data.get('order'))
        except (TypeError, ValueError):
            pass
    r.save(using='turso_db')
    _bust_reports(r.slug)
    return Response(dict(_report_summary(r), id=r.id, is_active=r.is_active))
