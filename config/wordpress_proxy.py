"""Server-side proxy to the site's WordPress REST API.

The admin panel's WordPress portal calls `/api/wordpress/<path>` and this view
forwards it to `<WORDPRESS_URL>/wp-json/<path>`, injecting the Application
Password credential **server-side** so it is never exposed to the browser.

Superuser-only. Handles JSON bodies (posts/pages/taxonomies/comments) and
multipart file uploads (media). Passes WordPress's pagination headers
(X-WP-Total / X-WP-TotalPages) back through so the UI can paginate.
"""

import requests
from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework_simplejwt.authentication import JWTAuthentication

# Response headers worth forwarding to the browser (Content-Type handled separately).
_RESP_HEADERS = ('Content-Disposition', 'X-WP-Total', 'X-WP-TotalPages', 'Allow')


@csrf_exempt
def wordpress_proxy(request, remote_path=''):
    # ── Auth: admin-panel superusers only ──────────────────────────────────
    try:
        auth = JWTAuthentication().authenticate(request)
    except Exception:  # noqa: BLE001 — bad/expired token
        auth = None
    if not auth:
        return JsonResponse({'detail': 'Authentication required.'}, status=401)
    user, _ = auth
    if not user.is_superuser:
        return JsonResponse({'detail': 'Superuser access required.'}, status=403)

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
