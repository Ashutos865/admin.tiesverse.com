"""Admin-managed email templates.

Each send point maps to one `EmailTemplate` row. Admins edit friendly, structured
content (`content_json`) in the visual editor; `body_html` is regenerated from it
by `render_content()` on every save. `send_template_email()` is the single sender
every call site now uses - it fills {{tokens}} and applies the template's subject,
sender, enabled flag, and attachment rule.

content_json shape:
    {
      "heading":   "Reset your password",
      "body":      "Hi {{name}},\n\nWe received a request...",   # blank line = new paragraph
      "table":     [{"label": "Role", "value": "{{role}}"}, ...],
      "closing":   "Some text after the table.",
      "button":    {"label": "Reset Password", "url": "{{reset_url}}"},
      "signature": "Warm regards,\nTiesverse HR Team\ncareers@tiesverse.com"
    }
"""

from __future__ import annotations

import re

from django.conf import settings

BRAND_PRIMARY = '#4338ca'
BRAND_PRIMARY_DARK = '#3730a3'


def _paragraphs(text):
    """Blank-line-separated blocks -> <p>; single newlines -> <br>."""
    out = []
    for block in re.split(r'\n\s*\n', (text or '').strip()):
        block = block.strip()
        if block:
            out.append(
                '<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">'
                + block.replace('\n', '<br>') + '</p>'
            )
    return ''.join(out)


def render_content(content):
    """Turn structured content into branded HTML (with {{tokens}} still in place)."""
    content = content or {}
    parts = []

    heading = (content.get('heading') or '').strip()
    if heading:
        parts.append(
            f'<h1 style="margin:0 0 20px;font-size:20px;font-weight:800;color:#111827;">{heading}</h1>'
        )

    parts.append(_paragraphs(content.get('body')))

    table = content.get('table') or []
    rows = [r for r in table if (r.get('label') or r.get('value'))]
    if rows:
        cells = ''.join(
            f'<tr>'
            f'<td style="padding:9px 14px;font-size:13px;color:#6b7280;font-weight:600;'
            f'background:#f9fafb;width:42%;">{r.get("label", "")}</td>'
            f'<td style="padding:9px 14px;font-size:14px;color:#111827;font-weight:600;">'
            f'{r.get("value", "")}</td></tr>'
            for r in rows
        )
        parts.append(
            '<table role="presentation" cellpadding="0" cellspacing="0" '
            'style="width:100%;margin:0 0 20px;border:1px solid #e5e7eb;border-radius:10px;'
            'border-collapse:separate;overflow:hidden;">' + cells + '</table>'
        )

    parts.append(_paragraphs(content.get('closing')))

    button = content.get('button') or {}
    if button.get('label') and button.get('url'):
        parts.append(
            f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">'
            f'<tr><td style="border-radius:10px;background:{BRAND_PRIMARY};">'
            f'<a href="{button["url"]}" target="_blank" style="display:inline-block;padding:12px 28px;'
            f'font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">'
            f'{button["label"]}</a></td></tr></table>'
        )

    sig = (content.get('signature') or '').strip()
    if sig:
        lines = []
        for ln in sig.split('\n'):
            if '@' in ln and '.' in ln:
                lines.append(f'<span style="color:#9ca3af;font-size:13px;">{ln}</span>')
            elif lines and not lines[-1].endswith('>'):
                lines.append(f'<strong>{ln}</strong>')
            else:
                lines.append(ln)
        parts.append(
            '<p style="margin:20px 0 0;font-size:15px;line-height:1.6;color:#374151;">'
            + '<br>'.join(lines) + '</p>'
        )

    inner = ''.join(p for p in parts if p)
    return f"""\
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f3f4f6;">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f3f4f6;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
<tr><td style="background:linear-gradient(135deg,{BRAND_PRIMARY},{BRAND_PRIMARY_DARK});padding:24px 32px;">
<span style="font-size:18px;font-weight:800;color:#ffffff;letter-spacing:.02em;">Tiesverse</span>
</td></tr>
<tr><td style="padding:32px;">{inner}</td></tr>
<tr><td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #eef0f3;">
<p style="margin:0;font-size:12px;color:#9ca3af;">&copy; Tiesverse. This is an automated message - please do not reply.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""


# Placeholder values used for previews and test sends.
SAMPLE_CONTEXT = {
    'name': 'Alex Doe',
    'reset_url': 'https://portal.tiesverse.com/reset-password?token=sample',
    'role': 'Graphic Designer',
    'upload_link': 'https://portal.tiesverse.com/onboarding/sample',
    'username': 'alex.doe',
    'password': 'Temp#2026',
    'login_url': 'https://portal.tiesverse.com/login',
    'document': 'Internship Certificate',
    'issued_by': 'HR Team',
    'portal_url': 'https://portal.tiesverse.com/login',
    'subject_title': 'AI Workshop 2026',
    'certificate_id': 'TV-CERT-SAMPLE-0001',
    'department': 'Content',
    'status': 'Selected',
    'effective_date': '4 July 2026',
}


# key -> settings flag that seeds the initial is_enabled value
_ENABLED_SEED = {
    'password_reset': 'PASSWORD_RESET_EMAIL_ENABLED',
    'onboarding_invite': 'ONBOARDING_EMAIL_ENABLED',
    'onboarding_credentials': 'ONBOARDING_EMAIL_ENABLED',
    'certificate_issue': 'CERT_EMAIL_ENABLED',
    'certificate_bulk': 'CERT_EMAIL_ENABLED',
    'offer_letter': 'OFFER_EMAIL_ENABLED',
    'webinar_confirmation': 'WEBINAR_EMAIL_ENABLED',
    'webinar_reminder': 'WEBINAR_EMAIL_ENABLED',
    'webinar_followup': 'WEBINAR_EMAIL_ENABLED',
    'offboarding_approved': 'OFFBOARDING_EMAIL_ENABLED',
    'offboarding_revoked': 'OFFBOARDING_EMAIL_ENABLED',
}


_OFFBOARDING_TEMPLATES = {
    'offboarding_approved': {
        'name': 'Offboarding - Approved',
        'description': 'Sent when HR approves an offboarding request and sets the last working day.',
        'subject': 'Your offboarding is confirmed - Tiesverse',
        'from_name': 'Tiesverse HR',
        'from_email': '',
        'allow_attachment': False,
        'variables': ['name', 'last_working_day', 'notice_days'],
        'content': {
            'heading': 'Your offboarding is confirmed',
            'body': 'Dear {{name}},\n\nYour request to offboard has been approved by HR. Please find your notice details below.',
            'table': [
                {'label': 'Last working day', 'value': '{{last_working_day}}'},
                {'label': 'Notice period', 'value': '{{notice_days}} days'},
            ],
            'closing': 'Before your last day, please return any assigned assets and hand over your open tasks. Your portal access will end after your last working day; your records stay with us.',
            'button': {'label': '', 'url': ''},
            'signature': 'Warm regards,\nTiesverse HR Team',
        },
    },
    'offboarding_revoked': {
        'name': 'Offboarding - Access ended',
        'description': 'Sent when a member’s portal access is revoked at the end of offboarding.',
        'subject': 'Your Tiesverse portal access has ended',
        'from_name': 'Tiesverse HR',
        'from_email': '',
        'allow_attachment': False,
        'variables': ['name', 'last_working_day'],
        'content': {
            'heading': 'Thank you for your time at Tiesverse',
            'body': 'Dear {{name}},\n\nYour offboarding is now complete and your portal access has ended as of {{last_working_day}}. We’re grateful for everything you contributed.',
            'table': [],
            'closing': 'If you need a certificate or reference letter, or if this was in error, please reach out to HR.',
            'button': {'label': '', 'url': ''},
            'signature': 'Warm regards,\nTiesverse HR Team',
        },
    },
}


EMAIL_TEMPLATES = {
    'password_reset': {
        'name': 'Password Reset',
        'description': 'Sent when someone uses the "Forgot password" link.',
        'subject': 'Reset your Tiesverse password',
        'from_name': 'Tiesverse',
        'from_email': '',
        'allow_attachment': False,
        'variables': ['name', 'reset_url'],
        'content': {
            'heading': 'Reset your password',
            'body': 'Hi {{name}},\n\nWe received a request to reset the password on your Tiesverse account. Click the button below to choose a new one.',
            'table': [],
            'closing': "This link expires soon and can be used once. If you didn't request it, you can safely ignore this email.",
            'button': {'label': 'Reset Password', 'url': '{{reset_url}}'},
            'signature': '',
        },
    },
    'onboarding_invite': {
        'name': 'Onboarding Invite',
        'description': 'Sent to a new candidate to collect their documents.',
        'subject': 'Complete Your Onboarding - Tiesverse',
        'from_name': 'Tiesverse HR',
        'from_email': '',
        'allow_attachment': False,
        'variables': ['name', 'role', 'upload_link'],
        'content': {
            'heading': 'Complete your onboarding',
            'body': 'Dear {{name}},\n\nCongratulations on being selected for {{role}} at Tiesverse! Please upload your documents (Aadhaar, College ID, Photo, Emergency Contact) using your secure link below.',
            'table': [],
            'closing': 'This link is unique to you - please do not share it.',
            'button': {'label': 'Upload Documents', 'url': '{{upload_link}}'},
            'signature': 'Warm regards,\nTiesverse HR Team',
        },
    },
    'onboarding_credentials': {
        'name': 'Member Credentials',
        'description': 'Sent when HR verifies a member and their portal account is created.',
        'subject': 'Your Tiesverse Portal Credentials',
        'from_name': 'Tiesverse HR',
        'from_email': '',
        'allow_attachment': False,
        'variables': ['name', 'role', 'username', 'password', 'login_url'],
        'content': {
            'heading': 'Welcome to Tiesverse',
            'body': 'Dear {{name}},\n\nYour onboarding has been verified and your portal access is ready. Use the credentials below to sign in, then change your password.',
            'table': [
                {'label': 'Role', 'value': '{{role}}'},
                {'label': 'Username', 'value': '{{username}}'},
                {'label': 'Temp password', 'value': '{{password}}'},
            ],
            'closing': 'For your security, please change your password after first login.',
            'button': {'label': 'Log In', 'url': '{{login_url}}'},
            'signature': 'Warm regards,\nTiesverse HR Team',
        },
    },
    'certificate_issue': {
        'name': 'Certificate Issued (individual)',
        'description': 'Sent when HR issues an internship certificate / LOR / NOC to a member.',
        'subject': 'Your {{document}} - Tiesverse',
        'from_name': 'Tiesverse',
        'from_email': '',
        'allow_attachment': True,
        'variables': ['name', 'document', 'issued_by', 'portal_url'],
        'content': {
            'heading': 'Your {{document}} is ready',
            'body': "Dear {{name}},\n\nWe're pleased to let you know that your {{document}} has been issued by the Tiesverse team.",
            'table': [
                {'label': 'Document', 'value': '{{document}}'},
                {'label': 'Issued by', 'value': '{{issued_by}}'},
            ],
            'closing': 'Keep this document for your records.',
            'button': {'label': 'Open Portal', 'url': '{{portal_url}}'},
            'signature': '',
        },
    },
    'certificate_bulk': {
        'name': 'Certificate Delivery (bulk)',
        'description': 'Sent when certificates are emailed in bulk from the Certificate Generator.',
        'subject': 'Your {{subject_title}} Certificate - Tiesverse',
        'from_name': 'Tiesverse',
        'from_email': '',
        'allow_attachment': True,
        'variables': ['name', 'subject_title', 'certificate_id'],
        'content': {
            'heading': 'Your certificate is ready',
            'body': 'Dear {{name}},\n\nYour certificate for {{subject_title}} has been generated by Tiesverse. Your unique certificate ID is shown below for verification.',
            'table': [
                {'label': 'Certificate', 'value': '{{subject_title}}'},
                {'label': 'Certificate ID', 'value': '{{certificate_id}}'},
            ],
            'closing': 'Please retain your certificate ID for verification purposes.',
            'button': {'label': '', 'url': ''},
            'signature': '',
        },
    },
    'career_application': {
        'name': 'Career Application Received',
        'description': "Sent to a candidate after they submit an internship application on the careers site.",
        'subject': 'We received your application - Tiesverse',
        'from_name': 'Tiesverse Careers',
        'from_email': '',
        'allow_attachment': False,
        'variables': ['name', 'role', 'careers_url'],
        'content': {
            'heading': 'Application received',
            'body': "Hi {{name}},\n\nThanks for applying to Tiesverse for the {{role}} internship. We've received your application and our team will review it shortly.\n\nThis is a 3-month, unpaid internship focused on learning and portfolio building.",
            'table': [],
            'closing': "If you're shortlisted, we'll reach out by email with the next steps. Keep an eye on your inbox (and spam).",
            'button': {'label': 'Visit Tiesverse', 'url': '{{careers_url}}'},
            'signature': 'Warm regards,\nTiesverse Careers Team\ncareers@tiesverse.com',
        },
    },
    'webinar_confirmation': {
        'name': 'Webinar - Registration Confirmation',
        'description': 'Global default confirmation sent when someone registers for a webinar/event. Each webinar can override the subject/body when broadcasting.',
        'subject': "You're registered: {{topic}}",
        'from_name': 'Tiesverse',
        'from_email': '',
        'allow_attachment': False,
        'variables': ['name', 'topic', 'date', 'time', 'join_link'],
        'content': {
            'heading': "You're registered!",
            'body': "Hi {{name}},\n\nYour spot for {{topic}} is confirmed. We'll send the joining link and any details before it starts.",
            'table': [
                {'label': 'Session', 'value': '{{topic}}'},
                {'label': 'Date', 'value': '{{date}}'},
                {'label': 'Time', 'value': '{{time}}'},
            ],
            'closing': 'Add it to your calendar so you don’t miss it. Questions? Just reply to this email.',
            'button': {'label': 'Join link', 'url': '{{join_link}}'},
            'signature': '- The Tiesverse Team',
        },
    },
    'webinar_reminder': {
        'name': 'Webinar - Reminder',
        'description': 'Reminder you can broadcast to a webinar’s registrants before it starts.',
        'subject': 'Reminder: {{topic}} is coming up',
        'from_name': 'Tiesverse',
        'from_email': '',
        'allow_attachment': False,
        'variables': ['name', 'topic', 'date', 'time', 'join_link'],
        'content': {
            'heading': "It's almost time",
            'body': 'Hi {{name}},\n\nJust a reminder that {{topic}} is happening soon. Here are the details:',
            'table': [
                {'label': 'Session', 'value': '{{topic}}'},
                {'label': 'Date', 'value': '{{date}}'},
                {'label': 'Time', 'value': '{{time}}'},
            ],
            'closing': 'See you there!',
            'button': {'label': 'Join now', 'url': '{{join_link}}'},
            'signature': '- The Tiesverse Team',
        },
    },
    'webinar_followup': {
        'name': 'Webinar - Follow-up / Thank you',
        'description': 'Thank-you + recording/next-steps you can broadcast after a webinar.',
        'subject': 'Thanks for joining {{topic}}',
        'from_name': 'Tiesverse',
        'from_email': '',
        'allow_attachment': False,
        'variables': ['name', 'topic', 'recording_link'],
        'content': {
            'heading': 'Thanks for joining!',
            'body': 'Hi {{name}},\n\nThank you for attending {{topic}}. We hope you found it valuable. If you missed anything, the recording is below.',
            'table': [],
            'closing': "We'd love to see you at our next session. Keep an eye on your inbox!",
            'button': {'label': 'Watch the recording', 'url': '{{recording_link}}'},
            'signature': '- The Tiesverse Team',
        },
    },
    'offer_letter': {
        'name': 'Offer Letter',
        'description': 'Sent to a candidate with their offer details and offer letter PDF attached.',
        'subject': 'Offer Letter - {{role}} | Tiesverse',
        'from_name': 'Tiesverse Careers',
        'from_email': '',
        'allow_attachment': True,
        'variables': ['name', 'role', 'department', 'status', 'effective_date'],
        'content': {
            'heading': '',
            'body': 'Dear {{name}},\n\nWe are delighted to extend this offer of selection to join Tiesverse. Please find the details of your offer below:',
            'table': [
                {'label': 'Role', 'value': '{{role}}'},
                {'label': 'Department', 'value': '{{department}}'},
                {'label': 'Status', 'value': '{{status}}'},
                {'label': 'Effective Date', 'value': '{{effective_date}}'},
            ],
            'closing': 'Congratulations on your selection! Our team will be in touch shortly with the next steps for your onboarding.\n\nPlease find the official offer letter attached to this email as a PDF.',
            'button': {'label': '', 'url': ''},
            'signature': 'Warm regards,\nTiesverse HR Team\ncareers@tiesverse.com',
        },
    },
}


EMAIL_TEMPLATES.update(_OFFBOARDING_TEMPLATES)


def _row_defaults(key, reg):
    flag = _ENABLED_SEED.get(key)
    enabled = bool(getattr(settings, flag, False)) if flag else False
    content = reg['content']
    return {
        'name': reg['name'],
        'description': reg.get('description', ''),
        'subject': reg['subject'],
        'from_name': reg.get('from_name', ''),
        'from_email': reg.get('from_email', ''),
        'content_json': content,
        'body_html': render_content(content),
        'is_enabled': enabled,
        'allow_attachment': reg.get('allow_attachment', False),
        'variables': reg.get('variables', []),
    }


def ensure_templates():
    """Create missing rows, and backfill content_json for any legacy row that
    doesn't have it yet (regenerating body_html from the structured default)."""
    from accounts_app.models import EmailTemplate
    by_key = {t.key: t for t in EmailTemplate.objects.all()}
    for key, reg in EMAIL_TEMPLATES.items():
        row = by_key.get(key)
        if row is None:
            EmailTemplate.objects.create(key=key, **_row_defaults(key, reg))
        elif not row.content_json:
            row.content_json = reg['content']
            row.body_html = render_content(reg['content'])
            if not row.variables:
                row.variables = reg.get('variables', [])
            row.save()


def get_template(key):
    from accounts_app.models import EmailTemplate
    tpl = EmailTemplate.objects.filter(key=key).first()
    if tpl is None and key in EMAIL_TEMPLATES:
        tpl = EmailTemplate.objects.create(key=key, **_row_defaults(key, EMAIL_TEMPLATES[key]))
    return tpl


_TOKEN_RE = r'{{\s*(\w+)\s*}}'


def normalize_variables(variables):
    """Accept the `variables` field in either legacy (list of names) or new
    (list of {name, label, default}) form and always return a list of dicts:
        [{'name': str, 'label': str, 'default': str}, ...]
    This keeps old templates working while enabling per-variable defaults."""
    out = []
    seen = set()
    for v in (variables or []):
        if isinstance(v, str):
            name, label, default = v, '', ''
        elif isinstance(v, dict):
            name = (v.get('name') or '').strip()
            label = (v.get('label') or '').strip()
            default = v.get('default')
            default = '' if default is None else str(default)
        else:
            continue
        name = name.strip()
        if not name or name in seen:
            continue
        seen.add(name)
        out.append({'name': name, 'label': label or name, 'default': default})
    return out


def variable_defaults(variables):
    """{name: default} for every declared variable that has a non-empty default."""
    return {v['name']: v['default'] for v in normalize_variables(variables) if v['default'] != ''}


def find_tokens(*texts):
    """Every distinct {{token}} name used across the given strings."""
    names = []
    for t in texts:
        for m in re.finditer(_TOKEN_RE, t or ''):
            if m.group(1) not in names:
                names.append(m.group(1))
    return names


def unresolved_tokens(variables, provided_keys, *texts):
    """Tokens that would render BLANK in a real send: used in the text but
    neither declared with a default nor supplied a value. Powers the editor /
    pre-send 'these will be empty' warning (render-blank-and-warn policy)."""
    defaults = variable_defaults(variables)
    provided = set(provided_keys or [])
    return [name for name in find_tokens(*texts)
            if name not in provided and name not in defaults]


def render_tokens(text, context, keep_unknown=False):
    """Replace {{token}} occurrences. A token resolves to its context value if
    present, else '' (stripped) so a raw {{token}} is NEVER shipped to a real
    recipient. Pass keep_unknown=True only for editor previews where showing the
    literal placeholder is useful."""
    def _sub(m):
        name = m.group(1)
        if name in context:
            return str(context[name])
        return m.group(0) if keep_unknown else ''
    return re.sub(_TOKEN_RE, _sub, text or '')


def resolve_from(tpl):
    """Build the SES Source header from the template's alias + address."""
    from_email = tpl.from_email or getattr(settings, 'SES_FROM_EMAIL', 'noreply@tiesverse.com')
    if tpl.key == 'offer_letter' and not tpl.from_email:
        from_email = getattr(settings, 'SES_CAREERS_FROM_EMAIL', from_email)
    if tpl.from_name:
        return f'"{tpl.from_name}" <{from_email}>'
    return from_email


def send_template_email(key, to, context=None, attachments=None, force=False):
    """Render and send one template. Returns True if actually sent via SES.
    `force=True` sends even if the template is disabled (for explicit actions
    like issuing a certificate or a campaign)."""
    from config.email_utils import send_email
    context = context or {}
    tpl = get_template(key)
    if tpl is None:
        print(f"[EMAIL] No template registered for key={key!r}")
        return False
    # Declared-variable defaults fill in for anything the caller didn't supply,
    # so a {{token}} never leaks; the caller's real values always win.
    merged = {**variable_defaults(tpl.variables), **context}
    subject = render_tokens(tpl.subject, merged)
    body = render_tokens(tpl.body_html, merged)
    atts = attachments if tpl.allow_attachment else None
    return send_email(
        to, subject, body,
        from_email=resolve_from(tpl),
        attachments=atts,
        enabled=True if force else tpl.is_enabled,
    )
