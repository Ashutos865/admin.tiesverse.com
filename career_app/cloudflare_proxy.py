"""
Proxy to Cloudflare D1 for the career candidates table.
The admin panel has the same Cloudflare credentials as the career page backend.
"""
import json
import logging
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings

logger = logging.getLogger(__name__)


class D1Error(RuntimeError):
    pass


def _query(sql, params=None):
    account_id = getattr(settings, 'CLOUDFLARE_ACCOUNT_ID', '')
    db_id = getattr(settings, 'CLOUDFLARE_D1_DATABASE_ID', '')
    token = getattr(settings, 'CLOUDFLARE_API_TOKEN', '')

    if not all([account_id, db_id, token]):
        logger.warning('Cloudflare D1 not configured in admin settings')
        return []

    endpoint = (
        f'https://api.cloudflare.com/client/v4/accounts/{account_id}'
        f'/d1/database/{db_id}/query'
    )
    req = Request(
        endpoint,
        data=json.dumps({'sql': sql, 'params': params or []}).encode(),
        headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
        },
        method='POST',
    )
    try:
        with urlopen(req, timeout=20) as resp:
            payload = json.loads(resp.read().decode())
    except HTTPError as exc:
        detail = exc.read().decode(errors='replace')
        raise D1Error(f'Cloudflare D1 HTTP {exc.code}: {detail}') from exc
    except URLError as exc:
        raise D1Error(f'Cloudflare D1 unreachable: {exc.reason}') from exc

    if not payload.get('success'):
        raise D1Error(f'D1 query failed: {payload.get("errors")}')

    results = (payload.get('result') or [{}])
    first = results[0]
    if not first.get('success', True):
        raise D1Error(f'D1 statement failed: {first}')
    return first.get('results') or []


def get_candidates():
    try:
        _ensure_certificate_columns()
        _ensure_interview_columns()
        return _query(
            """SELECT id, timestamp, department, roles, first_name, last_name, email,
                      phone, city, linkedin, portfolio, why_join, answers, resume_name,
                      interview_status, interviewer, rating, final_decision,
                      offer_certificate_id,
                      interview_at, meeting_link, calendar_event_id, interviewer_email,
                      created_at
               FROM candidates ORDER BY id ASC"""
        )
    except D1Error as exc:
        logger.error('get_candidates failed: %s', exc)
        return None  # None signals DB error vs empty list


def _ensure_interview_columns():
    for col in ('interview_at TEXT', 'meeting_link TEXT',
                'calendar_event_id TEXT', 'interviewer_email TEXT'):
        try:
            _query(f"ALTER TABLE candidates ADD COLUMN {col}")
        except D1Error:
            pass


def set_interview(row_id, interview_at, meeting_link, calendar_event_id,
                  interviewer_email, interview_status, interviewer=''):
    """Persist interview scheduling details on a candidate row."""
    try:
        _ensure_interview_columns()
        _query(
            """UPDATE candidates
               SET interview_at=?, meeting_link=?, calendar_event_id=?, interviewer_email=?,
                   interview_status=?, interviewer=?, updated_at=?
               WHERE id=?""",
            [interview_at, meeting_link, calendar_event_id, interviewer_email,
             interview_status, interviewer,
             __import__('datetime').datetime.utcnow().isoformat(), int(row_id)],
        )
        return True
    except D1Error as exc:
        logger.error('set_interview %s failed: %s', row_id, exc)
        return False


def update_candidate(row_id, interview_status, interviewer, rating, final_decision):
    try:
        _query(
            """UPDATE candidates
               SET interview_status=?, interviewer=?, rating=?, final_decision=?, updated_at=?
               WHERE id=?""",
            [interview_status, interviewer, int(rating), final_decision,
             __import__('datetime').datetime.utcnow().isoformat(), int(row_id)],
        )
        return True
    except D1Error as exc:
        logger.error('update_candidate %s failed: %s', row_id, exc)
        return False


def _ensure_certificate_columns():
    try:
        _query("ALTER TABLE candidates ADD COLUMN offer_certificate_id TEXT")
    except D1Error:
        pass


def set_offer_certificate_id(row_id, certificate_id):
    try:
        _ensure_certificate_columns()
        _query(
            "UPDATE candidates SET offer_certificate_id=?, updated_at=? WHERE id=?",
            [certificate_id, __import__('datetime').datetime.utcnow().isoformat(), int(row_id)],
        )
        return True
    except D1Error as exc:
        logger.error('set_offer_certificate_id %s failed: %s', row_id, exc)
        return False
