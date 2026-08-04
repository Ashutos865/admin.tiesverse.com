"""Ingest inbound mail: S3 → parsed MIME → MailMessage rows.

AWS SES receives every message addressed to *@mail.tiesverse.com (MX → receipt
rule) and writes the raw RFC 822 message into s3://<bucket>/inbox/. This module
reads those objects, parses them, files each one into the right mailbox and then
removes the S3 object — the bucket is a staging area, not storage.

Safe to run repeatedly: each object is keyed by its S3 key and the RFC Message-ID,
so a re-run can never duplicate a message. Anything it cannot parse is left in S3
(never silently dropped) so it can be inspected.
"""
import email
import re
from email import policy
from email.utils import getaddresses, parsedate_to_datetime

import boto3
from django.conf import settings
from django.utils import timezone

from . import storage
from .models import MailAttachment, MailMessage
from .services import resolve_recipient_mailbox

BUCKET = getattr(settings, 'SES_INBOUND_BUCKET', '') or 'tiesverse-portal-mail'
PREFIX = getattr(settings, 'SES_INBOUND_PREFIX', '') or 'inbox/'

# SES drops this marker when the bucket policy is first attached — not a message.
SKIP_KEYS = {'AMAZON_SES_SETUP_NOTIFICATION'}


def _client():
    return boto3.client(
        's3',
        region_name=getattr(settings, 'AWS_SES_REGION', 'ap-south-1'),
        aws_access_key_id=getattr(settings, 'AWS_SES_ACCESS_KEY_ID', ''),
        aws_secret_access_key=getattr(settings, 'AWS_SES_SECRET_ACCESS_KEY', ''),
    )


def _addresses(msg, header):
    """All bare addresses in a header, lowercased."""
    raw = msg.get_all(header, [])
    return [a.lower() for _, a in getaddresses(raw) if a]


def _body_parts(msg):
    """(text, html) — prefers the real body parts, ignores attachments."""
    text, html = '', ''
    if msg.is_multipart():
        for part in msg.walk():
            if part.is_multipart():
                continue
            disp = (part.get_content_disposition() or '')
            if disp == 'attachment':
                continue                      # collected separately by _attachments()
            ctype = part.get_content_type()
            try:
                payload = part.get_content()
            except Exception:  # noqa: BLE001 — undecodable part must not kill ingest
                continue
            if ctype == 'text/plain' and not text:
                text = payload
            elif ctype == 'text/html' and not html:
                html = payload
    else:
        try:
            payload = msg.get_content()
        except Exception:  # noqa: BLE001
            payload = ''
        if msg.get_content_type() == 'text/html':
            html = payload
        else:
            text = payload

    if not text and html:
        stripped = re.sub(r'(?is)<(script|style).*?</\1>', '', html)
        stripped = re.sub(r'(?i)<br\s*/?>', '\n', stripped)
        stripped = re.sub(r'(?i)</(p|div|tr|li|h[1-6])>', '\n', stripped)
        text = re.sub(r'\n{3,}', '\n\n', re.sub(r'<[^>]+>', '', stripped)).strip()
    return (text or '').strip(), (html or '').strip()


def _thread_key_for(in_reply_to, references, fallback):
    """Reuse the thread of the message being replied to, when we know it."""
    candidates = [c for c in [in_reply_to] + (references or []) if c]
    for cand in candidates:
        prior = MailMessage.objects.filter(message_id=cand).only('thread_key').first()
        if prior and prior.thread_key:
            return prior.thread_key
    return candidates[0] if candidates else fallback


def _attachments(msg):
    """Every attached file in a received message: [(filename, bytes, content_type)].

    Inline images that carry a filename count too — a photo pasted into a mail is
    still a file the recipient may want. A part that cannot be decoded is skipped
    rather than allowed to lose the whole message.
    """
    out = []
    if not msg.is_multipart():
        return out
    for part in msg.walk():
        if part.is_multipart():
            continue
        disp = (part.get_content_disposition() or '')
        filename = part.get_filename()
        if disp != 'attachment' and not (filename and disp == 'inline'):
            continue
        try:
            payload = part.get_payload(decode=True)
        except Exception:  # noqa: BLE001
            continue
        if not payload or len(payload) > storage.MAX_FILE_BYTES:
            continue
        out.append((filename or 'attachment', payload, part.get_content_type()))
    return out


def _store_attachments(row, msg):
    """Move a message's files into R2 and record them. Never raises: a file we
    could not store must not cost us the message it came with."""
    saved = 0
    for filename, payload, ctype in _attachments(msg):
        try:
            safe = storage.safe_filename(filename)
            key = storage.build_key(safe, inbound=True)
            storage.put(key, payload, content_type=storage.guess_content_type(safe, ctype))
            MailAttachment.objects.create(
                message=row, filename=safe, size=len(payload),
                content_type=storage.guess_content_type(safe, ctype), storage_key=key,
            )
            saved += 1
        except Exception:  # noqa: BLE001
            continue
    if saved:
        row.has_attachments = True
        row.save(update_fields=['has_attachments'])
    return saved


def ingest_object(s3, key, *, delete=True):
    """Ingest one S3 object. Returns (MailMessage|None, note)."""
    name = key.rsplit('/', 1)[-1]
    if name in SKIP_KEYS:
        if delete:
            s3.delete_object(Bucket=BUCKET, Key=key)
        return None, 'skipped SES setup marker'

    if MailMessage.objects.filter(s3_key=key).exists():
        if delete:
            s3.delete_object(Bucket=BUCKET, Key=key)
        return None, 'already ingested (s3_key)'

    raw = s3.get_object(Bucket=BUCKET, Key=key)['Body'].read()
    msg = email.message_from_bytes(raw, policy=policy.default)

    message_id = (msg.get('Message-ID') or '').strip()
    if message_id and MailMessage.objects.filter(message_id=message_id,
                                                 direction='IN').exists():
        if delete:
            s3.delete_object(Bucket=BUCKET, Key=key)
        return None, 'already ingested (message-id)'

    to_list = _addresses(msg, 'To')
    cc_list = _addresses(msg, 'Cc')
    from_list = _addresses(msg, 'From')
    mailbox = resolve_recipient_mailbox(to_list + cc_list)

    text, html = _body_parts(msg)
    subject = (msg.get('Subject') or '').strip()

    try:
        published = parsedate_to_datetime(msg.get('Date')) if msg.get('Date') else None
    except Exception:  # noqa: BLE001
        published = None
    if published is not None and timezone.is_naive(published):
        published = timezone.make_aware(published, timezone.utc)

    in_reply_to = (msg.get('In-Reply-To') or '').strip()
    references = (msg.get('References') or '').split()

    row = MailMessage.objects.create(
        mailbox=mailbox,
        direction='IN',
        peer=from_list[0] if from_list else '',
        to=to_list, cc=cc_list,
        subject=subject,
        body_text=text, body_html=html,
        snippet=(text or subject)[:300],
        message_id=message_id,
        in_reply_to=in_reply_to,
        thread_key=_thread_key_for(in_reply_to, references, message_id or key),
        status='received',
        spam_verdict=(msg.get('X-SES-Spam-Verdict') or '').strip()[:20],
        virus_verdict=(msg.get('X-SES-Virus-Verdict') or '').strip()[:20],
        s3_key=key,
        published_at=published or timezone.now(),
    )

    saved = _store_attachments(row, msg)

    if delete:
        s3.delete_object(Bucket=BUCKET, Key=key)
    note = f'→ {mailbox.address}'
    if saved:
        note += f' ({saved} attachment{"s" if saved != 1 else ""})'
    return row, note


def ingest_all(*, delete=True, limit=200):
    """Ingest every pending object. Returns a summary dict."""
    s3 = _client()
    result = {'checked': 0, 'ingested': 0, 'skipped': 0, 'errors': [], 'messages': []}

    paginator = s3.get_paginator('list_objects_v2')
    for page in paginator.paginate(Bucket=BUCKET, Prefix=PREFIX):
        for obj in page.get('Contents', []):
            key = obj['Key']
            if key.endswith('/'):
                continue
            if result['checked'] >= limit:
                return result
            result['checked'] += 1
            try:
                row, note = ingest_object(s3, key, delete=delete)
            except Exception as exc:  # noqa: BLE001 — one bad message must not stop the rest
                result['errors'].append({'key': key, 'error': str(exc)[:300]})
                continue
            if row is None:
                result['skipped'] += 1
            else:
                result['ingested'] += 1
                result['messages'].append({
                    'mailbox': row.mailbox.address, 'from': row.peer,
                    'subject': row.subject, 'note': note,
                })
    return result
