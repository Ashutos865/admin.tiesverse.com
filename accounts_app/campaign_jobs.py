"""Background certificate-campaign runner.

Certificates are large (~2 MB each), so we never ship them through the browser.
Instead the front end sends only recipient data, and this module — running in a
daemon thread — generates each certificate server-side (concurrently), attaches
it, and sends it via SES, updating campaign progress in the DB as it goes.
"""

import json
import logging
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

logger = logging.getLogger(__name__)

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


def generator_original(template_id):
    """The template's untouched background PDF — no variables rendered at all.
    Campaigns stamp values themselves, so starting from the clean original
    means nothing invisible is ever drawn at the unused ID/QR spots (the
    stand-in character showed as a stray "?" or box on some viewers), and one
    download serves every recipient instead of one generator call each."""
    with urlopen(f"{_gen_base()}/api/templates/{template_id}/original.pdf", timeout=120) as r:
        return r.read()


def generator_generate(template_id, data):
    body = json.dumps({'data': data}).encode()
    req = Request(f"{_gen_base()}/api/templates/{template_id}/generate",
                  data=body, headers={'Content-Type': 'application/json'}, method='POST')
    with urlopen(req, timeout=120) as r:
        return r.read()


_TOKEN_RE = re.compile(r'\{\{\s*([a-zA-Z0-9_]+)\s*\}\}')

_font_lock = threading.Lock()
_font_map = None    # lowercase family -> registered reportlab font name


def _load_generator_fonts():
    """Download the template editor's uploaded fonts once and register them
    with reportlab.

    Certificates are stamped by US (overlay_values), and stamping in Helvetica
    while the editor laid the template out in The Seasons put every value a few
    points off — enough to drop names onto the certificate's dotted rules and
    make issued certificates look nothing like the editor preview.

    Never raises; a font that cannot be fetched or parsed is simply skipped and
    that element falls back to Helvetica, so a generator outage cannot stop a
    send.
    """
    global _font_map
    with _font_lock:
        if _font_map is not None:
            return _font_map
        fmap = {}
        try:
            from reportlab.pdfbase import pdfmetrics
            from reportlab.pdfbase.ttfonts import TTFont
            fonts_dir = os.path.join(str(settings.BASE_DIR), 'cert_fonts')
            os.makedirs(fonts_dir, exist_ok=True)
            manifest_path = os.path.join(fonts_dir, 'families.json')

            # The listing names the families; the files themselves are cached on
            # disk. When the generator is unreachable, fall back to the manifest
            # written on a previous successful run — a flaky network must not
            # produce a Helvetica certificate while the fonts sit right here.
            entries = {}
            try:
                with urlopen(f"{_gen_base()}/api/editor/fonts", timeout=30) as r:
                    listing = json.loads(r.read())
                for f in listing:
                    if f.get('source') == 'system' or not f.get('file_url'):
                        continue
                    family = str(f.get('family') or '').strip()
                    if family:
                        entries[family] = f['file_url']
                with open(manifest_path, 'w', encoding='utf-8') as mh:
                    json.dump(entries, mh)
            except Exception:  # noqa: BLE001
                try:
                    with open(manifest_path, encoding='utf-8') as mh:
                        entries = {k: None for k in json.load(mh)}
                except Exception:  # noqa: BLE001
                    entries = {}

            for family, file_url in entries.items():
                try:
                    reg = 'CF-' + re.sub(r'[^A-Za-z0-9]+', '', family)
                    path = os.path.join(fonts_dir, reg + '.ttf')
                    if not os.path.exists(path):
                        if not file_url:
                            continue
                        with urlopen(f"{_gen_base()}{file_url}", timeout=60) as fr:
                            blob = fr.read()
                        with open(path, 'wb') as fh:
                            fh.write(blob)
                    pdfmetrics.registerFont(TTFont(reg, path))
                    fmap[family.lower()] = reg
                except Exception:  # noqa: BLE001 — one bad font must not lose the rest
                    continue
        except Exception:  # noqa: BLE001
            pass
        # An empty map is a failure, not an answer: leave it uncached so the
        # next certificate retries instead of stamping Helvetica forever.
        if fmap:
            _font_map = fmap
        return fmap


def _font_for(el):
    """The registered face for an element — the family the editor actually shows.

    The italic Seasons face is a separate foundry file with its own family name,
    so "The Seasons Bold" + italic maps to it rather than to a synthetic oblique.
    Helvetica stays as the fallback of last resort.
    """
    fonts = _load_generator_fonts()
    fam = str(el.get('font_family') or '').strip().lower()
    bold, italic = bool(el.get('is_bold')), bool(el.get('is_italic'))
    candidates = []
    if fam:
        if bold and italic:
            candidates += [f'{fam} bdit', f'{fam} bold italic']
        if italic:
            candidates += [f'{fam} italic', f'{fam} it']
            if 'seasons' in fam:
                candidates.append('fontspring demo theseasons bdit')
        if bold:
            candidates += [f'{fam} bold', f'{fam} bd']
        candidates.append(fam)
    for c in candidates:
        if c in fonts:
            return fonts[c]
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
                    # Match the editor's box model: (x,y) is the element box's TOP-LEFT,
                    # text is laid out inside it honouring padding, vertical_align and
                    # line_height (top-anchored by default — NOT centred).
                    ex, ey = float(e.get('x', 0)) * sx, float(e.get('y', 0)) * sy
                    ew, eh = float(e.get('width', 0)) * sx, float(e.get('height', 0)) * sy
                    pl = float(e.get('padding_left', 0) or 0) * sx
                    pr = float(e.get('padding_right', 0) or 0) * sx
                    pt = float(e.get('padding_top', 0) or 0) * sy
                    pb = float(e.get('padding_bottom', 0) or 0) * sy
                    fs = max(6.0, float(e.get('font_size', 24)) * sy)
                    font = _font_for(e)
                    inner_w = max(0.0, ew - pl - pr)
                    # Shrink to fit the box width (the design's auto-fit behaviour).
                    while fs > 7 and inner_w and stringWidth(text, font, fs) > inner_w:
                        fs -= 0.5
                    tw = stringWidth(text, font, fs)
                    align = (e.get('text_align') or 'left').lower()
                    if align == 'center':
                        tx = ex + pl + max(0, (inner_w - tw) / 2)
                    elif align == 'right':
                        tx = ex + pl + max(0, inner_w - tw)
                    else:
                        tx = ex + pl
                    # Vertical: the CSS line box height is font_size * line_height; the
                    # glyph baseline sits ~0.8 of the font size below the line-box top.
                    line_h = fs * float(e.get('line_height', 1.2) or 1.2)
                    valign = (e.get('vertical_align') or 'top').lower()
                    inner_h = max(0.0, eh - pt - pb)
                    if valign == 'middle':
                        top_from_box = pt + max(0.0, (inner_h - line_h) / 2.0)
                    elif valign == 'bottom':
                        top_from_box = pt + max(0.0, inner_h - line_h)
                    else:                       # top (default)
                        top_from_box = pt
                    # distance from the page top down to the glyph baseline
                    baseline_from_top = ey + top_from_box + (line_h - fs) / 2.0 + fs * 0.80
                    baseline = ph - baseline_from_top
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


def generate_single_certificate(template_id, values, id_var=None):
    """Generate ONE certificate the same reliable way the campaign does: ask the
    generator for a blank PDF, then STAMP the real values on top (the external
    generator does not substitute {{tokens}} reliably). Auto-generated variables
    (``generator_enabled``) are produced by the generator; their rendered value
    becomes the certificate ID.

    Args:
        template_id: certificate template id.
        values: {variable_name: value} — real values to stamp (any case).
        id_var:  which generator-enabled variable to treat as the certificate ID.
                 If None, the first generator-enabled variable is used.

    Returns: (pdf_bytes | None, cert_id: str, error: str)
    """
    try:
        tpl = generator_get_template(template_id) or {}
    except Exception as exc:  # noqa: BLE001
        return None, '', f'template load failed: {exc}'[:300]
    cert_vars = tpl.get('variables') or []
    cert_els = tpl.get('text_elements') or []
    pgs = tpl.get('pages') or []
    design_w, design_h = 842.0, 595.0
    if pgs:
        design_w = float(pgs[0].get('width') or design_w)
        design_h = float(pgs[0].get('height') or design_h)

    lc_values = {str(k).lower(): ('' if v is None else str(v)) for k, v in (values or {}).items()}

    # Pick the generator-enabled variable that gives the certificate its ID, and
    # build a CONCRETE id from its pattern (e.g. TIES-BH-{######} → TIES-BH-047318).
    # We generate the number ourselves so the stored ID matches what's on the PDF.
    gen_var_names = [str(v.get('name')) for v in cert_vars if v.get('generator_enabled')]
    id_pick = (id_var if (id_var and id_var in gen_var_names) else (gen_var_names[0] if gen_var_names else None))
    cert_id = ''
    if id_pick:
        # A value explicitly supplied for the id var is used as-is; otherwise generate
        # a CONCRETE, UNIQUE id from the pattern (regenerate on the rare collision so
        # short patterns like TIES-BH-{####} never reuse an existing certificate's id).
        cert_id = lc_values.get(id_pick.lower(), '')
        if not cert_id:
            cert_id = _make_unique_cert_id(cert_vars, id_pick)

    # Send data to the generator: the concrete ID for the id variable, blank/pattern
    # for other generator vars, and ZW for the vars WE stamp (the generator requires
    # a non-empty value — a plain space is rejected 422 — and ZW is invisible; if it
    # shows as a ⊠ box our overlay covers it).
    gen_data = {}
    for v in cert_vars:
        name = str(v.get('name')).lower()
        if v.get('generator_enabled'):
            gen_data[name] = cert_id if (id_pick and name == id_pick.lower()) else ''
        else:
            gen_data[name] = ZW

    pdf, gen_error = None, ''
    for _ in range(2):   # one retry on transient failure
        try:
            pdf = generator_generate(template_id, gen_data)
            break
        except Exception as exc:  # noqa: BLE001
            gen_error = str(exc)[:200]
    if pdf is None:
        return None, '', f'certificate not generated: {gen_error}'[:300]

    # Stamp the real values onto the placeholders (generator-enabled vars, incl. the
    # ID, are rendered by the generator itself, so we skip them here).
    gen_names = {str(v.get('name')).lower() for v in cert_vars if v.get('generator_enabled')}
    overlay = {name: lc_values.get(name, '') for name in
               (str(v.get('name')).lower() for v in cert_vars) if name not in gen_names}
    # The {{qr}} placeholder is drawn as an image (below), not as text — keep it
    # out of the text overlay so its literal token never gets stamped.
    text_els = [e for e in (cert_els or []) if '{{qr}}' not in (e.get('content', '') or '').lower()]
    # Render the values (each step independent so one failing never skips the next,
    # and — critically — never skips compression, which must ALWAYS run last).
    try:
        pdf = overlay_values(pdf, text_els, overlay, design_w, design_h)
    except Exception:  # noqa: BLE001
        pass
    if cert_id:
        # A cert with an ID gets a verification QR → /verify?id=<id>. It goes where a
        # {{qr}} field is placed in the template, else the bottom-right corner.
        try:
            pdf = add_verify_qr(pdf, cert_id, design_w, design_h, cert_els)
        except Exception:  # noqa: BLE001
            pass
    # Compression is its OWN step so a failure above can never leave a heavy PDF
    # uncompressed. compress_pdf itself never raises (falls back to input).
    try:
        pdf = compress_pdf(pdf, target_kb=int(getattr(settings, 'CERT_MAX_KB', 500)))
    except Exception:  # noqa: BLE001
        pass

    return pdf, cert_id, ''


def add_verify_qr(pdf_bytes, cert_id, design_w, design_h, text_elements=None):
    """Stamp a QR code on page 1 that opens the public verification page for this
    certificate. If the template has a {{qr}} field, the QR goes at THAT element's
    position/size (add a text field with {{qr}} in the editor and drag it); with no
    {{qr}} field it defaults to the bottom-right corner. Never raises."""
    try:
        import qrcode
        from io import BytesIO
        from reportlab.pdfgen import canvas
        from reportlab.lib.utils import ImageReader
        from pypdf import PdfReader, PdfWriter

        base = getattr(settings, 'VERIFY_URL', '') or 'https://tiesverse.com/verify'
        url = f'{base.rstrip("/")}?id={cert_id}'
        qr = qrcode.QRCode(box_size=10, border=1)
        qr.add_data(url)
        qr.make(fit=True)
        img = qr.make_image(fill_color='black', back_color='white').convert('RGB')
        img_buf = BytesIO(); img.save(img_buf, format='PNG'); img_buf.seek(0)

        # A {{qr}} field placed on page 1 sets the QR's position + size.
        qr_el = next((e for e in (text_elements or [])
                      if '{{qr}}' in (e.get('content', '') or '').lower()
                      and int(e.get('page_number', 1) or 1) == 1), None)

        reader = PdfReader(BytesIO(pdf_bytes))
        writer = PdfWriter()
        for pi, page in enumerate(reader.pages):
            if pi == 0:
                pw, ph = float(page.mediabox.width), float(page.mediabox.height)
                sx = pw / (design_w or pw); sy = ph / (design_h or ph)
                buf = BytesIO()
                c = canvas.Canvas(buf, pagesize=(pw, ph))
                if qr_el is not None:
                    # square QR that fits the placed box, CENTERED inside it — a
                    # wide box (the editor's default element shape) must not pin
                    # the QR to its left edge.
                    ex = float(qr_el.get('x', 0)) * sx
                    ey = float(qr_el.get('y', 0)) * sy
                    ew = float(qr_el.get('width', 60)) * sx
                    eh = float(qr_el.get('height', 60)) * sy
                    size = max(24.0, min(ew, eh) if eh else ew)
                    box_h = eh or size
                    qx = ex + max(0.0, (ew - size) / 2.0)
                    qy = ph - ey - box_h + max(0.0, (box_h - size) / 2.0)   # PDF bottom-origin
                    # White-cover the whole {{qr}} box first: the generator renders
                    # the token's placeholder (a "?") which would otherwise peek out
                    # beside the square QR. (The box sits on the white letter body.)
                    from reportlab.lib.colors import HexColor
                    c.setFillColor(HexColor('#FFFFFF'))
                    pad = 2.0
                    c.rect(ex - pad, ph - ey - (eh or size) - pad,
                           (ew or size) + 2 * pad, (eh or size) + 2 * pad, stroke=0, fill=1)
                    c.drawImage(ImageReader(img_buf), qx, qy, size, size, mask='auto')
                else:
                    size = min(64.0, pw * 0.11)
                    margin = 30.0
                    qx = pw - margin - size
                    qy = margin
                    c.drawImage(ImageReader(img_buf), qx, qy, size, size, mask='auto')
                    c.setFont('Helvetica', 6)
                    c.setFillColorRGB(0.4, 0.4, 0.4)
                    c.drawCentredString(qx + size / 2, qy - 8, 'Scan to verify')
                c.save(); buf.seek(0)
                page.merge_page(PdfReader(buf).pages[0])
            writer.add_page(page)
        out = BytesIO(); writer.write(out)
        return out.getvalue()
    except Exception:  # noqa: BLE001
        return pdf_bytes


def _make_cert_id(cert_vars, name):
    """Turn a generator pattern into a concrete ID: every {…} run of hash marks (or
    a bare {seq}/{number}) becomes a random digit string of that length. Non-hash
    braces are filled with a 6-digit number. e.g. 'TIES-BH-{######}' → 'TIES-BH-483920'."""
    import re
    import secrets
    pat = ''
    for v in cert_vars:
        if str(v.get('name')) == str(name):
            pat = (v.get('generator_pattern') or v.get('default_value') or '').strip()
            break
    if not pat:
        return ''

    def _rand(n):
        return ''.join(secrets.choice('0123456789') for _ in range(n))

    def _sub(m):
        inner = m.group(1)
        hashes = inner.count('#')
        return _rand(hashes if hashes else 6)

    out = re.sub(r'\{([^}]*)\}', _sub, pat)
    return out or pat


# IDs handed out this process but perhaps not yet written to the verify table —
# prevents two certs in the same bulk run from colliding before either is recorded.
_ISSUED_THIS_RUN = set()


def _cert_id_exists(cert_id):
    """True if this certificate ID is already used — issued earlier this run, in the
    verify table, or on any member. Guarantees freshly-generated IDs never collide."""
    if not cert_id:
        return False
    if str(cert_id).upper() in _ISSUED_THIS_RUN:
        return True
    try:
        from webinar_app import turso_client
        if turso_client.is_configured():
            rows = turso_client.execute(
                "SELECT 1 FROM certificate_records WHERE UPPER(certificate_id)=:c LIMIT 1",
                {'c': str(cert_id).upper()})
            if rows:
                return True
    except Exception:  # noqa: BLE001 — verify table unreachable shouldn't block issuance
        pass
    try:
        from career_app.models import OnboardingSubmission
        for m in (OnboardingSubmission.objects
                  .exclude(certificate_ids={}).exclude(certificate_ids__isnull=True)
                  .only('certificate_ids').iterator()):
            for v in (m.certificate_ids or {}).values():
                if v and str(v).upper() == str(cert_id).upper():
                    return True
    except Exception:  # noqa: BLE001
        pass
    return False


def _make_unique_cert_id(cert_vars, name, attempts=25):
    """Like _make_cert_id but regenerates until the ID is unused (or the pattern has
    no random part, in which case the single value is returned as-is)."""
    cid = _make_cert_id(cert_vars, name)
    if not cid:
        return ''
    for _ in range(attempts):
        if not _cert_id_exists(cid):
            _ISSUED_THIS_RUN.add(str(cid).upper())
            return cid
        nxt = _make_cert_id(cert_vars, name)
        if nxt == cid:   # pattern is fixed (no # placeholders) — can't vary, accept it
            break
        cid = nxt
    _ISSUED_THIS_RUN.add(str(cid).upper())
    return cid


CAMPAIGN_DOC_TYPES = {
    'offer_letter': 'Offer Letter',
    'internship_cert': 'Internship Certificate',
    'lor': 'Letter of Recommendation',
    'noc': 'No Objection Certificate',
}


def _doc_type_label(doc_key):
    """The label for a document type — from the superadmin-managed table, so
    the list is controlled in the app, not in this file. The dict above is only
    the last-resort fallback (it mirrors what the table is seeded with)."""
    if not doc_key:
        return ''
    try:
        from .models import CertificateDocType
        row = CertificateDocType.objects.filter(key=doc_key).only('label').first()
        if row:
            return row.label
    except Exception:  # noqa: BLE001
        pass
    return CAMPAIGN_DOC_TYPES.get(doc_key, '')


def _resolve_date_mapping(src):
    """The two automatic date sources a certificate field can map to:
    '__today__' (the send day) or '__date__:YYYY-MM-DD' (a date the sender
    picked — a certificate for work finished last month is dated last month).
    Returns None when src is neither, and formats like the certificates do:
    "3 August 2026"."""
    from datetime import date, datetime
    if src == '__today__':
        d = date.today()
    elif isinstance(src, str) and src.startswith('__date__:'):
        try:
            d = datetime.strptime(src.split(':', 1)[1].strip(), '%Y-%m-%d').date()
        except Exception:  # noqa: BLE001
            d = date.today()
    else:
        return None
    return f"{d.day} {d.strftime('%B %Y')}"


def _fallback_cert_id(attempts=25):
    """A unique ID for templates that have no generator-enabled variable. The ID
    then appears only in the QR/record, not as text on the design — which is
    fine: the QR is what gets scanned."""
    import secrets
    cid = ''
    for _ in range(attempts):
        cid = 'TIES-' + ''.join(secrets.choice('0123456789') for _ in range(6))
        if not _cert_id_exists(cid):
            break
    _ISSUED_THIS_RUN.add(cid.upper())
    return cid


def _record_campaign_certificate(cert_id, person_name, email, doc_key, doc_label,
                                 template_id, template_name, row, campaign_id):
    """Make a campaign certificate's QR mean something: write the verify record,
    and tick the member's certificate matrix when the recipient is a member.

    Mirrors what the HR issue path stores (position, avatar for the verify page).
    Never raises — a record failure must not turn a delivered email into a
    'failed' row."""
    try:
        from config.certificate_workflow import record_certificate
        position = str(row.get('position') or row.get('role') or '')
        avatar, sub = '', None
        try:
            from career_app.models import OnboardingSubmission
            sub = (OnboardingSubmission.objects
                   .filter(candidate_email__iexact=email).order_by('-id').first())
        except Exception:  # noqa: BLE001
            sub = None
        if sub is not None:
            position = position or (sub.role_offered or '')
            try:
                if getattr(sub, 'account', None) and sub.account.user_id:
                    from accounts_app.models import UserProfile
                    pr = UserProfile.objects.filter(user_id=sub.account.user_id).first()
                    avatar = (pr.avatar_url if pr else '') or ''
            except Exception:  # noqa: BLE001
                avatar = ''
        # source_ref must be unique PER RECIPIENT: the store has a
        # UNIQUE(source_type, source_ref, template_id) constraint, and a batch
        # writing every recipient under the campaign's own ref meant only the
        # first insert survived — 21 of a 22-send were silently dropped.
        record_certificate(
            cert_id, person_name or email, doc_label or 'Certificate',
            source_type='campaign',
            source_ref=f'campaign:{campaign_id}:{(email or "").strip().lower()}',
            person_email=email, template_id=str(template_id or ''),
            template_name=str(template_name or ''), position=position,
            extra={'doc_type': doc_label or 'Certificate', 'avatar_url': avatar},
        )
        if sub is not None and doc_key:
            try:
                sub.set_certificate_id(doc_key, cert_id)
            except Exception:  # noqa: BLE001
                pass
    except Exception:  # noqa: BLE001
        pass


def _render_generator_pattern(cert_vars, name):
    """Best-effort readable ID from a generator variable's pattern/default when the
    generator's own value wasn't captured (single-send path has no batch row)."""
    for v in cert_vars:
        if str(v.get('name')) == str(name):
            pat = (v.get('generator_pattern') or v.get('default_value') or '').strip()
            return pat
    return ''


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
        # Which webinar this send belongs to. The inline send path records
        # this on every log row, but the worker never did — so anything
        # large enough to be queued vanished from a webinar's Send History
        # even though it had been delivered and logged.
        event_key = cfg.get('event_key') or ''
        event_type = cfg.get('event_type') or ''
        cert = cfg.get('certificate') or None

        cert_vars, cert_els, cert_tid, mapping, fname_pat = [], [], '', {}, 'certificate.pdf'
        cert_tpl_name = ''
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
                    cert_tpl_name = tpl_full.get('name') or ''
                    pgs = tpl_full.get('pages') or []
                    if pgs:
                        design_w = float(pgs[0].get('width') or design_w)
                        design_h = float(pgs[0].get('height') or design_h)
                except Exception:  # noqa: BLE001
                    cert_vars, cert_els = [], []

        # The sender's choice: issue these as REAL certificates — each one gets a
        # unique ID + verification QR, is written to the verify store, and is
        # ticked in the member's certificate matrix under the chosen document.
        # Without it, campaign certificates are plain attachments (old behaviour).
        verify_qr = bool(cert and cert.get('verify_qr'))
        doc_key = str(cert.get('doc_type') or '') if cert else ''
        # A test send delivers the email but records nothing: no verify row, no
        # tick on the member's matrix, and an obviously fake TEST- id. It exists
        # so checking a template cannot mint a real certificate for yourself.
        is_test_send = bool((cert or {}).get('test_send') or getattr(camp, 'test_send', False))
        doc_label = _doc_type_label(doc_key)
        id_var = next((str(v.get('name')) for v in cert_vars if v.get('generator_enabled')), '')

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

        # ONE clean background serves every recipient: the original PDF has no
        # variables rendered, so nothing invisible is ever drawn at the unused
        # ID/QR spots (the stand-in character showed as a stray "?" or box on
        # some viewers), and N recipients cost one download, not N generator
        # calls. If the download fails, per-recipient generation still works.
        blank_pdf = None
        if cert and cert_tid:
            for _ in range(2):
                try:
                    blank_pdf = generator_original(cert_tid)
                    break
                except Exception:  # noqa: BLE001
                    blank_pdf = None

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

            # Checked per recipient, not from a list built when the campaign was
            # queued: a 1,000-person send takes long enough that somebody can
            # unsubscribe midway, and the promise is that we stop mailing them.
            # Certificates and other transactional sends are exempt — opting out
            # of marketing does not forfeit something already earned or paid for.
            if not is_test_send and not cert:
                try:
                    from accounts_app.models import MailContact
                    if MailContact.objects.filter(
                            email__iexact=to).exclude(
                            status=MailContact.ACTIVE).exists():
                        return {'email': to, 'name': name, 'subject': subject,
                                'status': 'skipped', 'error': 'unsubscribed',
                                'cert': '', 'mid': ''}
                except Exception:  # noqa: BLE001 — never block a send on this
                    pass

            attachments, cert_fname, cert_id, gen_error = None, '', '', ''
            guard = {'allowed': True, 'reason': '', 'reuse_cert_id': '', 'is_test': is_test_send}
            if cert and cert_tid:
                from accounts_app import certificate_guards as guards
                guard = guards.check_recipient(
                    to, name, template_id=str(cert_tid or ''), doc_key=doc_key,
                    is_test=is_test_send)
                if not guard['allowed']:
                    return {'email': to, 'name': name, 'subject': subject,
                            'status': 'skipped', 'error': guard['reason'],
                            'cert': '', 'mid': ''}
                if verify_qr:
                    # An existing holder keeps their number, so the QR already in
                    # their inbox still resolves and no second record is written.
                    cert_id = (guard['reuse_cert_id']
                               or (guards.test_certificate_id() if is_test_send else None)
                               or (_make_unique_cert_id(cert_vars, id_var) if id_var
                                   else _fallback_cert_id()))
                # Start from the clean original and stamp everything ourselves.
                # Per-recipient generation is only the fallback for when the
                # original could not be fetched: it renders an invisible
                # stand-in at every unused spot, which some viewers draw as "?".
                pdf = blank_pdf
                from_blank = pdf is not None
                if pdf is None:
                    gen_data = {str(v.get('name')).lower(): ZW for v in cert_vars}
                    if cert_id and id_var:
                        gen_data[id_var.lower()] = cert_id
                    for attempt in range(2):   # one retry on transient failure
                        try:
                            pdf = generator_generate(cert_tid, gen_data)
                            break
                        except Exception as exc:  # noqa: BLE001
                            gen_error = str(exc)[:200]
                    if pdf is None:
                        return {'email': to, 'name': name, 'subject': subject, 'status': 'failed',
                                'error': f'certificate not generated: {gen_error}'[:400], 'cert': '', 'mid': ''}
                # Stamp the real recipient values — including the certificate ID
                # when one is being issued; {{qr}} is drawn as an image below.
                overlay = {}
                for v in cert_vars:
                    vname = str(v.get('name')).lower()
                    if id_var and vname == id_var.lower():
                        # From the blank we stamp the ID ourselves; the fallback
                        # path had the generator render it, so stamping again
                        # would double-print it.
                        overlay[vname] = cert_id if from_blank else ''
                        continue
                    src = mapping.get(v.get('name'))
                    rv = _resolve_date_mapping(src)
                    if rv is None:
                        if isinstance(src, str) and src.startswith('__value__:'):
                            # A value the sender typed once, applied to every
                            # recipient — "Advisory" for the whole batch without
                            # a column for it.
                            rv = src.split(':', 1)[1]
                        else:
                            rv = row.get(src) if src else ''
                    overlay[vname] = '' if rv is None else str(rv)
                stamp_els = [e for e in cert_els
                             if '{{qr}}' not in (e.get('content', '') or '').lower()]
                pdf = overlay_values(pdf, stamp_els, overlay, design_w, design_h)
                if cert_id:
                    # The QR that makes it verifiable → /verify?id=<cert_id>.
                    try:
                        pdf = add_verify_qr(pdf, cert_id, design_w, design_h, cert_els)
                    except Exception:  # noqa: BLE001
                        pass
                # Shrink the (image-heavy) PDF toward the size cap before attaching.
                pdf = compress_pdf(pdf, target_kb=int(getattr(settings, 'CERT_MAX_KB', 600)))
                fname = re.sub(r'[\\/:*?"<>|]+', '', render_tokens(fname_pat, merged)).strip() or 'certificate'
                if not fname.lower().endswith('.pdf'):
                    fname += '.pdf'
                cert_fname = fname
                attachments = [(fname, pdf, 'pdf')]

            # The body is rendered AFTER certificate generation so the email can
            # use what only exists then: the certificate's ID and its public
            # verification link. An unfilled {{portal_url}} defaults to that
            # link — the email's button then opens this recipient's certificate
            # rather than going nowhere.
            if cert_id:
                base = getattr(settings, 'VERIFY_URL', '') or 'https://tiesverse.com/verify'
                merged.setdefault('certificate_id', cert_id)
                merged.setdefault('verify_url', f"{base.rstrip('/')}?id={cert_id}")
                if not str(merged.get('portal_url') or '').strip():
                    merged['portal_url'] = merged['verify_url']
                subject = render_tokens(subject_src, merged)
            # Resolved before the body is rendered, because both the footer link
            # and the List-Unsubscribe header need the same per-person token.
            unsub_url, send_headers = '', None
            if not cert:
                try:
                    from accounts_app.unsubscribe import (
                        get_or_create_contact, unsubscribe_headers)
                    _contact = get_or_create_contact(to, name=name)
                    send_headers = unsubscribe_headers(_contact) or None
                    from accounts_app.unsubscribe import unsubscribe_link
                    unsub_url = unsubscribe_link(_contact)
                except Exception:  # noqa: BLE001 — never block a send on this
                    unsub_url, send_headers = '', None

            body = render_tokens(body_src, merged)

            # A visible footer link, not only the header. Mail clients show an
            # unsubscribe button from the header alone, but many readers look
            # for a link in the body, and the rules expect one to be findable.
            # Appended rather than required in every template, so no template
            # can be published without one by mistake. A template that already
            # includes {{unsubscribe_url}} places it itself and is left alone.
            if not cert and unsub_url:
                if '{{unsubscribe_url}}' in body_src or unsub_url in body:
                    body = body.replace('{{unsubscribe_url}}', unsub_url)
                else:
                    body += (
                        '<div style="margin-top:28px;padding-top:16px;'
                        'border-top:1px solid #e5e7eb;font-family:Arial,sans-serif;'
                        'font-size:12px;line-height:1.5;color:#6b7280;text-align:center">'
                        'You are receiving this because you registered with TIESVERSE '
                        'or signed up for our updates.<br>'
                        f'<a href="{unsub_url}" style="color:#6b7280;text-decoration:underline">'
                        'Unsubscribe from these emails</a>'
                        '</div>'
                    )

            # Gmail and Yahoo require bulk mail to carry a one-click unsubscribe
            # header (resolved above, alongside the footer link); without it,
            # mail from a domain sending at this volume is filtered to spam
            # whatever the content says. Certificates are transactional, not
            # bulk mail, and carry neither.
            #
            # Test sends DO get both. Skipping the suppression check for a test
            # is right — you must be able to mail yourself even after
            # unsubscribing — but skipping the link meant a test looked nothing
            # like the real thing, so there was no way to check the unsubscribe
            # link before sending to a thousand people.
            res = send_email(to, subject, body, from_email=source,
                             attachments=attachments, enabled=True, detailed=True,
                             headers=send_headers)
            ok = res.get('ok')

            # One retry, then decide. Most failures at this layer are transient —
            # SES throttling, a dropped connection — and simply trying again
            # fixes them. A second failure means something is actually wrong.
            if not ok:
                time.sleep(1.5)
                res = send_email(to, subject, body, from_email=source,
                                 attachments=attachments, enabled=True, detailed=True,
                                 headers=send_headers)
                ok = res.get('ok')

                if not ok and not cert and not is_test_send:
                    # Suppress only what is permanently undeliverable. An outage
                    # or a throttle would otherwise strip real subscribers off
                    # the list for good, which is far worse than mailing a dead
                    # address twice. Anything not clearly permanent is left
                    # active and simply retried on the next campaign.
                    err_text = str(res.get('error') or '').lower()
                    permanent = any(marker in err_text for marker in (
                        'does not exist', 'no such user', 'invalid domain',
                        'address blacklisted', 'suppressed', 'rejected',
                        'invalid email', 'recipient rejected',
                        "missing final '@domain'", 'illegal address',
                    ))
                    if permanent:
                        try:
                            from accounts_app.models import MailContact
                            from django.utils import timezone as _tz
                            MailContact.objects.filter(email__iexact=to).update(
                                status=MailContact.BOUNCED,
                                status_reason='failed twice: %s' % err_text[:160],
                                status_changed_at=_tz.now())
                            logger.warning('Suppressed %s after two permanent '
                                        'failures: %s', to, err_text[:200])
                        except Exception:  # noqa: BLE001
                            pass
            if ok and cert_id:
                # Sending IS issuing: the QR must verify from the moment the mail
                # lands, so the record is written right after the send succeeds.
                # The record sees the RESOLVED values — a typed position like
                # "Tech Intern" must reach the verify page, not just the PDF.
                # A test send writes no record and never touches the member's
                # certificate matrix: that is the point of a test. A reused
                # number is already recorded, so writing again would either
                # be refused by the unique constraint or duplicate the row.
                if not is_test_send and not guard.get('reuse_cert_id'):
                    _record_campaign_certificate(cert_id, name, to, doc_key, doc_label,
                                                 cert_tid, cert_tpl_name,
                                                 {**row, 'position': overlay.get('position') or row.get('position') or ''},
                                                 cid)
            return {'email': to, 'name': name, 'subject': subject,
                    'status': 'sent' if ok else 'failed', 'error': res.get('error') or '',
                    'cert': cert_id or cert_fname, 'mid': res.get('message_id') or ''}

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
                            event_key=event_key[:120], event_type=event_type[:20],
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
