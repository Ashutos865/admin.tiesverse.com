"""Background certificate-campaign runner.

Certificates are large (~2 MB each), so we never ship them through the browser.
Instead the front end sends only recipient data, and this module — running in a
daemon thread — generates each certificate server-side (concurrently), attaches
it, and sends it via SES, updating campaign progress in the DB as it goes.
"""

import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.request import Request, urlopen

from django.conf import settings
from django.db import connection

ZW = chr(0x200b)   # zero-width space: non-empty for the generator, invisible on the PDF
EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')

_GS = shutil.which('gs') or shutil.which('gswin64c')


def _gs_run(pdf_bytes, opts):
    """Run Ghostscript with the given options; return the smaller PDF or None."""
    if not _GS:
        return None
    fi = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False)
    fo = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False)
    try:
        fi.write(pdf_bytes); fi.flush(); fi.close(); fo.close()
        cmd = [_GS, '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.5', '-dNOPAUSE',
               '-dBATCH', '-dQUIET', '-dAutoRotatePages=/None', *opts,
               '-sOutputFile=' + fo.name, fi.name]
        subprocess.run(cmd, timeout=60, check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        with open(fo.name, 'rb') as f:
            out = f.read()
        return out if out[:4] == b'%PDF' else None
    except Exception:  # noqa: BLE001
        return None
    finally:
        for p in (fi.name, fo.name):
            try:
                os.unlink(p)
            except Exception:  # noqa: BLE001
                pass


def compress_pdf(pdf_bytes, target_kb=600):
    """Shrink a PDF toward target_kb by progressively downsampling its images.
    Uses the least-aggressive tier that lands under the cap (best quality that
    fits); if even the smallest is over, returns whatever was smallest. Falls
    back to the original if Ghostscript is unavailable or errors — never fails."""
    try:
        cap = target_kb * 1024
        if not pdf_bytes or len(pdf_bytes) <= cap or not _GS:
            return pdf_bytes
        tiers = [
            ['-dPDFSETTINGS=/ebook'],     # 150 dpi
            ['-dPDFSETTINGS=/screen'],    # 72 dpi
            ['-dPDFSETTINGS=/screen', '-dDownsampleColorImages=true', '-dColorImageResolution=72',
             '-dDownsampleGrayImages=true', '-dGrayImageResolution=72', '-dColorImageDownsampleThreshold=1.0'],
            ['-dPDFSETTINGS=/screen', '-dDownsampleColorImages=true', '-dColorImageResolution=54',
             '-dDownsampleGrayImages=true', '-dGrayImageResolution=54', '-dColorImageDownsampleThreshold=1.0'],
        ]
        best = pdf_bytes
        for opts in tiers:
            out = _gs_run(pdf_bytes, opts)
            if out and len(out) < len(best):
                best = out
                if len(out) <= cap:
                    return out
        return best
    except Exception:  # noqa: BLE001
        return pdf_bytes


def _gen_base():
    return settings.CERTIFICATE_GENERATOR_API_URL.rstrip('/')


def generator_get_template(template_id):
    with urlopen(f"{_gen_base()}/api/templates/{template_id}", timeout=30) as r:
        return json.loads(r.read())


def generator_generate(template_id, data):
    body = json.dumps({'data': data}).encode()
    req = Request(f"{_gen_base()}/api/templates/{template_id}/generate",
                  data=body, headers={'Content-Type': 'application/json'}, method='POST')
    with urlopen(req, timeout=120) as r:
        return r.read()


_TOKEN_RE = re.compile(r'\{\{\s*([a-zA-Z0-9_]+)\s*\}\}')


def _font_for(el):
    bold, italic = el.get('is_bold'), el.get('is_italic')
    if bold and italic:
        return 'Helvetica-BoldOblique'
    if bold:
        return 'Helvetica-Bold'
    if italic:
        return 'Helvetica-Oblique'
    return 'Helvetica'


def overlay_values(pdf_bytes, text_elements, values, design_w, design_h):
    """Draw the real variable values onto the generated certificate ourselves —
    the external generator doesn't substitute {{tokens}} reliably, so we stamp
    each placeholder element's text at its exact position/font/colour. Never
    raises; returns the original PDF if anything goes wrong."""
    try:
        from io import BytesIO
        from reportlab.pdfgen import canvas
        from reportlab.lib.colors import HexColor
        from reportlab.pdfbase.pdfmetrics import stringWidth
        from pypdf import PdfReader, PdfWriter

        toks = [e for e in (text_elements or []) if _TOKEN_RE.search(e.get('content', '') or '')]
        if not toks:
            return pdf_bytes

        reader = PdfReader(BytesIO(pdf_bytes))
        writer = PdfWriter()
        for pi, page in enumerate(reader.pages):
            pw, ph = float(page.mediabox.width), float(page.mediabox.height)
            sx = pw / (design_w or pw)
            sy = ph / (design_h or ph)
            page_els = [e for e in toks if int(e.get('page_number', 1) or 1) == pi + 1]
            if page_els:
                buf = BytesIO()
                c = canvas.Canvas(buf, pagesize=(pw, ph))
                for e in page_els:
                    text = _TOKEN_RE.sub(lambda m: str(values.get(m.group(1).lower(), '') or ''),
                                         e.get('content', '') or '').strip()
                    if not text:
                        continue
                    ex, ey = float(e.get('x', 0)) * sx, float(e.get('y', 0)) * sy
                    ew, eh = float(e.get('width', 0)) * sx, float(e.get('height', 0)) * sy
                    fs = max(6.0, float(e.get('font_size', 24)) * sy)
                    font = _font_for(e)
                    # Shrink to fit the box width (the design's auto-fit behaviour).
                    while fs > 7 and ew and stringWidth(text, font, fs) > ew:
                        fs -= 0.5
                    tw = stringWidth(text, font, fs)
                    align = (e.get('text_align') or 'left').lower()
                    if align == 'center':
                        tx = ex + max(0, (ew - tw) / 2)
                    elif align == 'right':
                        tx = ex + max(0, ew - tw)
                    else:
                        tx = ex
                    # vertical: box is top-origin; PDF is bottom-origin. Centre the text.
                    center_from_top = ey + eh / 2.0
                    baseline = ph - center_from_top - fs * 0.33
                    try:
                        c.setFillColor(HexColor(e.get('text_color') or '#000000'))
                    except Exception:  # noqa: BLE001
                        c.setFillColor(HexColor('#000000'))
                    c.setFont(font, fs)
                    c.drawString(tx, baseline, text)
                c.save()
                buf.seek(0)
                page.merge_page(PdfReader(buf).pages[0])
            writer.add_page(page)
        out = BytesIO()
        writer.write(out)
        return out.getvalue()
    except Exception:  # noqa: BLE001 — overlay must never break the send
        return pdf_bytes


def build_cert_data(cert_vars, mapping, row):
    """Fill every declared variable (the generator requires all of them). Mapped
    fields get the recipient's value; the rest use the default, then an invisible
    zero-width space so unplaced/orphan variables still satisfy the requirement."""
    data = {}
    for v in cert_vars:
        name = v.get('name')
        src = mapping.get(name)
        val = row.get(src) if src else ''
        val = '' if val is None else str(val)
        if val.strip() == '':
            dv = v.get('default_value')
            dv = '' if dv is None else str(dv)
            val = dv if dv.strip() != '' else ZW
        data[str(name).lower()] = val
    return data


def _ses_rate():
    """Live SES max send rate (emails/sec) — sizes each batch to what SES will
    accept, so large sends 'send as many as they can' without tripping the rate
    limit. Falls back to a safe 10/s if the quota call fails."""
    try:
        import boto3
        client = boto3.client(
            'ses',
            region_name=getattr(settings, 'AWS_SES_REGION', 'ap-south-1'),
            aws_access_key_id=settings.AWS_SES_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SES_SECRET_ACCESS_KEY,
        )
        rate = float((client.get_send_quota() or {}).get('MaxSendRate') or 0)
        return rate if rate > 0 else 10.0
    except Exception:  # noqa: BLE001
        return 10.0


def _is_canceled(campaign_id):
    from .models import EmailCampaign
    try:
        return EmailCampaign.objects.filter(id=campaign_id, cancel_requested=True).exists()
    except Exception:  # noqa: BLE001
        return False


def _send_completion_email(campaign_id):
    """Notify the campaign's From address once it finishes (done/canceled/error),
    so the sender can safely close the tab and still learn the outcome. Sent at
    most once (guarded by the `notified` flag). Never raises."""
    from .models import EmailCampaign
    from config.email_utils import send_email
    try:
        c = EmailCampaign.objects.get(id=campaign_id)
        if c.notified:
            return
        # No completion email for test / trivial one-off sends — only real batches.
        if c.recipient_count <= 1 or (c.name or '').strip().lower() == 'test send':
            EmailCampaign.objects.filter(id=campaign_id).update(notified=True)
            return
        to = (c.notify_email or c.from_email or '').strip()
        # Accept a bare address or a "Name <addr@x>" form — pull the address out.
        m = re.search(r'<([^>]+)>', to)
        if m:
            to = m.group(1).strip()
        if not to or not EMAIL_RE.match(to):
            EmailCampaign.objects.filter(id=campaign_id).update(notified=True)
            return
        label = c.name or c.template_name or 'your campaign'
        if c.status == 'canceled':
            headline = f"Campaign stopped — {c.sent_count} of {c.recipient_count} sent"
            note = "You stopped this campaign. The recipients below were already emailed; the rest were not."
        elif c.status == 'error':
            headline = "Campaign interrupted"
            note = ("This campaign was interrupted before it could finish. Anyone already emailed is "
                    "listed below — you can re-run it and only the remaining recipients will be sent.")
        else:
            headline = f"Campaign complete — dispatched to {c.sent_count} recipient(s)"
            note = "Your emails have been dispatched. Here's the summary:"
        batch_line = (f"<tr><td style='padding:4px 12px 4px 0;color:#64748b'>Batches</td>"
                      f"<td style='padding:4px 0;font-weight:600'>{c.batch_total}</td></tr>"
                      if c.batch_total else "")
        html = f"""
        <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px">
          <h2 style="margin:0 0 6px;font-size:18px;color:#0f172a">{headline}</h2>
          <p style="margin:0 0 14px;color:#475569;font-size:14px">{note}</p>
          <table style="border-collapse:collapse;font-size:14px;color:#0f172a">
            <tr><td style="padding:4px 12px 4px 0;color:#64748b">Campaign</td><td style="padding:4px 0;font-weight:600">{label}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#64748b">Recipients</td><td style="padding:4px 0;font-weight:600">{c.recipient_count}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#64748b">Sent</td><td style="padding:4px 0;font-weight:600;color:#16a34a">{c.sent_count}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#64748b">Failed</td><td style="padding:4px 0;font-weight:600;color:#dc2626">{c.failed_count}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#64748b">Skipped</td><td style="padding:4px 0;font-weight:600">{c.skipped_count}</td></tr>
            {batch_line}
          </table>
          <p style="margin:16px 0 0;color:#94a3b8;font-size:12px">Sent automatically by TIES Mail Automation.</p>
        </div>"""
        # From the same verified sender the campaign used, so it's deliverable.
        send_email(to, f"[TIES] {headline}", html,
                   from_email=(c.from_email or None), enabled=True)
    except Exception:  # noqa: BLE001
        pass
    finally:
        try:
            EmailCampaign.objects.filter(id=campaign_id).update(notified=True)
        except Exception:  # noqa: BLE001
            pass


def process_campaign(camp):
    """Run one campaign to completion — batched, cancellable, and RESUMABLE.

    Everything needed to run lives in `camp.job_config`, so this can pick up a
    campaign the browser started (or one a restart interrupted) with no client
    involvement. Progress is checkpointed to the DB after every recipient, and a
    recipient already present in EmailSendLog for this campaign is never re-sent
    — that's what makes a resume safe (no duplicate emails)."""
    from .models import EmailCampaign, EmailSendLog
    from config.email_templates import render_tokens
    from config.email_utils import send_email
    from django.utils import timezone

    cid = camp.id
    try:
        EmailCampaign.objects.filter(id=cid).update(
            status='running', started_at=(camp.started_at or timezone.now()))

        cfg = camp.job_config or {}
        recipients = cfg.get('recipients') or []
        defaults = cfg.get('defaults') or {}
        subject_src, body_src = cfg.get('subject_src') or '', cfg.get('body_src') or ''
        source, email_field = cfg.get('source') or '', cfg.get('email_field') or 'email'
        actor = cfg.get('actor') or ''
        tpl_key, tpl_name = cfg.get('tpl_key') or '', cfg.get('tpl_name') or ''
        cert = cfg.get('certificate') or None

        cert_vars, cert_els, cert_tid, mapping, fname_pat = [], [], '', {}, 'certificate.pdf'
        design_w, design_h = 842.0, 595.0
        if cert:
            cert_tid = cert.get('template_id') or ''
            mapping = cert.get('mapping') or {}
            fname_pat = cert.get('filename_pattern') or 'certificate.pdf'
            if cert_tid:
                try:
                    tpl_full = generator_get_template(cert_tid) or {}
                    cert_vars = tpl_full.get('variables') or []
                    cert_els = tpl_full.get('text_elements') or []
                    pgs = tpl_full.get('pages') or []
                    if pgs:
                        design_w = float(pgs[0].get('width') or design_w)
                        design_h = float(pgs[0].get('height') or design_h)
                except Exception:  # noqa: BLE001
                    cert_vars, cert_els = [], []

        # ── Resume state: recompute counters from whatever's already logged, and
        # remember which emails are already handled so we never send them twice. ──
        counters = {'sent': 0, 'failed': 0, 'skipped': 0, 'processed': 0}
        logged_prior = set()
        for email, st in EmailSendLog.objects.filter(campaign=camp).values_list('recipient_email', 'status'):
            logged_prior.add((email or '').strip().lower())
            counters['processed'] += 1
            if st == 'skipped':
                counters['skipped'] += 1
            elif st in ('sent', 'delivered', 'bounced', 'complained'):
                counters['sent'] += 1
            else:
                counters['failed'] += 1

        lock = threading.Lock()
        seen = set(logged_prior)   # first occurrence sends; later duplicates skip

        def work(row):
            row = row if isinstance(row, dict) else {}
            to = str(row.get(email_field, '')).strip()
            name = str(row.get('name', ''))[:200]
            merged = {**defaults, **row}
            subject = render_tokens(subject_src, merged)

            with lock:
                dup = to.lower() in seen
                if to and EMAIL_RE.match(to) and not dup:
                    seen.add(to.lower())
            if not to or not EMAIL_RE.match(to) or dup:
                return {'email': to, 'name': name, 'subject': subject, 'status': 'skipped',
                        'error': 'duplicate' if dup else 'invalid or blank email', 'cert': '', 'mid': ''}

            body = render_tokens(body_src, merged)
            attachments, cert_fname, gen_error = None, '', ''
            if cert and cert_tid:
                # Ask the generator to render placeholders blank (ZW satisfies its
                # required-field check); we stamp the real values ourselves after,
                # because the generator does not substitute {{tokens}} reliably.
                gen_data = {str(v.get('name')).lower(): ZW for v in cert_vars}
                pdf = None
                for attempt in range(2):   # one retry on transient failure
                    try:
                        pdf = generator_generate(cert_tid, gen_data)
                        break
                    except Exception as exc:  # noqa: BLE001
                        gen_error = str(exc)[:200]
                if pdf is None:
                    return {'email': to, 'name': name, 'subject': subject, 'status': 'failed',
                            'error': f'certificate not generated: {gen_error}'[:400], 'cert': '', 'mid': ''}
                # Stamp the real recipient values onto the certificate.
                overlay = {}
                for v in cert_vars:
                    src = mapping.get(v.get('name'))
                    rv = row.get(src) if src else ''
                    overlay[str(v.get('name')).lower()] = '' if rv is None else str(rv)
                pdf = overlay_values(pdf, cert_els, overlay, design_w, design_h)
                # Shrink the (image-heavy) PDF toward the size cap before attaching.
                pdf = compress_pdf(pdf, target_kb=int(getattr(settings, 'CERT_MAX_KB', 600)))
                fname = re.sub(r'[\\/:*?"<>|]+', '', render_tokens(fname_pat, merged)).strip() or 'certificate'
                if not fname.lower().endswith('.pdf'):
                    fname += '.pdf'
                cert_fname = fname
                attachments = [(fname, pdf, 'pdf')]

            res = send_email(to, subject, body, from_email=source,
                             attachments=attachments, enabled=True, detailed=True)
            ok = res.get('ok')
            return {'email': to, 'name': name, 'subject': subject,
                    'status': 'sent' if ok else 'failed', 'error': res.get('error') or '',
                    'cert': cert_fname, 'mid': res.get('message_id') or ''}

        # Only the recipients not already handled by a previous (interrupted) run.
        pending = []
        for row in recipients:
            row = row if isinstance(row, dict) else {}
            to = str(row.get(email_field, '')).strip()
            if to and to.lower() in logged_prior:
                continue
            pending.append(row)

        workers = max(1, int(getattr(settings, 'CAMPAIGN_CONCURRENCY', 8)))
        rate = _ses_rate()
        # Adaptive batch size: about one second of SES capacity, at least the
        # worker pool, capped so a batch stays a sensible checkpoint unit.
        batch_size = min(200, max(workers, int(rate) or workers))
        chunks = [pending[i:i + batch_size] for i in range(0, len(pending), batch_size)]

        def checkpoint(**extra):
            EmailCampaign.objects.filter(id=cid).update(
                processed_count=counters['processed'], sent_count=counters['sent'],
                failed_count=counters['failed'], skipped_count=counters['skipped'], **extra)

        checkpoint(batch_size=batch_size, batch_total=len(chunks), batch_index=0)

        canceled = False
        for bi, chunk in enumerate(chunks):
            if _is_canceled(cid):
                canceled = True
                break
            EmailCampaign.objects.filter(id=cid).update(batch_index=bi + 1)
            t0 = time.monotonic()
            with ThreadPoolExecutor(max_workers=workers) as ex:
                futs = [ex.submit(work, r) for r in chunk]
                for fut in as_completed(futs):
                    try:
                        r = fut.result()
                    except Exception as exc:  # noqa: BLE001
                        r = {'email': '', 'name': '', 'subject': '', 'status': 'failed',
                             'error': str(exc)[:200], 'cert': '', 'mid': ''}
                    # Persist each result immediately — this is the durability
                    # checkpoint that lets a restart resume without re-sending.
                    try:
                        EmailSendLog.objects.create(
                            recipient_email=(r.get('email') or '')[:254], recipient_name=(r.get('name') or '')[:200],
                            template_key=tpl_key, template_name=tpl_name, subject=(r.get('subject') or '')[:300],
                            context='campaign', status=r.get('status') or 'failed', error=(r.get('error') or '')[:400],
                            certificate_id=(r.get('cert') or '')[:64], message_id=(r.get('mid') or '')[:200],
                            campaign=camp, sent_by=actor)
                    except Exception:  # noqa: BLE001
                        pass
                    st = r.get('status')
                    counters['processed'] += 1
                    counters['sent' if st == 'sent' else 'skipped' if st == 'skipped' else 'failed'] += 1
                    checkpoint()
            # Stay under the SES send rate: if the batch finished faster than its
            # fair share of a second, wait the remainder (abortable on cancel).
            spent = time.monotonic() - t0
            need = (len(chunk) / rate) if rate > 0 else 0.0
            while spent < need:
                if _is_canceled(cid):
                    break
                nap = min(0.5, need - spent)
                time.sleep(nap)
                spent += nap

        final_status = 'canceled' if (canceled or _is_canceled(cid)) else 'done'
        checkpoint(had_attachment=bool(cert), status=final_status)
        _send_completion_email(cid)
    except Exception:  # noqa: BLE001
        try:
            EmailCampaign.objects.filter(id=cid).update(status='error')
            _send_completion_email(cid)
        except Exception:  # noqa: BLE001
            pass
    finally:
        connection.close()


# ── Queue plumbing ──────────────────────────────────────────────────────────

def enqueue_campaign(campaign_id, cfg):
    """Persist the full job on the campaign row and mark it queued. The always-on
    worker process picks it up — nothing runs in the web request, so the send
    survives the tab closing AND a server restart."""
    from .models import EmailCampaign
    EmailCampaign.objects.filter(id=campaign_id).update(
        job_config=cfg, status='queued', cancel_requested=False)


# Backwards-compatible alias (older callers imported start_campaign_job).
def start_campaign_job(campaign_id, cfg):
    enqueue_campaign(campaign_id, cfg)


def claim_next_campaign():
    """The oldest campaign that still needs work: 'queued' (never started) or
    'running' (a crash left it mid-flight — resume it). Single worker → no race."""
    from .models import EmailCampaign
    return (EmailCampaign.objects
            .filter(status__in=['queued', 'running'])
            .order_by('created_at')
            .first())


def run_worker_once():
    camp = claim_next_campaign()
    if not camp:
        return False
    process_campaign(camp)
    return True


def run_worker_forever(poll_seconds=3.0):
    """The worker loop (run by `manage.py run_campaign_worker`)."""
    while True:
        try:
            worked = run_worker_once()
        except Exception:  # noqa: BLE001 — one bad campaign must not kill the loop
            worked = False
        if not worked:
            time.sleep(poll_seconds)
