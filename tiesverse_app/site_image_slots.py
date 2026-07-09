"""Catalog of manageable website image slots.

Each slot: key (stable — matches the website's bundled filename where possible),
label, group (for the admin UI), aspect (crop ratio), auto (whether it can pull
from a live data feed → the Auto/Manual toggle is shown).
"""

_GOVT = {
    'logo-govt-india': 'Government of India',
    'logo-govt-delhi': 'Govt of NCT of Delhi',
    'logo-govt-up': 'Government of Uttar Pradesh',
    'logo-govt-maharashtra': 'Government of Maharashtra',
    'logo-min-finance': 'Ministry of Finance',
    'logo-min-mea': 'Ministry of External Affairs',
    'logo-min-meity': 'Ministry of Electronics & IT',
    'logo-min-roadtransport': 'Ministry of Road Transport & Highways',
    'logo-min-education': 'Ministry of Education',
    'logo-icwa': 'Indian Council of World Affairs',
    'logo-unesco': 'UNESCO',
    'logo-indiaai': 'INDIAai',
    'logo-aeos': 'AEOS Group',
}

_UNIV = {
    'aiims': 'AIIMS',
    'iit-dhanbad': 'IIT Dhanbad',
    'nit-bhopal': 'NIT Bhopal',
    'kings-college-london': "King's College London",
    'university-of-glasgow': 'University of Glasgow',
    'university-of-oxford': 'University of Oxford',
    'manipal-university': 'Manipal University',
    'christ-university': 'Christ University',
    'symbiosis': 'Symbiosis',
    'university-of-delhi': 'University of Delhi',
    'jnu': 'JNU',
    'university-of-mumbai': 'University of Mumbai',
    'ms-university-of-baroda': 'MS University of Baroda',
    'savitribai-phule-pune-university': 'Savitribai Phule Pune University',
    'bbau-lucknow': 'BBAU Lucknow',
    'university-of-calcutta': 'University of Calcutta',
    'jadavpur-university': 'Jadavpur University',
}

_BRANDS = {
    'brand-tiesverse': 'Tiesverse', 'brand-foreign-policy': 'Foreign Policy India',
    'brand-ties': '.TIES', 'brand-bharat-age': 'The Bharat Age',
    'brand-india-elections': 'India Elections', 'brand-finties': 'Finties',
    'brand-upties': 'Upties', 'brand-nimble': 'Nimble',
}


def _rows(mapping, group, aspect=1, auto=False):
    return [{'key': k, 'label': v, 'group': group, 'aspect': aspect, 'auto': auto} for k, v in mapping.items()]


# Brand / government-ministry / university logos are intentionally HARDCODED in
# the website (stable brand assets) — not managed here. The CMS only covers the
# slots that genuinely change: the hero, backdrops, and data-driven nav cards.
_BRAND_PAGE = {
    'brand-establishing': ('Establishing shot (hero)', 16 / 9),
    'brand-universe-map': ('World map (observatory/river/…)', 16 / 10),
    'brand-bharat': ('“Built for Bharat” wide hero', 3 / 1),
    'moodboard': ('Moodboard collage', 1 / 1),
    'brand-jantar-mantar': ('Jantar Mantar thesis image', 16 / 9),
    'brand-arch-pattern': ('Architecture pattern strip', 1200 / 140),
    'brand-one-light': ('Imagery: one light, one grade', 16 / 10),
    'brand-scale-stillness': ('Imagery: scale & stillness', 16 / 10),
    'brand-atlas': ('Civilization atlas plate', 16 / 9),
    'brand-source-portrait': ('Source portrait (before grade)', 4 / 5),
    'sign-observatory': ('Signature: Observatory', 1 / 1),
    'sign-river': ('Signature: River', 1 / 1),
    'sign-archive': ('Signature: Archive', 1 / 1),
    'sign-tower': ('Signature: Tower', 1 / 1),
    'sign-constellation': ('Signature: Constellation', 1 / 1),
}


def _rows2(mapping, group, auto=False):
    return [{'key': k, 'label': v[0], 'group': group, 'aspect': v[1], 'auto': auto} for k, v in mapping.items()]


# Nav mega-menu feature cards (3 per menu). "What we do" & "Company" are static
# → manual only (the upload always shows). "Insights" & "Engagements" are live
# "Latest in…" rows → auto by default (newest articles/events), with a Manual
# toggle to pin an uploaded image. Each entry: (key, label, auto, seed_file) —
# seed_file is the bundled /work/ image the seed_nav_images command imports.
_NAV = [
    ('nav-whatwedo-1', 'Nav · What we do: AI Wars',    False, 'insight-ai-wars.png'),
    ('nav-whatwedo-2', 'Nav · What we do: Media',      False, 'feat-media.png'),
    ('nav-whatwedo-3', 'Nav · What we do: Technology', False, 'tech-tabloid.png'),
    ('nav-insights-1', 'Nav · Insights: card 1',       True,  'insight-budget-2026.png'),
    ('nav-insights-2', 'Nav · Insights: card 2',       True,  'map-hormuz.png'),
    ('nav-insights-3', 'Nav · Insights: card 3',       True,  'poster-witte.png'),
    ('nav-engagements-1', 'Nav · Engagements: card 1', True,  'event-india-ai.jpg'),
    ('nav-engagements-2', 'Nav · Engagements: card 2', True,  'poster-bhanushali.png'),
    ('nav-engagements-3', 'Nav · Engagements: card 3', True,  'guest-tharoor.png'),
    ('nav-company-1', 'Nav · Company: Brand',    False, 'Moodboard.png'),
    ('nav-company-2', 'Nav · Company: About',    False, 'rmt-visual.png'),
    ('nav-company-3', 'Nav · Company: Careers',  False, 'cta-backdrop.png'),
]

# key → bundled /work/ filename, used by the seed command.
NAV_SEED = {k: f for (k, _l, _a, f) in _NAV}

# Hero/backdrop/brand/signature slots that have a real bundled image on the live
# site (verified image/*, not the SPA fallback). Excluded on purpose because no
# real image exists yet — they stay "using default" until an editor uploads one:
# team-group and the 6 brand placeholders (brand-jantar-mantar, brand-arch-pattern,
# brand-one-light, brand-scale-stillness, brand-atlas, brand-source-portrait).
PAGE_SEED = {
    'hero': 'hero.png',
    'cta-backdrop': 'cta-backdrop.png',
    'letter-backdrop': 'letter-backdrop.png',
    'brand-establishing': 'brand-establishing.png',
    'brand-universe-map': 'brand-universe-map.png',
    'brand-bharat': 'brand-bharat.png',
    'moodboard': 'Moodboard.png',
    'sign-observatory': 'sign-observatory.png',
    'sign-river': 'sign-river.png',
    'sign-archive': 'sign-archive.png',
    'sign-tower': 'sign-tower.png',
    'sign-constellation': 'sign-constellation.png',
}

# All slots the seed command can import, key → /work/ filename.
SEED_FILES = {**NAV_SEED, **PAGE_SEED}


SLOTS = (
    [
        {'key': 'hero', 'label': 'Homepage hero', 'group': 'Hero & backdrops', 'aspect': 16 / 9, 'auto': False},
        {'key': 'cta-backdrop', 'label': 'CTA band backdrop', 'group': 'Hero & backdrops', 'aspect': 16 / 9, 'auto': False},
        {'key': 'letter-backdrop', 'label': 'Founders letter backdrop', 'group': 'Hero & backdrops', 'aspect': 16 / 9, 'auto': False},
        {'key': 'team-group', 'label': 'About: team group photo', 'group': 'About', 'aspect': 16 / 9, 'auto': False},
    ]
    + _rows2(_BRAND_PAGE, 'Brand page')
    + [{'key': k, 'label': l, 'group': 'Nav feature cards', 'aspect': 4 / 3, 'auto': a} for (k, l, a, _f) in _NAV]
)

SLOT_KEYS = {s['key'] for s in SLOTS}

# key → auto flag; the seed command uses it to seed auto slots as 'auto'.
SEED_AUTO = {s['key']: s['auto'] for s in SLOTS}
