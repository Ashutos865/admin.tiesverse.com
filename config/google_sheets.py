"""Mirror form responses into a Google Sheet.

Reuses the OAuth refresh token already configured for Calendar, so there is no
second credential to manage. That token must be re-issued with the Sheets and
Drive scopes before any of this works (see get_google_refresh_token.py) -
`is_configured()` reports honestly rather than failing at the first API call.

The sheet is a mirror, not the record: the database stays authoritative and a
sheet can be deleted or rewritten without losing a response. Every write is
therefore a full rebuild of the tab, which also means a form whose questions
changed does not end up with answers under the wrong headers.
"""
import logging

from django.conf import settings

logger = logging.getLogger(__name__)

# Sheets to write the values, Drive to create the file and share it.
SHEETS_SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file',
]


def is_configured():
    return bool(
        getattr(settings, 'GOOGLE_OAUTH_CLIENT_ID', '')
        and getattr(settings, 'GOOGLE_OAUTH_CLIENT_SECRET', '')
        and getattr(settings, 'GOOGLE_OAUTH_REFRESH_TOKEN', '')
    )


def _credentials():
    if not is_configured():
        return None
    from google.oauth2.credentials import Credentials
    return Credentials(
        token=None,
        refresh_token=settings.GOOGLE_OAUTH_REFRESH_TOKEN,
        client_id=settings.GOOGLE_OAUTH_CLIENT_ID,
        client_secret=settings.GOOGLE_OAUTH_CLIENT_SECRET,
        token_uri='https://oauth2.googleapis.com/token',
        scopes=SHEETS_SCOPES,
    )


class SheetsError(RuntimeError):
    """Raised with a message an operator can act on."""


def _service(name, version):
    """Build an API client, raising SheetsError with a readable message.

    The token refresh happens here, so a refresh token that never carried the
    Sheets scope fails at this point rather than at the API call - which is why
    the translation has to wrap the build, not just the request.
    """
    creds = _credentials()
    if creds is None:
        return None
    from googleapiclient.discovery import build
    try:
        return build(name, version, credentials=creds, cache_discovery=False)
    except Exception as exc:  # noqa: BLE001
        raise SheetsError(_readable(exc)) from exc


def _readable(exc):
    """Turn a Google API error into something worth showing a person."""
    text = str(exc)
    lowered = text.lower()
    # Google reports a missing scope two different ways: `invalid_scope` when
    # the stored refresh token never had it, and `insufficient`/
    # ACCESS_TOKEN_SCOPE_INSUFFICIENT when the call itself is refused. Both mean
    # the same thing to whoever has to fix it.
    if ('invalid_scope' in lowered or 'insufficient' in lowered
            or 'ACCESS_TOKEN_SCOPE' in text):
        return ('Google has not granted Sheets access to this account yet. '
                'Someone with server access needs to re-run '
                'get_google_refresh_token.py, approve Sheets and Drive when the '
                'browser asks, and update GOOGLE_OAUTH_REFRESH_TOKEN in the '
                'admin .env. Everything else here keeps working meanwhile.')
    if 'notFound' in text or '404' in text:
        return 'That spreadsheet could not be found. Check the link, or let the admin create a new one.'
    if 'permission' in text.lower() or '403' in text:
        return 'The Tiesverse Google account cannot edit that spreadsheet. Share it with edit access, or create a new one here.'
    return text[:300]


def create_spreadsheet(title):
    """Make a new spreadsheet and return {id, url}."""
    svc = _service('sheets', 'v4')
    if svc is None:
        raise SheetsError('Google is not configured on the server.')
    try:
        created = svc.spreadsheets().create(
            body={'properties': {'title': title[:120] or 'Form responses'}},
            fields='spreadsheetId,spreadsheetUrl',
        ).execute()
    except Exception as exc:  # noqa: BLE001
        raise SheetsError(_readable(exc)) from exc
    return {'id': created['spreadsheetId'], 'url': created['spreadsheetUrl']}


def share_with(spreadsheet_id, email, role='writer'):
    """Give a person access to a sheet this account owns. Best effort: a sheet
    that cannot be shared is still a working sheet for whoever owns it."""
    svc = _service('drive', 'v3')
    if svc is None or not email:
        return False
    try:
        svc.permissions().create(
            fileId=spreadsheet_id,
            body={'type': 'user', 'role': role, 'emailAddress': email},
            sendNotificationEmail=False,
        ).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning('Sheet share with %s failed: %s', email, exc)
        return False


def sheet_id_from_url(url):
    """Accept a full Sheets URL or a bare id."""
    import re
    s = str(url or '').strip()
    if not s:
        return ''
    m = re.search(r'/spreadsheets/d/([a-zA-Z0-9_-]{20,})', s)
    if m:
        return m.group(1)
    return s if re.fullmatch(r'[a-zA-Z0-9_-]{20,}', s) else ''


def write_rows(spreadsheet_id, header, rows):
    """Replace the first tab's contents with `header` + `rows`.

    A full rewrite rather than an append: appending assumes the columns never
    move, and a form's questions change more often than anyone expects.
    """
    svc = _service('sheets', 'v4')
    if svc is None:
        raise SheetsError('Google is not configured on the server.')
    values = [header] + rows
    try:
        svc.spreadsheets().values().clear(
            spreadsheetId=spreadsheet_id, range='A:ZZ', body={}).execute()
        svc.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range='A1',
            valueInputOption='RAW',
            body={'values': values},
        ).execute()
    except Exception as exc:  # noqa: BLE001
        raise SheetsError(_readable(exc)) from exc
    return len(rows)
