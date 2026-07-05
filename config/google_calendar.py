"""Google Calendar interview scheduling via OAuth 2.0 user credentials.

We use OAuth (a refresh token for one organiser account) rather than a
service-account key, because Google Workspace "secure by default" blocks
service-account key creation.

Setup (one-time, on the Google side):
  1. Google Cloud Console → create a project → enable "Google Calendar API".
  2. OAuth consent screen → User type "Internal" → add scope
        https://www.googleapis.com/auth/calendar.events
  3. Credentials → Create OAuth client ID → Application type "Desktop app"
     → download the client JSON (this download is allowed; only SA keys are blocked).
  4. Run once, signing in as the organiser (e.g. hello@tiesverse.com):
        python get_google_refresh_token.py <downloaded_client.json>
     Copy the printed values into the backend .env:
        GOOGLE_OAUTH_CLIENT_ID=...
        GOOGLE_OAUTH_CLIENT_SECRET=...
        GOOGLE_OAUTH_REFRESH_TOKEN=...

Events are created on the organiser's calendar; attendees get real Meet invites.
"""
import datetime

from django.conf import settings

SCOPES = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/meetings.space.created',   # Meet API host controls (Phase C)
]


def _join_access_to_meet(join_access):
    return {'open': 'OPEN', 'org': 'TRUSTED', 'invited': 'RESTRICTED'}.get(str(join_access or 'invited'), 'RESTRICTED')


def create_meet_space(*, access_type='RESTRICTED', moderation=True, auto_record=False):
    """Create a configured Google Meet space via the Meet API (host controls).
    Returns {name, uri, code} or None if the Meet API isn't available/authorized."""
    creds = _credentials()
    if creds is None:
        return None
    try:
        from googleapiclient.discovery import build
        svc = build('meet', 'v2', credentials=creds, cache_discovery=False)
        config = {'accessType': access_type, 'entryPointAccess': 'ALL'}
        if moderation:
            config['moderation'] = 'ON'
            config['moderationRestrictions'] = {
                'chatRestriction': 'HOSTS_ONLY',
                'presentRestriction': 'HOSTS_ONLY',
                'defaultJoinAsViewerType': 'ON',
            }
        else:
            config['moderation'] = 'OFF'
        if auto_record:
            config['artifactConfig'] = {'recordingConfig': {'autoRecordingGeneration': 'ON'}}
        space = svc.spaces().create(body={'config': config}).execute()
        return {'name': space.get('name', ''), 'uri': space.get('meetingUri', ''), 'code': space.get('meetingCode', '')}
    except Exception:  # noqa: BLE001 — Meet API not enabled / scope not granted yet
        return None


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
        scopes=SCOPES,
    )


def create_event(*, summary, description, start_iso, duration_min, attendees,
                 guests_can_see_other_guests=True, request_id_prefix='ties', meet_uri=None):
    """Create a Calendar event and invite attendees. If `meet_uri` is given (a
    pre-configured Meet space), that link is used; otherwise Calendar auto-creates
    a Meet link. Returns {meet_link, event_id, html_link}."""
    creds = _credentials()
    if creds is None:
        raise RuntimeError('Google Calendar is not configured on the server.')

    from googleapiclient.discovery import build

    tz = getattr(settings, 'GOOGLE_CAL_TIMEZONE', 'Asia/Kolkata')
    start = datetime.datetime.fromisoformat(str(start_iso))
    end = start + datetime.timedelta(minutes=int(duration_min or 30))

    body = {
        'summary': summary,
        'description': (description or '') + (f'\n\nJoin: {meet_uri}' if meet_uri else ''),
        'start': {'dateTime': start.isoformat(), 'timeZone': tz},
        'end': {'dateTime': end.isoformat(), 'timeZone': tz},
        'attendees': [{'email': e} for e in attendees if e],
        'guestsCanSeeOtherGuests': bool(guests_can_see_other_guests),
        'guestsCanInviteOthers': False,
        'reminders': {'useDefault': True},
    }
    conf_version = 0
    if meet_uri:
        body['location'] = meet_uri
    else:
        body['conferenceData'] = {
            'createRequest': {
                'requestId': f'{request_id_prefix}-{int(start.timestamp())}',
                'conferenceSolutionKey': {'type': 'hangoutsMeet'},
            }
        }
        conf_version = 1

    service = build('calendar', 'v3', credentials=creds, cache_discovery=False)
    event = service.events().insert(
        calendarId='primary',
        body=body,
        conferenceDataVersion=conf_version,
        sendUpdates='all',
    ).execute()

    if meet_uri:
        meet = meet_uri
    else:
        meet = ''
        for ep in (event.get('conferenceData', {}).get('entryPoints') or []):
            if ep.get('entryPointType') == 'video':
                meet = ep.get('uri', '')
                break
        meet = meet or event.get('hangoutLink', '')
    return {'meet_link': meet, 'event_id': event.get('id', ''), 'html_link': event.get('htmlLink', '')}


def create_interview_event(*, summary, description, start_iso, duration_min, attendees):
    """Interview scheduling — guests (candidate/interviewer) may see each other."""
    return create_event(
        summary=summary, description=description, start_iso=start_iso,
        duration_min=duration_min, attendees=attendees,
        guests_can_see_other_guests=True, request_id_prefix='ties-int',
    )


def apply_meet_controls(event_obj):
    """Apply Meet host controls (moderation, join access, recording) to a webinar's
    meeting. Implemented in Phase C via the Meet API; no-op until then."""
    return False


def get_event_guests(event_id):
    """Return {attendees, guests_can_see_other_guests, html_link} for an event, or None."""
    creds = _credentials()
    if creds is None or not event_id:
        return None
    try:
        from googleapiclient.discovery import build
        svc = build('calendar', 'v3', credentials=creds, cache_discovery=False)
        ev = svc.events().get(calendarId='primary', eventId=event_id).execute()
        return {
            'attendees': [
                {'email': a.get('email', ''), 'status': a.get('responseStatus', 'needsAction'),
                 'organizer': bool(a.get('organizer'))}
                for a in (ev.get('attendees') or [])
            ],
            'guests_can_see_other_guests': bool(ev.get('guestsCanSeeOtherGuests', False)),
            'html_link': ev.get('htmlLink', ''),
        }
    except Exception:  # noqa: BLE001
        return None


def add_guest(event_id, email, send_update=True):
    """Add one attendee (paid registrant) to an existing event and email them.
    Returns True on success. Never raises."""
    if not (event_id and email):
        return False
    creds = _credentials()
    if creds is None:
        return False
    try:
        from googleapiclient.discovery import build
        service = build('calendar', 'v3', credentials=creds, cache_discovery=False)
        ev = service.events().get(calendarId='primary', eventId=event_id).execute()
        attendees = ev.get('attendees', []) or []
        if any((a.get('email', '').lower() == email.lower()) for a in attendees):
            return True  # already invited
        attendees.append({'email': email})
        service.events().patch(
            calendarId='primary', eventId=event_id,
            body={'attendees': attendees},
            sendUpdates='all' if send_update else 'none',
        ).execute()
        return True
    except Exception:  # noqa: BLE001
        return False
