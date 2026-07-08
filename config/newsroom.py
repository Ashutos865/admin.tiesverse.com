"""Public newsroom feed for the marketing website (tiesverse.com).

Pulls PUBLISHED posts from the WordPress site (ties.tiesverse.com) and exposes
them — plus the admin-curated nav categories — via cached, unauthenticated
endpoints the website fetches. "Read more" links point back to the WP permalink
on ties.tiesverse.com. No credentials involved (published content is public).
"""

import requests
from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny


def _wp_base():
    return (getattr(settings, 'WORDPRESS_URL', '') or '').rstrip('/')


@api_view(['GET'])
@permission_classes([AllowAny])
def public_newsroom_nav(request):
    """The admin-curated nav categories (label, slug, order) for the site nav."""
    from accounts_app.models import SiteNavCategory
    cached = cache.get('public_nav')
    if cached is None:
        cached = [
            {'slug': c.wp_slug, 'label': c.label, 'category_id': c.wp_category_id, 'order': c.order}
            for c in SiteNavCategory.objects.filter(is_active=True)
        ]
        cache.set('public_nav', cached, 120)
    return JsonResponse({'categories': cached})


def _img_from_media(media):
    if not isinstance(media, dict):
        return ''
    sizes = ((media.get('media_details') or {}).get('sizes') or {})
    for size in ('medium_large', 'large', 'medium', 'full'):
        if sizes.get(size, {}).get('source_url'):
            return sizes[size]['source_url']
    return media.get('source_url') or ''


def _simplify(post):
    emb = post.get('_embedded', {}) or {}
    img = _img_from_media((emb.get('wp:featuredmedia') or [{}])[0])
    cats = []
    for group in (emb.get('wp:term') or []):
        for t in (group or []):
            if t.get('taxonomy') == 'category':
                cats.append({'name': t.get('name'), 'slug': t.get('slug')})
    return {
        'id': post.get('id'),
        'title': (post.get('title') or {}).get('rendered', ''),
        'excerpt': (post.get('excerpt') or {}).get('rendered', ''),
        'link': post.get('link'),                 # WP permalink → ties.tiesverse.com/...
        'date': post.get('date'),
        'image': img,
        'categories': cats,
    }


@api_view(['GET'])
@permission_classes([AllowAny])
def public_newsroom_articles(request):
    """Published WP posts, optionally filtered by category slug. Cached ~5 min."""
    base = _wp_base()
    if not base:
        return JsonResponse({'articles': []})
    category = (request.GET.get('category') or '').strip()   # slug
    try:
        per_page = min(max(int(request.GET.get('per_page', 12)), 1), 30)
    except ValueError:
        per_page = 12

    ckey = f'public_articles:{category}:{per_page}'
    cached = cache.get(ckey)
    if cached is not None:
        return JsonResponse({'articles': cached})

    params = {'status': 'publish', 'per_page': per_page, '_embed': 1, 'orderby': 'date', 'order': 'desc'}
    if category:
        try:
            r = requests.get(f'{base}/wp-json/wp/v2/categories', params={'slug': category}, timeout=20)
            cat = (r.json() or [{}])[0]
            if cat.get('id'):
                params['categories'] = cat['id']
        except Exception:  # noqa: BLE001
            pass
    try:
        resp = requests.get(f'{base}/wp-json/wp/v2/posts', params=params, timeout=25)
        posts = resp.json() if resp.ok else []
    except Exception:  # noqa: BLE001
        posts = []
    articles = [_simplify(p) for p in (posts if isinstance(posts, list) else [])]
    cache.set(ckey, articles, 300)
    return JsonResponse({'articles': articles})


@api_view(['GET'])
@permission_classes([AllowAny])
def public_events_feed(request):
    """Admin-managed events (tiesverse_app.Event) for the website Events hub. Cached ~2 min."""
    cached = cache.get('public_events_feed')
    if cached is None:
        try:
            from tiesverse_app.models import Event
            cached = [
                {
                    'id': e.id, 'title': e.title, 'category': e.category or 'Other',
                    'city': e.city, 'venue': e.venue, 'date': e.date, 'time': e.time,
                    'host': e.host, 'price': int(e.price or 0), 'orig': e.orig_price,
                    'capacity': e.capacity, 'attended': e.attended, 'note': e.note,
                    'flagship': bool(e.flagship), 'past': bool(e.past),
                    'cover_url': e.cover_url or '', 'register_url': e.register_url or '',
                }
                for e in Event.objects.using('turso_db').all().order_by('-created_at')
            ]
        except Exception:  # noqa: BLE001
            cached = []
        cache.set('public_events_feed', cached, 120)
    return JsonResponse({'events': cached})


@api_view(['GET'])
@permission_classes([AllowAny])
def public_guests_feed(request):
    """Admin-managed past guests / speakers (tiesverse_app.EventSpeaker). Cached ~2 min."""
    cached = cache.get('public_guests_feed')
    if cached is None:
        try:
            from tiesverse_app.models import EventSpeaker
            cached = [
                {
                    'id': g.id, 'name': g.name, 'role': g.role, 'org': g.org or '',
                    'photo_url': g.photo_url or '', 'quote': g.quote or '',
                    'featured': bool(g.featured),
                }
                for g in EventSpeaker.objects.using('turso_db').all().order_by('-featured', '-created_at')
            ]
        except Exception:  # noqa: BLE001
            cached = []
        cache.set('public_guests_feed', cached, 120)
    return JsonResponse({'guests': cached})
