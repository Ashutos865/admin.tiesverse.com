import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def send_registration_confirmation(to_email, name, event_title, event_type, event_date='', meeting_link=''):
    """
    Send a confirmation email via AWS SES.
    Silently logs a warning if SES is not configured — never raises.
    """
    key_id = getattr(settings, 'AWS_SES_ACCESS_KEY_ID', '') or getattr(settings, 'AWS_ACCESS_KEY_ID', '')
    secret = getattr(settings, 'AWS_SES_SECRET_ACCESS_KEY', '') or getattr(settings, 'AWS_SECRET_ACCESS_KEY', '')
    region = getattr(settings, 'AWS_SES_REGION', 'ap-south-1')
    from_email = getattr(settings, 'SES_FROM_EMAIL', '')

    if not all([key_id, secret, from_email]):
        logger.warning('SES not configured — skipping confirmation email to %s', to_email)
        return False

    try:
        import boto3
        ses = boto3.client(
            'ses',
            region_name=region,
            aws_access_key_id=key_id,
            aws_secret_access_key=secret,
        )

        kind_label = 'webinar' if event_type == 'webinar' else 'event'
        date_line = f'<p style="margin:0 0 8px">Date: {event_date}</p>' if event_date else ''
        meet_block = (
            f'<div style="margin:0 0 24px">'
            f'<a href="{meeting_link}" style="display:inline-block;background:#FE7A00;color:#fff;'
            f'text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:700">Join the meeting</a>'
            f'<p style="margin:10px 0 0;font-size:13px;color:#666;word-break:break-all">Or open this link at the scheduled time:<br>{meeting_link}</p>'
            f'</div>'
        ) if meeting_link else ''

        html_body = f"""
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <div style="background:#FE7A00;padding:24px 32px">
    <span style="color:#fff;font-size:20px;font-weight:700">.tiesverse</span>
  </div>
  <div style="padding:32px">
    <h2 style="margin:0 0 16px">You're registered!</h2>
    <p style="margin:0 0 16px">Hi {name},</p>
    <p style="margin:0 0 24px">
      Your registration for <strong>{event_title}</strong> has been confirmed.
      We'll send you the joining link / venue details closer to the date.
    </p>
    <div style="background:#f5f5f5;border-radius:8px;padding:16px 20px;margin-bottom:24px">
      <p style="margin:0 0 8px;font-weight:600">{event_title}</p>
      {date_line}
      <p style="margin:0;color:#666;font-size:14px">Type: {kind_label.title()}</p>
    </div>
    {meet_block}
    <p style="margin:0;color:#666;font-size:13px">
      Questions? Reply to this email or reach us at contact@tiesverse.com
    </p>
  </div>
  <div style="background:#f5f5f5;padding:16px 32px;font-size:12px;color:#999">
    © Tiesverse · India's leading youth-led org. in research, media & tech.
  </div>
</div>"""

        text_body = (
            f"Hi {name},\n\n"
            f"You're registered for: {event_title}\n"
            + (f"Date: {event_date}\n" if event_date else "")
            + (f"Join link: {meeting_link}\n" if meeting_link else "")
            + "\nWe'll email you the joining link / venue details before the event.\n\n"
            "Questions? contact@tiesverse.com\n\n— Tiesverse"
        )

        ses.send_email(
            Source=from_email,
            Destination={'ToAddresses': [to_email]},
            Message={
                'Subject': {'Data': f'Confirmed: {event_title}'},
                'Body': {
                    'Text': {'Data': text_body},
                    'Html': {'Data': html_body},
                },
            },
        )
        logger.info('Confirmation email sent to %s for "%s"', to_email, event_title)
        return True
    except Exception as exc:
        logger.error('SES send failed for %s: %s', to_email, exc)
        return False
