"""Certificate workflow APIs owned by the admin portal.

These endpoints intentionally store certificate metadata only. PDF files remain
on-demand: a record keeps the template, person, source, and certificate ID, and
the frontend asks the generator service to render a PDF only when Download is
clicked.
"""

from __future__ import annotations

import csv
import io
import json
import re
from datetime import datetime, timezone
from uuid import uuid4

from django.http import HttpResponse, JsonResponse
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.throttling import SimpleRateThrottle

from career_app import cloudflare_proxy
from webinar_app import turso_client


class VerifyRateThrottle(SimpleRateThrottle):
    """Rate-limit the public certificate verification by client IP (see the
    'verify' scope in settings), so the endpoint can't be hammered/enumerated."""
    scope = 'verify'

    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': self.get_ident(request)}


def _slug(value: str, fallback: str = 'cert') -> str:
    cleaned = re.sub(r'[^a-z0-9]+', '-', str(value or '').lower()).strip('-')
    return (cleaned or fallback)[:28]


def _now_suffix() -> str:
    return datetime.now(timezone.utc).strftime('%y%m%d%H%M%S%f')[:16]


def _certificate_id(source_type: str, subject: str, source_ref: str) -> str:
    prefix = 'TV-WEB' if source_type == 'webinar' else 'TV-OFFER' if source_type == 'offer' else 'TV-CERT'
    return f'{prefix}-{_slug(subject)}-{_slug(source_ref, "row")}-{_now_suffix()}'.upper()


def _record_key_set(template_id: str, source_type: str) -> set[str]:
    if not turso_client.is_configured():
        return set()
    turso_client.setup_tables()
    rows = turso_client.execute(
        """SELECT source_ref FROM certificate_records
           WHERE template_id=:template_id AND source_type=:source_type""",
        {'template_id': template_id, 'source_type': source_type},
    )
    return {str(row.get('source_ref') or '') for row in rows}


def _safe_json(value):
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value or '{}')
    except (TypeError, ValueError):
        return {}


def _webinar_rows():
    if not turso_client.is_configured():
        return []
    try:
        turso_client.setup_tables()
        _ensure_turso_certificate_columns()
        return turso_client.execute('SELECT * FROM registrations ORDER BY registered_at DESC LIMIT 1000')
    except turso_client.TursoError:
        return []


def _confirmed_registration(row: dict) -> bool:
    payment_required = str(row.get('payment_required') or '0') in {'1', 'true', 'True'}
    payment_status = str(row.get('payment_status') or 'free').lower()
    return (not payment_required) or payment_status in {'paid', 'success', 'free'}


def _webinar_import_rows(template_id: str, event_key: str = '', pending_only: bool = True) -> list[dict]:
    existing = _record_key_set(template_id, 'webinar')
    rows = []
    for row in _webinar_rows():
        source_ref = str(row.get('id') or row.get('email') or '')
        row_event_key = str(row.get('event_id') or row.get('event_title') or '')
        if event_key and row_event_key != event_key and str(row.get('event_title') or '') != event_key:
            continue
        if pending_only and source_ref in existing:
            continue
        if not _confirmed_registration(row):
            continue
        name = str(row.get('name') or '').strip()
        email = str(row.get('email') or '').strip()
        event_title = str(row.get('event_title') or 'Webinar').strip()
        certificate_id = str(row.get('webinar_certificate_id') or '').strip()
        rows.append({
            'source_type': 'webinar',
            'source_ref': source_ref,
            'person_name': name,
            'person_email': email,
            'subject_title': event_title,
            'certificate_id': certificate_id,
            'data': {
                'name': name,
                'participant_name': name,
                'email': email,
                'participant_email': email,
                'event_title': event_title,
                'webinar': event_title,
                'phone': row.get('phone') or '',
                'city': row.get('city') or '',
                'date': row.get('registered_at') or '',
                'registered_at': row.get('registered_at') or '',
                'certificate_id': certificate_id,
                'cert_id': certificate_id,
            },
            'raw': row,
        })
    return rows


def _offer_import_rows(template_id: str, pending_only: bool = True) -> list[dict]:
    existing = _record_key_set(template_id, 'offer')
    candidates = cloudflare_proxy.get_candidates() or []
    rows = []
    for candidate in candidates:
        source_ref = str(candidate.get('id') or candidate.get('row_index') or candidate.get('email') or '')
        if pending_only and source_ref in existing:
            continue
        final_decision = str(candidate.get('final_decision') or '').lower()
        interview_status = str(candidate.get('interview_status') or '').lower()
        if final_decision and final_decision not in {'accepted', 'selected', 'hired', 'offer', 'offered'}:
            if not any(word in interview_status for word in ['accepted', 'selected', 'hired', 'offer']):
                continue
        name = ' '.join(part for part in [candidate.get('first_name'), candidate.get('last_name')] if part).strip()
        if not name:
            name = str(candidate.get('name') or candidate.get('applicant_name') or 'Candidate')
        role = str(candidate.get('roles') or candidate.get('role') or candidate.get('department') or 'Offer Letter')
        certificate_id = str(candidate.get('offer_certificate_id') or '').strip()
        rows.append({
            'source_type': 'offer',
            'source_ref': source_ref,
            'person_name': name,
            'person_email': str(candidate.get('email') or ''),
            'subject_title': role,
            'certificate_id': certificate_id,
            'data': {
                'name': name,
                'candidate_name': name,
                'participant_name': name,
                'email': candidate.get('email') or '',
                'candidate_email': candidate.get('email') or '',
                'position': role,
                'role': role,
                'department': candidate.get('department') or '',
                'phone': candidate.get('phone') or '',
                'city': candidate.get('city') or '',
                'date': datetime.now(timezone.utc).date().isoformat(),
                'certificate_id': certificate_id,
                'cert_id': certificate_id,
            },
            'raw': candidate,
        })
    return rows


def _ensure_turso_certificate_columns():
    for col in ['webinar_certificate_id']:
        try:
            turso_client.execute(f'ALTER TABLE registrations ADD COLUMN {col} TEXT')
        except turso_client.TursoError:
            pass


def _mark_turso_certificate(source_ref: str, certificate_id: str):
    if not turso_client.is_configured():
        return
    try:
        _ensure_turso_certificate_columns()
        turso_client.execute(
            'UPDATE registrations SET webinar_certificate_id=:certificate_id WHERE id=:id',
            {'certificate_id': certificate_id, 'id': source_ref},
        )
    except turso_client.TursoError:
        pass


def _mark_offer_certificate(source_ref: str, certificate_id: str):
    try:
        cloudflare_proxy.set_offer_certificate_id(source_ref, certificate_id)
    except Exception:
        pass


def _serialize_record(record: dict) -> dict:
    return {
        'id': str(record.get('id') or ''),
        'certificate_id': record.get('certificate_id') or '',
        'source_type': record.get('source_type') or '',
        'source_ref': record.get('source_ref') or '',
        'person_name': record.get('person_name') or '',
        'person_email': record.get('person_email') or '',
        'subject_title': record.get('subject_title') or '',
        'template_id': record.get('template_id') or '',
        'template_name': record.get('template_name') or '',
        'data': _safe_json(record.get('data_json')),
        'email_status': record.get('email_status') or 'not_sent',
        'created_at': record.get('created_at') or '',
    }


_VERIFY_TYPE_LABEL = {
    'webinar': 'Webinar / workshop certificate',
    'offer': 'Offer letter',
    'manual': 'Certificate',
}


def _verify_date(iso_value) -> str:
    try:
        return datetime.fromisoformat(str(iso_value).replace('Z', '+00:00')).strftime('%d %b %Y')
    except (TypeError, ValueError):
        return ''


@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([VerifyRateThrottle])
def verify_certificate(request):
    """Public fraud-detection lookup. Given an exact certificate ID, confirm it
    is genuine and return ONLY minimal info (name, title, type, issue date).
    No email/template/internal fields, and no listing — you must know the exact
    ID, so nothing can be enumerated or scraped."""
    cert_id = (request.query_params.get('id') or '').strip().upper()
    if not cert_id:
        return JsonResponse({'valid': False, 'error': 'No certificate ID provided.'}, status=400)
    if not turso_client.is_configured():
        return JsonResponse({'valid': False})
    try:
        turso_client.setup_tables()
        rows = turso_client.execute(
            """SELECT certificate_id, source_type, person_name, subject_title, created_at
               FROM certificate_records WHERE UPPER(certificate_id)=:cid LIMIT 1""",
            {'cid': cert_id},
        )
    except turso_client.TursoError:
        return JsonResponse({'valid': False})
    if not rows:
        return JsonResponse({'valid': False, 'certificate_id': cert_id})
    r = rows[0]
    source_type = r.get('source_type') or ''
    return JsonResponse({
        'valid': True,
        'certificate_id': r.get('certificate_id') or cert_id,
        'name': r.get('person_name') or '',
        'title': r.get('subject_title') or '',
        'type': source_type,
        'type_label': _VERIFY_TYPE_LABEL.get(source_type, 'Certificate'),
        'issued_on': _verify_date(r.get('created_at')),
        'issuer': 'TIESVERSE',
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def certificate_sources(request):
    template_id = request.query_params.get('template_id') or ''
    existing_webinar = _record_key_set(template_id, 'webinar') if template_id else set()
    events = {}
    for row in _webinar_rows():
        if not _confirmed_registration(row):
            continue
        event_key = str(row.get('event_id') or row.get('event_title') or '')
        source_ref = str(row.get('id') or row.get('email') or '')
        entry = events.setdefault(event_key, {
            'event_key': event_key,
            'event_id': row.get('event_id') or '',
            'event_title': row.get('event_title') or 'Webinar',
            'event_type': row.get('event_type') or 'event',
            'total': 0,
            'pending': 0,
        })
        entry['total'] += 1
        if source_ref not in existing_webinar:
            entry['pending'] += 1

    offer_rows = _offer_import_rows(template_id, pending_only=False) if template_id else []
    pending_offers = _offer_import_rows(template_id, pending_only=True) if template_id else []
    return JsonResponse({
        'webinar_events': sorted(events.values(), key=lambda item: item['event_title'].lower()),
        'offer_letters': {'total': len(offer_rows), 'pending': len(pending_offers)},
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def certificate_import_rows(request):
    template_id = request.query_params.get('template_id') or ''
    source_type = request.query_params.get('source_type') or 'webinar'
    event_key = request.query_params.get('event_key') or ''
    pending_only = request.query_params.get('pending_only', 'true').lower() != 'false'
    if source_type == 'offer':
        rows = _offer_import_rows(template_id, pending_only=pending_only)
    else:
        rows = _webinar_import_rows(template_id, event_key=event_key, pending_only=pending_only)
    return JsonResponse({'rows': rows, 'count': len(rows)})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def certificate_import_records(request):
    template_id = request.data.get('template_id') or ''
    template_name = request.data.get('template_name') or 'Certificate template'
    source_type = request.data.get('source_type') or 'webinar'
    event_key = request.data.get('event_key') or ''
    selected_refs = {str(item) for item in (request.data.get('source_refs') or [])}
    if source_type == 'offer':
        rows = _offer_import_rows(template_id, pending_only=True)
    else:
        rows = _webinar_import_rows(template_id, event_key=event_key, pending_only=True)
    if selected_refs:
        rows = [row for row in rows if str(row['source_ref']) in selected_refs]

    created = []
    skipped = 0
    turso_client.setup_tables()
    for row in rows:
        cert_id = row.get('certificate_id') or _certificate_id(source_type, row['subject_title'], row['source_ref'])
        data = dict(row.get('data') or {})
        data['certificate_id'] = cert_id
        data['cert_id'] = cert_id
        record_id = str(uuid4())
        now = datetime.now(timezone.utc).isoformat()
        try:
            turso_client.execute(
                """INSERT INTO certificate_records
                   (id,certificate_id,source_type,source_ref,person_name,person_email,
                    subject_title,template_id,template_name,data_json,email_status,
                    created_at,updated_at)
                   VALUES (:id,:certificate_id,:source_type,:source_ref,:person_name,:person_email,
                           :subject_title,:template_id,:template_name,:data_json,'not_sent',
                           :created_at,:updated_at)""",
                {
                    'id': record_id,
                    'certificate_id': cert_id,
                    'source_type': source_type,
                    'source_ref': str(row['source_ref']),
                    'person_name': row['person_name'],
                    'person_email': row.get('person_email') or '',
                    'subject_title': row['subject_title'],
                    'template_id': template_id,
                    'template_name': template_name,
                    'data_json': json.dumps(data, ensure_ascii=False),
                    'created_at': now,
                    'updated_at': now,
                },
            )
        except turso_client.TursoError as exc:
            if 'UNIQUE' in str(exc).upper():
                skipped += 1
                continue
            raise
        if source_type == 'webinar':
            _mark_turso_certificate(str(row['source_ref']), cert_id)
        elif source_type == 'offer':
            _mark_offer_certificate(str(row['source_ref']), cert_id)
        stored = turso_client.execute(
            'SELECT * FROM certificate_records WHERE id=:id LIMIT 1',
            {'id': record_id},
        )
        if stored:
            created.append(_serialize_record(stored[0]))
    return JsonResponse({'created': created, 'created_count': len(created), 'skipped': skipped})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def certificate_records(request):
    turso_client.setup_tables()
    clauses = []
    params = {}
    source_type = request.query_params.get('source_type')
    if source_type:
        clauses.append('source_type=:source_type')
        params['source_type'] = source_type
    template_id = request.query_params.get('template_id')
    if template_id:
        clauses.append('template_id=:template_id')
        params['template_id'] = template_id
    where = f" WHERE {' AND '.join(clauses)}" if clauses else ''
    records = turso_client.execute(
        f'SELECT * FROM certificate_records{where} ORDER BY created_at DESC LIMIT 1000',
        params,
    )
    return JsonResponse({'records': [_serialize_record(record) for record in records]})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def certificate_mark_emailed(request):
    turso_client.setup_tables()
    ids = request.data.get('record_ids') or []
    status = request.data.get('email_status') or 'sent'
    updated = 0
    now = datetime.now(timezone.utc).isoformat()
    for record_id in ids:
        rows = turso_client.execute(
            """UPDATE certificate_records
               SET email_status=:status,updated_at=:updated_at
               WHERE id=:id RETURNING id""",
            {'status': status, 'updated_at': now, 'id': str(record_id)},
        )
        updated += len(rows)
    return JsonResponse({'updated': updated})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def certificate_send_emails(request):
    """Bulk-send branded certificate notification emails (SES) for the selected
    records, then mark them emailed. Real sending only happens when
    CERT_EMAIL_ENABLED=True and SES creds are set; otherwise each is stubbed to
    the console. Returns per-record results."""
    from config.email_templates import send_template_email

    turso_client.setup_tables()
    ids = request.data.get('record_ids') or []
    selected_ids = {str(record_id) for record_id in ids}
    if not selected_ids:
        return JsonResponse({'detail': 'No certificate records selected.'}, status=400)

    all_records = turso_client.execute(
        'SELECT * FROM certificate_records ORDER BY created_at DESC LIMIT 1000'
    )
    records = [row for row in all_records if str(row.get('id')) in selected_ids]

    sent, stubbed, skipped = 0, 0, 0
    results = []
    now = datetime.now(timezone.utc).isoformat()

    for record in records:
        email = str(record.get('person_email') or '').strip()
        name = str(record.get('person_name') or 'there').strip()
        subject_title = str(record.get('subject_title') or 'Certificate').strip()
        cert_id = str(record.get('certificate_id') or '').strip()
        if not email:
            skipped += 1
            results.append({'id': record.get('id'), 'status': 'skipped', 'reason': 'no email'})
            continue

        ok = send_template_email('certificate_bulk', email, {
            'name': name,
            'subject_title': subject_title,
            'certificate_id': cert_id or '—',
        })
        if ok:
            sent += 1
        else:
            stubbed += 1

        turso_client.execute(
            """UPDATE certificate_records
               SET email_status=:status, updated_at=:updated_at
               WHERE id=:id""",
            {'status': 'sent' if ok else 'stubbed', 'updated_at': now, 'id': str(record.get('id'))},
        )
        results.append({'id': record.get('id'), 'status': 'sent' if ok else 'stubbed', 'email': email})

    return JsonResponse({
        'sent': sent, 'stubbed': stubbed, 'skipped': skipped, 'results': results,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def certificate_records_csv(request):
    turso_client.setup_tables()
    ids = request.data.get('record_ids') or []
    selected_ids = {str(record_id) for record_id in ids}
    records = [
        row for row in turso_client.execute(
            'SELECT * FROM certificate_records ORDER BY created_at DESC LIMIT 1000'
        )
        if str(row.get('id')) in selected_ids
    ]
    if not records:
        return JsonResponse({'detail': 'No certificate records selected.'}, status=400)

    record_data = [_safe_json(record.get('data_json')) for record in records]
    fieldnames = sorted({key for data in record_data for key in data.keys()})
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    for data in record_data:
        writer.writerow({key: data.get(key, '') for key in fieldnames})
    return HttpResponse(buffer.getvalue(), content_type='text/csv')
