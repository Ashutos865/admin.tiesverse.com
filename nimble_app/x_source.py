"""X (Twitter) public-profile post fetch.

Ported VERBATIM from the standalone Nimble Monitor tool
(Upties/YT-Competitor-Monitor-by-TIES @ acd48d6, `XProfileParser` + `fetch_x_posts`)
— that parser is proven and was verified pulling real posts for @nasa, @TiesIndia
and @elonmusk, so it is kept as-is rather than rewritten. Only the returned dict
keys are renamed to the shape `services.poll_channels` already expects from
`youtube.fetch_youtube_entries` (item_id / title / url / published_at / thumbnail_url).

CAVEATS (surface these, do not pretend they don't exist):
  * This is SCRAPING, not an API. X can change their markup at any time and this
    stops returning posts. `services.poll_channels` therefore tracks
    consecutive_failures per channel so a silent break gets noticed.
  * Retweets/quoted posts appearing on the tracked profile are returned too, and
    their URLs point at the ORIGINAL author (e.g. tracking @elonmusk yields posts
    whose url is x.com/Tesla/...). Treat entries as "activity on this timeline",
    not "authored by this account".
"""
from __future__ import annotations

import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser

from .youtube import UA, parse_dt


class XProfileParser(HTMLParser):
    """Pulls post metadata out of the semantic markup on a public X profile."""

    def __init__(self):
        super().__init__()
        self.article_depth = 0
        self.current = None
        self.posts = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'article' and attrs.get('data-tweet-id'):
            self.article_depth = 1
            tweet_id = attrs['data-tweet-id']
            self.current = {
                'item_id': tweet_id,
                'title': '',
                'url': '',
                'published_at': '',
                'thumbnail_url': '',
                'is_video': False,
                'caption': '',
            }
            return
        if not self.current:
            return
        self.article_depth += 1
        if tag != 'meta':
            return
        item_prop = attrs.get('itemprop', '')
        content = attrs.get('content', '')
        if item_prop == 'articleBody':
            self.current['title'] = content.splitlines()[0][:180] or 'New X post'
            self.current['caption'] = content
        elif item_prop == 'datePublished':
            self.current['published_at'] = content
        elif item_prop == 'url' and '/status/' in content and not self.current['url']:
            self.current['url'] = content.split('/photo/')[0].split('/video/')[0]
        elif item_prop in {'image', 'thumbnailUrl'} and not self.current['thumbnail_url']:
            self.current['thumbnail_url'] = content

    def handle_endtag(self, tag):
        if not self.current:
            return
        self.article_depth -= 1
        if tag == 'article' or self.article_depth <= 0:
            # Only keep fully-formed posts — both fields are required downstream.
            if self.current['url'] and self.current['published_at']:
                self.posts.append(self.current)
            self.current = None
            self.article_depth = 0


def x_profile_url(username):
    return f'https://x.com/{str(username).strip().lstrip("@")}'


def fetch_x_posts(username, count=12, timeout=15):
    """Return up to `count` recent posts from a public X profile, newest first."""
    req = urllib.request.Request(
        x_profile_url(username),
        headers={
            'User-Agent': UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        html = response.read().decode('utf-8', errors='ignore')

    parser = XProfileParser()
    parser.feed(html)

    unique = {}
    for post in parser.posts:
        unique[post['item_id']] = post
    posts = sorted(
        unique.values(),
        key=lambda post: parse_dt(post['published_at']) or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    return posts[:count]
