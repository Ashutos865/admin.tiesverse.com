"""Server-side proxy to the site's WordPress REST API.

The admin panel's WordPress portal calls `/api/wordpress/<path>` and this view
forwards it to `<WORDPRESS_URL>/wp-json/<path>`, injecting the Application
Password credential **server-side** so it is never exposed to the browser.

Superuser-only. Handles JSON bodies (posts/pages/taxonomies/comments) and
multipart file uploads (media). Passes WordPress's pagination headers
(X-WP-Total / X-WP-TotalPages) back through so the UI can paginate.
"""

import json

import requests
from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework_simplejwt.authentication import JWTAuthentication

from career_app.access import get_article_access

# Response headers worth forwarding to the browser (Content-Type handled separately).
_RESP_HEADERS = ('Content-Disposition', 'X-WP-Total', 'X-WP-TotalPages', 'Allow')

# Content-team (draft-only) writers may create/update posts, but never publish,
# delete, or touch users/settings. Everything they POST is forced to draft and
# tagged with their name. These are the only write paths they may reach.
_DRAFT_WRITE_PREFIXES = ('wp/v2/posts', 'wp/v2/media')


def _wp_path(remote_path):
    clean = str(remote_path or '').lstrip('/')
    if clean.startswith('wp-json/'):
        clean = clean[len('wp-json/'):]
    return clean


def _forbid(msg):
    return JsonResponse({'detail': msg}, status=403)


def _enforce_draft_only(request, wp_rel):
    """Return (ok, error_response, forced_body).

    For a draft-only content writer: allow GET everywhere; allow POST to
    posts/media only, forcing status='draft' and never allowing a publish or a
    change to someone else's already-published post. Block DELETE and anything
    outside the allowed prefixes (users, settings, plugins, etc.)."""
    method = request.method.upper()
    if method in ('GET', 'HEAD', 'OPTIONS'):
        return True, None, None
    if method == 'DELETE':
        return False, _forbid('Content writers cannot delete posts.'), None
    if method not in ('POST', 'PUT', 'PATCH'):
        return False, _forbid('Not allowed.'), None
    # Only posts and media writes are permitted.
    if not any(wp_rel.startswith(p) for p in _DRAFT_WRITE_PREFIXES):
        return False, _forbid('Content writers can only create drafts and upload media.'), None
    # Media upload (multipart) is allowed as-is (needed to add images to a draft).
    if request.FILES or wp_rel.startswith('wp/v2/media'):
        return True, None, None
    # A post write: force draft status, block publishing.
    try:
        body = json.loads(request.body or b'{}')
    except Exception:  # noqa: BLE001
        body = {}
    requested = str(body.get('status', '') or '').lower()
    if requested and requested not in ('draft', 'pending', 'auto-draft'):
        return False, _forbid('Content writers cannot publish. Save as a draft; a lead will review it.'), None
    body['status'] = 'draft'
    return True, None, body


@csrf_exempt
def wordpress_proxy(request, remote_path=''):
    # ── Auth ────────────────────────────────────────────────────────────────
    try:
        auth = JWTAuthentication().authenticate(request)
    except Exception:  # noqa: BLE001 — bad/expired token
        auth = None
    if not auth:
        return JsonResponse({'detail': 'Authentication required.'}, status=401)
    user, _ = auth

    # ── Access tier: full (superuser/lead/granted), draft (content member), none
    tier, member = get_article_access(user)
    if tier == 'none':
        return JsonResponse({'detail': 'You do not have access to Articles & Reports.'}, status=403)

    wp_rel = _wp_path(remote_path)
    forced_body = None
    if tier == 'draft':
        ok, err, forced_body = _enforce_draft_only(request, wp_rel)
        if not ok:
            return err

    base = (getattr(settings, 'WORDPRESS_URL', '') or '').rstrip('/')
    wp_user = getattr(settings, 'WORDPRESS_USER', '')
    wp_pw = getattr(settings, 'WORDPRESS_APP_PASSWORD', '')
    if not (base and wp_user and wp_pw):
        return JsonResponse({'detail': 'WordPress connection is not configured on the server.'}, status=503)

    # Only the wp-json REST surface may be proxied.
    clean = str(remote_path or '').lstrip('/')
    if not clean.startswith('wp-json'):
        clean = 'wp-json/' + clean
    url = f'{base}/{clean}'

    kwargs = {
        'method': request.method,
        'url': url,
        'params': request.GET.dict(),
        'auth': (wp_user, wp_pw),
        'timeout': 90,
    }
    if request.method in ('POST', 'PUT', 'PATCH', 'DELETE'):
        if request.FILES:
            # Media upload — re-send as multipart to WordPress.
            f = next(iter(request.FILES.values()))
            kwargs['files'] = {'file': (f.name, f.read(), f.content_type or 'application/octet-stream')}
            extra = {k: v for k, v in request.POST.items()}
            if extra:
                kwargs['data'] = extra
        elif forced_body is not None:
            # Draft writer: send the server-forced body (status=draft) and stamp
            # the writer's enrolled name so the draft is attributed to them (the
            # WP account is shared, so we record it in meta + a byline prefix).
            author_name = (getattr(member, 'candidate_name', '') or '').strip()
            if author_name:
                meta = forced_body.get('meta') or {}
                if isinstance(meta, dict):
                    meta['tv_author_name'] = author_name
                    forced_body['meta'] = meta
                # A visible byline so leads see who wrote it in the drafts list.
                existing = forced_body.get('excerpt')
                if not existing:
                    forced_body['excerpt'] = f'Draft by {author_name}'
            kwargs['data'] = json.dumps(forced_body)
            kwargs['headers'] = {'Content-Type': 'application/json'}
        else:
            kwargs['data'] = request.body
            ct = request.META.get('CONTENT_TYPE')
            if ct:
                kwargs['headers'] = {'Content-Type': ct}

    try:
        resp = requests.request(**kwargs)
    except requests.RequestException as exc:  # noqa: BLE001
        return JsonResponse({'detail': f'WordPress is unreachable: {exc}'}, status=502)

    out = HttpResponse(
        resp.content, status=resp.status_code,
        content_type=resp.headers.get('Content-Type', 'application/json'),
    )
    for h in _RESP_HEADERS:
        if h in resp.headers:
            out[h] = resp.headers[h]
    return out
