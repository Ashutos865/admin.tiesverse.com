"""One-time helper: get a Google OAuth refresh token for interview scheduling.

Run it with the admin venv, passing the OAuth *client* JSON you downloaded from
Google Cloud (Credentials → OAuth client ID → Desktop app → Download):

    venv\\Scripts\\python.exe get_google_refresh_token.py path\\to\\oauth_client.json

A browser opens — sign in as your organiser account (e.g. hello@tiesverse.com)
and grant Calendar, Sheets and Drive access. The script then prints three values;
paste them into admin/.env and restart the backend.

A token issued before Sheets was added carries Calendar only, and exporting to a
spreadsheet will report that plainly rather than half-working.
"""
import sys

# One token covers every Google feature the admin uses, so re-running this
# replaces the lot. Dropping a scope here silently disables whatever needed it,
# so add rather than swap.
SCOPES = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/meetings.space.created',   # Meet API host controls
    'https://www.googleapis.com/auth/spreadsheets',             # form responses -> Sheets
    'https://www.googleapis.com/auth/drive.file',               # create/share those sheets
]


def main():
    if len(sys.argv) < 2:
        print('Usage: python get_google_refresh_token.py <oauth_client.json>')
        sys.exit(1)

    from google_auth_oauthlib.flow import InstalledAppFlow

    flow = InstalledAppFlow.from_client_secrets_file(sys.argv[1], SCOPES)
    # access_type=offline + prompt=consent guarantees a refresh token is issued.
    creds = flow.run_local_server(port=0, access_type='offline', prompt='consent')

    if not creds.refresh_token:
        print('\nNo refresh token returned — re-run the script (it forces consent).')
        sys.exit(1)

    print('\n' + '=' * 60)
    print('Paste these into admin/.env, then restart the backend:')
    print('=' * 60)
    print(f'GOOGLE_OAUTH_CLIENT_ID={creds.client_id}')
    print(f'GOOGLE_OAUTH_CLIENT_SECRET={creds.client_secret}')
    print(f'GOOGLE_OAUTH_REFRESH_TOKEN={creds.refresh_token}')
    print('=' * 60)


if __name__ == '__main__':
    main()
