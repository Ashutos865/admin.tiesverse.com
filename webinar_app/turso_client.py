import json
import logging
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings

logger = logging.getLogger(__name__)
_schema_ready = False


class TursoError(RuntimeError):
    pass


def _get_config():
    url = getattr(settings, 'TURSO_DATABASE_URL', '').rstrip('/')
    token = getattr(settings, 'TURSO_AUTH_TOKEN', '')
    return url, token


def is_configured():
    url, token = _get_config()
    return bool(url and token)


def execute(sql, params=None):
    """Run a single SQL statement. Returns rows as list of dicts."""
    url, token = _get_config()
    if not url or not token:
        logger.warning('Turso not configured — TURSO_DATABASE_URL / TURSO_AUTH_TOKEN missing')
        return []

    stmt = {'sql': sql}
    if params:
        stmt['named_args'] = [{'name': k, 'value': {'type': 'text', 'value': str(v)}} for k, v in params.items()]

    payload = json.dumps({
        'requests': [
            {'type': 'execute', 'stmt': stmt},
            {'type': 'close'},
        ]
    }).encode()

    req = Request(
        f'{url}/v2/pipeline',
        data=payload,
        headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
        },
        method='POST',
    )
    try:
        with urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read().decode())
    except HTTPError as exc:
        detail = exc.read().decode(errors='replace')
        raise TursoError(f'Turso HTTP {exc.code}: {detail}') from exc
    except URLError as exc:
        raise TursoError(f'Turso unreachable: {exc.reason}') from exc

    result = body.get('results', [{}])[0]
    if result.get('type') == 'error':
        raise TursoError(f"Turso query error: {result.get('error')}")

    rows = result.get('response', {}).get('result', {}).get('rows', [])
    cols = [c['name'] for c in result.get('response', {}).get('result', {}).get('cols', [])]
    return [dict(zip(cols, [cell.get('value') for cell in row])) for row in rows]


def setup_tables():
    """Create/migrate registrations table."""
    global _schema_ready
    if _schema_ready:
        return

    execute("""
        CREATE TABLE IF NOT EXISTS registrations (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id            TEXT,
            event_title         TEXT NOT NULL,
            event_type          TEXT DEFAULT 'event',
            event_date          TEXT,
            name                TEXT NOT NULL,
            email               TEXT NOT NULL,
            phone               TEXT,
            city                TEXT,
            registered_at       TEXT NOT NULL,
            email_sent          INTEGER DEFAULT 0,
            payment_required    INTEGER DEFAULT 0,
            amount              INTEGER DEFAULT 0,
            razorpay_order_id   TEXT,
            razorpay_payment_id TEXT,
            payment_status      TEXT DEFAULT 'free',
            coupon_code         TEXT,
            discount_amount     INTEGER DEFAULT 0,
            final_amount        INTEGER DEFAULT 0,
            coupon_redeemed     INTEGER DEFAULT 0
        )
    """)
    existing_columns = {
        row.get('name')
        for row in execute('PRAGMA table_info(registrations)')
    }

    # Add columns only when absent; this avoids one hosted request per existing
    # column every time a worker starts.
    for col, definition in [
        ('event_date',          'TEXT'),
        ('payment_required',    'INTEGER DEFAULT 0'),
        ('amount',              'INTEGER DEFAULT 0'),
        ('razorpay_order_id',   'TEXT'),
        ('razorpay_payment_id', 'TEXT'),
        ('payment_status',      "TEXT DEFAULT 'free'"),
        ('coupon_code',         'TEXT'),
        ('discount_amount',     'INTEGER DEFAULT 0'),
        ('final_amount',        'INTEGER DEFAULT 0'),
        ('coupon_redeemed',     'INTEGER DEFAULT 0'),
        ('attended',            'INTEGER DEFAULT 0'),
        ('role',                'TEXT'),
        ('organization',        'TEXT'),
        ('country',             'TEXT'),
        ('source',              'TEXT'),
        ('expectations',        'TEXT'),
        ('speaker_question',    'TEXT'),
    ]:
        if col in existing_columns:
            continue
        try:
            execute(f'ALTER TABLE registrations ADD COLUMN {col} {definition}')
        except TursoError:
            pass  # column already exists

    execute(
        'CREATE INDEX IF NOT EXISTS idx_registrations_event '
        'ON registrations(event_type, event_id)'
    )
    execute(
        'CREATE INDEX IF NOT EXISTS idx_registrations_registered_at '
        'ON registrations(registered_at DESC)'
    )
    execute("""
        CREATE TABLE IF NOT EXISTS coupons (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            code                TEXT NOT NULL UNIQUE COLLATE NOCASE,
            event_id            TEXT NOT NULL,
            event_title         TEXT NOT NULL,
            event_type          TEXT NOT NULL,
            discount_type       TEXT NOT NULL DEFAULT 'percent',
            discount_value      REAL NOT NULL,
            starts_at           TEXT,
            expires_at          TEXT,
            max_redemptions     INTEGER,
            redeemed_count      INTEGER NOT NULL DEFAULT 0,
            active              INTEGER NOT NULL DEFAULT 1,
            created_at          TEXT NOT NULL,
            updated_at          TEXT NOT NULL
        )
    """)
    execute(
        'CREATE INDEX IF NOT EXISTS idx_coupons_target '
        'ON coupons(event_type, event_id, active)'
    )
    execute("""
        CREATE TABLE IF NOT EXISTS certificate_records (
            id                  TEXT PRIMARY KEY,
            certificate_id      TEXT NOT NULL UNIQUE,
            source_type         TEXT NOT NULL,
            source_ref          TEXT NOT NULL,
            person_name         TEXT NOT NULL,
            person_email        TEXT NOT NULL DEFAULT '',
            subject_title       TEXT NOT NULL,
            template_id         TEXT NOT NULL,
            template_name       TEXT NOT NULL,
            data_json           TEXT NOT NULL DEFAULT '{}',
            email_status        TEXT NOT NULL DEFAULT 'not_sent',
            created_at          TEXT NOT NULL,
            updated_at          TEXT NOT NULL,
            UNIQUE(source_type, source_ref, template_id)
        )
    """)
    execute(
        'CREATE INDEX IF NOT EXISTS idx_certificate_records_created '
        'ON certificate_records(created_at DESC)'
    )
    execute(
        'CREATE INDEX IF NOT EXISTS idx_certificate_records_template '
        'ON certificate_records(template_id, source_type)'
    )
    _schema_ready = True
