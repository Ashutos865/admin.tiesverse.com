"""Where mail attachments live.

Bytes go to Cloudflare R2, never into the database — a 9 MB PDF in a SQLite row
would be read into memory on every list query that touched it. The row keeps the
key; this module moves the bytes.

Downloads are proxied through Django rather than handed out as presigned URLs.
That costs a little bandwidth and buys two things: shared-token sessions (which
have no AWS identity) work exactly like portal ones, and every download passes
the same mailbox permission check as reading the message it belongs to.
"""
import mimetypes
import re
import uuid

from career_app.providers import R2Storage

OUT_PREFIX = 'mail/attachments/out'
IN_PREFIX = 'mail/attachments/in'

# 10 MB a file, 25 MB a message. The real ceiling is SES's 40 MB raw limit, but
# base64 inflates by ~37% and recipients' servers routinely refuse anything over
# 25 MB, so a send that passes here should actually arrive.
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_TOTAL_BYTES = 25 * 1024 * 1024

_UNSAFE = re.compile(r'[^A-Za-z0-9._-]+')


def safe_filename(name, fallback='attachment'):
    """A filename safe to put in a storage key and a Content-Disposition header.

    Keeps the extension, strips path separators and anything exotic, and never
    returns an empty string.
    """
    name = (name or '').strip().replace('\\', '/').split('/')[-1]
    name = _UNSAFE.sub('_', name).strip('._')
    if not name:
        name = fallback
    return name[:180]


def guess_content_type(filename, given=''):
    given = (given or '').strip()
    if given and given != 'application/octet-stream':
        return given[:120]
    guessed, _ = mimetypes.guess_type(filename or '')
    return (guessed or 'application/octet-stream')[:120]


def build_key(filename, *, inbound=False):
    """A unique key per upload, so two people attaching `proposal.pdf` on the
    same day never collide."""
    prefix = IN_PREFIX if inbound else OUT_PREFIX
    return f'{prefix}/{uuid.uuid4().hex}/{safe_filename(filename)}'


def put(key, data, content_type='application/octet-stream'):
    R2Storage().put_object(key, data, content_type=content_type)
    return key


def get(key):
    return R2Storage().get_object(key)


def delete(key):
    """Best-effort removal. A key that cannot be deleted is a wasted object, not
    a failed request — the caller is usually already committing something more
    important than this cleanup."""
    try:
        storage = R2Storage()
        import os as _os
        storage.client().delete_object(
            Bucket=_os.environ.get('CLOUDFLARE_R2_BUCKET'), Key=key)
        return True
    except Exception:  # noqa: BLE001
        return False
