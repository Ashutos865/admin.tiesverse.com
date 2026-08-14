"""Central branded email helper for the admin backend.

Every outbound email (onboarding, credentials, certificates, password reset,
...) renders through `render_email()` for a consistent look and sends through
`send_email()`, which respects a per-purpose "enabled" flag. When a purpose is
disabled — or SES credentials are missing — the email is printed to the console
as a stub instead of being sent, so nothing goes out by accident before the
SES sender addresses are verified.
"""

from __future__ import annotations

import re

from django.conf import settings

BRAND_NAME = 'Tiesverse'
# TIES orange — matches the website, admin portal and TIES Mail.
BRAND_PRIMARY = '#fe7a00'
BRAND_PRIMARY_DARK = '#d96900'


def _text_from_html(html: str) -> str:
    """Rough plain-text fallback from HTML for the multipart alternative part."""
    text = re.sub(r'(?is)<(script|style).*?</\1>', '', html)
    text = re.sub(r'(?i)<br\s*/?>', '\n', text)
    text = re.sub(r'(?i)</(p|div|tr|h[1-6]|li)>', '\n', text)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def render_email(
    heading: str,
    paragraphs: list[str] | None = None,
    button_label: str | None = None,
    button_url: str | None = None,
    info_rows: list[tuple[str, str]] | None = None,
    footer_note: str | None = None,
    preheader: str | None = None,
    *,
    repliable: bool = False,
):
    """Return (html, text) for a branded transactional email.

    - paragraphs: body copy, each rendered as its own <p>.
    - info_rows: list of (label, value) shown in a bordered key/value box
      (used for credentials, certificate IDs, etc.).
    - button_label / button_url: optional call-to-action button.
    - repliable: automated mail says "please do not reply"; person-to-person mail
      sent from a real portal mailbox must NOT, since replies are the point.
    """
    paragraphs = paragraphs or []
    body_html = ''.join(
        f'<p style="margin:0 0 15px;font-size:15px;line-height:1.65;color:#3f3f46;">{p}</p>'
        for p in paragraphs
    )

    rows_html = ''
    if info_rows:
        cells = ''.join(
            f'<tr>'
            f'<td style="padding:6px 14px;font-size:13px;color:#6b7280;white-space:nowrap;">{label}</td>'
            f'<td style="padding:6px 14px;font-size:14px;color:#111827;font-weight:600;'
            f'font-family:ui-monospace,Menlo,Consolas,monospace;">{value}</td>'
            f'</tr>'
            for label, value in info_rows
        )
        rows_html = (
            '<table role="presentation" cellpadding="0" cellspacing="0" '
            'style="width:100%;margin:0 0 20px;border:1px solid #e5e7eb;border-radius:10px;'
            'border-collapse:separate;overflow:hidden;background:#f9fafb;">'
            f'{cells}</table>'
        )

    button_html = ''
    if button_label and button_url:
        button_html = (
            f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">'
            f'<tr><td style="border-radius:10px;background:#0d0d0d;">'
            f'<a href="{button_url}" target="_blank" '
            f'style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;'
            f'color:#ffffff;text-decoration:none;border-radius:10px;">{button_label}</a>'
            f'</td></tr></table>'
            f'<p style="margin:0 0 16px;font-size:12px;color:#9ca3af;word-break:break-all;">'
            f'If the button does not work, copy this link into your browser:<br>{button_url}</p>'
        )

    footer_html = ''
    if footer_note:
        footer_html = (
            f'<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#9ca3af;">{footer_note}</p>'
        )

    preheader_html = ''
    if preheader:
        preheader_html = (
            f'<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{preheader}</div>'
        )

    _footer_line = (
        f'© {BRAND_NAME}'
        if repliable
        else f'© {BRAND_NAME}. This is an automated message, please do not reply.'
    )

    html = f"""\
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f6f6f7;">
{preheader_html}
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f6f6f7;padding:36px 12px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e8e8ea;">
<tr><td style="background:#0d0d0d;padding:26px 32px;">
<span style="font-size:19px;font-weight:700;color:#ffffff;letter-spacing:-.01em;">.ties<span style="color:{BRAND_PRIMARY};">verse</span></span>
</td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 18px;font-size:21px;font-weight:700;color:#0d0d0d;letter-spacing:-.01em;">{heading}</h1>
{body_html}
{rows_html}
{button_html}
{footer_html}
</td></tr>
<tr><td style="padding:18px 32px;background:#fafafa;border-top:1px solid #eeeef0;">
<p style="margin:0;font-size:12px;color:#9ca3af;">{_footer_line}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""

    return html, _text_from_html(html)


def render_personal_email(body_text: str, sender_name: str = '', sender_address: str = '',
                          body_html: str = ''):
    """Return (html, text) for a person-to-person message sent from a TIES Mail
    mailbox.

    Deliberately NOT the transactional template: a message someone typed should
    read like a normal email, not a system notice. No header banner, no card, no
    "do not reply" — just the text, then a small signature rule identifying the
    sender and the organisation.
    """
    body_text = body_text or ''
    if body_html:
        # Already formatted by the composer and cleaned by mail_app.sanitize.
        # Wrapped rather than rebuilt, so the sender's own formatting survives.
        paragraphs = (
            '<div style="font-size:15px;line-height:1.65;color:#1f2937;">'
            f'{body_html}</div>'
        )
    else:
        paragraphs = ''.join(
            '<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#1f2937;">'
            f'{_escape(line)}</p>'
            for line in body_text.split('\n') if line.strip()
        ) or '<p style="margin:0;">&nbsp;</p>'

    who = _escape(sender_name.strip()) if sender_name else ''
    addr = _escape(sender_address.strip()) if sender_address else ''
    sig_bits = []
    if who:
        sig_bits.append(f'<span style="font-weight:600;color:#374151;">{who}</span>')
    sig_bits.append(f'<span style="color:{BRAND_PRIMARY};font-weight:600;">{BRAND_NAME}</span>')
    signature = (
        '<div style="margin-top:26px;padding-top:14px;border-top:1px solid #e5e7eb;'
        'font-size:12.5px;line-height:1.6;color:#9ca3af;">'
        + ' · '.join(sig_bits)
        + (f'<br><a href="mailto:{addr}" style="color:#9ca3af;text-decoration:none;">{addr}</a>'
           if addr else '')
        + '</div>'
    )

    html = f"""\
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="max-width:620px;margin:0 auto;padding:24px 20px;
     font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
{paragraphs}
{signature}
</div>
</body>
</html>"""

    text = body_text.rstrip()
    if who or addr:
        text += '\n\n--\n' + ' · '.join(filter(None, [sender_name.strip(), BRAND_NAME]))
        if addr:
            text += f'\n{sender_address.strip()}'
    return html, text


def _escape(s: str) -> str:
    return (str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


def list_ses_senders():
    """Return {emails, domains, default} of SES-verified identities so the UI can
    offer valid 'from' addresses. Any address under a verified domain also works."""
    payload = {'emails': [], 'domains': [], 'default': getattr(settings, 'SES_FROM_EMAIL', '')}
    try:
        import boto3
        client = boto3.client(
            'ses', region_name=getattr(settings, 'AWS_SES_REGION', 'ap-south-1'),
            aws_access_key_id=getattr(settings, 'AWS_SES_ACCESS_KEY_ID', ''),
            aws_secret_access_key=getattr(settings, 'AWS_SES_SECRET_ACCESS_KEY', ''),
        )
        ids = client.list_identities().get('Identities', [])
        attrs = (client.get_identity_verification_attributes(Identities=ids)
                 .get('VerificationAttributes', {}) if ids else {})
        for i in ids:
            if attrs.get(i, {}).get('VerificationStatus') != 'Success':
                continue
            (payload['emails'] if '@' in i else payload['domains']).append(i)
        payload['emails'].sort()
        payload['domains'].sort()
    except Exception as exc:  # noqa: BLE001
        payload['error'] = str(exc)
    return payload


def verified_sender_domains():
    """Domains under which any alias is a valid SES sender — used to validate a
    custom 'from' address without an SES round-trip on every send. Falls back to
    the configured sender domains when a live SES lookup isn't available."""
    domains = set()
    for addr in (getattr(settings, 'SES_FROM_EMAIL', ''), getattr(settings, 'SES_CAREERS_FROM_EMAIL', '')):
        if '@' in (addr or ''):
            domains.add(addr.split('@', 1)[1].lower())
    return domains


def _attachment_part(filename: str, data: bytes, subtype: str = ''):
    """Build one attachment part with its REAL content type.

    Callers pass either a bare subtype ('pdf') or a full type ('image/jpeg').
    Both used to be forced through MIMEApplication, which turned image/jpeg into
    "application/jpeg" and text/plain into "application/plain" — types that do
    not exist. Mail filters read a malformed Content-Type as a sign the sender
    is not a real mail client, and receivers cannot preview the file inline.

    A full type from the caller wins — the browser knows what it read off the
    file. Otherwise the extension decides, because a caller may pass only a bare
    subtype or nothing at all. (The extension is not consulted first: Windows
    registers .zip as the legacy "application/x-zip-compressed", so trusting the
    OS over an explicit "application/zip" would downgrade it.)
    """
    import mimetypes
    from email.mime.application import MIMEApplication
    from email.mime.audio import MIMEAudio
    from email.mime.image import MIMEImage

    raw = (subtype or '').strip().lower()
    ctype = raw if '/' in raw else ''
    if not ctype:
        ctype = mimetypes.guess_type(filename or '')[0] or ''
    if not ctype and raw:
        ctype = f'application/{raw}'
    if not ctype or '/' not in ctype:
        ctype = 'application/octet-stream'

    main, sub = ctype.split('/', 1)
    try:
        if main == 'image':
            part = MIMEImage(data, _subtype=sub)
        elif main == 'audio':
            part = MIMEAudio(data, _subtype=sub)
        elif main == 'text':
            # Text parts must declare a charset or non-ASCII filenames and
            # contents arrive mangled.
            from email.mime.text import MIMEText as _MT
            part = _MT(data.decode('utf-8', 'replace'), _subtype=sub, _charset='utf-8')
        else:
            part = MIMEApplication(data, _subtype=sub)
    except Exception:  # noqa: BLE001 — a bad guess must never lose the file
        part = MIMEApplication(data, _subtype='octet-stream')

    part.add_header('Content-Disposition', 'attachment', filename=filename)
    return part


def send_email(
    to: str,
    subject: str,
    html_body: str,
    text_body: str | None = None,
    from_email: str | None = None,
    attachments: list[tuple[str, bytes, str]] | None = None,
    enabled: bool = True,
    detailed: bool = False,
    *,
    reply_to: str | None = None,
    cc: list[str] | None = None,
    bcc: list[str] | None = None,
    headers: dict[str, str] | None = None,
    configuration_set: str | None = None,
):
    """Send one email via AWS SES.

    With detailed=True returns {'ok', 'message_id', 'error'} so callers can log
    the SES MessageId (for bounce matching) and the failure reason per recipient.
    Otherwise returns a bool.

    Returns True if actually sent, False if stubbed (disabled or no creds) or if
    sending soft-failed. Never raises for a missing config — callers can email
    without guarding every call. attachments: list of (filename, bytes, subtype).

    Keyword-only extras (added for TIES Mail; every pre-existing caller keeps its
    exact behaviour because they all default to None):
      reply_to          — sets the Reply-To header so replies reach a real mailbox.
      cc                — extra recipients; they receive the mail AND appear in Cc.
      headers           — arbitrary extra headers, e.g. a self-issued Message-ID
                          (needed for reply threading — SES's returned MessageId is
                          NOT the RFC 5322 Message-ID header).
      configuration_set — SES configuration set, so person-to-person portal mail
                          can be tracked/reputation-isolated from transactional mail.
    """
    from_addr = from_email or getattr(settings, 'SES_FROM_EMAIL', 'noreply@tiesverse.com')
    has_creds = bool(
        getattr(settings, 'AWS_SES_ACCESS_KEY_ID', '')
        and getattr(settings, 'AWS_SES_SECRET_ACCESS_KEY', '')
    )

    def _ret(ok, message_id='', error=''):
        return {'ok': ok, 'message_id': message_id, 'error': error} if detailed else ok

    if not (enabled and has_creds and to):
        reason = 'disabled' if not enabled else ('no-SES-creds' if not has_creds else 'no-recipient')
        print(f"[EMAIL STUB:{reason}] to={to!r} subject={subject!r} from={from_addr!r}")
        return _ret(False, error=reason)

    try:
        import boto3
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText
        from email.mime.application import MIMEApplication

        from email.utils import formatdate

        msg = MIMEMultipart('mixed')
        msg['Subject'] = subject
        msg['From'] = from_addr
        msg['To'] = to
        # RFC 5322 requires Date. Without it a message reads as machine-generated
        # to filters, and some clients show the delivery time instead of the
        # send time. SES does add one, but only after its own checks have run.
        msg['Date'] = formatdate(localtime=True)
        cc_list = [a for a in (cc or []) if a]
        if cc_list:
            msg['Cc'] = ', '.join(cc_list)
        # Bcc reaches SES through Destinations only. Writing it as a header would
        # show every blind recipient to everyone else — the one mistake blind
        # copy exists to prevent.
        bcc_list = [a for a in (bcc or []) if a]
        if reply_to:
            msg['Reply-To'] = reply_to
        for key, value in (headers or {}).items():
            if key.lower() in ('subject', 'from', 'to', 'cc'):
                continue                       # never let extras clobber the envelope
            del msg[key]                       # avoid duplicate headers on re-set
            msg[key] = value

        alt = MIMEMultipart('alternative')
        alt.attach(MIMEText(text_body or _text_from_html(html_body), 'plain', 'utf-8'))
        alt.attach(MIMEText(html_body, 'html', 'utf-8'))
        msg.attach(alt)

        for filename, data, subtype in (attachments or []):
            part = _attachment_part(filename, data, subtype)
            msg.attach(part)

        client = boto3.client(
            'ses',
            region_name=getattr(settings, 'AWS_SES_REGION', 'ap-south-1'),
            aws_access_key_id=settings.AWS_SES_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SES_SECRET_ACCESS_KEY,
        )
        send_kwargs = {
            'Source': from_addr,
            'Destinations': [to] + cc_list + bcc_list,
            'RawMessage': {'Data': msg.as_string()},
        }
        if configuration_set:
            send_kwargs['ConfigurationSetName'] = configuration_set
        resp = client.send_raw_email(**send_kwargs)
        return _ret(True, message_id=(resp or {}).get('MessageId', ''))
    except Exception as exc:  # noqa: BLE001 — email must never break the request
        print(f"[EMAIL ERROR] to={to!r} subject={subject!r}: {exc}")
        return _ret(False, error=str(exc)[:400])
