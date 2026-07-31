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
BRAND_PRIMARY = '#4338ca'
BRAND_PRIMARY_DARK = '#3730a3'


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
        f'<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">{p}</p>'
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
            f'<tr><td style="border-radius:10px;background:{BRAND_PRIMARY};">'
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
        else f'© {BRAND_NAME}. This is an automated message — please do not reply.'
    )

    html = f"""\
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f3f4f6;">
{preheader_html}
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f3f4f6;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
<tr><td style="background:linear-gradient(135deg,{BRAND_PRIMARY},{BRAND_PRIMARY_DARK});padding:24px 32px;">
<span style="font-size:18px;font-weight:800;color:#ffffff;letter-spacing:.02em;">{BRAND_NAME}</span>
</td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 20px;font-size:20px;font-weight:800;color:#111827;">{heading}</h1>
{body_html}
{rows_html}
{button_html}
{footer_html}
</td></tr>
<tr><td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #eef0f3;">
<p style="margin:0;font-size:12px;color:#9ca3af;">{_footer_line}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""

    return html, _text_from_html(html)


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

        msg = MIMEMultipart('mixed')
        msg['Subject'] = subject
        msg['From'] = from_addr
        msg['To'] = to
        cc_list = [a for a in (cc or []) if a]
        if cc_list:
            msg['Cc'] = ', '.join(cc_list)
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
            part = MIMEApplication(data, _subtype=subtype)
            part.add_header('Content-Disposition', 'attachment', filename=filename)
            msg.attach(part)

        client = boto3.client(
            'ses',
            region_name=getattr(settings, 'AWS_SES_REGION', 'ap-south-1'),
            aws_access_key_id=settings.AWS_SES_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SES_SECRET_ACCESS_KEY,
        )
        send_kwargs = {
            'Source': from_addr,
            'Destinations': [to] + cc_list,
            'RawMessage': {'Data': msg.as_string()},
        }
        if configuration_set:
            send_kwargs['ConfigurationSetName'] = configuration_set
        resp = client.send_raw_email(**send_kwargs)
        return _ret(True, message_id=(resp or {}).get('MessageId', ''))
    except Exception as exc:  # noqa: BLE001 — email must never break the request
        print(f"[EMAIL ERROR] to={to!r} subject={subject!r}: {exc}")
        return _ret(False, error=str(exc)[:400])
