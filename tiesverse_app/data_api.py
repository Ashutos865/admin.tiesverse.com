"""Standalone Data API (/api/data/v1/) + Advisory-only store & key management.

A Tiesverse frontend on any domain can write to / read from a DataStore using an
origin-locked API key — no backend or database of its own. Columns are typed and
defined in the admin; the API validates every write against them. The key is the
security boundary (scope + origin + expiry + single-use); CORS is opened for
these paths by DataApiCorsMiddleware.
"""
import datetime
import re

from django.core import signing
from django.db import connections, transaction
from django.core.cache import cache
from django.http import HttpResponse, HttpResponseNotFound
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from rest_framework.response import Response

from career_app import access
from .models import DataStore, DataApiKey, DataRecord, DataSequence

HONEYPOT_FIELD = '_hp'
WRITE_RATE_PER_MIN = 60
R2_PREFIX = 'data-uploads'
MAX_FILE_BYTES = 10 * 1024 * 1024      # 10 MB per uploaded file (global ceiling)
UPLOAD_URL_TTL = 15 * 60               # signed file links last 15 minutes
UPLOAD_SALT = 'data_api.upload'
MAX_FILES_PER_COLUMN = 10              # when a column allows multiple

# What a `file` column may accept. A column names one or more of these kinds;
# naming none means "anything", which is the old behaviour.
FILE_KINDS = {
    'image': {
        'label': 'Images',
        'mimes': ('image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'),
        'exts': ('png', 'jpg', 'jpeg', 'webp', 'gif'),
    },
    'pdf': {'label': 'PDF', 'mimes': ('application/pdf',), 'exts': ('pdf',)},
    'doc': {
        'label': 'Documents',
        'mimes': ('application/msword', 'application/vnd.oasis.opendocument.text', 'text/plain',
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
        'exts': ('doc', 'docx', 'odt', 'txt', 'rtf'),
    },
    'sheet': {
        'label': 'Spreadsheets',
        'mimes': ('application/vnd.ms-excel', 'text/csv',
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
        'exts': ('xls', 'xlsx', 'csv'),
    },
}
MAX_VALUE_LEN = 20000                  # per string value
# A `longtext` column holds a whole serialised document — a full application
# form, say — where 20k is genuinely too small. Kept separate so an ordinary
# text field still can't be used to push megabytes into a record.
MAX_LONGTEXT_LEN = 1000000
MAX_KEYS = 100                         # per record
COLUMN_TYPES = ['text', 'longtext', 'number', 'boolean', 'email', 'url', 'date', 'datetime', 'file']
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
    # An admin key is a superset of both: a server that owns the whole workflow
    # creates records, reads them back and updates them. Forcing it to juggle
    # three keys for one job would serve nothing — the trust boundary is that it
    # lives on a server, not in a browser.
    if key.scope != scope and key.scope != DataApiKey.SCOPE_ADMIN:
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

    # Rate limit — per key AND per client IP, atomic increment (best-effort).
    ip = _client_ip(request) or 'noip'
    window = int(timezone.now().timestamp() // 60)
    for bucket in (f'dataapi:rl:k:{key.id}:{window}', f'dataapi:rl:i:{ip}:{window}'):
        cache.add(bucket, 0, 70)
        try:
            if cache.incr(bucket) > WRITE_RATE_PER_MIN:
                return _err('Too many writes, slow down.', 429)
        except ValueError:
            pass  # key expired between add and incr — treat as under limit

    if (request.data.get(HONEYPOT_FIELD) or '').strip():
        return Response({'ok': True, 'id': None}, status=201)

    # Single-use: atomically claim so two concurrent requests can't both write.
    if key.single_use:
        claimed = DataApiKey.objects.filter(pk=key.id, used_at__isnull=True).update(used_at=timezone.now())
        if not claimed:
            return _err('This API key has already been used.', 403)

    data, ferr = _collect(request, store)
    if ferr:
        return ferr
    errors = _validate(store.columns or [], data)
    if errors:
        return _err('Validation failed.', 422, fields=errors)

    rec = DataRecord.objects.create(store=store, data=data, ip=_client_ip(request))
    DataApiKey.objects.filter(pk=key.id).update(records_count=(key.records_count or 0) + 1, last_used_at=timezone.now())
    return Response({'ok': True, 'id': rec.id, 'created_at': rec.created_at.isoformat()}, status=201)


def _read(request, store):
    key, err = _auth_key(request, store, DataApiKey.SCOPE_READ)
    if err:
        return err
    key.last_used_at = timezone.now()
    key.save(update_fields=['last_used_at'])
    return Response(_paginate(store, request))


def sign_upload(store_id, name, ttl=UPLOAD_URL_TTL):
    """A short-lived token for one file. Carries its own expiry, so a link that
    leaks stops working on its own rather than living forever."""
    return signing.dumps({'s': int(store_id), 'n': str(name)}, salt=UPLOAD_SALT)


def _upload_token_ok(token, store_id, name):
    try:
        payload = signing.loads(token, salt=UPLOAD_SALT, max_age=UPLOAD_URL_TTL)
    except signing.SignatureExpired:
        return False, 'This file link has expired. Reload the page to get a fresh one.'
    except signing.BadSignature:
        return False, 'Invalid file link.'
    if int(payload.get('s', -1)) != int(store_id) or str(payload.get('n')) != str(name):
        return False, 'Invalid file link.'
    return True, None


_CTYPES = {
    'webp': 'image/webp', 'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
    'gif': 'image/gif', 'pdf': 'application/pdf', 'txt': 'text/plain', 'csv': 'text/csv',
}


@api_view(['POST'])
@permission_classes([AllowAny])
@parser_classes([JSONParser, FormParser])
def data_sequence(request, slug):
    """Hand out the next number in a named sequence, atomically.

    A registration number must never be issued twice. Computing it as
    "count + 1" races: two submissions arriving together read the same count and
    both take the same number. This does the increment inside the database so
    each caller provably gets a distinct value.

    POST {"name": "DEL"}                -> {"name": "DEL", "value": 41}
    POST {"name": "DEL", "release": 41} -> hands 41 back if still the highest
    """
    store = _get_store(slug)
    if store is None:
        return HttpResponseNotFound('{"error": "Data store not found."}')
    key, err = _auth_key(request, store, DataApiKey.SCOPE_ADMIN)
    if err:
        return err

    name = str(request.data.get('name') or 'default').strip()[:40]
    if not re.match(r'^[a-zA-Z0-9_-]+$', name):
        return _err('Sequence name must be letters, digits, _ or -.', 400)

    # Handing a number back. A caller that drew one and then failed to write its
    # record would otherwise burn it, leaving the counter ahead of the real
    # count. Only the highest number can be returned: if anyone has drawn since,
    # that number is spent and rolling back would issue a duplicate.
    release = request.data.get('release')
    if release is not None:
        try:
            release = int(release)
        except (TypeError, ValueError):
            return _err('release must be a number.', 400)
        with transaction.atomic(using=DataSequence.objects.db):
            with connections[DataSequence.objects.db].cursor() as cur:
                cur.execute(
                    'UPDATE data_sequences SET value = value - 1 '
                    'WHERE store_id = %s AND name = %s AND value = %s RETURNING value',
                    [store.id, name, release],
                )
                row = cur.fetchone()
        # No row means someone drew after this caller did; nothing to undo.
        return Response({'name': name, 'released': bool(row),
                         'value': row[0] if row else None})

    # Increment and read back in ONE statement. Splitting them lets a concurrent
    # writer bump the value in between, handing two callers the same number —
    # which is the exact failure this endpoint exists to prevent. SQLite backs
    # this store and select_for_update is a no-op there, so the RETURNING clause
    # is what makes it safe.
    DataSequence.objects.get_or_create(store=store, name=name, defaults={'value': 0})
    conn = connections[DataSequence.objects.db]
    with transaction.atomic(using=DataSequence.objects.db):
        with conn.cursor() as cur:
            cur.execute(
                'UPDATE data_sequences SET value = value + 1 '
                'WHERE store_id = %s AND name = %s RETURNING value',
                [store.id, name],
            )
            row = cur.fetchone()
    if not row:
        return _err('Could not draw a number.', 500)
    value = row[0]

    DataApiKey.objects.filter(pk=key.id).update(last_used_at=timezone.now())
    return Response({'name': name, 'value': value})


@api_view(['GET', 'PATCH'])
@permission_classes([AllowAny])
@parser_classes([JSONParser, MultiPartParser, FormParser])
def data_record_detail(request, slug, pk):
    """One record: GET with a read key, PATCH with an admin key.

    An approval workflow has to change a record after it was submitted — mark it
    approved, attach a decision, store an issued pass. Submit keys only create
    and read keys only read, so without this the whole review step has nowhere
    to write.
    """
    store = _get_store(slug)
    if store is None:
        return HttpResponseNotFound('{"error": "Data store not found."}')

    scope = DataApiKey.SCOPE_ADMIN if request.method == 'PATCH' else DataApiKey.SCOPE_READ
    key, err = _auth_key(request, store, scope)
    if err:
        return err

    rec = DataRecord.objects.filter(store=store, pk=pk).first()
    if rec is None:
        return HttpResponseNotFound('{"error": "Record not found."}')

    if request.method == 'GET':
        DataApiKey.objects.filter(pk=key.id).update(last_used_at=timezone.now())
        return Response({'id': rec.id, 'data': _sign_record_files(store, rec.data),
                         'created_at': rec.created_at.isoformat()})

    patch, ferr = _collect(request, store)
    if ferr:
        return ferr
    merged = {**(rec.data or {}), **patch}
    # Validate the merged record, not the patch: a partial update must not trip
    # "required" on fields it simply isn't touching.
    errors = _validate(store.columns or [], merged)
    if errors:
        return _err('Validation failed.', 422, fields=errors)

    rec.data = merged
    rec.save(update_fields=['data'])
    DataApiKey.objects.filter(pk=key.id).update(last_used_at=timezone.now())
    return Response({'ok': True, 'id': rec.id, 'data': _sign_record_files(store, rec.data)})


@api_view(['GET'])
@permission_classes([AllowAny])
def data_upload(request, store_id, name):
    """Serve an uploaded file.

    Uploads used to be served to anyone who had the URL. Submissions can be ID
    photos or documents, so a guessed or forwarded link exposed them for good.
    Three ways in now, each proving the caller is entitled to this store:
      - ?t=<signed token>, which the admin panel mints per view and which expires
      - a valid read key for the store (X-Api-Key), as the read API already needs
      - a signed-in advisory user, who can already read every record
    """
    store = DataStore.objects.filter(pk=store_id).first()
    if store is None:
        return HttpResponseNotFound('Not found')

    token = (request.GET.get('t') or '').strip()
    allowed, why = False, 'This file is not public.'
    if token:
        allowed, why = _upload_token_ok(token, store_id, name)
    elif (request.headers.get('X-Api-Key') or '').strip():
        _key, err = _auth_key(request, store, DataApiKey.SCOPE_READ)
        allowed = err is None
        if err is not None:
            why = 'A read key is required to fetch this file.'
    elif getattr(request, 'user', None) and request.user.is_authenticated and _is_advisory(request.user):
        allowed = True
    if not allowed:
        return _err(why, 403)

    from career_app.providers import R2Storage
    try:
        data = R2Storage().get_object(f'{R2_PREFIX}/{store_id}/{name}')
    except Exception:  # noqa: BLE001
        return HttpResponseNotFound('Not found')
    ext = name.rsplit('.', 1)[-1].lower() if '.' in name else ''
    resp = HttpResponse(data, content_type=_CTYPES.get(ext, 'application/octet-stream'))
    # private: a signed link is per-viewer, so a shared cache must not keep it.
    resp['Cache-Control'] = 'private, max-age=300'
    resp['X-Content-Type-Options'] = 'nosniff'
    if ext not in ('webp', 'png', 'jpg', 'jpeg', 'gif', 'pdf'):
        resp['Content-Disposition'] = f'attachment; filename="{name}"'
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
    if len(data) > MAX_KEYS:
        return None, _err(f'Too many fields (max {MAX_KEYS}).', 400)

    # Only accept defined columns (drop unknown keys); cap string sizes.
    defined = {str(c.get('key')) for c in (store.columns or []) if c.get('key')}
    if defined:
        data = {k: v for k, v in data.items() if str(k) in defined}
    # Refuse an oversized value rather than trimming it. Silently truncating a
    # field that holds structured text (a JSON payload, a long answer) stores
    # something corrupt and unparseable, and the writer is never told.
    types = {str(c.get('key')): (c.get('type') or 'text') for c in (store.columns or []) if c.get('key')}
    for k, v in list(data.items()):
        if not isinstance(v, str):
            continue
        limit = MAX_LONGTEXT_LEN if types.get(str(k)) == 'longtext' else MAX_VALUE_LEN
        if len(v) > limit:
            return None, _err(
                f'{k}: value too long ({len(v)} characters, max {limit}).', 413)

    files = getattr(request, 'FILES', None)
    if files:
        from career_app.providers import R2Storage
        import secrets
        base = request.build_absolute_uri('/')[:-1]
        spec_by_key = {str(c.get('key')): c for c in (store.columns or []) if c.get('key')}
        for col in files.keys():
            if defined and str(col) not in defined:
                continue  # ignore files for undefined columns
            spec = spec_by_key.get(str(col), {})
            uploaded = files.getlist(col) if hasattr(files, 'getlist') else [files[col]]
            if not spec.get('multiple') and len(uploaded) > 1:
                return None, _err(f'{col}: only one file is allowed here.', 400)
            if len(uploaded) > MAX_FILES_PER_COLUMN:
                return None, _err(f'{col}: at most {MAX_FILES_PER_COLUMN} files.', 400)

            saved = []
            for f in uploaded:
                bad = _check_file(spec, f, col)
                if bad:
                    return None, bad
                payload, ctype, ext = _maybe_webp(f, spec)
                safe = f'{secrets.token_hex(16)}.{ext}'
                try:
                    R2Storage().put_object(f'{R2_PREFIX}/{store.id}/{safe}', payload, ctype)
                except Exception as e:  # noqa: BLE001
                    return None, _err(f'File upload failed: {e}', 502)
                saved.append({
                    'name': getattr(f, 'name', safe), 'size': len(payload),
                    'content_type': ctype, 'stored': safe,
                    # Unsigned; the reader mints a signed link when it serves this.
                    # trailing slash matters: the route has one, and a 301 can
                    # drop the ?t= signature on the way through.
                    'url': f'{base}/api/data/v1/uploads/{store.id}/{safe}/',
                })
            if saved:
                data[str(col)] = saved if spec.get('multiple') else saved[0]
    return data, None


def _col_max_bytes(spec):
    try:
        mb = float(spec.get('max_mb') or 0)
    except (TypeError, ValueError):
        mb = 0
    limit = int(mb * 1024 * 1024) if mb > 0 else MAX_FILE_BYTES
    return min(limit, MAX_FILE_BYTES)   # a column may tighten, never loosen


def _check_file(spec, f, col):
    """Enforce this column's kind and size rules. Returns an error Response or None."""
    limit = _col_max_bytes(spec)
    if getattr(f, 'size', 0) > limit:
        return _err(f'{col}: file too large (max {round(limit / (1024 * 1024), 1)} MB).', 413)

    kinds = [k for k in (spec.get('kinds') or []) if k in FILE_KINDS]
    if not kinds:
        return None                      # no restriction set = accept anything
    ctype = (getattr(f, 'content_type', '') or '').lower().split(';')[0]
    name = (getattr(f, 'name', '') or '').lower()
    ext = name.rsplit('.', 1)[-1] if '.' in name else ''
    for k in kinds:
        spec_k = FILE_KINDS[k]
        if ctype in spec_k['mimes'] or ext in spec_k['exts']:
            return None
    allowed = ', '.join(FILE_KINDS[k]['label'] for k in kinds)
    return _err(f'{col}: this file type is not allowed (accepted: {allowed}).', 415)


def _maybe_webp(f, spec=None):
    """Images become webp; oversized ones are downscaled first.

    A phone photo or print poster can be several thousand pixels wide, which
    costs storage and download time for a thumbnail nobody views at that size.
    `max_px` caps the long edge, preserving aspect ratio.
    """
    spec = spec or {}
    ctype = (getattr(f, 'content_type', '') or '').lower().split(';')[0]
    if ctype in ('image/png', 'image/jpeg', 'image/jpg', 'image/webp'):
        try:
            max_px = int(spec.get('max_px') or 0)
        except (TypeError, ValueError):
            max_px = 0
        if max_px > 0:
            try:
                from io import BytesIO
                from PIL import Image
                f.seek(0)
                img = Image.open(f)
                img.load()
                if max(img.size) > max_px:
                    img.thumbnail((max_px, max_px), Image.LANCZOS)
                buf = BytesIO()
                img.convert('RGB').save(buf, format='WEBP', quality=82, method=4)
                return buf.getvalue(), 'image/webp', 'webp'
            except Exception:  # noqa: BLE001 — fall through to the plain path
                f.seek(0)
        try:
            from tiesverse_app.media_views import to_webp
            f.seek(0)
            return to_webp(f).read(), 'image/webp', 'webp'
        except Exception:  # noqa: BLE001
            f.seek(0)
    ext = (getattr(f, 'name', 'file').rsplit('.', 1)[-1] or 'bin')[:8].lower()
    f.seek(0)
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

    # Filter on stored values: ?where.status=approved&where.email=a@b.com. Without
    # this a caller looking for one record has to page through the whole store.
    for param, raw in request.GET.items():
        if not param.startswith('where.'):
            continue
        field = param[6:].strip()
        if not field or not re.match(r'^[a-zA-Z][a-zA-Z0-9_]*$', field):
            continue
        qs = qs.filter(**{f'data__{field}': raw})

    # ?q= searches across the record as free text, for a name/email box.
    needle = (request.GET.get('q') or '').strip()
    if needle:
        qs = qs.filter(data__icontains=needle)

    total = qs.count()
    rows = qs[(page - 1) * page_size: page * page_size]
    return {'count': total, 'page': page, 'page_size': page_size,
            'results': [{'id': r.id, 'data': _sign_record_files(store, r.data),
                         'created_at': r.created_at.isoformat()} for r in rows]}


def _sign_record_files(store, data):
    """Attach a fresh signed link to every stored file in a record.

    Records hold the bare URL; the signature is added at read time so links are
    always short-lived and never sit in the database waiting to be leaked.
    """
    if not isinstance(data, dict):
        return data

    def sign_one(v):
        if isinstance(v, dict) and v.get('stored'):
            token = sign_upload(store.id, v['stored'])
            return {**v, 'url': f"{v.get('url', '')}?t={token}"}
        return v

    out = {}
    for k, v in data.items():
        if isinstance(v, list):
            out[k] = [sign_one(x) for x in v]
        else:
            out[k] = sign_one(v)
    return out


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
        col = {'key': key, 'label': (c.get('label') or key)[:120],
               'type': c.get('type') if c.get('type') in COLUMN_TYPES else 'text',
               'required': bool(c.get('required'))}
        # File rules only mean anything on a file column, so they are not carried
        # on the others — a type change back to text leaves nothing stale behind.
        if col['type'] == 'file':
            kinds = [k for k in (c.get('kinds') or []) if k in FILE_KINDS]
            if kinds:
                col['kinds'] = kinds
            try:
                mb = float(c.get('max_mb') or 0)
            except (TypeError, ValueError):
                mb = 0
            if mb > 0:
                col['max_mb'] = round(min(mb, MAX_FILE_BYTES / (1024 * 1024)), 2)
            try:
                px = int(c.get('max_px') or 0)
            except (TypeError, ValueError):
                px = 0
            if px > 0:
                col['max_px'] = max(64, min(px, 8000))
            if c.get('multiple'):
                col['multiple'] = True
        out.append(col)
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
