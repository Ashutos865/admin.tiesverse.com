"""Turn a shared Google Doc into research-report blocks.

The admin pastes a doc link; we fetch its HTML export and classify the
content: front matter becomes the eyebrow and title, ALL-CAPS lines become
sections, star/numbered lead-ins become sub-heads, tables keep their rows,
and embedded images are re-hosted on Cloudinary. The table of contents (and
its page numbers) is dropped — the reader builds its own contents rail from
the section blocks.

The doc must be shared as "anyone with the link can view", or Google's
export endpoint returns a login page instead of the document.
"""
import base64
import io
import re
from html.parser import HTMLParser

import requests

DOC_ID_RE = re.compile(r'/document/d/([A-Za-z0-9_-]{20,})')
MAX_BLOCKS = 800


class _DocHTML(HTMLParser):
    """Flatten the export into ordered items: paragraphs, tables, images."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.items = []            # ('p', text) | ('table', rows) | ('img', bytes|url)
        self._text = []
        self._table = None         # rows accumulator when inside a table
        self._row = None
        self._cell = None

    def handle_starttag(self, tag, attrs):
        if tag == 'table':
            self._table = []
        elif tag == 'tr' and self._table is not None:
            self._row = []
        elif tag in ('td', 'th') and self._row is not None:
            self._cell = []
        elif tag == 'img':
            src = dict(attrs).get('src', '')
            if src.startswith('data:image/'):
                try:
                    self.items.append(('img', base64.b64decode(src.split(',', 1)[1])))
                except Exception:  # noqa: BLE001 — a corrupt image is not worth failing the doc
                    pass
            elif src.startswith('http'):
                self.items.append(('img', src))

    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self._cell is not None:
            self._row.append(' '.join(''.join(self._cell).split()))
            self._cell = None
        elif tag == 'tr' and self._row is not None:
            if any(c for c in self._row):
                self._table.append(self._row)
            self._row = None
        elif tag == 'table' and self._table is not None:
            if self._table:
                self.items.append(('table', self._table))
            self._table = None
        elif tag in ('p', 'h1', 'h2', 'h3', 'h4', 'li') and self._table is None:
            text = ' '.join(''.join(self._text).split())
            if text:
                self.items.append(('p', text))
            self._text = []

    def handle_data(self, data):
        if self._cell is not None:
            self._cell.append(data)
        elif self._table is None:
            self._text.append(data)


def _caps_ratio(s):
    letters = [c for c in s if c.isalpha()]
    if not letters:
        return 0.0
    return sum(1 for c in letters if c.isupper()) / len(letters)


def _is_heading(text):
    if text[:1].isdigit():          # '1. SOCIAL MEDIA...' is a sub-head, not a section
        return False
    return 4 <= len(text) <= 120 and _caps_ratio(text) > 0.9 and not text.endswith('.')


def _title_words(s):
    words = [w for w in re.split(r'\s+', s) if w and w[0].isalpha()]
    if not words:
        return 0.0
    return sum(1 for w in words if w[0].isupper()) / len(words)


def _titlecase(s):
    """SECTION HEADINGS COME IN CAPS — settle them down for the page."""
    small = {'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'vs', 'with'}
    acronyms = {'ai', 'us', 'un', 'osint', 'kgb', 'cpsu', 'it'}
    out = []
    for i, w in enumerate(s.lower().split()):
        after_colon = bool(out) and out[-1].endswith(':')
        if w in acronyms and i:
            out.append(w.upper())
        elif w in small and i and not after_colon:
            out.append(w)
        else:
            out.append(w[:1].upper() + w[1:])
    return ' '.join(out)


def fetch_doc_html(url):
    m = DOC_ID_RE.search(url or '')
    if not m:
        raise ValueError('That does not look like a Google Docs link.')
    r = requests.get(
        f'https://docs.google.com/document/d/{m.group(1)}/export?format=html',
        timeout=45,
    )
    if r.status_code != 200 or b'<table' not in r.content and b'<p' not in r.content:
        raise ValueError('Could not fetch the document. Is it shared as "anyone with the link can view"?')
    return r.text


def parse_doc(html):
    """Returns (eyebrow, title, blocks) — images still as raw bytes."""
    parser = _DocHTML()
    parser.feed(html)

    eyebrow, title = '', ''
    blocks = []
    phase = 'front'            # front -> (toc) -> body -> refs
    lead_done = False

    for kind, payload in parser.items[:MAX_BLOCKS * 2]:
        if kind == 'table':
            flat = ' '.join(c for row in payload for c in row).upper()
            if 'PAGE NO' in flat or phase in ('front', 'toc'):
                # The TOC (or any front-matter table): the reader builds its
                # own contents rail, so page numbers have nothing to say here.
                if phase == 'toc':
                    phase = 'toc_done'
                continue
            blocks.append({'type': 'table', 'rows': payload})
            continue

        if kind == 'img':
            if phase not in ('front', 'toc'):
                blocks.append({'type': 'img', 'data': payload, 'src': payload if isinstance(payload, str) else ''})
            continue

        text = payload
        if phase in ('front', 'toc', 'toc_done'):
            if _is_heading(text):
                upper = text.upper()
                if 'TABLE OF CONTENTS' in upper:
                    phase = 'toc'
                    continue
                if not title and len(text) >= 25:
                    title = _titlecase(text)
                    continue
                if title:
                    phase = 'body'
                    blocks.append({'type': 'h2', 'text': _titlecase(text)})
                    continue
            if not eyebrow and not title and 5 < len(text) < 120:
                eyebrow = text
            continue

        # body
        if _is_heading(text):
            label = _titlecase(text.rstrip(':'))
            # 'AUTHORS:'-style caps labels are sub-heads; bare caps lines are sections.
            level = 'h3' if text.rstrip().endswith(':') else 'h2'
            phase = 'refs' if label.lower().startswith('reference') else 'body'
            blocks.append({'type': level, 'text': label})
            continue
        if phase == 'refs':
            blocks.append({'type': 'ref', 'text': text})
            continue

        m = re.match(r'^\*\s*(?P<h>[^:]{4,110})(?::\s*(?P<rest>.*))?$', text)
        if m:
            blocks.append({'type': 'h3', 'text': m.group('h').strip()})
            rest = (m.group('rest') or '').strip()
            if rest:
                blocks.append({'type': 'p', 'text': rest})
            continue
        m = re.match(r'^(?P<n>\d+)\.\s+(?P<h>.{4,110})$', text)
        if m and _caps_ratio(m.group('h')) > 0.8:
            blocks.append({'type': 'h3', 'text': _titlecase(m.group('h'))})
            continue
        m = re.match(r"^(?P<h>[A-Z][\w''’ ,-]{3,80}):\s*(?P<rest>.+)$", text)
        if m and _title_words(m.group('h')) >= 0.6:
            if len(text) <= 130 and not m.group('rest').endswith('.'):
                blocks.append({'type': 'h3', 'text': text})
                continue
            blocks.append({'type': 'p', 'strong': m.group('h'), 'text': m.group('rest')})
            continue

        btype = 'p' if lead_done else 'lead'
        lead_done = True
        blocks.append({'type': btype, 'text': text})

    return eyebrow, title, blocks[:MAX_BLOCKS]


def upload_images(blocks):
    """Re-host embedded images on Cloudinary; drop any that fail."""
    import cloudinary.uploader
    out = []
    for b in blocks:
        if b.get('type') != 'img':
            out.append(b)
            continue
        if b.get('src'):
            out.append({'type': 'img', 'src': b['src']})
            continue
        try:
            res = cloudinary.uploader.upload(io.BytesIO(b['data']), folder='research-reports')
            out.append({'type': 'img', 'src': res['secure_url']})
        except Exception:  # noqa: BLE001 — a lost illustration should not sink the import
            pass
    return out


def import_doc(url):
    eyebrow, title, blocks = parse_doc(fetch_doc_html(url))
    return eyebrow, title, upload_images(blocks)
