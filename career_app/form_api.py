"""Headless Form API (/api/forms/v1/) + Advisory-only key management.

Lets a Tiesverse frontend on a *different* domain submit to / read from a Form
using an origin-locked API key, instead of the hosted /f/<token> page. The key
is the security boundary (scope + origin + expiry + single-use); CORS is opened
for these paths via a signal (see apps.py) only so the browser will make the
call — the server still enforces the key.
"""
import datetime

from django.core.cache import cache
from django.http import HttpResponse, HttpResponseNotFound
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from rest_framework.response import Response

from . import access
from .models import Form, FormResponse, FormApiKey

HONEYPOT_FIELD = '_hp'
SUBMIT_RATE_PER_MIN = 30
R2_PREFIX = 'form-uploads'


# ── helpers ──────────────────────────────────────────────────────────────
def _err(msg, status):
    return Response({'error': msg}, status=status)


def _request_origin(request):
    return (request.headers.get('Origin') or request.headers.get('Referer') or '').strip()


def _auth_key(request, form, scope):
    """Resolve + validate the X-Api-Key header for `scope`. Returns (key, error)."""
    raw = (request.headers.get('X-Api-Key') or request.headers.get('X-API-Key') or '').strip()
    key_id = raw.split('.', 1)[0]
    if not key_id:
        return None, _err('Missing API key (send it in the X-Api-Key header).', 401)
    try:
        key = FormApiKey.objects.get(form=form, key_id=key_id)
    except FormApiKey.DoesNotExist:
        return None, _err('Invalid API key.', 401)
    if not key.matches(raw):
        return None, _err('Invalid API key.', 401)
    st = key.status
    if st != 'active':
        return None, _err(f'This API key is {st}.', 403)
    if key.scope != scope:
        return None, _err(f'This key is not permitted to {scope}.', 403)
    if not key.origin_allowed(_request_origin(request)):
        return None, _err('This key is not allowed from this domain.', 403)
    return key, None


def _touch(key):
    key.last_used_at = timezone.now()
    key.save(update_fields=['last_used_at'])


# ── public API: schema / submit / read ───────────────────────────────────
@api_view(['GET'])
@permission_classes([AllowAny])
def form_api_schema(request, pk):
    """Return the form's fields so a frontend can render itself. Submit or read key."""
    form = _get_form(pk)
    if form is None:
        return HttpResponseNotFound(_json_404())
    raw = (request.headers.get('X-Api-Key') or '').strip()
    key_id = raw.split('.', 1)[0]
    key = FormApiKey.objects.filter(form=form, key_id=key_id).first()
    if not key or not key.matches(raw) or key.status != 'active' or not key.origin_allowed(_request_origin(request)):
        return _err('Invalid or unauthorized API key.', 401)
    fields = [
        {'id': str(f.get('id')), 'type': f.get('type'), 'label': f.get('label'),
         'help': f.get('help', ''), 'required': bool(f.get('required')),
         'options': f.get('options', [])}
        for f in (form.schema or [])
        if f.get('type') not in ('heading', 'section', 'paragraph')
    ]
    return Response({'id': form.id, 'title': form.title, 'description': form.description, 'fields': fields})


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
@parser_classes([JSONParser, MultiPartParser, FormParser])
def form_api_submissions(request, pk):
    """POST = submit (submit key) · GET = list responses (read key)."""
    form = _get_form(pk)
    if form is None:
        return HttpResponseNotFound(_json_404())
    return _submit(request, form) if request.method == 'POST' else _list(request, form)


def _submit(request, form):
    """Accept a submission via a submit-scope key. Supports JSON and multipart (files)."""
    key, err = _auth_key(request, form, FormApiKey.SCOPE_SUBMIT)
    if err:
        return err

    # Rate limit per key.
    bucket = f'formapi:rl:{key.id}:{int(timezone.now().timestamp() // 60)}'
    if (cache.get(bucket) or 0) >= SUBMIT_RATE_PER_MIN:
        return _err('Too many submissions, slow down.', 429)
    cache.set(bucket, (cache.get(bucket) or 0) + 1, 70)

    # Honeypot — a bot filled the hidden field. Pretend success, store nothing.
    if (request.data.get(HONEYPOT_FIELD) or '').strip():
        return Response({'ok': True, 'id': None}, status=201)

    answers, submitter_name, submitter_email, ferr = _collect_answers(request, form)
    if ferr:
        return ferr

    accepted = _accept(form, answers, submitter_name, submitter_email, request)
    if accepted.status_code >= 400:
        return accepted

    key.submissions_count = (key.submissions_count or 0) + 1
    key.last_used_at = timezone.now()
    if key.single_use:
        key.used_at = timezone.now()
    key.save(update_fields=['submissions_count', 'last_used_at', 'used_at'])
    return accepted


def _list(request, form):
    """List responses via a read-scope key. Paginated (?page=&page_size=)."""
    key, err = _auth_key(request, form, FormApiKey.SCOPE_READ)
    if err:
        return err
    _touch(key)

    try:
        page = max(1, int(request.GET.get('page', 1)))
        page_size = min(100, max(1, int(request.GET.get('page_size', 50))))
    except (TypeError, ValueError):
        page, page_size = 1, 50
    qs = FormResponse.objects.filter(form=form).order_by('-submitted_at')
    total = qs.count()
    rows = qs[(page - 1) * page_size: page * page_size]
    data = [
        {'id': r.id, 'answers': r.answers, 'submitter_name': r.submitter_name,
         'submitter_email': r.submitter_email, 'submitted_at': r.submitted_at.isoformat()}
        for r in rows
    ]
    return Response({'count': total, 'page': page, 'page_size': page_size, 'results': data})


@api_view(['GET'])
@permission_classes([AllowAny])
def form_api_upload(request, form_id, name):
    """Public proxy that streams a form file upload out of R2 (unguessable name)."""
    from .providers import R2Storage
    try:
        data = R2Storage().get_object(f'{R2_PREFIX}/{form_id}/{name}')
    except Exception:  # noqa: BLE001
        return HttpResponseNotFound('Not found')
    ctype = 'image/webp' if name.endswith('.webp') else 'application/octet-stream'
    resp = HttpResponse(data, content_type=ctype)
    resp['Cache-Control'] = 'public, max-age=86400'
    return resp


# ── submission internals ─────────────────────────────────────────────────
def _collect_answers(request, form):
    """Build the answers dict; upload any files to R2. Returns (answers, name, email, err)."""
    import json
    submitter_name = (request.data.get('submitter_name') or '')[:255]
    submitter_email = (request.data.get('submitter_email') or '')[:254]

    raw_answers = request.data.get('answers')
    if isinstance(raw_answers, str):
        try:
            answers = json.loads(raw_answers) if raw_answers else {}
        except ValueError:
            return None, None, None, _err('answers must be valid JSON.', 400)
    elif isinstance(raw_answers, dict):
        answers = dict(raw_answers)
    else:
        answers = {}
    if not isinstance(answers, dict):
        return None, None, None, _err('answers must be an object of field_id -> value.', 400)

    # Files (multipart): store each in R2, put a {name,url} descriptor in answers.
    files = getattr(request, 'FILES', None)
    if files:
        from .providers import R2Storage
        from django.conf import settings as dj_settings
        import secrets
        base = getattr(dj_settings, 'PUBLIC_BASE_URL', '') or request.build_absolute_uri('/')[:-1]
        for field_id, f in files.items():
            data, ctype, ext = _maybe_webp(f)
            safe = f'{secrets.token_hex(8)}.{ext}'
            r2key = f'{R2_PREFIX}/{form.id}/{safe}'
            try:
                R2Storage().put_object(r2key, data, ctype)
            except Exception as e:  # noqa: BLE001
                return None, None, None, _err(f'File upload failed: {e}', 502)
            answers[str(field_id)] = {
                'name': getattr(f, 'name', safe), 'size': getattr(f, 'size', len(data)),
                'url': f'{base}/api/forms/v1/uploads/{form.id}/{safe}',
            }
    return answers, submitter_name, submitter_email, None


def _maybe_webp(f):
    """Images → WebP; everything else passes through. Returns (bytes, ctype, ext)."""
    ctype = (getattr(f, 'content_type', '') or '').lower()
    if ctype in ('image/png', 'image/jpeg', 'image/jpg', 'image/webp'):
        try:
            from tiesverse_app.media_views import to_webp
            return to_webp(f).read(), 'image/webp', 'webp'
        except Exception:  # noqa: BLE001
            f.seek(0)
    ext = (getattr(f, 'name', 'file').rsplit('.', 1)[-1] or 'bin')[:8].lower()
    return f.read(), ctype or 'application/octet-stream', ext


def _accept(form, answers, submitter_name, submitter_email, request):
    """Validate against the schema + persist a FormResponse (mirrors the hosted flow)."""
    s = form.settings or {}
    if not form.is_published:
        return _err('This form is not accepting responses.', 400)
    if s.get('accepting') is False:
        return _err('This form is no longer accepting responses.', 400)
    close_date = s.get('close_date')
    if close_date:
        try:
            if timezone.now().date() > datetime.date.fromisoformat(str(close_date)[:10]):
                return _err('This form is closed.', 400)
        except (ValueError, TypeError):
            pass

    missing = []
    for field in (form.schema or []):
        if field.get('type') in ('heading', 'section', 'paragraph'):
            continue
        if field.get('required'):
            val = answers.get(str(field.get('id')))
            if val in (None, '', []) or (isinstance(val, list) and not val):
                missing.append(field.get('label') or 'Untitled question')
    if missing:
        return Response({'error': 'Please answer all required questions.', 'missing': missing}, status=422)

    resp = FormResponse.objects.create(
        form=form, answers=answers, submitted_by_user=None,
        submitter_name=submitter_name or '', submitter_email=submitter_email or '',
    )
    if s.get('send_confirmation', True) and submitter_email:
        try:
            from .views import _send_form_confirmation
            _send_form_confirmation(form, submitter_email, submitter_name, answers)
        except Exception:  # noqa: BLE001 — never fail a submission on a mail hiccup
            pass
    return Response({'ok': True, 'id': resp.id, 'thank_you': s.get('thank_you') or ''}, status=201)


def _get_form(pk):
    try:
        return Form.objects.get(pk=pk)
    except (Form.DoesNotExist, ValueError, TypeError):
        return None


def _json_404():
    return '{"error": "Form not found."}'


# ── Advisory-only key management (staff, JWT) ────────────────────────────
def _is_advisory(user):
    if getattr(user, 'is_superuser', False):
        return True
    m = access.get_member_for_user(user)
    if m and (m.portal_role or '') == 'advisory':
        return True
    return user.groups.filter(name='Advisory').exists()


def _key_dict(k):
    return {
        'id': k.id, 'label': k.label, 'scope': k.scope, 'key_id': k.key_id,
        'allowed_origins': k.allowed_origins or [], 'single_use': k.single_use,
        'expires_at': k.expires_at.isoformat() if k.expires_at else None,
        'status': k.status, 'submissions_count': k.submissions_count,
        'last_used_at': k.last_used_at.isoformat() if k.last_used_at else None,
        'created_at': k.created_at.isoformat(),
    }


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def form_keys(request, pk):
    """List or create API keys for a form. Advisory only."""
    if not _is_advisory(request.user):
        return _err('Only Advisory can manage form API keys.', 403)
    form = _get_form(pk)
    if form is None:
        return HttpResponseNotFound(_json_404())

    if request.method == 'GET':
        return Response({'keys': [_key_dict(k) for k in form.api_keys.all()]})

    d = request.data
    scope = d.get('scope')
    if scope not in (FormApiKey.SCOPE_SUBMIT, FormApiKey.SCOPE_READ):
        return _err('scope must be "submit" or "read".', 400)
    origins = d.get('allowed_origins') or []
    if isinstance(origins, str):
        origins = [o.strip() for o in origins.split(',') if o.strip()]
    if not origins:
        return _err('Add at least one allowed domain (a key locked to no domain is unusable).', 400)
    expires_at = None
    if d.get('expires_at'):
        try:
            expires_at = datetime.datetime.fromisoformat(str(d['expires_at']).replace('Z', '+00:00'))
            if timezone.is_naive(expires_at):
                expires_at = timezone.make_aware(expires_at)
        except (ValueError, TypeError):
            return _err('expires_at must be an ISO date/time.', 400)

    key, full = FormApiKey.issue(
        form, scope, label=(d.get('label') or '')[:120], allowed_origins=origins,
        expires_at=expires_at, single_use=bool(d.get('single_use')),
        created_by_user=request.user if request.user.is_authenticated else None,
    )
    out = _key_dict(key)
    out['secret'] = full  # shown once, never again
    return Response(out, status=201)


@api_view(['POST', 'DELETE'])
@permission_classes([IsAuthenticated])
def form_key_detail(request, pk, key_pk):
    """Revoke (POST) or delete (DELETE) a key. Advisory only + password required."""
    if not _is_advisory(request.user):
        return _err('Only Advisory can manage form API keys.', 403)
    form = _get_form(pk)
    if form is None:
        return HttpResponseNotFound(_json_404())
    try:
        key = form.api_keys.get(pk=key_pk)
    except FormApiKey.DoesNotExist:
        return HttpResponseNotFound('{"error": "Key not found."}')

    password = (request.data.get('password') or '')
    if not request.user.check_password(password):
        return _err('Incorrect password.', 403)

    if request.method == 'DELETE':
        key.delete()
        return Response({'ok': True, 'deleted': True})
    key.revoked_at = timezone.now()
    key.save(update_fields=['revoked_at'])
    return Response(_key_dict(key))
