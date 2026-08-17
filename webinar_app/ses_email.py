import hashlib
import html as _html
import logging

from django.conf import settings

logger = logging.getLogger(__name__)

# Served from the public site, never from admin.tiesverse.com: every recipient's
# mail client fetches this image, which would otherwise advertise the admin
# hostname to anyone who looks at the message source.
BRAND_LOGO_URL = 'https://www.tiesverse.com/brand-logo.png'

# Ticket palette. The saffron is the site's own --accent; the ink is the near
# black used on paper stock so the barcode and rules read as printed.
TICKET_PAPER = '#fe7a00'
TICKET_INK = '#1d160d'


def _ticket_ref(email, event_title):
    """A short, stable reference for a ticket — same input, same code."""
    digest = hashlib.sha1(f'{email}|{event_title}'.encode('utf-8')).hexdigest()
    return f'TIES-{digest[:8].upper()}'


def _barcode_cells(seed, count=34):
    """A row of table cells that reads as a barcode.

    Real barcode fonts are not installed on the machines that render email, and
    a background-image barcode is stripped by several clients, so the bars are
    table cells with a width and a background colour — the one thing every
    client since Outlook 2000 agrees on.
    """
    digest = hashlib.sha1(seed.encode('utf-8')).hexdigest()
    cells = []
    for i in range(count):
        wide = int(digest[i % len(digest)], 16) % 3
        w = 2 + wide
        cells.append(
            f'<td width="{w}" style="width:{w}px;background:{TICKET_INK};'
            f'font-size:0;line-height:0;">&nbsp;</td>'
            f'<td width="3" style="width:3px;font-size:0;line-height:0;">&nbsp;</td>'
        )
    return ''.join(cells)


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

        # An event title is written in the admin, so it can legitimately hold
        # an ampersand or an angle bracket. Unescaped, those break the markup
        # around them; escaped once here, every interpolation below is safe.
        name = _html.escape(str(name or ''), quote=False)
        event_title = _html.escape(str(event_title or ''), quote=False)
        event_date = _html.escape(str(event_date or ''), quote=False)

        kind_label = 'webinar' if event_type == 'webinar' else 'event'
        date_line = f'<p style="margin:0 0 8px">Date: {event_date}</p>' if event_date else ''
        # A row, not a div: this sits inside the outer table beneath the ticket,
        # and a stray div between <tr>s is dropped by Outlook.
        meet_block = (
            f'<tr><td style="padding:22px 4px 0;">'
            f'<a href="{meeting_link}" style="display:inline-block;background:{TICKET_INK};'
            f'color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:6px;'
            f'font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;">'
            f'Join the meeting</a>'
            f'<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#7a6f63;'
            f'padding-top:10px;word-break:break-all;">Or open this link at the scheduled time:<br />'
            f'{meeting_link}</div>'
            f'</td></tr>'
        ) if meeting_link else ''

        # The ticket, built as nested tables with inline styles. The design it
        # follows uses clip-path, CSS custom properties and Tailwind, none of
        # which survive an email client — Gmail strips <style>, Outlook renders
        # through Word. The notch, perforation and stub are therefore drawn
        # with borders and cells, which every client has supported for years.
        ref = _ticket_ref(to_email, event_title)
        date_cell = (
            f'<td style="padding:0 0 0 18px;border-left:1px solid rgba(29,22,13,.18);">'
            f'<div style="font-family:Arial,Helvetica,sans-serif;font-size:9px;font-weight:bold;'
            f'letter-spacing:1px;text-transform:uppercase;color:rgba(29,22,13,.62);">Date</div>'
            f'<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;'
            f'color:{TICKET_INK};padding-top:4px;">{event_date}</div></td>'
        ) if event_date else ''

        html_body = f"""\
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f4efe7;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"
       style="width:100%;background:#f4efe7;padding:32px 12px;">
<tr><td align="center">

  <table role="presentation" cellpadding="0" cellspacing="0" border="0"
         style="width:100%;max-width:420px;">

    <!-- Logo, as an image rather than typed text -->
    <tr><td align="center" style="padding:0 0 22px;">
      <img src="{BRAND_LOGO_URL}" width="132" alt="Tiesverse"
           style="display:block;width:132px;max-width:132px;height:auto;border:0;outline:none;" />
    </td></tr>

    <!-- ── Ticket ─────────────────────────────────────────── -->
    <tr><td>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
             style="width:100%;background:{TICKET_PAPER};border-radius:14px;">

        <!-- Body -->
        <tr><td style="padding:26px 26px 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="font-family:Arial,Helvetica,sans-serif;font-size:9px;font-weight:bold;
                         letter-spacing:1.2px;text-transform:uppercase;color:rgba(29,22,13,.72);">
                {kind_label.title()} pass
              </td>
              <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:9px;
                         font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;
                         color:rgba(29,22,13,.72);">Confirmed</td>
            </tr>
          </table>

          <div style="font-family:Georgia,'Times New Roman',serif;font-size:27px;line-height:1.1;
                      font-weight:bold;color:{TICKET_INK};padding:22px 0 0;">{event_title}</div>

          <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;
                      color:rgba(29,22,13,.78);padding:12px 0 0;">
            Hi {name}, your seat is confirmed. Keep this ticket — it carries your
            reference number.
          </div>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                 style="padding:22px 0 0;">
            <tr>
              <td style="padding:0 18px 0 0;">
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:9px;font-weight:bold;
                            letter-spacing:1px;text-transform:uppercase;color:rgba(29,22,13,.62);">Admit</div>
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;
                            color:{TICKET_INK};padding-top:4px;">One</div>
              </td>
              {date_cell}
            </tr>
          </table>
        </td></tr>

        <!-- Perforation. The notches are half-circles in the page colour that
             sit flush to each edge, so the ticket reads as punched rather than
             as two dots floating on it. Outlook ignores border-radius and
             renders them square, which still reads as a notch. -->
        <tr><td style="padding:0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td width="9" style="width:9px;padding:0;">
                <div style="width:9px;height:18px;background:#f4efe7;
                            border-radius:0 18px 18px 0;font-size:0;line-height:0;">&nbsp;</div>
              </td>
              <td style="padding:0 10px;">
                <div style="border-top:2px dashed rgba(29,22,13,.32);font-size:0;line-height:0;
                            height:0;">&nbsp;</div>
              </td>
              <td width="9" style="width:9px;padding:0;">
                <div style="width:9px;height:18px;background:#f4efe7;
                            border-radius:18px 0 0 18px;font-size:0;line-height:0;">&nbsp;</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Stub -->
        <tr><td style="padding:18px 26px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="font-family:Arial,Helvetica,sans-serif;font-size:9px;font-weight:bold;
                         letter-spacing:1px;text-transform:uppercase;color:rgba(29,22,13,.62);">
                Reference</td>
              <td align="right" style="font-family:'Courier New',Courier,monospace;font-size:12px;
                         font-weight:bold;letter-spacing:.5px;color:{TICKET_INK};">{ref}</td>
            </tr>
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                 style="padding-top:14px;height:26px;">
            <tr>{_barcode_cells(ref)}</tr>
          </table>
        </td></tr>

      </table>
    </td></tr>
    <!-- ── /Ticket ────────────────────────────────────────── -->

    {meet_block}

    <tr><td style="padding:22px 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                   line-height:1.6;color:#5b5147;">
      We will send the joining link and venue details before the {kind_label} begins.
      Questions? Reply to this email or write to contact@tiesverse.com.
    </td></tr>

    <tr><td style="padding:20px 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;
                   line-height:1.6;color:#9a8f83;">
      &copy; Tiesverse &middot; India&#39;s leading youth-led organisation in research, media
      &amp; technology.
    </td></tr>

  </table>

</td></tr>
</table>
</body>
</html>"""

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


def send_payment_reminder(to_email, name, event_title, event_url):
    """Email an abandoned/failed payer a link to finish their webinar payment.
    Silently returns False if SES is not configured — never raises."""
    key_id = getattr(settings, 'AWS_SES_ACCESS_KEY_ID', '') or getattr(settings, 'AWS_ACCESS_KEY_ID', '')
    secret = getattr(settings, 'AWS_SES_SECRET_ACCESS_KEY', '') or getattr(settings, 'AWS_SECRET_ACCESS_KEY', '')
    region = getattr(settings, 'AWS_SES_REGION', 'ap-south-1')
    from_email = getattr(settings, 'SES_FROM_EMAIL', '')
    if not all([key_id, secret, from_email]):
        logger.warning('SES not configured — skipping payment reminder to %s', to_email)
        return False
    try:
        import boto3
        ses = boto3.client('ses', region_name=region, aws_access_key_id=key_id, aws_secret_access_key=secret)
        html_body = f"""
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <div style="background:#FE7A00;padding:24px 32px"><span style="color:#fff;font-size:20px;font-weight:700">.tiesverse</span></div>
  <div style="padding:32px">
    <h2 style="margin:0 0 16px">Complete your registration</h2>
    <p style="margin:0 0 16px">Hi {name or 'there'},</p>
    <p style="margin:0 0 24px">Your payment for <strong>{event_title}</strong> wasn't completed, so your spot isn't confirmed yet. You can finish it in under a minute:</p>
    <div style="margin:0 0 24px">
      <a href="{event_url}" style="display:inline-block;background:#FE7A00;color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:700">Complete payment</a>
      <p style="margin:10px 0 0;font-size:13px;color:#666;word-break:break-all">Or open: {event_url}</p>
    </div>
    <p style="margin:0;color:#666;font-size:13px">Already paid? Please ignore this email. Questions? contact@tiesverse.com</p>
  </div>
  <div style="background:#f5f5f5;padding:16px 32px;font-size:12px;color:#999">Tiesverse</div>
</div>"""
        text_body = (
            f"Hi {name or 'there'},\n\n"
            f"Your payment for {event_title} wasn't completed, so your spot isn't confirmed yet.\n"
            f"Complete it here: {event_url}\n\n"
            "Already paid? Please ignore this. Questions? contact@tiesverse.com\n\n- Tiesverse"
        )
        ses.send_email(
            Source=from_email,
            Destination={'ToAddresses': [to_email]},
            Message={'Subject': {'Data': f'Complete your registration for {event_title}'},
                     'Body': {'Text': {'Data': text_body}, 'Html': {'Data': html_body}}},
        )
        logger.info('Payment reminder sent to %s for "%s"', to_email, event_title)
        return True
    except Exception as exc:
        logger.error('SES payment reminder failed for %s: %s', to_email, exc)
        return False
