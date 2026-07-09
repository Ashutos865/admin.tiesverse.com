"""Standalone Data API (/api/data/v1/) + Advisory-only store & key management.

A Tiesverse frontend on any domain can write to / read from a DataStore using an
origin-locked API key — no backend or database of its own. Columns are typed and
defined in the admin; the API validates every write against them. The key is the
security boundary (scope + origin + expiry + single-use); CORS is opened for
these paths by DataApiCorsMiddleware.
"""
import datetime
import re

from django.core.cache import cache
from django.http import HttpResponse, HttpResponseNotFound
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from rest_framework.response import Response

from career_app import access
from .models import DataStore, DataApiKey, DataRecord

HONEYPOT_FIELD = '_hp'
WRITE_RATE_PER_MIN = 60
R2_PREFIX = 'data-uploads'
COLUMN_TYPES = ['text', 'number', 'boolean', 'email', 'url', 'date', 'datetime', 'file']
_EMAIL = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


# ── helpers ──────────────────────────────────────────────────────────────
def _err(msg, status, **extra):
    return Response({'error': msg, **extra}, status=status)


def _origin(request):
    return (request.headers.get('Origin') or request.headers.get('Referer') or '').strip()


def _get_store(slug_or_pk):
    q = DataStore.objects.filter(slug=str(slug_or_pk))
    store = q.first()
    if store is None and str(slug_or_pk).isdigit():
        store = DataStore.objects.filter(pk=int(slug_or_pk)).first()
    return store


def _auth_key(request, store, scope):
    raw = (request.headers.get('X-Api-Key') or '').strip()
    key_id = raw.split('.', 1)[0]
    if not key_id:
        return None, _err('Missing API key (send it in the X-Api-Key header).', 401)
    key = DataApiKey.objects.filter(store=store, key_id=key_id).first()
    if not key or not key.matches(raw):
        return None, _err('Invalid API key.', 401)
    st = key.status
    if st != 'active':
        return None, _err(f'This API key is {st}.', 403)
    if key.scope != scope:
        return None, _err(f'This key is not permitted to {scope}.', 403)
    if not key.origin_allowed(_origin(request)):
        return None, _err('This key is not allowed from this domain.', 403)
    return key, None


def _client_ip(request):
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    return (xff.split(',')[0].strip() if xff else request.META.get('REMOTE_ADDR')) or None


# ── public API: schema / records ─────────────────────────────────────────
@api_view(['GET'])
@permission_classes([AllowAny])
def data_schema(request, slug):
    store = _get_store(slug)
    if store is None:
        return HttpResponseNotFound('{"error": "Data store not found."}')
    # schema is readable with either a submit or read key
    raw = (request.headers.get('X-Api-Key') or '').strip()
    k = DataApiKey.objects.filter(store=store, key_id=raw.split('.', 1)[0]).first()
    if not k or not k.matches(raw) or k.status != 'active' or not k.origin_allowed(_origin(request)):
        return _err('Invalid or unauthorized API key.', 401)
    return Response({'store': store.slug, 'name': store.name, 'columns': store.columns or []})


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
@parser_classes([JSONParser, MultiPartParser, FormParser])
def data_records(request, slug):
    """POST = write a record (write key) · GET = list records (read key)."""
    store = _get_store(slug)
    if store is None:
        return HttpResponseNotFound('{"error": "Data store not found."}')
    return _write(request, store) if request.method == 'POST' else _read(request, store)


def _write(request, store):
    if not store.is_active:
        return _err('This data store is not accepting data.', 400)
    key, err = _auth_key(request, store, DataApiKey.SCOPE_SUBMIT)
    if err:
        return err

    bucket = f'dataapi:rl:{key.id}:{int(timezone.now().timestamp() // 60)}'
    if (cache.get(bucket) or 0) >= WRITE_RATE_PER_MIN:
        return _err('Too many writes, slow down.', 429)
    cache.set(bucket, (cache.get(bucket) or 0) + 1, 70)

    if (request.data.get(HONEYPOT_FIELD) or '').strip():
        return Response({'ok': True, 'id': None}, status=201)

    data, ferr = _collect(request, store)
    if ferr:
        return ferr
    errors = _validate(store.columns or [], data)
    if errors:
        return _err('Validation failed.', 422, fields=errors)

    rec = DataRecord.objects.create(store=store, data=data, ip=_client_ip(request))
    key.records_count = (key.records_count or 0) + 1
    key.last_used_at = timezone.now()
    if key.single_use:
        key.used_at = timezone.now()
    key.save(update_fields=['records_count', 'last_used_at', 'used_at'])
    return Response({'ok': True, 'id': rec.id, 'created_at': rec.created_at.isoformat()}, status=201)


def _read(request, store):
    key, err = _auth_key(request, store, DataApiKey.SCOPE_READ)
    if err:
        return err
    key.last_used_at = timezone.now()
    key.save(update_fields=['last_used_at'])
    return Response(_paginate(store, request))


@api_view(['GET'])
@permission_classes([AllowAny])
def data_upload(request, store_id, name):
    from career_app.providers import R2Storage
    try:
        data = R2Storage().get_object(f'{R2_PREFIX}/{store_id}/{name}')
    except Exception:  # noqa: BLE001
        return HttpResponseNotFound('Not found')
    ctype = 'image/webp' if name.endswith('.webp') else 'application/octet-stream'
    resp = HttpResponse(data, content_type=ctype)
    resp['Cache-Control'] = 'public, max-age=86400'
    return resp


# ── write internals ──────────────────────────────────────────────────────
def _collect(request, store):
    """Build the record dict; upload any files to R2. Returns (data, err)."""
    import json
    raw = request.data.get('data')
    if isinstance(raw, str):
        try:
            data = json.loads(raw) if raw else {}
        except ValueError:
            return None, _err('data must be valid JSON.', 400)
    elif isinstance(raw, dict):
        data = dict(raw)
    else:
        # Fall back to top-level fields (minus reserved) for simple form posts.
        data = {k: v for k, v in request.data.items() if k not in ('data', HONEYPOT_FIELD)}
    if not isinstance(data, dict):
        return None, _err('data must be an object of column -> value.', 400)

    files = getattr(request, 'FILES', None)
    if files:
        from career_app.providers import R2Storage
        import secrets
        base = request.build_absolute_uri('/')[:-1]
        for col, f in files.items():
            payload, ctype, ext = _maybe_webp(f)
            safe = f'{secrets.token_hex(8)}.{ext}'
            try:
                R2Storage().put_object(f'{R2_PREFIX}/{store.id}/{safe}', payload, ctype)
            except Exception as e:  # noqa: BLE001
                return None, _err(f'File upload failed: {e}', 502)
            data[str(col)] = {'name': getattr(f, 'name', safe), 'size': getattr(f, 'size', len(payload)),
                              'url': f'{base}/api/data/v1/uploads/{store.id}/{safe}'}
    return data, None


def _maybe_webp(f):
    ctype = (getattr(f, 'content_type', '') or '').lower()
    if ctype in ('image/png', 'image/jpeg', 'image/jpg', 'image/webp'):
        try:
            from tiesverse_app.media_views import to_webp
            return to_webp(f).read(), 'image/webp', 'webp'
        except Exception:  # noqa: BLE001
            f.seek(0)
    ext = (getattr(f, 'name', 'file').rsplit('.', 1)[-1] or 'bin')[:8].lower()
    return f.read(), ctype or 'application/octet-stream', ext


def _validate(columns, data):
    """Validate data against typed columns. Returns {column: message} of errors."""
    errors = {}
    for col in columns:
        key = str(col.get('key') or '').strip()
        if not key:
            continue
        val = data.get(key)
        empty = val in (None, '', []) or (isinstance(val, list) and not val)
        if col.get('required') and empty:
            errors[key] = 'This field is required.'
            continue
        if empty:
            continue
        t = col.get('type') or 'text'
        if t == 'number' and not _is_number(val):
            errors[key] = 'Must be a number.'
        elif t == 'boolean' and not isinstance(val, bool) and str(val).lower() not in ('true', 'false', '1', '0'):
            errors[key] = 'Must be true or false.'
        elif t == 'email' and not _EMAIL.match(str(val)):
            errors[key] = 'Must be a valid email.'
        elif t == 'url' and not str(val).startswith(('http://', 'https://')):
            errors[key] = 'Must be a URL.'
        elif t in ('date', 'datetime'):
            try:
                datetime.datetime.fromisoformat(str(val).replace('Z', '+00:00'))
            except ValueError:
                errors[key] = 'Must be an ISO date.'
    return errors


def _is_number(v):
    try:
        float(v)
        return True
    except (TypeError, ValueError):
        return False


def _paginate(store, request):
    try:
        page = max(1, int(request.GET.get('page', 1)))
        page_size = min(200, max(1, int(request.GET.get('page_size', 50))))
    except (TypeError, ValueError):
        page, page_size = 1, 50
    qs = DataRecord.objects.filter(store=store).order_by('-created_at')
    total = qs.count()
    rows = qs[(page - 1) * page_size: page * page_size]
    return {'count': total, 'page': page, 'page_size': page_size,
            'results': [{'id': r.id, 'data': r.data, 'created_at': r.created_at.isoformat()} for r in rows]}


# ── Advisory-only management (staff, JWT) ────────────────────────────────
def _is_advisory(user):
    if getattr(user, 'is_superuser', False):
        return True
    m = access.get_member_for_user(user)
    if m and (m.portal_role or '') == 'advisory':
        return True
    return user.groups.filter(name='Advisory').exists()


def _store_dict(s, with_counts=True):
    d = {'id': s.id, 'name': s.name, 'slug': s.slug, 'description': s.description,
         'columns': s.columns or [], 'is_active': s.is_active, 'created_at': s.created_at.isoformat()}
    if with_counts:
        d['records'] = s.records.count()
        d['keys'] = s.api_keys.count()
    return d


def _key_dict(k):
    return {'id': k.id, 'label': k.label, 'scope': k.scope, 'key_id': k.key_id,
            'allowed_origins': k.allowed_origins or [], 'single_use': k.single_use,
            'expires_at': k.expires_at.isoformat() if k.expires_at else None,
            'status': k.status, 'records_count': k.records_count,
            'last_used_at': k.last_used_at.isoformat() if k.last_used_at else None,
            'created_at': k.created_at.isoformat()}


def _clean_columns(raw):
    out = []
    for c in (raw or []):
        key = str(c.get('key') or '').strip()
        if not key or not re.match(r'^[a-zA-Z][a-zA-Z0-9_]*$', key):
            continue
        out.append({'key': key, 'label': (c.get('label') or key)[:120],
                    'type': c.get('type') if c.get('type') in COLUMN_TYPES else 'text',
                    'required': bool(c.get('required'))})
    return out


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def data_stores(request):
    if not _is_advisory(request.user):
        return _err('Only Advisory can manage data stores.', 403)
    if request.method == 'GET':
        return Response({'stores': [_store_dict(s) for s in DataStore.objects.all()]})
    d = request.data
    if not (d.get('name') or '').strip():
        return _err('A name is required.', 400)
    store = DataStore.objects.create(
        name=d['name'].strip()[:200], description=(d.get('description') or '')[:2000],
        columns=_clean_columns(d.get('columns')),
        created_by_user=request.user if request.user.is_authenticated else None,
    )
    return Response(_store_dict(store), status=201)


@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def data_store_detail(request, pk):
    if not _is_advisory(request.user):
        return _err('Only Advisory can manage data stores.', 403)
    store = _get_store(pk)
    if store is None:
        return HttpResponseNotFound('{"error": "Data store not found."}')
    if request.method == 'GET':
        return Response(_store_dict(store))
    if request.method == 'PATCH':
        d = request.data
        if 'name' in d and d['name'].strip():
            store.name = d['name'].strip()[:200]
        if 'description' in d:
            store.description = (d['description'] or '')[:2000]
        if 'columns' in d:
            store.columns = _clean_columns(d['columns'])
        if 'is_active' in d:
            store.is_active = bool(d['is_active'])
        store.save()
        return Response(_store_dict(store))
    # DELETE requires the account password.
    if not request.user.check_password(request.data.get('password') or ''):
        return _err('Incorrect password.', 403)
    store.delete()
    return Response({'ok': True, 'deleted': True})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def data_store_records(request, pk):
    if not _is_advisory(request.user):
        return _err('Only Advisory can view records.', 403)
    store = _get_store(pk)
    if store is None:
        return HttpResponseNotFound('{"error": "Data store not found."}')
    return Response(_paginate(store, request))


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def data_keys(request, pk):
    if not _is_advisory(request.user):
        return _err('Only Advisory can manage keys.', 403)
    store = _get_store(pk)
    if store is None:
        return HttpResponseNotFound('{"error": "Data store not found."}')
    if request.method == 'GET':
        return Response({'keys': [_key_dict(k) for k in store.api_keys.all()]})
    d = request.data
    if d.get('scope') not in (DataApiKey.SCOPE_SUBMIT, DataApiKey.SCOPE_READ):
        return _err('scope must be "submit" or "read".', 400)
    origins = d.get('allowed_origins') or []
    if isinstance(origins, str):
        origins = [o.strip() for o in origins.split(',') if o.strip()]
    if not origins:
        return _err('Add at least one allowed domain.', 400)
    expires_at = None
    if d.get('expires_at'):
        try:
            expires_at = datetime.datetime.fromisoformat(str(d['expires_at']).replace('Z', '+00:00'))
            if timezone.is_naive(expires_at):
                expires_at = timezone.make_aware(expires_at)
        except (ValueError, TypeError):
            return _err('expires_at must be an ISO date/time.', 400)
    key, full = DataApiKey.issue(
        store, d['scope'], label=(d.get('label') or '')[:120], allowed_origins=origins,
        expires_at=expires_at, single_use=bool(d.get('single_use')),
        created_by_user=request.user if request.user.is_authenticated else None,
    )
    out = _key_dict(key)
    out['secret'] = full
    return Response(out, status=201)


@api_view(['POST', 'DELETE'])
@permission_classes([IsAuthenticated])
def data_key_detail(request, pk, key_pk):
    if not _is_advisory(request.user):
        return _err('Only Advisory can manage keys.', 403)
    store = _get_store(pk)
    if store is None:
        return HttpResponseNotFound('{"error": "Data store not found."}')
    key = store.api_keys.filter(pk=key_pk).first()
    if key is None:
        return HttpResponseNotFound('{"error": "Key not found."}')
    if not request.user.check_password(request.data.get('password') or ''):
        return _err('Incorrect password.', 403)
    if request.method == 'DELETE':
        key.delete()
        return Response({'ok': True, 'deleted': True})
    key.revoked_at = timezone.now()
    key.save(update_fields=['revoked_at'])
    return Response(_key_dict(key))
