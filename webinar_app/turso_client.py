import json
import logging
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings

logger = logging.getLogger(__name__)


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
    """Create registrations table if it doesn't exist yet."""
    execute("""
        CREATE TABLE IF NOT EXISTS registrations (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id    TEXT,
            event_title TEXT NOT NULL,
            event_type  TEXT DEFAULT 'event',
            name        TEXT NOT NULL,
            email       TEXT NOT NULL,
            phone       TEXT,
            city        TEXT,
            registered_at TEXT NOT NULL,
            email_sent  INTEGER DEFAULT 0
        )
    """)
