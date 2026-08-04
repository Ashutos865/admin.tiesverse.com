"""Cleaning HTML that a person composed before it goes into someone's inbox.

The composer produces HTML, and HTML from a browser cannot be trusted on its
way out any more than on its way in: a pasted fragment can carry scripts, event
handlers, or a `javascript:` link that would run in the recipient's client.

This is an allow-list. Anything not named here is dropped rather than patched,
because a blocklist is only ever as good as the last exploit somebody thought
of. It uses Python's own HTML parser instead of regexes — regex-stripping tags
is exactly how these filters get bypassed.
"""
from html import escape
from html.parser import HTMLParser

# Tags an email body may contain. No <script>, <style>, <iframe>, <object>,
# <form>, <input> — none of which belong in a message someone typed.
ALLOWED_TAGS = {
    'p', 'br', 'div', 'span',
    'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del',
    'a', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
    'h1', 'h2', 'h3', 'h4', 'font',
}

# Void elements never get a closing tag.
VOID_TAGS = {'br'}

ALLOWED_ATTRS = {
    'a': {'href', 'title'},
    # Browsers still emit <font color> for a colour change, so it is accepted
    # and rewritten to a styled span rather than thrown away with the colour.
    'font': {'color'},
    'span': {'style'},
    'p': {'style'},
    'div': {'style'},
    'li': {'style'},
}

# Only presentational properties, and only shapes we can validate. `position`,
# `behavior` and `expression` have all been used to turn CSS into an attack.
ALLOWED_CSS = {'color', 'background-color', 'font-weight', 'font-style',
               'text-decoration', 'text-align'}

SAFE_SCHEMES = ('http://', 'https://', 'mailto:', 'tel:')

# For these, the text BETWEEN the tags is code, not writing. Dropping the tag
# while keeping its contents would paste `alert(1)` into the message body.
DROP_CONTENT_TAGS = {'script', 'style', 'title', 'head', 'noscript', 'template'}


def _safe_href(value):
    """Links must go somewhere harmless. `javascript:` and `data:` are the two
    that execute; a bare or relative link is meaningless in an email, so both
    are dropped."""
    v = (value or '').strip().replace('\x00', '')
    if not v:
        return None
    lowered = v.lower()
    # Strip whitespace and control characters before checking: "java\nscript:"
    # is a classic way past a naive prefix test.
    compact = ''.join(lowered.split())
    if compact.startswith(SAFE_SCHEMES):
        return v
    return None


_COLOR_RE = None


def _safe_color(value):
    """A colour must look like a colour. Anything else is a way in."""
    import re as _re
    global _COLOR_RE
    if _COLOR_RE is None:
        _COLOR_RE = _re.compile(r'^(#[0-9a-fA-F]{3,8}|rgba?\([0-9,.\s%]+\)|[a-zA-Z]{3,20})$')
    v = (value or '').strip()
    return v if v and _COLOR_RE.match(v) else None


def _safe_style(value):
    """Keep the handful of declarations a formatting toolbar produces."""
    out = []
    for decl in (value or '').split(';'):
        if ':' not in decl:
            continue
        prop, _, val = decl.partition(':')
        prop = prop.strip().lower()
        val = val.strip()
        if prop not in ALLOWED_CSS or not val:
            continue
        low = val.lower()
        if 'url(' in low or 'expression' in low or '\\' in val or ';' in val:
            continue
        out.append(f'{prop}:{val}')
    return ';'.join(out) if out else None


class _Cleaner(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.open_tags = []
        self.muted = 0          # depth inside a tag whose contents are code

    def handle_startendtag(self, tag, attrs):
        # <br/> and friends: no closing tag will follow.
        self.handle_starttag(tag, attrs)

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in DROP_CONTENT_TAGS:
            self.muted += 1
            return
        if self.muted:
            return
        if tag not in ALLOWED_TAGS:
            return                              # dropped, but its text is kept
        allowed = ALLOWED_ATTRS.get(tag, set())
        kept = []
        for name, value in attrs:
            name = (name or '').lower()
            # `on*` handlers are the whole reason this function exists.
            if name.startswith('on') or name not in allowed:
                continue
            if name == 'href':
                safe = _safe_href(value)
                if safe:
                    kept.append(f'href="{escape(safe, quote=True)}"')
            elif name == 'style':
                safe = _safe_style(value)
                if safe:
                    kept.append(f'style="{escape(safe, quote=True)}"')
            elif value:
                kept.append(f'{name}="{escape(value, quote=True)}"')

        # <font color="x"> becomes <span style="color:x">, so the sender's
        # colour survives in a form every mail client renders.
        if tag == 'font':
            color = None
            for name, value in attrs:
                if (name or '').lower() == 'color':
                    color = _safe_color(value)
            if color:
                self.parts.append(f'<span style="color:{escape(color, quote=True)}">')
            else:
                self.parts.append('<span>')
            self.open_tags.append('font')
            return

        attr_text = (' ' + ' '.join(kept)) if kept else ''
        if tag in VOID_TAGS:
            self.parts.append(f'<{tag}{attr_text}>')
            return
        # A link that leaves the building should not carry the reader with it.
        if tag == 'a':
            attr_text += ' target="_blank" rel="noopener noreferrer"'
        self.parts.append(f'<{tag}{attr_text}>')
        self.open_tags.append(tag)

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in DROP_CONTENT_TAGS:
            self.muted = max(0, self.muted - 1)
            return
        if self.muted:
            return
        if tag not in ALLOWED_TAGS or tag in VOID_TAGS:
            return
        if tag in self.open_tags:
            # Close anything left dangling inside it, so a stray </div> cannot
            # unbalance the document.
            while self.open_tags:
                current = self.open_tags.pop()
                self.parts.append('</span>' if current == 'font' else f'</{current}>')
                if current == tag:
                    break

    def handle_data(self, data):
        if self.muted:
            return                              # script/style text is not writing
        self.parts.append(escape(data))

    def close_all(self):
        while self.open_tags:
            tag = self.open_tags.pop()
            self.parts.append('</span>' if tag == 'font' else f'</{tag}>')


def clean_html(raw, max_length=200_000):
    """Return HTML safe to email. Never raises."""
    if not raw:
        return ''
    raw = str(raw)[:max_length]
    try:
        cleaner = _Cleaner()
        cleaner.feed(raw)
        cleaner.close()
        cleaner.close_all()
        return ''.join(cleaner.parts).strip()
    except Exception:  # noqa: BLE001 — a body we cannot parse is sent as text
        return escape(raw)


def html_to_text(raw):
    """A plain-text alternative for clients that will not render HTML.

    Every multipart email carries one; without it the fallback is either empty
    or a wall of markup.
    """
    if not raw:
        return ''
    import re
    text = re.sub(r'<br\s*/?>', '\n', str(raw), flags=re.I)
    text = re.sub(r'</(p|div|li|h[1-4]|blockquote)>', '\n', text, flags=re.I)
    text = re.sub(r'<li[^>]*>', '• ', text, flags=re.I)
    text = re.sub(r'<[^>]+>', '', text)
    from html import unescape
    text = unescape(text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()
